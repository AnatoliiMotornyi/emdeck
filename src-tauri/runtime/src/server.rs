use crate::{
    engine::Engine,
    error,
    protocol::*,
    storage::{self, Endpoint},
    Result,
};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

pub fn line(reader: &mut impl BufRead, limit: usize) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader
        .take((limit + 1) as u64)
        .read_until(b'\n', &mut bytes)
        .map_err(error)?;
    if bytes.is_empty() {
        return Err("Connection closed.".into());
    }
    if bytes.len() > limit || bytes.last() != Some(&b'\n') {
        return Err("Protocol frame exceeds its limit or is incomplete.".into());
    }
    Ok(bytes)
}
pub fn send(writer: &mut impl Write, value: &impl serde::Serialize, limit: usize) -> Result<()> {
    let mut bytes = serde_json::to_vec(value).map_err(error)?;
    if bytes.len() >= limit {
        return Err("Protocol response exceeds its limit.".into());
    }
    bytes.push(b'\n');
    writer.write_all(&bytes).map_err(error)?;
    writer.flush().map_err(error)
}
fn authenticated(candidate: &str, expected: &str) -> bool {
    let mut difference = candidate.len() ^ expected.len();
    for (index, byte) in expected.bytes().enumerate() {
        difference |= (candidate.as_bytes().get(index).copied().unwrap_or(0) ^ byte) as usize;
    }
    difference == 0
}
fn connection(
    mut stream: TcpStream,
    endpoint: &Endpoint,
    engine: &Arc<Engine>,
    remote: &crate::remote::Host,
) -> Result<()> {
    stream.set_nonblocking(false).map_err(error)?;
    stream.set_nodelay(true).map_err(error)?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(error)?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(error)?;
    let request: Request =
        serde_json::from_slice(&line(&mut BufReader::new(&mut stream), MAX_REQUEST)?)
            .map_err(error)?;
    let result = if request.version != PROTOCOL || !authenticated(&request.token, &endpoint.token) {
        Err("Session protocol version or authentication is invalid.".into())
    } else if request.id.len() > 100 || request.id.is_empty() {
        Err("Invalid request ID.".into())
    } else {
        match request.action {
            Action::Remote(action) => remote.manage(action),
            action => engine.execute(action),
        }
    };
    let response = Response {
        version: PROTOCOL,
        id: request.id,
        result: result.as_ref().ok().cloned(),
        error: result.err(),
    };
    send(&mut stream, &response, MAX_RESPONSE)
}
pub fn run(home: &Path) -> Result<()> {
    let _lock = storage::prepare(home)?;
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(error)?;
    listener.set_nonblocking(true).map_err(error)?;
    let endpoint = Endpoint {
        port: listener.local_addr().map_err(error)?.port(),
        token: format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        ),
        server_id: uuid::Uuid::new_v4().to_string(),
        pid: std::process::id(),
    };
    let engine = Engine::load(home, endpoint.server_id.clone())?;
    let remote = crate::remote::Host::load(home, endpoint.clone())?;
    storage::write_json(&home.join("endpoint.json"), &endpoint)?;
    engine.restore();
    let connections = Arc::new(AtomicUsize::new(0));
    let mut inspected = Instant::now();
    while !engine.stopping.load(Ordering::SeqCst) {
        remote.accept();
        if inspected.elapsed() >= Duration::from_millis(250) {
            engine.inspect();
            inspected = Instant::now();
        }
        match listener.accept() {
            Ok((stream, _)) => {
                if connections.load(Ordering::Relaxed) >= 128 {
                    drop(stream);
                    continue;
                }
                connections.fetch_add(1, Ordering::Relaxed);
                let count = connections.clone();
                let endpoint = endpoint.clone();
                let engine = engine.clone();
                let remote = remote.clone();
                std::thread::spawn(move || {
                    let _ = connection(stream, &endpoint, &engine, &remote);
                    count.fetch_sub(1, Ordering::Relaxed);
                });
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(20))
            }
            Err(e) => {
                remote.close();
                engine.shutdown();
                return Err(error(e));
            }
        }
    }
    remote.close();
    engine.shutdown();
    // The exclusive server lock is held until this endpoint is removed.
    std::fs::remove_file(home.join("endpoint.json")).map_err(error)?;
    Ok(())
}
