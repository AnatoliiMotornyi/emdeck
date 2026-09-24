# Emdeck session server

Emdeck owns its session server. Herdr is a behavioral reference, not a runtime
dependency. This experimental feature is unreleased; the published 0.1.22 beta
does not include it.

## Desktop workflow

Background terminals are also available in **Workspaces**, alongside ordinary
terminals. Select **Background machines** in its sidebar to connect a local, SSH
or paired machine, or create a background terminal. **Back to sessions** returns
to the workspace list without changing the terminal view.

The workspace list identifies each background agent's machine and workspace,
shows its reported status, and includes blocked agents in **Needs attention**.
Click an agent to attach and focus it. **All sessions** shows attached ordinary
and background terminals together; **Split view**, **Side by side**, **Stacked**
and **Grid** control their arrangement. Unopened background agents remain listed
without taking an input lease. Offline machines show stale activity as offline.

Switching between Workspaces and Background sessions preserves existing terminal
views, scrollback and input ownership. Panes shows ordinary terminals while
background views remain attached but hidden. **Detach** removes the view from
both session views and leaves the process running; **Stop** explicitly confirms
ending the process on its machine. Existing enabled machine profiles reconnect
when a session view is activated. Opening a project does not launch agents. The
custom drag-and-resize split tree belongs to Background sessions; Workspaces
uses the ordinary row, column and grid presets.

Select **Background sessions** in the terminal view menu. Click **Connect local
server**, then expand **New background terminal**. Choose a machine, an existing
workspace or an absolute folder, and a command such as `claude` or `codex`. A
blank command starts the system shell.

The machines/settings sidebar groups sessions by computer and workspace. Click a
machine heading to fold its session list. Open **Machine settings** for
disconnecting, forgetting a saved machine or managing local Tailscale sharing.
The **New & connect** section contains terminal creation and connection setup.

Use **Collapse sessions sidebar** in its header to make more room for terminals.
A narrow **Show sessions sidebar** button remains available, with an attention
indicator when agents need an answer. Clicking that indicator opens the filtered
session list. Sidebar visibility is remembered on this device; collapsing it
preserves open setup forms, terminal views and connections. The pane layout
toolbar stays available above the terminals.

The rail lists every connected machine's workspaces and agents, including those
without attached views. **Needs attention** filters blocked agents and **Show
details** controls evidence labels. Select agents to attach them side by side.
Choose a workspace in the rail to focus its panes, or **All panes** to show
every attached view.

The layout toolbar offers **Side by side**, **Stacked** and **Grid**. Drag the
grip in a terminal header to another pane's left, right, top or bottom edge to
split that area; drop in its center to swap positions. The highlighted area
previews the destination. Drag a divider to resize a split, or double-click it
to balance its two sides. Selecting a preset arranges all panes evenly and
restores multiple views after expanding a single terminal.

For keyboard positioning, focus a grip and use arrow keys to move beside the
nearest pane, or Shift+arrow to swap. Focus a divider and use arrows to resize,
Shift+arrow for larger steps, or Enter to balance. Escape cancels a drag. Small
windows scroll when needed instead of shrinking terminals below usable sizes.
View positions and sizes are saved on this device, including panes from remote
machines. Filtering, changing themes and arranging panes preserve live views and
scrollback. Up to 64 views can be attached at once.

**Detach** leaves the process running. **Stop** explicitly ends the process
after confirmation. Stopped entries offer **Start again**, **Resume** when a
native conversation ID is registered, and **Remove**. Disconnect leaves the
server running; cached offline entries have input disabled. Reconnect explicitly
after a network error.

Enabled machine preferences and attached view IDs are remembered. Previously
enabled machines reconnect when this view opens again. Opening a project alone
never launches an agent. Another client's input ownership requires **Take
control**; abandoned ownership expires after 45 seconds.

## Remote installation

For direct connections without OpenSSH, use the optional
[Tailscale pairing workflow](TAILSCALE-SESSIONS.md). Sharing is disabled until
explicitly enabled on the host. The SSH workflow below remains available.

Build the standalone binary with stable Rust, without Tauri or a WebView:

```sh
cargo build --manifest-path src-tauri/Cargo.toml -p emdeck-session --release --locked
```

Copy `src-tauri/target/release/emdeck-session` (`.exe` on Windows) to the remote
PATH. Run `emdeck-session start` there. `server` runs in the foreground for
diagnostics, `status` prints the inventory, and `stop` stops the server and its
terminals.

Expand **Add an SSH machine** in Emdeck. Enter its SSH alias or `user@host`,
optional port and executable path/name. Use forward slashes in Windows paths.
Configure SSH keys, jump hosts and host trust with your normal SSH client first.
Emdeck uses noninteractive OpenSSH with strict host verification and no agent
forwarding. It does not install software or log in to providers remotely. The
server must already be running. Its `rpc` command exchanges JSON over SSH
stdin/stdout on Windows, macOS or Linux.

Existing cmux TUI, tmux and Claude Remote Control sessions use the separate
[remote adapters](REMOTE-SESSIONS.md); they are not imported into Emdeck's
server inventory. Ordinary terminal processes cannot be retroactively adopted.
Start a new session here or explicitly resume a provider conversation.

## Agent automation

`emdeck-session request '<JSON>'` accepts the desktop's typed actions. Pass each
payload as one argument with appropriate shell quoting:

