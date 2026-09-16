use serde::{Deserialize, Serialize};

pub const PROTOCOL: u32 = 1;
pub const MAX_REQUEST: usize = 128 * 1024;
pub const MAX_RESPONSE: usize = 8 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentState {
    Working,
    Blocked,
    Idle,
    Done,
    Unknown,
    Stopped,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub kind: String,
    pub state: AgentState,
    pub source: String,
    pub reason: String,
    pub session_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Launch {
    pub workspace_id: String,
    pub name: String,
    pub cwd: String,
    pub shell: String,
    pub command: String,
    #[serde(default)]
    pub resume_on_restart: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaneInfo {
    pub id: String,
    pub generation: String,
    #[serde(default)]
    pub title: Option<String>,
    pub launch: Launch,
    pub running: bool,
    pub restored: bool,
    pub exit_code: Option<u32>,
    pub started_at: u64,
    pub cols: u16,
    pub rows: u16,
    pub agent: AgentInfo,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub root: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub protocol: u32,
    pub server_id: String,
    pub revision: u64,
    pub workspaces: Vec<WorkspaceInfo>,
    pub panes: Vec<PaneInfo>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "method", content = "params")]
pub enum Action {
    #[serde(rename = "remote.manage")]
    Remote(crate::remote::Management),
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "session.snapshot")]
    Snapshot { after: Option<u64>, wait_ms: u32 },
    #[serde(rename = "workspace.create")]
    WorkspaceCreate { root: String, name: String },
    #[serde(rename = "workspace.remove")]
    WorkspaceRemove { id: String },
    #[serde(rename = "pane.create")]
    PaneCreate {
        launch: Launch,
        cols: u16,
        rows: u16,
    },
    #[serde(rename = "pane.restart")]
    PaneRestart { id: String, resume: bool },
    #[serde(rename = "pane.stop")]
    PaneStop { id: String },
    #[serde(rename = "pane.remove")]
    PaneRemove { id: String },
    #[serde(rename = "pane.attach")]
    Attach {
        id: String,
        client: String,
        takeover: bool,
    },
    #[serde(rename = "pane.detach")]
    Detach { id: String, client: String },
    #[serde(rename = "pane.read")]
    Read {
        id: String,
        after: Option<u64>,
        wait_ms: u32,
    },
    #[serde(rename = "pane.input")]
    Input {
        id: String,
        client: String,
        text: String,
    },
    #[serde(rename = "pane.resize")]
    Resize {
        id: String,
        client: String,
        cols: u16,
        rows: u16,
    },
    #[serde(rename = "agent.report")]
    Report {
        id: String,
        generation: String,
        state: AgentState,
        session_id: Option<String>,
    },
    #[serde(rename = "agent.prompt")]
    Prompt {
        id: String,
        generation: String,
        text: String,
    },
    #[serde(rename = "agent.wait")]
    Wait {
        id: String,
        generation: String,
        states: Vec<AgentState>,
        timeout_ms: u32,
    },
    #[serde(rename = "server.stop")]
    StopServer,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Request {
    pub version: u32,
    pub id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub token: String,
    #[serde(flatten)]
    pub action: Action,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub version: u32,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub sequence: u64,
    pub reset: bool,
    pub data: String,
    pub text: String,
    pub pane: PaneInfo,
}
