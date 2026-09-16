use crate::services::workspace::{err, Result};
use crate::{
    services::{git, git_branches, git_conflicts, git_discard, worktrees},
    state::Projects,
};
use tauri::{Manager, State};

#[tauri::command]
pub(crate) async fn git_discard_preview(
    window: tauri::Window,
    root: String,
    paths: Vec<String>,
    projects: State<'_, Projects>,
) -> Result<git_discard::Plan> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || git_discard::preview(&root, &paths))
        .await
        .map_err(err)?
}

#[tauri::command]
pub(crate) async fn git_discard_apply(
    window: tauri::Window,
    root: String,
    request: git_discard::Request,
    projects: State<'_, Projects>,
) -> Result<()> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || git_discard::apply(&root, &request))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_conflict(
    window: tauri::Window,
    root: String,
    path: String,
    projects: State<'_, Projects>,
) -> Result<git_conflicts::Conflict> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || git_conflicts::read(&root, &path))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_resolve_conflict(
    window: tauri::Window,
    root: String,
    request: git_conflicts::Resolution,
    projects: State<'_, Projects>,
) -> Result<()> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || git_conflicts::resolve(&root, &request))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_snapshot(
    window: tauri::Window,
    root: String,
    projects: State<'_, Projects>,
) -> Result<git::Snapshot> {
    let path = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || git::snapshot(&path))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_action(
    window: tauri::Window,
    root: String,
    action: String,
    value: String,
    original: Option<String>,
    projects: State<'_, Projects>,
) -> Result<String> {
    let path = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || {
        git::action(&path, &action, &value, original.as_deref())
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_branch_action(
    window: tauri::Window,
    root: String,
    request: git_branches::BranchRequest,
    projects: State<'_, Projects>,
) -> Result<String> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || git_branches::action(&root, &request))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_compare(
    window: tauri::Window,
    root: String,
    base: String,
    head: String,
    working: bool,
    projects: State<'_, Projects>,
) -> Result<git_branches::Comparison> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || {
        git_branches::compare(&root, &base, &head, working)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_diff(
    window: tauri::Window,
    root: String,
    path: String,
    staged: bool,
    projects: State<'_, Projects>,
) -> Result<String> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || git::diff(&root, &path, staged))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_worktrees(
    window: tauri::Window,
    app: tauri::AppHandle,
    root: String,
    projects: State<'_, Projects>,
) -> Result<Vec<worktrees::Worktree>> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || {
        let projects = app.state::<Projects>();
        let active = projects.active.lock().map_err(err)?;
        worktrees::list(&root, &active.values().cloned().collect::<Vec<_>>())
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_worktree_create(
    window: tauri::Window,
    root: String,
    request: worktrees::CreateWorktree,
    projects: State<'_, Projects>,
) -> Result<String> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || worktrees::create(&root, &request))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn git_worktree_remove(
    window: tauri::Window,
    app: tauri::AppHandle,
    root: String,
    path: String,
    projects: State<'_, Projects>,
) -> Result<()> {
    let root = projects.root(window.label(), &root)?;
    tauri::async_runtime::spawn_blocking(move || {
        let projects = app.state::<Projects>();
        // Opening/replacing a project must wait until this removal finishes.
        let active = projects.active.lock().map_err(err)?;
        worktrees::remove(&root, &path, &active.values().cloned().collect::<Vec<_>>())
    })
    .await
    .map_err(err)?
}
