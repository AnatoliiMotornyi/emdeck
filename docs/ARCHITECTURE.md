# Emdeck architecture

Emdeck is one standalone desktop product, using Tauri 2/Rust, React/TypeScript,
CodeMirror and xterm. It uses the system webview and adds no indexing service,
language server or database. Its optional headless server owns ordinary CLI
processes; it does not replace their agent runtimes.

## Project conventions

Emdeck's contributor requirements are defined in [AGENTS.md](../AGENTS.md) and
enforced by the configuration and checks in this repository:

- One-way UI → domain dependencies, injected ports and plain request/result
  types keep services independent of React and native transport.
- Typed imports, named JSX handlers and stable native identifiers make ownership
  and lifecycle behavior explicit.
- Bun 1.3.6, Node 22, layered tests, formatting and dependency guards provide a
  consistent development environment.
- Components and hooks have a 500-line limit, services 700 and tests 900, with
  no legacy exemptions.

## Ownership and dependencies

```text
src/
  App.tsx                 Application view composition
  app/
    components/           Workspace chrome and cross-feature view composition
    hooks/                Window lifecycle and workspace action coordination
  features/
    agents/               Terminal sessions, agent cards and usage presentation
    editor/               Documents, CodeMirror and Markdown
    explorer/             Lazy file tree
    git/                  Branches, changes, comparisons and worktrees
    projects/             Project picker and startup preferences
    runs/                 Discovery, custom commands and history
    settings/             Preferences and themes
  shared/
    contracts/            Serializable data, dialog and IPC contracts
    lib/                  Neutral path helpers
    ui/                   Domain-independent dialog and file-icon primitives
  platform/
    desktop/              Typed Tauri transport
    preview/              Explicit browser demo adapter
    storage/              Resilient local preference persistence
  styles/                 Styles split by ownership; ordered from styles.css
src-tauri/src/
  lib.rs                  Registration and application startup
  commands/               Window authorization, IPC arguments and dispatch
  services/               Files, Git, worktrees, PTYs, Markdown and usage
  state/                  Per-window project authorization and lifetime
src-tauri/runtime/        Independent session server, CLI, protocol, PTYs,
                         private storage, lifecycle evidence and SSH bridge
tests/
  unit/                   In-memory services and transformations
  integration/            Real local process execution
  e2e/                    Browser workflows and typed desktop fixtures
```

The app composes features. Features cannot import another feature or the app.
Domain services depend on plain contracts, neutral helpers and their own service
modules; React and platform IO stay outside. Platform adapters depend on shared
contracts, never on views. These rules apply to type imports and dynamic
imports, and cycles are rejected by `architecture:check`.

`useWorkspaceState` owns one window's coordinated workspace state. The action
hooks accept explicit `Pick` contracts rather than importing a global mutable
store. This keeps project replacement, active tabs and unsaved-file protection
coordinated without adding a state-management runtime. Smaller feature services
handle document reconciliation and run discovery through typed inputs/ports.

`shared/contracts/desktop.ts` maps each command to its argument and result
types. The bridge infers results from command names; callers cannot invent a
response type. The architecture check compares that command list with Rust
registration. Rust remains authoritative for access control, revision checks,
Git locking and terminal ownership. The check catches name drift, not every
Rust/TS field-type change; native tests and browser adapter tests cover payload
behavior.

## Lifetime and performance

The optional Background sessions view is a client of `src-tauri/runtime`. That
independent crate owns PTYs and bounded VT screen state; desktop windows own
only connections and input leases. Native session commands scope connection IDs
to the invoking window and add its identity to input ownership. The local
capability never reaches React. SSH transports the same concurrent JSON RPC
without installing or authenticating remote software implicitly. Structural
server mutations are serialized independently of screen reads and input. The
standalone server has no Tauri dependency; Windows' embedded fallback runs from
a private copy so the IDE remains replaceable while agents work. See
[persistence and automation](PERSISTENT-AGENTS.md).

Opening a second project defaults to a new native window. Replacement resets
that window's views only after the existing confirmation flow. Native project
roots and terminal groups are keyed by the invoking window, not
renderer-provided IDs.

