mod commands;
mod services;
mod state;
use services::{agent_command, agent_usage, codex_usage, terminal};
use state::Projects;
use tauri::Manager;

pub fn run() {
    if std::env::args().nth(1).as_deref() == Some("session") {
        if let Err(error) = emdeck_session::cli::run(std::env::args().skip(2).collect(), true) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    if agent_usage::report_cli() || agent_command::command_cli() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Projects::default())
        .manage(services::sessions::Sessions::default())
        .manage(codex_usage::UsageCache::default())
        .manage(terminal::WindowTerminals::default())
        .setup(|app| {
            app.state::<terminal::WindowTerminals>()
                .register("main")
                .map_err(std::io::Error::other)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .app_handle()
                    .state::<services::sessions::Sessions>()
                    .close_window(window.label());
                window
                    .app_handle()
                    .state::<Projects>()
                    .forget(window.label());
                window
                    .app_handle()
                    .state::<terminal::WindowTerminals>()
                    .close_window(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::session_connect,
            commands::sessions::session_pair,
            commands::sessions::session_forget,
            commands::sessions::session_request,
            commands::sessions::session_disconnect,
            commands::projects::open_project,
            commands::projects::startup_project,
            commands::projects::open_project_window,
            commands::workspace::read_directory,
            commands::workspace::read_file,
            commands::workspace::find_file,
            commands::workspace::read_image,
            commands::workspace::open_external_url,
            commands::workspace::save_file,
            commands::workspace::create_entry,
            commands::workspace::rename_entry,
            commands::workspace::copy_entry,
            commands::workspace::trash_entry,
            commands::workspace::reveal_entry,
            commands::git::git_snapshot,
            commands::git::git_discard_preview,
            commands::git::git_discard_apply,
            commands::git::git_conflict,
            commands::git::git_resolve_conflict,
            commands::git::git_action,
            commands::git::git_branch_action,
            commands::git::git_compare,
            commands::git::git_diff,
            commands::git::git_worktrees,
            commands::git::git_worktree_create,
            commands::git::git_worktree_remove,
            commands::terminal::terminal_spawn,
            commands::terminal::terminal_connect_remote,
            commands::terminal::terminal_write,
            commands::terminal::terminal_attachment,
            commands::terminal::terminal_path_input,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::usage::codex_account_usage
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Emdeck")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<terminal::WindowTerminals>().close_all();
            }
        });
}
