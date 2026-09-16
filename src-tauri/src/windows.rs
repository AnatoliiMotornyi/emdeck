use crate::services::project_identity::{canonical_folder, launch_folder};
use crate::services::terminal::WindowTerminals;
use crate::services::workspace::{err, Result};
use crate::state::Projects;
use serde::Serialize;
use std::{path::Path, sync::atomic::Ordering};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub(crate) struct OpenWindow {
    label: String,
    reused: bool,
}

pub(crate) fn focus(app: &AppHandle, label: &str) -> Result<()> {
    let window = app
        .get_webview_window(label)
        .ok_or("The project window is closing. Try opening it again.")?;
    window.show().map_err(err)?;
    window.unminimize().map_err(err)?;
    window.set_focus().map_err(err)?;
    Ok(())
}

// Callers hold `routing`; window creation also reserves the root before its
// renderer loads, so simultaneous requests cannot create a second owner.
fn existing(app: &AppHandle, root: &Path) -> Result<Option<String>> {
    let projects = app.state::<Projects>();
    if let Some(owner) = projects.owner(root)? {
        if app.get_webview_window(&owner).is_some() {
            return Ok(Some(owner));
        }
        projects.forget(&owner);
    }
    Ok(None)
}

pub(crate) fn focus_existing(
    app: &AppHandle,
    current: &str,
    path: &Path,
) -> Result<Option<String>> {
    let root = canonical_folder(path)?;
    let projects = app.state::<Projects>();
    let _routing = projects.routing.lock().map_err(err)?;
    if let Some(owner) = existing(app, &root)? {
        // A newly created window has a reservation, but still needs its first
        // open_project call to authorize the root and initialize its renderer.
        if owner == current && projects.root(current, &root.to_string_lossy()).is_err() {
            return Ok(None);
        }
        focus(app, &owner)?;
        return Ok(Some(owner));
    }
    Ok(None)
}

pub(crate) fn open(app: &AppHandle, path: &Path) -> Result<OpenWindow> {
    let root = canonical_folder(path)?;
    let projects = app.state::<Projects>();
    let terminals = app.state::<WindowTerminals>();
    let _routing = projects.routing.lock().map_err(err)?;
    if let Some(label) = existing(app, &root)? {
        focus(app, &label)?;
        return Ok(OpenWindow {
            label,
            reused: true,
        });
    }
    let label = format!(
        "workspace-{}",
        projects.next_window.fetch_add(1, Ordering::Relaxed)
    );
    if let Some(owner) = projects.activate(&label, &root)? {
        focus(app, &owner)?;
        return Ok(OpenWindow {
            label: owner,
            reused: true,
        });
    }
    let build = || -> Result<()> {
        projects
            .initial
            .lock()
            .map_err(err)?
            .insert(label.clone(), root.to_string_lossy().into_owned());
        terminals.register(&label)?;
        let name = root
            .file_name()
            .unwrap_or(root.as_os_str())
            .to_string_lossy();
        tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(format!("{name} — Emdeck"))
            .inner_size(1440.0, 960.0)
            .min_inner_size(900.0, 640.0)
            .background_color(tauri::window::Color(18, 20, 24, 255))
            .build()
            .map_err(err)?;
        Ok(())
    };
    if let Err(error) = build() {
        projects.forget(&label);
        terminals.close_window(&label);
        return Err(error);
    }
    focus(app, &label)?;
    Ok(OpenWindow {
        label,
        reused: false,
    })
}

pub(crate) fn focus_recent(app: &AppHandle) -> Result<()> {
    let preferred = app
        .state::<Projects>()
        .last_focused
        .lock()
        .map_err(err)?
        .clone();
    let windows = app.webview_windows();
    let label = preferred
        .filter(|label| windows.contains_key(label))
        .or_else(|| windows.contains_key("main").then(|| "main".into()))
        .or_else(|| windows.keys().min().cloned());
    if let Some(label) = label {
        focus(app, &label)?;
    }
    Ok(())
}

pub(crate) fn reopen(app: &AppHandle, args: Vec<String>, cwd: String) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = launch_folder(&args, Path::new(&cwd)).and_then(|root| match root {
            Some(root) => open(&app, &root).map(|_| ()),
            None => focus_recent(&app),
        });
        if let Err(error) = result {
            report_error(&app, error);
        }
    });
}

pub(crate) fn report_error(app: &AppHandle, error: String) {
    use tauri_plugin_dialog::DialogExt;
    let _ = focus_recent(app);
    app.dialog()
        .message(error)
        .title("Could not open project")
        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
        .show(|_| {});
}
