# Changelog

## Unreleased

- Keep the historical terminal line being read visible when panes resize, while
  continuing to follow output at the bottom. User scrolling takes precedence
  over pending layout restoration in ordinary and background terminals.
- Arrange background terminals in rows, columns, grids or custom splits, with
  drag-and-drop placement, resizable dividers and keyboard controls. Keep
  running processes and input leases intact across layout changes.
- Use local and remote background sessions alongside ordinary terminals in
  Workspaces, with machine-qualified discovery, live status and explicit attach
  controls. Remember views without automatically launching agents.
- Collapse background machine settings or reduce the Workspaces sidebar to
  compact job tiles while retaining status colors, attention indicators and
  keyboard access. Remember each sidebar's visibility preference.
- Open each project folder in one window. Reopening an owned folder, including
  through a second app launch, restores and focuses its existing window while
  preserving unsaved edits and terminals.

- Stabilize workspace status color tests by waiting for terminal focus after
  selecting a session, then checking sidebar focus through keyboard navigation.
- Clear Claude's Working state when its foreground turn completes, including
  modern done footers with background shells, custom status lines and unsent
  drafts. Retained completion history cannot finish a newly submitted task.
- Stabilize the dotenv color regression check across file/theme switches by
  waiting for one consistent snapshot of the expected theme's token colors.
- Track Codex workspace activity through its terminal-title updates, retaining
  Working during streaming and detecting completion, approval requests and
  freeform or multi-step questions. Recognize dimmed composer placeholders and
  stop treating Codex's pre-answer divider as completion.
- Keep selected session titles, outlines and backgrounds consistent with their
  activity color, including keyboard focus, instead of the global green accent.
- Fix false Ready statuses while agents are working: recognize changing spinner
  labels, tall live screens and wrapped controls; invalidate stale prompts on
  submission, and report uncertain activity instead of guessing completion.
- Highlight workspace session states with colored borders, icons and readable
  badges. Distinguish approval requests from detected questions waiting for an
  answer, and include both in the attention count and filter.
- Keep editor selections visible on the current line in dark, light and graphite
  themes, including after focus and theme changes, without resetting undo
  history.
- Discard tracked changes from Source Control for one file or all files, with an
  explicit restore/delete preview, protection for unsaved editor buffers and
  changed-on-disk files, and support for staged edits, renames and deletions.
- Launch Windows debug builds as desktop applications without an extra console
  window whose Close button also terminates the IDE.
- Highlight environment files (`.env`, `.env.*`, and `*.env`), including keys,
  values, comments, export prefixes and quoted multiline values in every theme.
- Give the Windows Bun shell smoke test a bounded 60-second process budget and
  report launch errors, timeout details and captured output instead of a null
  exit-status assertion. Missing Bun now fails this required integration check.
- Restore Ctrl/Cmd+V and Ctrl+Shift+V paste in regular and background terminals,
  including clipboard images/files. Send a distinct Shift+Enter key for
  multiline prompts and preserve Enter, Ctrl+J, Alt+Enter and Ctrl+C behavior.
- Accept file drops and pasted image/file data in local terminal panes, with
  quoted paths, private temporary storage, bounded uploads and no automatic
  prompt submission. Explain unsupported file transfer in remote/background
  panes.
- Show agent-reported terminal titles in pane headers, agent cards, session tabs
  and background sessions. Keep manually assigned names, and preserve running
  terminals when their titles change.
- Keep the New terminal menu inside the window: open below or above the toolbar
  as space allows, scroll in short windows, and support keyboard navigation.
- Preserve colors in new terminal and agent panes even when Emdeck was started
  from a launcher with color output disabled. Apply the same behavior to
  background sessions while retaining explicit per-command color preferences.
- Add community feedback routes, structured bug/feature forms, a public roadmap,
  maintainer ownership, and a reviewed fork-to-dev contribution process.
- Protect unsaved manual merge drafts when closing immediately after typing,
  including before React finishes updating the interface.
