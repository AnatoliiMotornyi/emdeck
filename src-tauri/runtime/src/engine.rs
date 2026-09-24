use crate::{
    agent, error,
    protocol::*,
    storage::{self, SavedState},
    terminal::{self, Terminal},
    Result,
};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    time::{Duration, Instant},
};

struct State {
    revision: u64,
    workspaces: BTreeMap<String, WorkspaceInfo>,
    panes: BTreeMap<String, Arc<Terminal>>,
}
pub struct Engine {
    pub id: String,
    pub stopping: AtomicBool,
    home: PathBuf,
    state: Mutex<State>,
    changed: Condvar,
    persistence: Mutex<()>,
    mutations: Mutex<()>,
}
impl Engine {
    pub fn load(home: &Path, id: String) -> Result<Arc<Self>> {
        let saved = storage::load(home)?;
        let mut workspaces = BTreeMap::new();
        let mut panes = BTreeMap::new();
        for workspace in saved.workspaces {
            uuid::Uuid::parse_str(&workspace.id).map_err(error)?;
            if workspaces.insert(workspace.id.clone(), workspace).is_some() {
                return Err("Duplicate workspace in saved layout.".into());
            }
        }
        for mut pane in saved.panes {
            uuid::Uuid::parse_str(&pane.id).map_err(error)?;
            uuid::Uuid::parse_str(&pane.generation).map_err(error)?;
            if !workspaces.contains_key(&pane.launch.workspace_id) {
                return Err("Saved pane has no workspace.".into());
            }
            pane.running = false;
            pane.restored = true;
            pane.agent.state = AgentState::Stopped;
            pane.agent.reason = "Server restarted; original process is no longer running.".into();
            let size = terminal::size(pane.cols, pane.rows);
            pane.cols = size.cols;
            pane.rows = size.rows;
            if panes
                .insert(pane.id.clone(), Arc::new(Terminal::new(pane)))
                .is_some()
            {
                return Err("Duplicate pane in saved layout.".into());
            }
        }
        Ok(Arc::new(Self {
            id,
            home: home.into(),
            state: Mutex::new(State {
                revision: 1,
                workspaces,
                panes,
            }),
            changed: Condvar::new(),
            persistence: Mutex::new(()),
            mutations: Mutex::new(()),
            stopping: AtomicBool::new(false),
        }))
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let state = self.state.lock().map_err(error)?;
        Ok(Snapshot {
            protocol: PROTOCOL,
            server_id: self.id.clone(),
            revision: state.revision,
            workspaces: state.workspaces.values().cloned().collect(),
            panes: state.panes.values().map(|p| p.info()).collect(),
        })
    }
    fn persist(&self) -> Result<()> {
        let _guard = self.persistence.lock().map_err(error)?;
        let snapshot = self.snapshot()?;
        storage::write_json(
            &self.home.join("layout.json"),
            &SavedState {
                version: 1,
                workspaces: snapshot.workspaces,
                panes: snapshot.panes,
            },
        )
    }
    fn update(&self, persist: bool) -> Result<()> {
        self.state.lock().map_err(error)?.revision += 1;
        self.changed.notify_all();
        if persist {
            self.persist()?;
        }
        Ok(())
    }
    fn pane(&self, id: &str) -> Result<Arc<Terminal>> {
        self.state
            .lock()
            .map_err(error)?
            .panes
            .get(id)
            .cloned()
            .ok_or("Pane no longer exists.".into())
    }
    fn launch(self: &Arc<Self>, pane: &Arc<Terminal>, resume: bool) -> Result<()> {
        let command = terminal::command(&pane.info(), &self.home, resume)?;
        let weak = Arc::downgrade(self);
        pane.spawn(
            command,
            Arc::new(move |persist| {
                if let Some(engine) = weak.upgrade() {
                    if let Err(e) = engine.update(persist) {
                        eprintln!("Session persistence: {e}");
                    }
                }
            }),
        )
    }
    fn create(self: &Arc<Self>, mut launch: Launch, cols: u16, rows: u16) -> Result<Value> {
        let workspace = self
            .state
            .lock()
            .map_err(error)?
            .workspaces
            .get(&launch.workspace_id)
            .cloned()
            .ok_or("Workspace no longer exists.")?;
        validate_launch(&mut launch, &workspace)?;
        let size = terminal::size(cols, rows);
        let info = PaneInfo {
            id: uuid::Uuid::new_v4().to_string(),
            generation: uuid::Uuid::new_v4().to_string(),
            title: None,
            agent: agent::initial(&launch.command),
            launch,
            running: false,
            restored: false,
            exit_code: None,
            started_at: terminal::now(),
            cols: size.cols,
            rows: size.rows,
        };
        let pane = Arc::new(Terminal::new(info));
        {
            let mut state = self.state.lock().map_err(error)?;
            if state.panes.len() >= 64 {
                return Err("This server supports up to 64 panes.".into());
            }
            state.panes.insert(pane.info().id, pane.clone());
        }
        if let Err(e) = self.launch(&pane, false) {
            self.state
                .lock()
                .map_err(error)?
                .panes
                .remove(&pane.info().id);
            return Err(e);
        }
        self.update(true)?;
        Ok(json!(pane.info()))
    }
    fn restart(self: &Arc<Self>, id: &str, resume: bool) -> Result<Value> {
        let previous = self.pane(id)?;
        let mut info = previous.info();
        if info.running {
            return Err("Stop this pane before restarting it.".into());
        }
        let workspace = self
            .state
            .lock()
            .map_err(error)?
            .workspaces
            .get(&info.launch.workspace_id)
            .cloned()
            .ok_or("Workspace no longer exists.")?;
        validate_launch(&mut info.launch, &workspace)?;
        info.generation = uuid::Uuid::new_v4().to_string();
        info.title = None;
        info.started_at = terminal::now();
        info.restored = false;
        info.exit_code = None;
        info.agent.source = "screen".into();
        info.agent.state = AgentState::Unknown;
        if !resume {
            info.agent = agent::initial(&info.launch.command);
        }
        let pane = Arc::new(Terminal::new(info));
        // Reserve the replacement under the map lock so concurrent restarts cannot spawn two occupants.
        pane.live.lock().map_err(error)?.info.running = true;
        {
            let mut state = self.state.lock().map_err(error)?;
            if !state
                .panes
                .get(id)
                .is_some_and(|p| Arc::ptr_eq(p, &previous))
            {
                return Err("Pane changed; refresh before restarting.".into());
            }
            state.panes.insert(id.into(), pane.clone());
        }
        if let Err(e) = self.launch(&pane, resume) {
            self.state
                .lock()
                .map_err(error)?
                .panes
                .insert(id.into(), previous);
            return Err(e);
        }
        self.update(true)?;
        Ok(json!(pane.info()))
    }
    pub fn restore(self: &Arc<Self>) {
        if let Ok(snapshot) = self.snapshot() {
            for pane in snapshot.panes {
                if pane.launch.resume_on_restart && agent::resume_args(&pane.agent).is_some() {
                    if let Err(e) = self.restart(&pane.id, true) {
                        eprintln!("Could not resume {}: {e}", pane.launch.name);
                    }
                }
            }
        }
    }
    pub fn inspect(&self) {
        let panes = self
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .panes
            .values()
            .cloned()
            .collect::<Vec<_>>();
        let mut changed = false;
        for pane in panes {
            changed |= pane.inspect();
        }
        if changed {
            let _ = self.update(false);
        }
    }
    pub fn execute(self: &Arc<Self>, action: Action) -> Result<Value> {
        // Serialize graph/process mutations, including the spawn interval. A
        // simultaneous remove/stop cannot orphan a process or lose a workspace.
        let mutating = matches!(
            &action,
            Action::WorkspaceCreate { .. }
                | Action::WorkspaceRemove { .. }
                | Action::PaneCreate { .. }
                | Action::PaneRestart { .. }
                | Action::PaneStop { .. }
                | Action::PaneRemove { .. }
                | Action::StopServer
        );
        let _mutation = if mutating {
            Some(self.mutations.lock().map_err(error)?)
        } else {
            None
        };
        if mutating && self.stopping.load(Ordering::SeqCst) {
            return Err("Session server is stopping.".into());
        }
        match action {
            Action::Remote(_) => {
                Err("Remote management requires the local server endpoint.".into())
            }
            Action::Ping => Ok(json!({"protocol": PROTOCOL, "serverId": self.id})),
            Action::Snapshot { after, wait_ms } => {
                let state = self.state.lock().map_err(error)?;
                if after == Some(state.revision) && wait_ms > 0 {
                    drop(
                        self.changed
                            .wait_timeout(state, Duration::from_millis(wait_ms.min(25_000) as u64))
                            .map_err(error)?,
                    );
                } else {
                    drop(state);
                }
                Ok(json!(self.snapshot()?))
            }
            Action::WorkspaceCreate { root, name } => {
                let root = directory(&root)?;
                let name = label(&name)?;
                let mut state = self.state.lock().map_err(error)?;
                if let Some(existing) = state.workspaces.values().find(|w| w.root == root) {
                    return Ok(json!(existing));
                }
                if state.workspaces.len() >= 64 {
                    return Err("This server supports up to 64 workspaces.".into());
                }
                let workspace = WorkspaceInfo {
                    id: uuid::Uuid::new_v4().to_string(),
                    name,
                    root,
                };
                state
                    .workspaces
                    .insert(workspace.id.clone(), workspace.clone());
                drop(state);
                self.update(true)?;
                Ok(json!(workspace))
            }
            Action::WorkspaceRemove { id } => {
                let mut state = self.state.lock().map_err(error)?;
                if state
                    .panes
                    .values()
                    .any(|p| p.info().launch.workspace_id == id)
                {
                    return Err("Remove this workspace's panes first.".into());
                }
                state.workspaces.remove(&id);
                drop(state);
                self.update(true)?;
                Ok(json!(null))
            }
            Action::PaneCreate { launch, cols, rows } => self.create(launch, cols, rows),
            Action::PaneRestart { id, resume } => self.restart(&id, resume),
            Action::PaneStop { id } => {
                self.pane(&id)?.stop()?;
                Ok(json!(null))
            }
            Action::PaneRemove { id } => {
                let mut state = self.state.lock().map_err(error)?;
                if state.panes.get(&id).is_some_and(|p| p.info().running) {
                    return Err("Stop the running pane before removing it.".into());
                }
                state.panes.remove(&id);
                drop(state);
                self.update(true)?;
                Ok(json!(null))
            }
            Action::Attach {
                id,
                client,
                takeover,
            } => {
                let pane = self.pane(&id)?;
                pane.attach(&client, takeover)?;
                Ok(json!(pane.info()))
            }
            Action::Detach { id, client } => {
                self.pane(&id)?.detach(&client)?;
                Ok(json!(null))
            }
            Action::Read { id, after, wait_ms } => {
                Ok(json!(self.pane(&id)?.read(after, wait_ms)?))
            }
            Action::Input { id, client, text } => {
                self.pane(&id)?.input(&client, &text)?;
                Ok(json!(null))
            }
            Action::Resize {
                id,
                client,
                cols,
                rows,
            } => {
                self.pane(&id)?.resize(&client, cols, rows)?;
                Ok(json!(null))
            }
            Action::Report {
                id,
                generation,
                state,
                session_id,
            } => {
                let pane = self.pane(&id)?;
                let mut live = pane.live.lock().map_err(error)?;
                if live.info.generation != generation || !live.info.running {
                    return Err("Agent occupant changed or stopped.".into());
                }
                if let Some(session_id) = session_id {
                    let mut candidate = live.info.agent.clone();
                    candidate.session_id = Some(session_id);
                    if agent::resume_args(&candidate).is_none() {
                        return Err(
                            "Native resume requires a Claude/Codex pane and a valid session ID."
                                .into(),
                        );
                    }
                    live.info.agent.session_id = candidate.session_id;
                }
                live.info.agent.state = state;
                live.info.agent.source = "report".into();
                live.info.agent.reason = "Reported by the agent integration.".into();
                drop(live);
                pane.changed.notify_all();
                self.update(true)?;
                Ok(json!(pane.info()))
            }
            Action::Prompt {
                id,
                generation,
                text,
            } => {
                let pane = self.pane(&id)?;
                pane.prompt(&generation, &text)?;
                self.update(false)?;
                Ok(json!(null))
            }
            Action::Wait {
                id,
                generation,
                states,
                timeout_ms,
            } => {
                if states.is_empty() {
                    return Err("At least one target state is required.".into());
                }
                let deadline =
                    Instant::now() + Duration::from_millis(timeout_ms.min(25_000) as u64);
                loop {
                    let pane = self.pane(&id)?;
                    let info = pane.info();
                    if info.generation != generation {
                        return Err("Agent occupant changed while waiting.".into());
                    }
                    if states.contains(&info.agent.state) {
                        return Ok(json!({"matched": true, "pane": info}));
                    }
                    if Instant::now() >= deadline || !info.running {
                        return Ok(json!({"matched": false, "pane": info}));
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
            Action::StopServer => {
                self.stopping.store(true, Ordering::SeqCst);
                Ok(json!(null))
            }
        }
    }
    pub fn shutdown(&self) {
        if let Ok(snapshot) = self.snapshot() {
            for info in snapshot.panes {
                if let Ok(pane) = self.pane(&info.id) {
                    let _ = pane.stop();
                }
            }
        }
        let _ = self.persist();
    }
}
fn directory(value: &str) -> Result<String> {
    let path = Path::new(value);
    if !path.is_absolute() || !path.is_dir() {
        return Err(
            "Workspace and pane directories must be existing absolute paths on this machine."
                .into(),
        );
    }
    let canonical = path
        .canonicalize()
        .map_err(error)?
        .to_string_lossy()
        .into_owned();
    // Windows PowerShell's filesystem provider treats the verbatim prefix's
    // question mark as wildcard syntax for relative file operations.
    #[cfg(windows)]
    let canonical = if let Some(unc) = canonical.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        canonical
            .strip_prefix(r"\\?\")
            .unwrap_or(&canonical)
            .to_owned()
    };
    Ok(canonical)
}
fn label(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 120 || value.chars().any(char::is_control) {
        return Err("Name must contain 1–120 printable characters.".into());
    }
    Ok(value.into())
}
fn validate_launch(launch: &mut Launch, workspace: &WorkspaceInfo) -> Result<()> {
    launch.name = label(&launch.name)?;
    launch.cwd = directory(&launch.cwd)?;
    let root = directory(&workspace.root)?;
    if !Path::new(&launch.cwd).starts_with(&root) {
        return Err("Pane directory must be inside its workspace.".into());
    }
    if launch.shell.len() > 4096
        || launch.command.len() > 32 * 1024
        || launch.shell.contains(['\0', '\r', '\n'])
        || launch.command.contains('\0')
    {
        return Err("Invalid shell or command.".into());
    }
    Ok(())
}