Terminal launch inputs are sampled when its identity/restart counter changes.
Appearance updates reconfigure the existing terminal. Hidden and maximized panes
remain mounted. CodeMirror samples a document on tab switches and separately
applies content/theme updates, preserving per-file undo history.

Desktop terminals observe xterm's OSC title events and publish bounded plain
text metadata without changing pane identity or launch inputs. The agents
service selects a manual name, reported title or launch label, in that order.
The session server captures the same title sequences through its VT parser and
includes optional title metadata in snapshots and reads, including for detached
clients. Title changes notify snapshot listeners without triggering disk writes.
New process generations clear the previous title; older stored sessions without
the field remain compatible.

Terminal attachment listeners share the xterm lifetime. Native drop coordinates
select the visible pane under the pointer; browser clipboard/file events feed a
serialized, bounded staging queue. Native commands authorize the invoking
window's live PTY before storing bytes or quoting paths for its launch shell.
Each PTY owns a private temporary attachment directory, removed with the
process. Paths are inserted through xterm's paste API without a newline. Pending
uploads cannot write into a closed or restarted pane. Remote and background
views show an explicit unsupported-transfer message and leave text input and
leases intact.

Both terminal views use one keyboard adapter owned by the xterm instance. A pure
service selects shortcut ownership. Paste gestures bypass xterm's control
character translation without canceling the webview's native ClipboardEvent,
preserving text, images and file handling. Shift+Enter sends the CSI-u modified
Enter sequence through the existing input stream; it never sends an extra submit
or bypasses background input leases. IME composition and other agent keys retain
xterm handling. Clipboard fixture tests never access the user's system
clipboard.

New desktop and background PTYs share their terminal environment policy in the
session runtime. They advertise `xterm-256color` and true color and clear
inherited `NO_COLOR`, `FORCE_COLOR`, `CLICOLOR`, `CLICOLOR_FORCE` and
`NODE_DISABLE_COLORS` overrides, so a launcher configured for plain logs does
not disable colors inside the IDE. Other environment variables, including
launch-time PATH, remain inherited. Users can still opt out of colors explicitly
in a shell profile or custom launch command. This applies when a process starts;
changing the IDE does not alter running terminal sessions.

Run discovery reads only the root listing and `package.json`. Its injected IO
port makes cancellation and read limits testable without launching an app.
Document reconciliation uses the current buffer when a read completes, keeping
edits made while IO was pending. Git remains explicit or focus-triggered.

The merge dialog loads only the selected conflicted file. Native `git_conflicts`
reads Git's unmerged index stages and validates the index, HEAD and working-file
revision before applying a choice. Accepting a complete side handles binary
files and deletions; a manual result must be UTF-8 text without remaining
conflict markers. Applying a result stages that path without committing or
continuing the operation. Git mutations share the repository operation guard.
Oversized files, symlinks and submodules report an explicit terminal fallback
instead of attempting text conversion.

The Git feature receives a typed conflict IO port and an editor render slot.
`WorkspaceConflicts` composes the CodeMirror editor without sibling feature
imports. Manual drafts survive file selection and failed saves, and participate
in the native window's unsaved-edit check. Open editor buffers are checked
before reading and applying a resolution; unsaved tabs must be saved or closed.
Shared modal keyboard handling belongs only to the topmost dialog.

Discard actions compose in `useDiscardActions`. The native `git_discard` service
prepares an explicit tracked-file selection, including both ends of a rename,
and fingerprints HEAD, the index, status and selected working files. Applying
revalidates that preview under the repository operation guard, then passes only
the confirmed literal paths to Git. Untracked files, links, submodules and Git
metadata are protected. The invoking window's project is authorized by thin
native commands; editor drafts are checked before preview and after
confirmation. Git and document reconciliation refresh the current workspace
after completion. Replacing a shared confirmation cancels the previous promise,
releasing pending operation locks if a native window-close prompt interrupts the
interaction.

