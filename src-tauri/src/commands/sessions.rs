use crate::services::sessions::{Sessions, Target};
use emdeck_session::{protocol::Action, Result};
use tauri::Manager;

#[tauri::command]
pub(crate) async fn session_pair(
    code: String,
    name: String,
) -> Result<emdeck_session::remote::PairedMachine> {
    tauri::async_runtime::spawn_blocking(move || {
        emdeck_session::remote::pair(&emdeck_session::storage::home()?, &code, &name)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn session_forget(window: tauri::Window, credential: String) -> Result<()> {
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || app.state::<Sessions>().forget(&credential))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn session_connect(window: tauri::Window, target: Target) -> Result<String> {
    let label = window.label().to_owned();
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || app.state::<Sessions>().connect(&label, target))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn session_request(
    window: tauri::Window,
    connection: String,
    action: Action,
) -> Result<serde_json::Value> {
    let label = window.label().to_owned();
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Sessions>().call(&label, &connection, action)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) fn session_disconnect(
    window: tauri::Window,
    connection: String,
    sessions: tauri::State<'_, Sessions>,
) {
    sessions.disconnect(window.label(), &connection);
}