- Resolve conflicts in a file-list modal with complete Ours/Theirs choices and a
  three-pane manual merge editor. Results are staged per file, with draft
  preservation, stale-version checks, binary/deletion handling and explicit
  rebase labels. See [merge conflict resolution](docs/MERGE-CONFLICTS.md).
- Keep the Welcome page fully scrollable in short panes and show shared
  scrollbars only while hovering containers with overflowing content.

- Use `main` for reviewed source and `dev` for ongoing development; validate
  both branches and keep routine dependency updates on `dev`.
- Allow the Bun shell integration test to use its existing 15-second child
  process budget on Windows CI instead of timing out after five seconds.
- Publication scans cover every tracked file and publishable new source file,
  plus all fetched Git history, without path exclusions or inline suppressions.
  Local credential/configuration folders are ignored, and documentation omits
  internal project names and directory structures.
- Experimental Emdeck-owned headless session server and optional Background
  sessions view. Local/SSH workspace inventories, unattached agent status,
  explicit control ownership, detach/stop, and cold layout restoration.
- Authenticated bounded JSON API and CLI for pane creation, input, prompts,
  waits and lifecycle reports. Opt-in Claude hook adapter and registered native
  Claude/Codex resume; standalone Rust binary has no Tauri/WebView dependency.

- Optional Workspaces terminal view with working-directory spaces, session tabs,
  attention filtering, and preserved terminal/editor lifetime.
- Saved, explicit connections to existing cmux TUI and tmux sessions over SSH,
  with custom SSH shell/command support, disconnect and reconnect controls.
- Claude Remote Control and other HTTPS provider-session links open their
  official browser interfaces. Remote status/usage capabilities are labeled.
- Native argv validation and per-window ownership; no automatic connection,
  remote server installation, provider login, or local usage probing for
  remotes.

## 0.1.22 — First public beta

- Lightweight file editing, Markdown previews, and independent project windows.
- Multiple terminal agents with configurable layouts and usage summaries.
- Git branch trees and action submenus, diff tabs, merge conflict tools and
  worktrees.
- Detected/custom run commands, recent commands, and Bun support.
- Dark/light themes, persistent layout, and last-project restoration.
- Organized feature architecture and typed native command boundaries.
- Open-source license, contributor/security/privacy documentation, and bundled
  dependency notices.
- Patched test dependencies, source/history secret scans, Rust advisory checks,
  and immutable CI action references.
- Four-target build/release workflows, signing integration, checksums, installer
  checks and an opt-in terminal soak test.
- Atomic saves retry brief Windows file locks while preserving external-change
  checks and unsaved editor content.
- Terminal layout and size changes keep following live output when the pane was
  at the bottom, while preserving deliberate scrollback reading.
- Windows terminals preserve launch-environment overrides, including tools added
  to `PATH` by a shell or tool manager.

**Unsigned beta:** Windows builds are unsigned; macOS builds use ad-hoc signing
without notarization. Operating-system warnings or device policy may prevent
launching them.

Test environments: Windows 11 x64 locally and Windows Server 2025 x64 in CI,
macOS 15.7.9 on Apple Silicon and Intel, and Ubuntu 24.04.5 x64. Linux downloads
are Ubuntu `.deb` packages. Other OS versions/distributions are not covered by
these results.

Auto-update, durable recovery of unsaved files, and agent reattachment after a
restart are not included. Provider usage fields depend on the installed CLI and
account. See [Validation](docs/VALIDATION.md) and the release's validation
record for completed checks and measurement scope.

## 0.1.21 — Unpublished release candidate

Installed Windows validation found that the terminal library replaced inherited
`PATH` entries with registry defaults, hiding Bun installed by the CI setup.
Publication was held for the 0.1.22 fix; the existing candidate tag was
preserved.

## 0.1.20 — Unpublished release candidate

Release validation found that resizing streaming terminal panes could leave
their views in older scrollback. Output remained intact. Publication was held
for the 0.1.21 fix; the existing candidate tag was preserved.

Earlier versions were local development builds. Their validation history remains
in `docs/VALIDATION.md`.
