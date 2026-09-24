use crate::protocol::{AgentInfo, AgentState};

pub const KINDS: &[(&str, &str)] = &[
    ("claude", "Claude Code"),
    ("codex", "Codex"),
    ("cursor-agent", "Cursor"),
    ("opencode", "OpenCode"),
    ("gemini", "Gemini"),
    ("copilot", "Copilot"),
    ("grok", "Grok"),
    ("pi", "Pi"),
    ("hermes", "Hermes"),
    ("amp", "Amp"),
    ("aider", "Aider"),
    ("cline", "Cline"),
    ("qwen", "Qwen"),
    ("kimi", "Kimi"),
    ("droid", "Droid"),
    ("kiro", "Kiro"),
    ("devin", "Devin"),
    ("kilo", "Kilo"),
    ("qodercli", "Qoder"),
    ("omp", "OMP"),
    ("mastracode", "MastraCode"),
];

pub fn kind(command: &str) -> String {
    let words = command.split_whitespace().take(6).collect::<Vec<_>>();
    for word in words {
        let executable = word
            .trim_matches(['\'', '"'])
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or("")
            .trim_end_matches(".exe")
            .trim_end_matches(".cmd");
        if let Some((name, _)) = KINDS.iter().find(|(name, _)| *name == executable) {
            return (*name).into();
        }
    }
    "shell".into()
}

pub fn initial(command: &str) -> AgentInfo {
    AgentInfo {
        kind: kind(command),
        state: AgentState::Unknown,
        source: "screen".into(),
        reason: "No lifecycle evidence yet".into(),
        session_id: None,
    }
}

// Screen rules are conservative observations, never permission to answer a
// prompt. Integrations can report authoritative state through the same API.
pub fn observe(current: &AgentInfo, screen: &str) -> AgentInfo {
    if current.source == "report" {
        return current.clone();
    }
    let mut next = current.clone();
    let text = screen
        .lines()
        .rev()
        .take(32)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
        .to_lowercase();
    if next.kind == "shell" {
        if text.contains("claude code") {
            next.kind = "claude".into();
        } else if text.contains("openai codex") {
            next.kind = "codex".into();
        } else if text.contains("opencode") && text.contains("session") {
            next.kind = "opencode".into();
        } else {
            return next;
        }
    }
    let approval = [
        "would you like to",
        "do you want to",
        "allow this",
        "approve this",
        "requires approval",
        "permission required",
    ];
    let choices = [
        "1. yes",
        "1) yes",
        "allow once",
        "yes, proceed",
        "2. no",
        "2) no",
        "[y/n]",
        "(y/n)",
        "esc to cancel",
    ];
    let working = [
        "esc to interrupt",
        "esc to stop",
        "thinking…",
        "thinking...",
        "working…",
        "working...",
        "ctrl+c to interrupt",
    ];
    let ready = [
        "? for shortcuts",
        "send a message",
        "what would you like",
        "type a message",
        "context left",
    ];
    let (state, reason) =
        if approval.iter().any(|s| text.contains(s)) && choices.iter().any(|s| text.contains(s)) {
            (AgentState::Blocked, "Visible approval or question controls")
        } else if working.iter().any(|s| text.contains(s)) {
            (
                AgentState::Working,
                "Visible agent work/interrupt indicator",
            )
        } else if ready.iter().any(|s| text.contains(s))
            && text
                .lines()
                .any(|l| l.trim_start().starts_with(['>', '❯', '›']))
        {
            (AgentState::Idle, "Visible agent input prompt")
        } else {
            (AgentState::Unknown, "No recognized lifecycle pattern")
        };
    next.state = state;
    next.reason = reason.into();
    next
}

pub fn resume_args(info: &AgentInfo) -> Option<Vec<String>> {
    resume_command(&info.kind, info.session_id.as_deref())
}

// The id reaches a shell as an argument, so the charset stays free of shell metacharacters.
pub fn resume_command(kind: &str, session: Option<&str>) -> Option<Vec<String>> {
    let session = session?;
    if !session
        .as_bytes()
        .first()
        .is_some_and(u8::is_ascii_alphanumeric)
        || session.len() > 200
        || !session
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
    {
        return None;
    }
    match kind {
        "claude" => Some(vec!["claude".into(), "--resume".into(), session.to_owned()]),
        "codex" => Some(vec!["codex".into(), "resume".into(), session.to_owned()]),
        _ => None,
    }
}
