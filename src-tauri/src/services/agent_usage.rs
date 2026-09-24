use crate::services::workspace::{err, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub label: String,
    pub used_percent: f64,
    pub resets_at: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub source: String,
    pub updated_at: u64,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub context_size: Option<u64>,
    pub context_percent: Option<f64>,
    pub cost_usd: Option<f64>,
    pub limits: Vec<LimitWindow>,
}
fn number(value: &Value) -> Option<f64> {
    value.as_f64().filter(|v| v.is_finite() && *v >= 0.0)
}
fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(|s| s.chars().filter(|c| !c.is_control()).take(160).collect())
}
pub fn claude_usage(value: &Value) -> Usage {
    let limits = [
        ("five_hour", "5-hour"),
        ("seven_day", "7-day"),
        ("spend_limit", "Spend limit"),
    ]
    .into_iter()
    .filter_map(|(key, label)| {
        let item = &value["rate_limits"][key];
        Some(LimitWindow {
            label: label.into(),
            used_percent: number(&item["used_percentage"])?,
            resets_at: item["resets_at"].as_u64(),
        })
    })
    .collect();
    Usage {
        source: "Claude status line".into(),
        updated_at: now(),
        model: text(&value["model"]["display_name"]).or_else(|| text(&value["model"]["id"])),
        session_id: text(&value["session_id"]),
        input_tokens: value["context_window"]["total_input_tokens"].as_u64(),
        output_tokens: value["context_window"]["total_output_tokens"].as_u64(),
        context_size: value["context_window"]["context_window_size"].as_u64(),
        context_percent: number(&value["context_window"]["used_percentage"])
            .filter(|p| *p <= 100.0),
        cost_usd: number(&value["cost"]["total_cost_usd"]),
        limits,
    }
}

pub struct Probe {
    directory: tempfile::TempDir,
}
impl Probe {
    // Every pane gets a directory so the command channel exists; only Claude reports usage.
    pub fn new() -> Result<Self> {
        Ok(Self {
            directory: tempfile::Builder::new()
                .prefix("emdeck-agent-")
                .tempdir()
                .map_err(err)?,
        })
    }
    pub fn reporting() -> Result<Self> {
        let probe = Self::new()?;
        let report = probe.directory.path().join("usage.json");
        let exe = std::env::current_exe().map_err(err)?;
        let command = reporter_command(&exe, &report);
        fs::write(
            probe.directory.path().join("settings.json"),
            serde_json::to_vec(&json!({"statusLine":{"type":"command", "command":command}}))
                .map_err(err)?,
        )
        .map_err(err)?;
        Ok(probe)
    }
    pub fn command(&self, shell: &str, resume: Option<&str>) -> Result<String> {
        let file = self
            .directory
            .path()
            .join("settings.json")
            .to_string_lossy()
            .into_owned();
        let shell_name = Path::new(shell)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if shell_name == "cmd" {
            if file.contains(['%', '!', '"']) {
                return Err(
                    "Use PowerShell for Claude usage integration with this temporary folder path."
                        .into(),
                );
            }
            return Ok(format!("claude --settings \"{file}\"{}", resumed(resume)));
        }
        let powershell = matches!(shell_name.as_str(), "powershell" | "pwsh")
            || (shell_name.is_empty() && cfg!(windows));
        Ok(format!(
            "claude --settings {}{}",
            shell_quote(&file, powershell),
            resumed(resume)
        ))
    }
    pub fn directory(&self) -> &Path {
        self.directory.path()
    }
    pub fn read(&self) -> Option<Usage> {
        let path = self.directory.path().join("usage.json");
        if fs::metadata(&path).ok()?.len() > 16_384 {
            return None;
        }
        serde_json::from_slice(&fs::read(path).ok()?).ok()
    }
    pub fn read_changed(&self, previous: &mut Option<SystemTime>) -> Option<Usage> {
        let modified = fs::metadata(self.directory.path().join("usage.json"))
            .ok()?
            .modified()
            .ok()?;
        if previous.as_ref() == Some(&modified) {
            return None;
        }
        let usage = self.read()?;
        *previous = Some(modified);
        Some(usage)
    }
}
// An id the runtime rejects drops the flag rather than reaching the shell unvalidated.
fn resumed(session: Option<&str>) -> String {
    match emdeck_session::agent::resume_command("claude", session) {
        Some(args) => format!(" {}", args[1..].join(" ")),
        None => String::new(),
    }
}