```json
{"method":"workspace.create","params":{"root":"/home/me/project","name":"Project"}}
{"method":"pane.create","params":{"launch":{"workspaceId":"WORKSPACE_ID","name":"Claude","cwd":"/home/me/project","shell":"","command":"claude","resumeOnRestart":false},"cols":100,"rows":30}}
{"method":"pane.read","params":{"id":"PANE_ID","after":null,"wait_ms":0}}
{"method":"agent.wait","params":{"id":"PANE_ID","generation":"GENERATION","states":["blocked","idle"],"timeout_ms":25000}}
{"method":"agent.prompt","params":{"id":"PANE_ID","generation":"GENERATION","text":"Run the relevant tests"}}
```

Create another pane in the workspace to split work. Wait returns
`matched: false` on timeout/exit and errors if the occupant changes; reissue
bounded waits as needed. Prompt requires positive idle/done evidence and never
answers a permission dialog. Raw input uses `pane.attach` with a client ID,
`pane.input`, then `pane.detach`. Full action types are in
`runtime/src/protocol.rs`.

Children inherit `EMDECK_PANE_ID`, `EMDECK_PANE_GENERATION`,
`EMDECK_SESSION_HOME` and `EMDECK_CLI_EXE`. Integrations can call
`emdeck-session report working`, `report blocked`, or `report idle`. A second
argument registers a Claude/Codex conversation ID. The embedded IDE executable
uses `emdeck-ide.exe session ...`; the standalone binary omits `session`.

Claude command hooks can invoke `emdeck-session hook-claude` for `SessionStart`,
`UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`,
`PostToolUseFailure`, `Stop`, and `Notification`. Each event can use a group
like:

```json
{ "hooks": [{ "type": "command", "command": "emdeck-session hook-claude" }] }
```

The observer reads Claude's JSON stdin, reports state/session identity, ignores
child-agent completion and emits no approval decisions. Failures do not block
the agent. Hooks are opt-in; no global settings are changed. Use the
[official hook configuration](https://code.claude.com/docs/en/hooks) to install
them. Other agents can use the general reporting command. Command recognition
does not imply complete lifecycle support; unrecognized screens show
**unknown**.

## Boundaries

The headless `emdeck-session` Rust crate owns workspaces, PTYs, terminal screen
state, agent observations, and persisted layout metadata. It has no React,
Tauri, WebView, project indexer, or language-server dependency. The desktop is a
client. A standalone binary runs on remote machines without the desktop GUI.

The desktop, CLI, and SSH bridge use a versioned JSON protocol. Local access is
restricted to a loopback listener with a random capability stored in a private
per-user directory. The capability is never included in renderer state, URLs, or
remote profile settings. Remote access uses either the bridge through OpenSSH or
the optional TLS listener bound to a Tailscale IPv4 address. Direct clients pair
using an expiring, single-use code and keep their revocable credentials in
native private storage. No unauthenticated terminal access is exposed.

Closing a view releases its input ownership and disconnects its client. Stopping
a terminal or the server is a separate explicit operation. A slow or
disconnected client cannot stop PTY reads. Output buffers, frame sizes, clients
and terminal counts are bounded. Inactive machines send metadata changes, not
every screen.

## Persistence and authority

Live processes survive desktop close and network loss while their host and
server remain running. A sleeping local machine pauses work; a separate remote
host can continue. Reboot ends OS processes. Layout metadata can be restored,
and supported agents can resume a specifically recorded native conversation.
Arbitrary commands are never silently replayed after restart.

No OS login/startup service is installed. Start the server manually after
reboot, connect locally from Emdeck, or configure your own service manager.
Automatic native resume requires a registered conversation ID and the explicit
per-pane option. Claude uses `--resume ID`; Codex uses `resume ID`. This
restores provider conversation state, not the old OS process.

Agent states are `working`, `blocked`, `idle`, `done`, `unknown`, and `stopped`.
They come from explicit lifecycle reports or conservative terminal-screen
evidence. Output activity alone is not proof of completion or permission to send
input. A wait pins the pane's current process generation; a replacement cannot
accidentally satisfy it. A high-level prompt refuses blocked or unknown agents;
raw input remains an explicit separate API operation.

Terminal output is held in bounded memory, not written to project files. Layout
and explicitly registered conversation references are separate from terminal
history and credentials. Native session resume is an explicit per-pane choice.

Storage defaults to `%LOCALAPPDATA%/Emdeck/sessions` on Windows and
`$XDG_STATE_HOME/emdeck/sessions` (or `~/.local/state/emdeck/sessions`) on Unix.
`EMDECK_SESSION_HOME` overrides it with an absolute directory. Layout includes
commands and paths; files are private to the user (and SYSTEM on Windows).
Reattachment restores the current screen, not an unlimited history. In-memory
output disappears when the server restarts. Limits are 64 panes/64 workspaces.

Remote quota, cost and token aggregation is not implemented by this server; the
existing local metrics view remains available. Missing data is not zero usage or
proof of completion. Actual provider versions and authenticated remote hosts
still need validation before claiming production parity.

## Reference behavior

- [Herdr persistence](https://herdr.dev/docs/session-state/)
- [Herdr agent status](https://herdr.dev/docs/agents/)
- [Herdr automation](https://herdr.dev/docs/agent-automation/)
- [Herdr machine connections](https://herdr.dev/docs/connecting-machines/)

Validation results are recorded in `VALIDATION.md`.