Merge draft transitions publish their dirty flag synchronously to a per-window
close guard. Native close events read that guard directly, so closing
immediately after an edit does not depend on a deferred React render or effect.
Draft cleanup clears the guard when the resolver unmounts.

The optional terminal workspace rail filters the existing pane tree; its xterm
instances retain stable parents and keys. Saved remote profiles and view
preferences are explicit UI state. The pure agent-activity service inspects a
bounded live viewport for working, approval, question and ready cues; no
transcript scan or background poll is added. Sidebar status presentation keeps
connection states distinct from detected activity and includes approvals and
questions in the attention filter. Theme-specific colors, icons and labels
provide redundant indicators without changing terminal identity. Pure connection
validation and space grouping live in the agents domain service. The typed
remote command validates the invoking window's project, builds OpenSSH argv
natively, and reuses the owned PTY lifetime. Structured multiplexer fields
reject shell syntax. User-authored custom command text is one remote argument,
never evaluated by a local shell. Remote panes do not start local provider usage
probes. Browser-provider profiles dispatch only an explicitly requested HTTPS
URL through the existing external-URL command. See
[Remote sessions](REMOTE-SESSIONS.md) for capabilities and boundaries.

Desktop activity inspection reads at most 256 live physical rows, joins xterm
soft wraps, and removes trailing blank screen space before classifying a bounded
tail. A per-process domain tracker invalidates old prompt evidence on
submission. Silence cannot complete a task. Claude's new completion row can
finish its foreground turn even with a custom footer, cropped composer, unsent
draft or running background shells. Completion identity excludes decorative
glyphs and background-shell counts; repeated occurrences are tracked so a new
equal-duration turn can finish without accepting retained history after submit.
Ambiguous composers during a turn report unknown activity. The tracker is owned
by the existing terminal lifetime, receives only screen/input events, and stores
no transcripts on disk. Pane exit/error state retains presentation priority.

Codex uses a provider-specific domain tracker that also receives OSC title
events from the existing xterm instance. The default activity prefix and its
removal from the same title provide working/idle evidence without polling or
changing provider configuration. Action-required titles are refined by the
current approval/question controls. A typed optional cell-attribute port lets
screen extraction distinguish Codex's dim placeholder from a draft or disabled
composer. Older pre-answer dividers cannot finish a turn; without title
evidence, only a fresh final completion footer can. The same bounded screen and
process lifetime constraints apply. This adapter does not change the independent
background-session server or infer remote activity from SSH output.

Style imports retain their original cascade order. Responsive overrides load
last. Shared scrollbar styles belong in `styles/scrollbars.css`: containers use
`overflow: auto`, and thumbs are transparent until that container is hovered.
Keep gutter dimensions unchanged on hover so editors and terminals do not
resize. Vertically centered scroll content must fall back to start alignment
when it overflows, keeping both ends reachable at small pane sizes.

The terminal launch menu is portaled to the document body to escape panel
containment and toolbar stacking. Its pure placement helper selects above or
below the trigger and clamps width and scrollable height to the visible
viewport. Resize/scroll observers exist only while the menu is open; positioning
updates its DOM styles without rerendering terminal sessions.

Linting, type checks, architecture checks and React Doctor are development
tools; none run inside the shipped IDE or analyze projects opened by its users.

## Validation commands

```sh
bun install --frozen-lockfile
bun run check
bun run test:unit
bun run test:integration
bun run test:native
bun run test:e2e
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
bun run desktop:build
```

`bun run verify` runs the frontend checks and all test tiers. `npm run` aliases
remain usable, but dependency installation uses the single Bun lockfile. The
GitHub workflows build native targets on Windows, macOS and Linux. Browser tests
use Edge on Windows; they run against Vite preview of a production build, so
source edits cannot change the application midway through a test.

React Doctor is an additional advisory audit, pinned to 0.9.13. Disable its
score, telemetry and supply-chain network checks; review diagnostics alongside
ESLint, behavioral tests and the application lifetime requirements. See the
validation log for the audit outcome and [the React audit](REACT-AUDIT.md) for
the command and remaining recommendations.

Reference:
[React Doctor's upstream CLI](https://github.com/millionco/react-doctor).
