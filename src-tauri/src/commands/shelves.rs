use crate::services::workspace::{err, Result};
use crate::{services::shelves, state::Projects};
use tauri::State;

#[tauri::command]
pub(crate) async fn shelf_list(
    window: tauri::Window,
    root: String,
    projects: State<'_, Projects>,
) -> Result<Vec<shelves::Shelf>> {
    let path = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || shelves::list(&path))
        .await
        .map_err(err)?
}

#[tauri::command]
pub(crate) async fn shelf_create(
    window: tauri::Window,
    root: String,
    name: String,
    paths: Vec<String>,
    projects: State<'_, Projects>,
) -> Result<shelves::Shelf> {
    let path = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || shelves::create(&path, &name, &paths))
        .await
        .map_err(err)?
}

#[tauri::command]
pub(crate) async fn shelf_apply(
    window: tauri::Window,
    root: String,
    id: String,
    force: bool,
    projects: State<'_, Projects>,
) -> Result<shelves::UnshelveReport> {
    let path = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || shelves::apply(&path, &id, force))
        .await
        .map_err(err)?
}

#[tauri::command]
pub(crate) async fn shelf_delete(
    window: tauri::Window,
    root: String,
    id: String,
    projects: State<'_, Projects>,
) -> Result<()> {
    let path = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || shelves::delete(&path, &id))
        .await
        .map_err(err)?
}
