use crate::{
    error,
    protocol::*,
    server,
    storage::{self, Endpoint},
    Result,
};
use std::{
    io::BufReader,
    net::{SocketAddr, TcpStream},
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub fn request(endpoint: &Endpoint, action: Action) -> Result<serde_json::Value> {
    let address = SocketAddr::from(([127, 0, 0, 1], endpoint.port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3)).map_err(error)?;
    stream.set_nodelay(true).map_err(error)?;
    stream
        .set_read_timeout(Some(Duration::from_secs(32)))
        .map_err(error)?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(error)?;
    let id = uuid::Uuid::new_v4().to_string();
    server::send(
        &mut stream,
        &Request {
            version: PROTOCOL,
            id: id.clone(),
            token: endpoint.token.clone(),
            action,
        },
        MAX_REQUEST,
    )?;
    let response: Response =
        serde_json::from_slice(&server::line(&mut BufReader::new(stream), MAX_RESPONSE)?)
            .map_err(error)?;
    if response.id != id || response.version != PROTOCOL {
        return Err("Session response identity/version mismatch.".into());
    }
    if let Some(e) = response.error {
        return Err(e);
    }
    Ok(response.result.unwrap_or(serde_json::Value::Null))
}
pub fn call(home: &Path, action: Action) -> Result<serde_json::Value> {
    request(&storage::endpoint(home)?, action)
}
pub fn start(home: &Path, executable: &Path, embedded: bool) -> Result<serde_json::Value> {
    if let Ok(value) = call(home, Action::Ping) {
        return Ok(value);
    }
    std::fs::create_dir_all(home).map_err(error)?;
    crate::private::protect(home)?;
    // Windows cannot replace a running executable during an IDE update/build.
    // Run the embedded fallback from a private, versioned copy instead.
    #[cfg(windows)]
    let cached = if embedded {
        Some(cache_host(home, executable)?)
    } else {
        None
    };
    #[cfg(windows)]
    let executable = cached.as_deref().unwrap_or(executable);
    let mut command = Command::new(executable);
    if embedded {
        command.arg("session");
    }
    command
        .arg("server")
        .env("EMDECK_SESSION_HOME", home)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x00000008 | 0x00000200); // Detached process, independent process group.
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // SAFETY: setsid is async-signal-safe and touches no Rust state after fork.
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    let mut child = command.spawn().map_err(error)?;
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if let Ok(value) = call(home, Action::Ping) {
            return Ok(value);
        }
        if let Some(status) = child.try_wait().map_err(error)? {
            return Err(format!(
                "Session server exited ({status}). Run `emdeck-session server` for diagnostics."
            ));
        }
        if Instant::now() >= deadline {
            return Err("Session server did not become ready within 8 seconds.".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(windows)]
fn cache_host(home: &Path, executable: &Path) -> Result<std::path::PathBuf> {
    let metadata = std::fs::metadata(executable).map_err(error)?;
    let stamp = metadata
        .modified()
        .map_err(error)?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(error)?
        .as_nanos();
    let destination = home.join(format!("host-{}-{stamp}.exe", metadata.len()));
    if !destination.exists() {
        let temporary = tempfile::NamedTempFile::new_in(home).map_err(error)?;
        std::fs::copy(executable, temporary.path()).map_err(error)?;
        crate::private::protect(temporary.path())?;
        match temporary.persist_noclobber(&destination) {
            Ok(_) => (),
            Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(e) => return Err(error(e)),
        }
    }
    Ok(destination)
}
