use crate::{error, Result};
use rustls::{
    pki_types::{CertificateDer, PrivatePkcs8KeyDer, ServerName},
    ClientConfig, ClientConnection, RootCertStore, ServerConfig, StreamOwned,
};
use std::{
    io::{BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    sync::Arc,
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
pub(super) fn exchange(
    address: SocketAddr,
    certificate: &[u8],
    payload: super::types::Payload,
) -> Result<serde_json::Value> {
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
    let connection = ClientConnection::new(
        Arc::new(config),
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
    let mut stream = StreamOwned::new(connection, socket);
    let id = uuid::Uuid::new_v4().to_string();
    crate::server::send(
        &mut stream,
        &super::types::Request {
            version: 1,
            id: id.clone(),
            payload,
        },
        crate::protocol::MAX_REQUEST,
    )?;
    let response: crate::protocol::Response = serde_json::from_slice(&crate::server::line(
        &mut BufReader::new(&mut stream),
        crate::protocol::MAX_RESPONSE,
    )?)
    .map_err(error)?;
    if response.version != 1 || response.id != id {
        return Err("Invalid remote response.".into());
    }
    if let Some(error) = response.error {
        return Err(error);
    }
    Ok(response.result.unwrap_or(serde_json::Value::Null))
}
