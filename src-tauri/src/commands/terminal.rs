use crate::services::workspace::{self, Result};
use crate::{services::terminal, state::Projects};
use std::path::Path;
use tauri::State;
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn terminal_connect_remote(
    window: tauri::Window,
    root: String,
    target: crate::services::remote::SshTarget,
    cols: u16,
    rows: u16,
    on_event: tauri::ipc::Channel<terminal::TerminalEvent>,
    projects: State<'_, Projects>,
    terminals: State<'_, terminal::WindowTerminals>,
) -> Result<String> {
    let root = projects.root(window.label(), &root)?;
    let command = crate::services::remote::command(&target, &root)?;
    terminals
        .get(window.label())?
        .spawn_prepared(command, None, cols, rows, move |event| {
            on_event.send(event).is_ok()
        })
}

#[tauri::command]
// IPC keeps named frontend arguments; Tauri injects the two state parameters.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn terminal_spawn(
    window: tauri::Window,
    root: String,
    cwd: String,
    shell: String,
    command: String,
    cols: u16,
    rows: u16,
    enhanced_usage: Option<bool>,
    resume: Option<String>,
    on_event: tauri::ipc::Channel<terminal::TerminalEvent>,
    projects: State<'_, Projects>,
    terminals: State<'_, terminal::WindowTerminals>,
) -> Result<String> {
    let root = projects.root(window.label(), &root)?;
    let path = workspace::resolve(&root, &cwd, false)?;
    if !Path::new(&path).is_dir() {
        return Err("Terminal working directory must be a folder.".into());
    }
    let group = terminals.get(window.label())?;
    terminal::spawn_channel(
        &group,
        &path,
        &shell,
        &command,
        cols,
        rows,
        enhanced_usage.unwrap_or(false),
        resume.as_deref(),
        on_event,
    )
}
#[tauri::command]
pub(crate) async fn terminal_write(
    window: tauri::Window,
    id: String,
    data: String,
    terminals: State<'_, terminal::WindowTerminals>,
) -> Result<()> {
    terminals.get(window.label())?.write(&id, &data)
}
#[tauri::command]
pub(crate) async fn terminal_attachment(
    window: tauri::Window,
    id: String,
    name: String,
    data: Vec<u8>,
    terminals: State<'_, terminal::WindowTerminals>,
) -> Result<String> {
    terminals.get(window.label())?.attachment(&id, &name, &data)
}
#[tauri::command]
pub(crate) async fn terminal_path_input(
    window: tauri::Window,
    id: String,
    paths: Vec<String>,
    terminals: State<'_, terminal::WindowTerminals>,
) -> Result<String> {
    terminals.get(window.label())?.path_input(&id, &paths)
}
#[tauri::command]
pub(crate) async fn terminal_resize(
    window: tauri::Window,
    id: String,
    cols: u16,
    rows: u16,
    terminals: State<'_, terminal::WindowTerminals>,
) -> Result<()> {
    terminals.get(window.label())?.resize(&id, cols, rows)
}
#[tauri::command]
pub(crate) async fn terminal_close(
    window: tauri::Window,
    id: String,
    terminals: State<'_, terminal::WindowTerminals>,
) -> Result<()> {
    terminals.get(window.label())?.close(&id)
}
