use crate::services::project_identity::canonical_folder;
use crate::services::workspace::{err, Result};
use crate::{state::Projects, windows};
use serde::Serialize;
use std::path::Path;
use tauri::State;
#[derive(Serialize)]
pub(crate) struct Project {
    root: String,
    name: String,
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum OpenProject {
    Opened { project: Project },
    Focused { window: String },
}
#[tauri::command]
pub(crate) async fn open_project(
    window: tauri::Window,
    app: tauri::AppHandle,
    path: String,
    projects: State<'_, Projects>,
) -> Result<OpenProject> {
    let root = canonical_folder(Path::new(&path))?;
    let _routing = projects.routing.lock().map_err(err)?;
    if let Some(owner) = projects.authorize(window.label(), root.clone())? {
        windows::focus(&app, &owner)?;
        return Ok(OpenProject::Focused { window: owner });
    }
    let name = root
        .file_name()
        .unwrap_or(root.as_os_str())
        .to_string_lossy()
        .into_owned();
    Ok(OpenProject::Opened {
        project: Project {
            root: root.to_string_lossy().into_owned(),
            name,
        },
    })
}

#[tauri::command]
pub(crate) fn startup_project(
    window: tauri::Window,
    projects: State<'_, Projects>,
) -> Result<Option<String>> {
    Ok(projects
        .initial
        .lock()
        .map_err(err)?
        .get(window.label())
        .cloned())
}

#[tauri::command]
pub(crate) async fn open_project_window(
    app: tauri::AppHandle,
    path: String,
) -> Result<windows::OpenWindow> {
    windows::open(&app, Path::new(&path))
}
#[tauri::command]
pub(crate) async fn focus_project_window(
    app: tauri::AppHandle,
    window: tauri::Window,
    path: String,
) -> Result<Option<String>> {
    windows::focus_existing(&app, window.label(), Path::new(&path))
}