fn shell_quote(value: &str, powershell: bool) -> String {
    if powershell {
        format!("'{}'", value.replace('\'', "''"))
    } else {
        format!("'{}'", value.replace('\'', "'\"'\"'"))
    }
}
fn reporter_command(exe: &Path, target: &Path) -> String {
    #[cfg(windows)]
    {
        use base64::Engine;
        let script = format!(
            "$OutputEncoding = [Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::In.ReadToEnd() | & {} --agent-report {}",
            shell_quote(&exe.to_string_lossy(), true),
            shell_quote(&target.to_string_lossy(), true)
        );
        let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
        format!(
            "powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand {}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        )
    }
    #[cfg(not(windows))]
    {
        format!(
            "{} --agent-report {}",
            shell_quote(&exe.to_string_lossy(), false),
            shell_quote(&target.to_string_lossy(), false)
        )
    }
}
fn report_target(target: &Path) -> Result<PathBuf> {
    let parent = target
        .parent()
        .ok_or("Missing report directory")?
        .canonicalize()
        .map_err(err)?;
    let temp = std::env::temp_dir().canonicalize().map_err(err)?;
    if target.file_name().is_none_or(|n| n != "usage.json")
        || parent.parent() != Some(temp.as_path())
        || !parent
            .file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with("emdeck-agent-"))
    {
        return Err("Reports are confined to Emdeck's temporary session directory.".into());
    }
    Ok(parent.join("usage.json"))
}
pub fn report(target: &Path, input: impl Read) -> Result<Usage> {
    let target = report_target(target)?;
    let mut data = Vec::new();
    input.take(131_073).read_to_end(&mut data).map_err(err)?;
    if data.len() > 131_072 {
        return Err("Usage report too large".into());
    }
    let value: Value = serde_json::from_slice(&data).map_err(err)?;
    let usage = claude_usage(&value);
    let mut temp = tempfile::NamedTempFile::new_in(target.parent().unwrap()).map_err(err)?;
    temp.write_all(&serde_json::to_vec(&usage).map_err(err)?)
        .map_err(err)?;
    temp.persist(&target).map_err(err)?;
    Ok(usage)
}
pub fn report_cli() -> bool {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new("--agent-report")) {
        return false;
    }
    if let Some(path) = args.next() {
        if let Ok(usage) = report(Path::new(&path), std::io::stdin().lock()) {
            println!(
                "Emdeck · {}{}",
                usage.model.as_deref().unwrap_or("Claude"),
                usage
                    .context_percent
                    .map(|n| format!(" · {n:.0}% context"))
                    .unwrap_or_default()
            );
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn usage_reporting_survives_a_resume_and_rejects_shell_syntax() {
        let probe = Probe::new().unwrap();
        let plain = probe.command("/bin/sh", None).unwrap();
        assert!(plain.starts_with("claude --settings"));
        assert!(!plain.contains("--resume"));

        let resumed = probe.command("/bin/sh", Some("abc_123-XY")).unwrap();
        assert!(resumed.starts_with("claude --settings"));
        assert!(resumed.ends_with(" --resume abc_123-XY"));

        for bad in ["a; rm -rf ~", "$(whoami)", "a b", "-flag", ""] {
            assert_eq!(probe.command("/bin/sh", Some(bad)).unwrap(), plain);
        }
    }
    #[test]
    #[ignore = "Requires EMDECK_TEST_REPORTER_EXE pointing to the built application"]
    fn built_reporter_accepts_statusline_stdin() {
        use std::process::{Command, Stdio};
        let exe = PathBuf::from(
            std::env::var_os("EMDECK_TEST_REPORTER_EXE").expect("Set EMDECK_TEST_REPORTER_EXE"),
        );
        assert!(exe.is_absolute() && exe.is_file());
        let probe = Probe::new().unwrap();
        let target = probe.directory.path().join("usage.json");
        let command = reporter_command(&exe, &target);
        let mut launcher = if cfg!(windows) {
            // The generated Windows command has no quoted arguments: its script
            // is UTF-16/base64. Launch the exact argv, without an extra cmd layer.
            let mut words = command.split_ascii_whitespace();
            let mut cmd = Command::new(words.next().unwrap());
            cmd.args(words);
            cmd
        } else {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", &command]);
            cmd
        };
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            launcher.creation_flags(0x08000000);
        }
        let mut child = launcher
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(r#"{"model":{"display_name":"Claude café"},"context_window":{"used_percentage":25}}"#.as_bytes()).unwrap();
        let result = child.wait_with_output().unwrap();
        assert!(
            result.status.success(),
            "reporter command failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        let report = probe
            .read()
            .expect("Reporter should write usage before printing the status line");
        assert_eq!(report.model.as_deref(), Some("Claude café"));
        assert_eq!(report.context_percent, Some(25.0));
        assert!(String::from_utf8_lossy(&result.stdout).contains("25% context"));
    }
    #[test]
    fn claude_metrics_preserve_missing_zero_and_scope_without_private_data() {
        let value = json!({"session_id":"abc", "transcript_path":"private", "model":{"display_name":"Opus"}, "cost":{"total_cost_usd":0}, "context_window":{"total_input_tokens":1200,"total_output_tokens":50,"used_percentage":12,"context_window_size":10000}, "rate_limits":{"five_hour":{"used_percentage":0,"resets_at":123}}});
        let usage = claude_usage(&value);
        assert_eq!(usage.cost_usd, Some(0.0));
        assert_eq!(usage.input_tokens, Some(1200));
        assert_eq!(usage.limits[0].used_percent, 0.0);
        assert!(!serde_json::to_string(&usage).unwrap().contains("private"));
        let missing = claude_usage(&json!({}));
        assert_eq!(missing.cost_usd, None);
        assert_eq!(missing.context_percent, None);
        assert!(missing.limits.is_empty());
    }
    #[test]
    fn reports_are_atomic_scoped_and_bounded() {
        let probe = Probe::new().unwrap();
        let target = probe.directory.path().join("usage.json");
        report(&target, br#"{"cost":{"total_cost_usd":1.2}}"#.as_slice()).unwrap();
        report(&target, br#"{"cost":{"total_cost_usd":2.3}}"#.as_slice()).unwrap();
        assert_eq!(probe.read().unwrap().cost_usd, Some(2.3));
        assert!(report(
            &probe.directory.path().join("settings.json"),
            b"{}".as_slice()
        )
        .is_err());
        assert!(report(&target, vec![b' '; 131_073].as_slice()).is_err());
        assert_eq!(probe.read().unwrap().cost_usd, Some(2.3));
        let other = tempfile::tempdir().unwrap();
        assert!(report(&other.path().join("usage.json"), b"{}".as_slice()).is_err());
    }
}
