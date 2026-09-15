use super::{tls, types::*};
use crate::{
    client, error,
    protocol::{Action, Response, MAX_REQUEST, MAX_RESPONSE},
    storage::{self, Endpoint},
    Result,
};
use rustls::{ServerConfig, ServerConnection, StreamOwned};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::BufReader,
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

#[derive(Default, Serialize, Deserialize)]
struct Saved {
    address: Option<SocketAddr>,
    enabled: bool,
    certificate: Vec<u8>,
    key: Vec<u8>,
    devices: Vec<Device>,
}
struct State {
    saved: Saved,
    listener: Option<TcpListener>,
    tls: Option<Arc<ServerConfig>>,
    invite: Option<(String, u64)>,
    epoch: u64,
    error: Option<String>,
}
pub struct Host {
    path: PathBuf,
    endpoint: Endpoint,
    state: Mutex<State>,
    active: Arc<AtomicUsize>,
}
impl Host {
    pub fn load(home: &Path, endpoint: Endpoint) -> Result<Arc<Self>> {
        let path = home.join("remote-host.json");
        let saved: Saved = if path.exists() {
            storage::read_json(&path, 128 * 1024)?
        } else {
            Saved::default()
        };
        if saved.devices.len() > 32 {
            return Err("Too many paired devices in remote state.".into());
        }
        let mut state = State {
            saved,
            listener: None,
            tls: None,
            invite: None,
            epoch: 0,
            error: None,
        };
        if state.saved.enabled {
            let start = (|| {
                let address = state.saved.address.ok_or("Missing sharing address.")?;
                validate_address(address)?;
                state.tls = Some(tls::server(&state.saved.certificate, &state.saved.key)?);
                state.listener = Some(Self::listener(address)?);
                Ok::<(), String>(())
            })();
            state.error = start.err();
        }
        Ok(Arc::new(Self {
            path,
            endpoint,
            state: Mutex::new(state),
            active: Arc::new(AtomicUsize::new(0)),
        }))
    }
    fn listener(address: SocketAddr) -> Result<TcpListener> {
        let listener = TcpListener::bind(address).map_err(|e| format!("Cannot listen on {address}. Make sure Tailscale is connected on this computer: {e}"))?;
        listener.set_nonblocking(true).map_err(error)?;
        Ok(listener)
    }
    fn status(state: &State) -> Status {
        Status {
            enabled: state.listener.is_some(),
            address: state.saved.address.map(|a| a.ip().to_string()),
            port: state.saved.address.map(|a| a.port()),
            error: state.error.clone(),
            devices: state.saved.devices.iter().map(|d| d.info.clone()).collect(),
        }
    }
    /// Called only after the local endpoint capability has been verified.
    pub fn manage(&self, action: Management) -> Result<Value> {
        let mut state = self.state.lock().map_err(error)?;
        match action {
            Management::Status => (),
            Management::Enable { address, port } => {
                let address = SocketAddr::new(
                    address
                        .parse()
                        .map_err(|_| "Enter a Tailscale IPv4 address.")?,
                    port,
                );
                validate_address(address)?;
                if state.listener.is_some() && state.saved.address == Some(address) {
                    return Ok(json!(Self::status(&state)));
                }
                let listener = Self::listener(address)?;
                if state.saved.certificate.is_empty() {
                    let identity =
                        rcgen::generate_simple_self_signed(vec!["emdeck.internal".into()])
                            .map_err(error)?;
                    state.saved.certificate = identity.cert.der().to_vec();
                    state.saved.key = identity.signing_key.serialize_der();
                }
                let config = tls::server(&state.saved.certificate, &state.saved.key)?;
                let previous = (state.saved.address, state.saved.enabled);
                state.saved.address = Some(address);
                state.saved.enabled = true;
                if let Err(e) = storage::write_json(&self.path, &state.saved) {
                    (state.saved.address, state.saved.enabled) = previous;
                    return Err(e);
                }
                state.listener = Some(listener);
                state.tls = Some(config);
                state.invite = None;
                state.error = None;
                state.epoch += 1;
            }
            Management::Disable => {
                // Fail closed even if persisting the disabled setting fails.
                state.listener = None;
                state.invite = None;
                state.epoch += 1;
                state.saved.enabled = false;
                storage::write_json(&self.path, &state.saved)?;
            }
            Management::Invite => {
                if state.listener.is_none() {
                    return Err("Enable sharing before pairing a device.".into());
                }
                if state.saved.devices.len() >= 32 {
                    return Err("Revoke a device before pairing another (maximum 32).".into());
                }
                let code = secret();
                let expires = crate::terminal::now() + 600;
                let invite = Invite {
                    version: 1,
                    address: state.saved.address.ok_or("Missing sharing address.")?,
                    certificate: state.saved.certificate.clone(),
                    secret: code.clone(),
                    expires,
                };
                state.invite = Some((digest(&code), expires));
                return Ok(json!({ "code": invite.encode()?, "expiresAt": expires * 1000 }));
            }
            Management::Revoke { id } => {
                let previous = state.saved.devices.clone();
                state.saved.devices.retain(|d| d.info.id != id);
                if let Err(e) = storage::write_json(&self.path, &state.saved) {
                    state.saved.devices = previous;
                    return Err(e);
                }
            }
        }
        Ok(json!(Self::status(&state)))
    }
    /// Nonblocking, bounded accept; the local server owns this host's lifetime.
    pub fn accept(self: &Arc<Self>) {
        let Ok(state) = self.state.lock() else { return };
        let Some(listener) = &state.listener else {
            return;
        };
        let Ok((socket, _)) = listener.accept() else {
            return;
        };
        if self.active.load(Ordering::Relaxed) >= 32 {
            return;
        }
        let Some(config) = state.tls.clone() else {
            return;
        };
        let epoch = state.epoch;
        self.active.fetch_add(1, Ordering::Relaxed);
        let host = self.clone();
        std::thread::spawn(move || {
            let _ = host.serve(socket, config, epoch);
            host.active.fetch_sub(1, Ordering::Relaxed);
        });
    }
    pub fn close(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.listener = None;
            state.invite = None;
            state.epoch += 1;
        }
    }
    fn serve(&self, socket: TcpStream, config: Arc<ServerConfig>, epoch: u64) -> Result<()> {
        socket.set_nonblocking(false).map_err(error)?;
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .map_err(error)?;
        socket
            .set_write_timeout(Some(Duration::from_secs(5)))
            .map_err(error)?;
        let mut stream = StreamOwned::new(
            ServerConnection::new(config).map_err(error)?,
            tls::ServerIo::new(socket),
        );
        let request: Request = serde_json::from_slice(&crate::server::line(
            &mut BufReader::new(&mut stream),
            MAX_REQUEST,
        )?)
        .map_err(error)?;
        let result = if request.version != 1 || request.id.is_empty() || request.id.len() > 100 {
            Err("Invalid remote request.".into())
        } else {
            self.dispatch(request.payload, epoch)
        };
        crate::server::send(
            &mut stream,
            &Response {
                version: 1,
                id: request.id,
                result: result.as_ref().ok().cloned(),
                error: result.err(),
            },
            MAX_RESPONSE,
        )
    }
    fn authorized(state: &State, epoch: u64, device: &str, token: &str) -> bool {
        state.listener.is_some()
            && state.epoch == epoch
            && state
                .saved
                .devices
                .iter()
                .any(|d| d.info.id == device && matches(token, &d.digest))
    }
    fn dispatch(&self, payload: Payload, epoch: u64) -> Result<Value> {
        let mut state = self.state.lock().map_err(error)?;
        if state.listener.is_none() || state.epoch != epoch {
            return Err("Sharing is disabled or changed. Reconnect.".into());
        }
        match payload {
            Payload::Pair { secret: code, name } => {
                let name = name.trim();
                if name.is_empty() || name.len() > 120 || name.chars().any(char::is_control) {
                    return Err("Use a device name of 1–120 characters.".into());
                }
                let valid = state.invite.as_ref().is_some_and(|(hash, expires)| {
                    *expires > crate::terminal::now() && matches(&code, hash)
                });
                if !valid {
                    return Err("Pairing code is invalid, expired or already used.".into());
                }
                if state.saved.devices.len() >= 32 {
                    return Err("Maximum paired devices reached.".into());
                }
                let id = uuid::Uuid::new_v4().to_string();
                let token = secret();
                state.saved.devices.push(Device {
                    info: DeviceInfo {
                        id: id.clone(),
                        name: name.into(),
                        paired_at: crate::terminal::now(),
                    },
                    digest: digest(&token),
                });
                if let Err(e) = storage::write_json(&self.path, &state.saved) {
                    state.saved.devices.pop();
                    return Err(e);
                }
                state.invite = None;
                Ok(json!({ "device": id, "token": token }))
            }
            Payload::Call {
                device,
                token,
                mut action,
            } => {
                if !Self::authorized(&state, epoch, &device, &token) {
                    return Err(
                        "Device access was revoked or is invalid. Pair this device again.".into(),
                    );
                }
                if matches!(action, Action::Remote(_) | Action::StopServer) {
                    return Err("Sharing settings and server shutdown are available only on the host computer.".into());
                }
                match &mut action {
                    Action::Attach { client, .. }
                    | Action::Detach { client, .. }
                    | Action::Input { client, .. }
                    | Action::Resize { client, .. } => {
                        if client.is_empty()
                            || client.len() > 180
                            || client.chars().any(char::is_control)
                        {
                            return Err("Invalid remote view identity.".into());
                        }
                        // Keep the native lease ID below 100 bytes, with a separate
                        // namespace even when two devices send the same view ID.
                        *client = format!("remote:{}", digest(&format!("{device}:{client}")));
                    }
                    _ => (),
                }
                drop(state);
                let result = client::request(&self.endpoint, action);
                let state = self.state.lock().map_err(error)?;
                if !Self::authorized(&state, epoch, &device, &token) {
                    return Err("Device access ended during this request.".into());
                }
                result
            }
        }
    }
}

#[cfg(test)]
impl Host {
    pub(super) fn test_bind(self: &Arc<Self>) -> SocketAddr {
        let listener = Self::listener("127.0.0.1:0".parse().unwrap()).unwrap();
        let address = listener.local_addr().unwrap();
        let mut state = self.state.lock().unwrap();
        state.saved.address = Some(address);
        if state.saved.certificate.is_empty() {
            let identity =
                rcgen::generate_simple_self_signed(vec!["emdeck.internal".into()]).unwrap();
            state.saved.certificate = identity.cert.der().to_vec();
            state.saved.key = identity.signing_key.serialize_der();
        }
        state.tls = Some(tls::server(&state.saved.certificate, &state.saved.key).unwrap());
        state.listener = Some(listener);
        address
    }
    pub(super) fn test_expire_invite(&self) {
        self.state.lock().unwrap().invite.as_mut().unwrap().1 = 0;
    }
}
