use crate::{error, Result};
use rustls::{
    pki_types::{CertificateDer, PrivatePkcs8KeyDer, ServerName},
    ClientConfig, ClientConnection, RootCertStore, ServerConfig, StreamOwned,
};
use std::{
    io::{BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

// A peer cannot keep a bounded connection slot forever by trickling bytes.
pub(super) struct ServerIo {
    socket: TcpStream,
    deadline: Instant,
}
impl ServerIo {
    pub fn new(socket: TcpStream) -> Self {
        Self {
            socket,
            deadline: Instant::now() + Duration::from_secs(40),
        }
    }
    pub fn next_request(&mut self) {
        self.deadline = Instant::now() + Duration::from_secs(40);
    }
    fn remaining(&self) -> std::io::Result<Duration> {
        self.deadline
            .checked_duration_since(Instant::now())
            .filter(|left| !left.is_zero())
            .map(|left| left.min(Duration::from_secs(5)))
            .ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "Remote request deadline exceeded.",
                )
            })
    }
}
impl Read for ServerIo {
    fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
        self.socket.set_read_timeout(Some(self.remaining()?))?;
        self.socket.read(bytes)
    }
}
impl Write for ServerIo {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.socket.set_write_timeout(Some(self.remaining()?))?;
        self.socket.write(bytes)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.socket.flush()
    }
}

pub(super) fn server(certificate: &[u8], key: &[u8]) -> Result<Arc<ServerConfig>> {
    let config =
        ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_protocol_versions(&[&rustls::version::TLS13])
            .map_err(error)?
            .with_no_client_auth()
            .with_single_cert(
                vec![CertificateDer::from(certificate.to_vec())],
                PrivatePkcs8KeyDer::from(key.to_vec()).into(),
            )
            .map_err(error)?;
    Ok(Arc::new(config))
}
fn client_config(certificate: &[u8]) -> Result<Arc<ClientConfig>> {
    // This one certificate is the only trust root. System/public roots and TOFU are not used.
    let mut roots = RootCertStore::empty();
    roots
        .add(CertificateDer::from(certificate.to_vec()))
        .map_err(error)?;
    let config =
        ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_protocol_versions(&[&rustls::version::TLS13])
            .map_err(error)?
            .with_root_certificates(roots)
            .with_no_client_auth();
    Ok(Arc::new(config))
}
type Stream = BufReader<StreamOwned<ClientConnection, TcpStream>>;

fn connect(address: SocketAddr, config: Arc<ClientConfig>) -> Result<Stream> {
    let connection = ClientConnection::new(
        config,
        ServerName::try_from("emdeck.internal").map_err(error)?,
    )
    .map_err(error)?;
    let socket = TcpStream::connect_timeout(&address, Duration::from_secs(5)).map_err(|e| {
        format!(
            "Cannot reach Emdeck at {address}. Check Tailscale, sharing and the host firewall: {e}"
        )
    })?;
    socket
        .set_read_timeout(Some(Duration::from_secs(32)))
        .map_err(error)?;
    socket
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(error)?;
    socket.set_nodelay(true).map_err(error)?;
    Ok(BufReader::new(StreamOwned::new(connection, socket)))
}

fn request(
    stream: &mut Stream,
    payload: super::types::Payload,
    keep_alive: bool,
) -> Result<super::types::Reply> {
    let id = uuid::Uuid::new_v4().to_string();
    crate::server::send(
        stream.get_mut(),
        &super::types::Request {
            version: 1,
            id: id.clone(),
            payload,
            keep_alive,
        },
        crate::protocol::MAX_REQUEST,
    )?;
    let reply: super::types::Reply =
        serde_json::from_slice(&crate::server::line(stream, crate::protocol::MAX_RESPONSE)?)
            .map_err(error)?;
    if reply.response.version != 1 || reply.response.id != id {
        return Err("Invalid remote response.".into());
    }
    Ok(reply)
}

fn result(response: crate::protocol::Response) -> Result<serde_json::Value> {
    if let Some(error) = response.error {
        return Err(error);
    }
    Ok(response.result.unwrap_or(serde_json::Value::Null))
}

pub(super) fn exchange(
    address: SocketAddr,
    certificate: &[u8],
    payload: super::types::Payload,
) -> Result<serde_json::Value> {
    let mut stream = connect(address, client_config(certificate)?)?;
    result(request(&mut stream, payload, false)?.response)
}

/// Only idle connections are locked. Long polls never block terminal input.
/// A failed exchange is never replayed: the host may already have applied input.
#[derive(Default)]
pub(super) struct Pool {
    idle: Mutex<Vec<(Instant, Stream)>>,
    config: Mutex<Option<Arc<ClientConfig>>>,
}
impl Pool {
    #[cfg(test)]
    pub(super) fn idle_count(&self) -> usize {
        self.idle.lock().unwrap().len()
    }
    pub fn call(
        &self,
        address: SocketAddr,
        certificate: &[u8],
        payload: super::types::Payload,
    ) -> Result<serde_json::Value> {
        let cached = {
            let mut idle = self.idle.lock().map_err(error)?;
            // The host's idle timeout is five seconds. Leave ample margin for transit.
            idle.retain(|(used, _)| used.elapsed() < Duration::from_secs(1));
            idle.pop().map(|(_, stream)| stream)
        };
        let mut stream = match cached {
            Some(stream) => stream,
            None => {
                let config = {
                    let mut config = self.config.lock().map_err(error)?;
                    if config.is_none() {
                        *config = Some(client_config(certificate)?);
                    }
                    config.as_ref().unwrap().clone()
                };
                connect(address, config)?
            }
        };
        let reply = request(&mut stream, payload, true)?;
        // Older hosts ignore the optional request flag and omit this acknowledgement.
        if reply.keep_alive && reply.response.error.is_none() {
            let mut idle = self.idle.lock().map_err(error)?;
            if idle.len() < 4 {
                idle.push((Instant::now(), stream));
            }
        }
        result(reply.response)
    }
}

#[cfg(test)]
#[path = "tls_tests.rs"]
mod tests;
