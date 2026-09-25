pub(crate) use emdeck_session::machines::Target;
use emdeck_session::{client, protocol::Action, remote, ssh, storage, Result};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn window_routing_and_view_identity_are_native_boundaries() {
        let sessions = Sessions::default();
        let connection = Arc::new(Connection::Local(storage::Endpoint {
            port: 1,
            token: "never-used".into(),
            server_id: "fixture".into(),
            pid: 0,
        }));
        sessions.windows.lock().unwrap().insert(
            "owner".into(),
            HashMap::from([("connection".into(), connection)]),
        );
        assert!(sessions
            .call("other", "connection", Action::Ping)
            .unwrap_err()
            .contains("not connected"));
        assert!(sessions
            .call(
                "owner",
                "connection",
                Action::Attach {
                    id: "pane".into(),
                    client: "owner:another-view".into(),
                    takeover: false
                }
            )
            .unwrap_err()
            .contains("Invalid terminal view identity"));
        sessions.close_window("other");
        assert!(sessions.windows.lock().unwrap().contains_key("owner"));
        sessions.close_window("owner");
        assert!(sessions.windows.lock().unwrap().is_empty());
    }
}
pub(crate) enum Connection {
    Local(storage::Endpoint),
    Direct {
        id: String,
        credential: remote::Credential,
    },
    Ssh(Arc<ssh::Bridge>),
}
impl Connection {
    fn call(&self, action: Action) -> Result<serde_json::Value> {
        if matches!(action, Action::Remote(_)) && !matches!(self, Self::Local(_)) {
            return Err("Sharing settings are available only on this computer.".into());
        }
        match self {
            Self::Local(endpoint) => client::request(endpoint, action),
            Self::Direct { credential, .. } => credential.call(action),
            Self::Ssh(bridge) => bridge.call(action),
        }
    }
}
#[derive(Default)]
pub(crate) struct Sessions {
    windows: Mutex<HashMap<String, HashMap<String, Arc<Connection>>>>,
    next: AtomicU64,
}
impl Sessions {
    pub fn connect(&self, window: &str, target: Target) -> Result<String> {
        let connection = match target {
            Target::Local => {
                let home = storage::home()?;
                client::start(
                    &home,
                    &std::env::current_exe().map_err(|e| e.to_string())?,
                    true,
                )?;
                Connection::Local(storage::endpoint(&home)?)
            }
            Target::Direct { credential: id } => {
                let credential = remote::Credential::load(&storage::home()?, &id)?;
                credential.call(Action::Ping)?;
                Connection::Direct { id, credential }
            }
            Target::Ssh { host, port, binary } => {
                Connection::Ssh(ssh::Bridge::connect(&ssh::Target { host, port, binary })?)
            }
        };
        let id = format!("session-{}", self.next.fetch_add(1, Ordering::Relaxed));
        let mut windows = self.windows.lock().map_err(|e| e.to_string())?;
        let connections = windows.entry(window.into()).or_default();
        if connections.len() >= 16 {
            return Err("Up to 16 machine connections are supported per window.".into());
        }
        connections.insert(id.clone(), Arc::new(connection));
        Ok(id)
    }
    pub fn call(&self, window: &str, id: &str, mut action: Action) -> Result<serde_json::Value> {
        let connection = self
            .windows
            .lock()
            .map_err(|e| e.to_string())?
            .get(window)
            .and_then(|m| m.get(id))
            .cloned()
            .ok_or("This window is not connected to that machine.")?;
        // The renderer cannot impersonate another window's input lease.
        match &mut action {
            Action::Attach { client, .. }
            | Action::Detach { client, .. }
            | Action::Input { client, .. }
            | Action::Resize { client, .. } => {
                if client.len() > 36
                    || !client
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'-')
                {
                    return Err("Invalid terminal view identity.".into());
                }
                *client = format!("{}:{window}:{id}:{client}", std::process::id())
            }
            _ => (),
        }
        connection.call(action)
    }
    pub fn disconnect(&self, window: &str, id: &str) {
        if let Ok(mut windows) = self.windows.lock() {
            if let Some(connections) = windows.get_mut(window) {
                connections.remove(id);
            }
        }
    }
    pub fn forget(&self, credential: &str) -> Result<()> {
        remote::forget(&storage::home()?, credential)?;
        for connections in self.windows.lock().map_err(|e| e.to_string())?.values_mut() {
            connections.retain(|_, connection| !matches!(connection.as_ref(), Connection::Direct { id, .. } if id == credential));
        }
        Ok(())
    }
    pub fn close_window(&self, window: &str) {
        if let Ok(mut windows) = self.windows.lock() {
            windows.remove(window);
        }
    }
}
