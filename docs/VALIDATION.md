# Validation — Emdeck

Versions through 0.1.3 were released as Relay; versions 0.1.4–0.1.14 were
released as Veldri. Historical artifact names below are unchanged.

## Unreleased — terminal scrollback during resizing

Validated on Windows x64 on 2026-09-15. `bun run verify` passed with 197 unit, 3
integration, 88 native and 155 browser tests; three existing native tests remain
opt-in. Rust formatting, Clippy and source/history secret scans passed. React
Doctor retained its reviewed findings without new diagnostics.

The new row-resize regression failed against the previous build: the first
visible historical line changed from output 0 to output 6. It passes with line
anchoring, including shrinking/growing and following output at the bottom. Both
resize regressions passed five consecutive runs against fixed assets, followed
by the full suite. The original CI test now uses a real wheel gesture and waits
for rendered history instead of racing a raw `scrollTop` assignment against
xterm's asynchronous resize. Unit tests cover reflow, rapid fits, buffer
changes, trimmed markers and cancellation/disposal. No user IDE session was
restarted; macOS/Linux execution of this follow-up remains for CI.

## Unreleased — compact Workspaces sidebar

Validated on Windows x64 on 2026-09-15. `bun run verify` passed with 193 unit, 3
integration, 88 native and 154 browser tests; three existing native
provider/soak tests remain opt-in. Rust formatting and Clippy passed. The normal
Windows executable built from the same fixed frontend assets. React Doctor
findings were reviewed in the [audit notes](REACT-AUDIT.md).

Six new browser workflows cover compact status colors, icons and keyboard focus
in Dark, Light and Graphite; live attention counts; remembered collapse and
restored search text; local/remote background jobs; and short-window scrolling
with hover-only scrollbars. Terminal DOM markers, keyboard input and recorded
RPCs verify that collapse and expansion do not stop processes, remount terminal
views or acquire duplicate background leases. The expanded status tests and
existing workspace flows pass as well. Screenshots of all three themes and the
short layout were visually reviewed. Native macOS/Linux interaction remains for
platform validation; no running user session was restarted.

## Unreleased — one window per project

Validated on Windows x64 on 2026-09-15. `bun run verify` passed with 193 unit, 3
integration, 88 native and 148 browser tests; the three existing native
provider/soak tests remain opt-in. Rust formatting, Clippy and the Rust
dependency audit passed. Third-party Rust license notices include the
single-instance plugin and its dependencies. React Doctor findings were reviewed
in the [audit notes](REACT-AUDIT.md). The normal Windows release executable
built successfully with the production identifier and the same fixed frontend
assets.

Native registry tests cover concurrent folder claims, Windows case/extended
paths, authorization isolation and releasing ownership. Five browser regressions
cover new-window reuse, same-window and other-window focus before discarding, a
claim during confirmation, and startup initialization. Existing worktree, close,
project replacement and terminal workflows also pass.

The real WebView2 acceptance script in
[Project windows](PROJECT-WINDOWS.md#windows-acceptance-test) passed with a
separate app identifier, profile and temporary folders. It verifies one window
for path aliases and concurrent opens, second-process forwarding with relative
paths, focus and unminimize, separate windows for separate folders, native
replacement refusal, preserved unsaved editor text and a still-responsive PTY,
and reopening after a window closes. The shell's changing OSC title is handled
by the test locator. No user project or running agent was used as a fixture.
Native macOS/Linux window interaction remains for platform validation.

## Unreleased — background terminals in Workspaces

Validated on Windows x64 on 2026-09-15. The final `bun run verify` passed with
193 unit, 3 integration, 85 native and 143 browser tests; three existing native
provider/soak tests remain opt-in. Rust formatting and Clippy passed. The
Windows release executable was built from the same fixed frontend assets.

New synthetic local/remote browser workflows cover mixed ordinary/background
layouts, machine-qualified discovery and status badges, attention filtering,
keyboard input, view/theme switching, sidebar controls, disconnect, detach,
explicit creation and restored attachments. DOM markers and RPC records confirm
that changing presentation creates no duplicate connections or leases and does
not restart processes. Reopening restores background views without issuing a new
launch. Project defaults populate untouched creation fields after startup;
manual form drafts remain intact. Light-theme rendering was visually reviewed.

The full run also covers project-open notifications, editor history, Git,
attachments and existing background layouts/sharing. The shared canvas exposes
its layout announcements only while that layout is active. React Doctor retains
four reviewed Worktrees false positives and 69 warnings; see the
[audit notes](REACT-AUDIT.md). Native macOS/Linux interaction remains for
platform validation. No live user agent session was restarted for these checks.

## Unreleased — collapsible background sidebar

Validated on Windows x64 on 2026-09-15. `bun run verify` passed with 190 unit, 3
integration, 85 native and 139 browser tests; the three existing native
provider/soak tests remain opt-in. Rust formatting and Clippy passed. The
Windows release executable was built from the same fixed frontend assets.

Browser coverage verifies sidebar collapse/restore, remembered visibility,
independent machine disclosures, grouped connection settings, attention
navigation, and short-window controls in dark and light themes. Terminal DOM
identity, input and unfinished form values survive collapse; no stop, restart or
detach operations occur. Existing sharing, pairing and layout tests pass with
the new navigation. React Doctor findings were reviewed in
[the audit notes](REACT-AUDIT.md). Native macOS/Linux interaction remains for
platform validation.

## Unreleased — background terminal layouts

Validated on Windows x64 on 2026-09-15:

- `bun run verify` passed: 190 unit tests, 3 integration tests, 85 native tests
  and 135 browser workflows. Three existing native provider/soak tests remain
  opt-in. Rust formatting and Clippy passed with warnings denied.
- Synthetic local and remote machines exercise rows, columns, grid, mixed
  splits, pane swapping, pointer cancellation, keyboard movement, resizing,
  workspace filtering, theme changes, persistence, disconnect/reconnect and
  terminal renaming. Stable terminal elements and RPC records verify that
  rearranging views neither remounts attached terminals nor restarts processes.
- Scrollback and input survive resizing. Small windows scroll, and selecting a
  preset exits the single-pane expanded view. Pure service tests check layout
  coverage, minimum pane sizes, non-overlap, hidden panes and corrupt
  preferences.
- Pointer-based pane dragging is tested with HTML drag events blocked, matching
  the constraint imposed by native file-drop handling on Windows. Existing file
  attachment and clipboard workflows also pass. These browser tests use the
  fixed production build in Edge; native macOS/Linux interaction awaits CI and
  platform review.
- The pinned React Doctor audit was reviewed without suppression; see
  [the audit notes](REACT-AUDIT.md).

## Unreleased — public source review

Reviewed on 2026-09-09 before publishing the session-server changes:

- Gitleaks 8.30.1 scanned the 391-file publication inventory and all 16 fetched
  commits with no detected secrets. Both scans used the default rules without
  path exclusions, ignore-file suppressions or inline allow comments.
- Reviewed non-vendored source and documentation for internal endpoints,
  personal paths, private project references and credential material. The public
  workspace screenshot contains synthetic demo content. No environment files,
  signing keys, local agent state, transcripts or build outputs are in the
  publication inventory.
- Removed internal project names and directory references from current
  documentation. Existing public history retains earlier documentation; this
  review does not rewrite commits or tags.
- GitHub secret scanning, push protection and private vulnerability reporting
  are enabled. GitHub reported no open secret or dependency alerts; the local
  JavaScript vulnerability audit also passed.
- Added isolated integration coverage for force-tracked ignored files and
  refusal to follow a tracked directory replaced with a filesystem link.

Automated scanning cannot establish that every possible form of confidential
business information is absent. This review covers source publication; it does
not approve new binary releases or arbitrary user-created project data.

## Unreleased — Emdeck session server

Windows x64 validation on 2026-09-09; not included in the published 0.1.22 beta.

- `bun run verify` passed with 49 unit tests, 1 integration test and 60 browser
  workflows. A final native follow-up passed 36 desktop tests plus 11 headless
  runtime tests. The three existing provider/soak tests remain opt-in.
- Rust formatting and workspace Clippy passed with warnings denied. The runtime
  is included in architecture/size checks and the cross-platform CI test/build
  matrix. Updated Rust license notices and advisory/source/license checks pass.
- Real temporary processes verify detached progress, input, replay, ownership,
  protocol authentication, concurrent CLI requests, generation-pinned waits,
  cold layout restoration without command replay, and bounded-output recovery.
  VT tests verify device-query replies and alternate-screen restoration without
  a renderer. Hook fixtures check state authority and child-agent isolation.
- The native Windows application test closes and relaunches Emdeck while its
  counter process continues in the same server/generation, reconnects to the
  screen, detaches without stopping, then explicitly stops the process. The
  fixture uses private temporary server and WebView profiles and no real agents
  or user projects. Repeat with `scripts/release/windows-sessions.mjs`, passing
  the IDE and standalone session executable paths. The final optimized Windows
  build and standalone binary passed this workflow again, including opening the
  IDE executable for writing while its background server kept running. Local
  evidence is in `.tmp/session-desktop-DnsRKF`, with build/acceptance logs in
  `.tmp/session-final-build.log` and `.tmp/session-final-acceptance.log`.
- Browser coverage verifies optional activation, existing unattached agents,
  ordered input, mounted-terminal preservation, and separate detach/stop flows.
  Initial regression failures from eagerly mounted hidden forms were corrected
  by loading the optional view on selection and using distinct field labels.
- Pinned React Doctor review retains four known Worktrees false positives and 61
  advisory warnings; see `REACT-AUDIT.md`. No diagnostic suppression or size
  baseline increase was introduced.

Authenticated SSH hosts, macOS/Linux native execution and real provider resume
remain unverified locally. SSH argument security and the multiplexed bridge
protocol have fixture coverage. Remote quota/cost/token aggregation and OS login
service installation are not implemented. Current-screen replay is bounded and
does not restore an unlimited transcript. See `PERSISTENT-AGENTS.md` for the
exact capabilities and setup requirements.

## Unreleased — terminal workspaces and remote connections

Validated locally on Windows x64 on 2026-09-09. This feature is not included in
the published 0.1.22 beta.

- `bun run verify` passed: 47 unit tests, 1 Bun integration test, 35 native
  tests and 59 browser workflows, with lint, types, formatting, architecture and
  size checks. Three existing native provider/soak tests remain opt-in. Rust
  formatting and Clippy with warnings treated as errors passed.
- New tests cover connection recovery/validation, working-directory grouping,
  exact tmux session selection, SSH argument boundaries, executable resolution
  outside the opened project, and preserved terminal/editor state while changing
  views. Browser workflows cover explicit attach, input/output, failed launch,
  reconnect, disconnect isolation, and browser-session URL dispatch. A newly
  launched terminal is revealed even when another space was selected, and the
  overview button returns to the customizable agent metrics without restarting
  terminals.
- The native Windows workflow passed with real PowerShell and OpenSSH processes.
  A loopback peer closes before authentication to exercise SSH failure, retry,
  and disconnect while an ordinary local PTY remains usable. It also rechecks
  six streaming terminals, layout/scrollback, files, Markdown, Git worktrees,
  project windows, a detected Bun command and graceful application close. The
  final Windows x64 executable and NSIS installer built successfully. One
  scrollback assertion failed during an overlapping native/test run; the final
  isolated desktop workflow passed. Build and desktop validation are run
  sequentially to avoid shared assets and test-process contention.
- An initial browser run overlapped a desktop asset rebuild and encountered a
  missing lazy-loaded worktree chunk. Serializing asset builds resolved the
  fixture failure; all 59 workflows then passed. A narrow-toolbar layout issue
  found during regression testing was fixed by allowing its controls to wrap.
- React Doctor retains four reviewed false positives and 58 advisory warnings;
  see [React audit](REACT-AUDIT.md). No dependencies were added. Release
  metadata and workflow configuration checks passed.
- Authenticated remote cmux/tmux sessions, provider login, and native
  macOS/Linux behavior have not been exercised for this feature. Browser links
  are explicit handoffs, not native provider-control integrations. Remote
  per-agent usage is not aggregated into local cards. See
  [Remote sessions](REMOTE-SESSIONS.md).

## 0.1.22 — First public beta

The installed Windows test found that portable-pty refreshes environment values
from the registry, replacing process overrides. Windows terminal launches now
preserve the app's inherited values before applying terminal-specific settings.
A native regression starts a separate test process with a tool available only
through its `PATH`, plus a custom `TEMP`. The original implementation failed
with `CommandNotFoundException`; the corrected implementation passes without
changing the developer's registry or process environment.

Local verification passed: 41 unit tests, 1 Bun integration test, 31 Windows
native tests and 53 browser workflows, plus lint, types, formatting,
architecture checks and Clippy. Security scans and regenerated dependency
notices passed.

The 0.1.20 and 0.1.21 tags remain unpublished candidates. The two-hour backend
soak began before the 0.1.21 version bump and passed with every shell advancing
in all 119 minute reports and exiting cleanly. Its sampled native-process
private memory remained 2.23 MiB over 77.84 minutes. A separate 45-minute 0.1.21
GUI soak passed with six continuously progressing panes and eight layout cycles.
The 0.1.22 change affects launch environment only; reading, resizing, shutdown
and the renderer remain unchanged. The final backend also passed a five-minute
six-shell soak with the corrected launch environment.

All four checks and installer jobs passed for the final release commit. Windows
passed the installed native UI workflow and reinstall/uninstall checks; both Mac
DMGs and the Ubuntu package passed native launch/close checks. The local 0.1.22
binary passed the native workflow and profile compatibility from actual 0.1.19.
A test-only follow-up waits for visibly rendered history after a wheel event
before resizing; this avoids a WebView2 DOM/terminal event-order race.

See the [completed validation record](validation/0.1.22/VALIDATION.md) for exact
versions, measurements and limitations. Raw evidence is attached to the
[0.1.22 release](https://github.com/Erdos-Miller/emdeck/releases/tag/v0.1.22).

## 0.1.21 — Unpublished release candidate

The native streaming review reproduced a resize that left two terminal views in
old scrollback even though their buffers continued receiving output. The
viewport now takes its height from xterm's screen rather than resizing
independently with the pane. Fitting restores the latest-output position after
xterm updates its scroll area, only when the pane was already following output.
User wheel, pointer and key interaction can cancel that pending restore.
Deliberate history reading remains in scrollback.

Four unit tests cover output arriving during resize, history reading, coalesced
resizes and cancellation/disposal. A browser regression exercises six real xterm
views with synthetic output, repeated layout changes, manual scrollback and
returning to live output. The native regression uses six real PowerShell PTYs.
Local verification passed: 41 unit tests, 1 Bun integration test, 30 Windows
native tests and 53 browser workflows, plus lint, types, formatting,
architecture checks and Clippy. Source/history secret scans, dependency audits
and notice regeneration passed. The native streaming review and final
platform/installer results are recorded with the
[0.1.22 release](https://github.com/Erdos-Miller/emdeck/releases/tag/v0.1.22).
The 0.1.20 candidate was not published; its tag remains unchanged. Its native
PTY backend and test are unchanged in 0.1.21, so the ongoing two-hour backend
soak remains applicable. Desktop rendering is checked separately.

## 0.1.20 — Unpublished release candidate

- Apache-2.0 selected by the maintainer; public repository created under
  `Erdos-Miller/emdeck`. Added contributor, security, privacy, installation and
  release documentation, issue templates, and a synthetic demo screenshot.
- Upgraded Vitest to 4.1.11. `bun audit` reports no vulnerabilities. Gitleaks
  source scanning reports no secrets. Rust advisory, license and source checks
  pass with six explicitly reviewed upstream maintenance notices; see
  [Dependency review](DEPENDENCIES.md).
- Generated full notices for 138 JavaScript production packages and 138 Rust
  license texts covering the four planned native targets. License expressions
  were checked for 339 installed JavaScript production/development packages.
  Notices and first-party attribution are included as installer resources.
- Full local verification passed: 37 unit tests, 1 Bun integration test, 30
  native tests and 52 browser workflows, plus lint, types, format, architecture,
  Rust formatting and Clippy. Three native tests are opt-in: two provider
  integrations and the terminal soak. The latter runs separately before
  publication. React Doctor retains four reviewed false positives and 52
  advisory warnings; see [React audit](REACT-AUDIT.md).
- Native Windows review caught a transient atomic-save failure. Saves now retry
  brief replacement locks for up to 500 ms, rechecking the disk revision on
  every attempt. Three real Windows file-lock tests cover recovery, permanent
  failure without data loss, and rejection of an intervening external edit.
- The real packaged Windows WebView passed project restoration, file saving,
  Markdown preview, six simultaneous PTYs, layout/hide preservation, normal
  close, external-edit protection, a Git diff in an editor tab, worktree
  creation/removal, an independent project window, and a detected Bun command.
  Fixtures contain no user repository, credentials or provider accounts.
- Disposable Windows Server 2025 CI passed install, bundled-notice checks,
  native launch/close, same-version reinstall with retained data, and uninstall.
  Windows 11 was reviewed locally. Both macOS 15.7.9 architectures passed DMG
  mounting, installation by copying the app, resource/signature checks, launch
  and normal quit. Ubuntu 24.04.5 passed `.deb` install, native launch/close
  under Xvfb and package removal. CI browser workflows use Chromium on
  macOS/Linux, not those operating systems' native WebViews.
- An actual 0.1.19 executable created an isolated profile with a project, Light
  theme, layout preferences and a saved file. The 0.1.20 executable restored all
  of them. This verifies older-profile compatibility; it is separate from the CI
  same-version reinstall and does not claim an in-place 0.1.19 NSIS upgrade.
- Recorded two-minute visible-window idle and six-terminal measurements in
  [Performance](PERFORMANCE.md), including raw samples and their scope. The
  separate two-hour streaming/resize soak must complete before publication; its
  final results are attached to the release rather than inferred from these
  short observations.
- Workflow syntax and PowerShell parsing passed. The final tagged release reruns
  all four platform checks and installer jobs, enforces matching version/commit
  manifests, and attaches SHA-256 checksums. Review its
  [0.1.22 release record](https://github.com/Erdos-Miller/emdeck/releases/tag/v0.1.22)
  for the final run and soak results. Earlier candidate runs found and resolved
  macOS shortcut assumptions, Linux window-manager startup timing, and elevated
  Windows WebView test configuration.
- The maintainer approved an explicitly unsigned beta. Windows signing and Apple
  notarization are not configured; macOS uses ad-hoc signing. The beta supplies
  Ubuntu `.deb` packages; AppImage packaging awaits a separate review of bundled
  system-library notices/source information.

## 0.1.19 — Architecture and project conventions

- Added checks for domain boundaries, native conventions, formatting and
  file-size limits; see [Architecture](ARCHITECTURE.md).
- Split the application into feature modules, workspace controllers and views,
  shared contracts, platform adapters and ordered styles. `App.tsx` is now 213
  lines (previously 2,323); the style entry is 22 lines (previously 3,504).
  Native registration is 70 lines, with commands, services and window state in
  separate modules. No file-size exemptions were introduced.
- Added typed IPC argument/result mapping and registration checks; enforced
  one-way feature/domain dependencies, separate type imports, named JSX handlers
  and service arrow functions. CodeMirror and PTY lifetimes retain their
  existing boundaries. Ref snapshots are updated after React commits.
- Added injected-port run discovery and pure document reconciliation, with
  cancellation, shallow-read and unsaved-edit tests. Reorganized browser
  fixtures by feature and separated real Bun execution from unit tests.
- Adopted Node 22, Bun 1.3.6 and one frozen lockfile. Updated the
  Windows/macOS/Linux check and packaging workflows. All development checks stay
  outside the app; no project indexing, language server or database was added.
- `bun run verify` passed: lint, production/test type checks, formatting,
  dependency/cycle/IPC checks, code-size checks, **37 unit tests**, **1 local
  Bun integration test**, **27 native tests**, and **52 browser workflows**. The
  two existing native checks requiring an installed signed-in Codex CLI or a
  separate usage-reporter harness remain explicitly ignored.
- Rust formatting and Clippy with warnings denied passed. Reviewed the dark
  workspace and small light branch-submenu screenshots. Browser workflows ran
  against a fixed production build, covering files, Markdown, Git, worktrees,
  run configurations, project windows, closing and terminal/session
  preservation.
- React Doctor completed against original and final source: reported errors
  reduced from 11 to 4; the remaining four are reviewed false positives in the
  ordinary async worktree operation wrapper. Warnings remain advisory and are
  recorded in [React audit](REACT-AUDIT.md); no rules were suppressed.
- Windows x64 release compilation and NSIS packaging passed. The versioned
  executable `release/Emdeck-0.1.19.exe` and installer
  `release/Emdeck_0.1.19_x64-setup.exe` are available for review.
- macOS/Linux builds and GitHub workflows were not run from this Windows host.
  This refactor did not add code signing, notarization or release distribution.

## 0.1.18 — Branch actions in a submenu

- Branch actions now open in a separate submenu beside the branch list.
  Local/remote folders, search text, and toolbar controls stay visible; the
  selected row is highlighted and advertises its expanded state. Menus flip or
  reposition to fit the viewport, including 900×640 windows, with independent
  scrolling for actions.
- Click/right-click or Right Arrow opens actions. Left Arrow/Escape or the close
  button returns focus to the branch. An open submenu follows another branch
  after a short hover delay; editing the filter, collapsing folders, and
  scrolling the tree dismiss it. Pending hover timers are cancelled when the
  menu closes.
- All 10 related UI workflows passed. The focused submenu workflow also passed
  after extending coverage for hover switching and search dismissal. Checks
  cover both menus remaining visible without overlap, viewport bounds, keyboard
  focus, current/remote action states, exact Git requests, push
  cancellation/errors, comparison tabs, worktree creation, and unsaved-buffer
  protection. Reviewed dark and small light screenshots. TypeScript and the
  production frontend build passed; native Git behavior is unchanged from
  0.1.17.
- Windows x64 packaging passed. `release/Emdeck-0.1.18.exe` and
  `release/Emdeck_0.1.18_x64-setup.exe` report 0.1.18. On the subsequent
  requested restart, the old instance was closed, `release/Emdeck.exe` was
  updated to 0.1.18, and the new desktop window was confirmed open and
  responding. macOS/Linux packaging was not tested for this release.

## 0.1.17 — Git branch actions and synchronization

- Added Fetch, Update, and Push controls; local branch incoming/outgoing counts
  and tracked-branch status; click/right-click branch action menus with keyboard
  navigation; checkout/create/rename/safe delete, checkout-and-update/rebase,
  explicit merge/rebase, tracking selection, and branch-prefilled worktree
  creation. Local/remote folder separation and search are retained.
- Branch comparisons use regular editor tabs, with unique commit counts and up
  to 50 commits from each branch plus a bounded text diff. Working-tree
  comparisons include saved tracked and staged files, excluding untracked files
  and unsaved buffers. Source Control exposes continue/abort controls for an
  in-progress Git operation.
- Native actions use validated full refs, an explicit push destination with no
  force/tags/mirror, fast-forward-only updates, expected-old-object checks when
  updating inactive branches, worktree occupancy checks, clean-tree checks for
  merge/rebase, and current-branch revalidation. A shared repository guard
  coordinates Git mutations and worktree creation/removal across windows in this
  process. Counts use cached refs; network work happens only through requested
  Fetch/Update/Push actions.
- All 30 unit tests, 27 normal native tests, and 52 browser workflows passed.
  Seven new native workflows use isolated repositories and local bare remotes to
  cover cached vs. fetched counts, current/inactive updates, dirty/divergent
  rejection, explicit push tracking and non-fast-forward rejection, namespace
  collisions, rename/create/tracking/compare, occupied worktrees, mutation
  locking, checkout/update/rebase direction, conflict continuation and abort. No
  user repository was pushed, fetched, or changed by these tests. The two
  existing opt-in agent integration tests were not run.
- Reviewed dark branch actions/status/comparison and a 900×640 light menu. UI
  tests cover context menus and keyboard access, push cancellation/errors, exact
  branch-action arguments, prefilled worktrees, conflict controls, unsaved
  buffer preservation, and the prior editor/terminal/layout/run workflows.
  TypeScript, the production frontend build, and Rust Clippy with warnings
  denied passed. Native desktop interaction and macOS/Linux packaging were not
  tested for this release.
- Windows x64 executable and NSIS installer built successfully and report
  version 0.1.17: `release/Emdeck-0.1.17.exe` and
  `release/Emdeck_0.1.17_x64-setup.exe`. On the subsequent requested restart,
  the old instance was closed, `release/Emdeck.exe` was updated to 0.1.17, and
  the new desktop window was confirmed open and responding.

## 0.1.16 — EM monogram

- Replaced the single E mark with an EM monogram for Erdos Miller in
  `public/emdeck.svg`. The same asset appears in the header, favicon, and
  sidebar badge, with the existing green and dark colors. Regenerated PNG, ICO,
  and ICNS application icons through the Tauri CLI.
- Reviewed the mark at 128 and 32 pixels, plus the rendered dark workspace and
  light layout at 900×640. All three focused UI workflows passed, covering
  normal rendering, theme persistence, and responsive panel sizing. TypeScript
  and the production frontend build passed. No agent, Git, editor, or settings
  logic changed.
- Windows x64 packaging passed. Review copies are `release/Emdeck-0.1.16.exe`
  (4,101,120 bytes), `release/Emdeck.exe`, and
  `release/Emdeck_0.1.16_x64-setup.exe` (1,713,150 bytes). Product metadata
  reports Emdeck 0.1.16, and the executable company reports Erdos Miller.
  macOS/Linux packaging was not checked for this release.

## 0.1.15 — Emdeck by Erdos Miller

- Renamed the app to Emdeck, with Erdos Miller attribution in the welcome
  screen, help, branding tooltips, Rust authors, and bundle publisher metadata.
  Updated the wordmark, window/browser titles, status bar, terminal identity,
  usage helper, CLI client identification, documentation, package names, and CI
  artifact names. The tagline is “Your code. Your agents. One workspace.”
- Replaced the V mark with an E mark drawn in `public/emdeck.svg`, then
  regenerated desktop platform icons using the Tauri CLI. Reviewed the icon and
  the rendered workspace.
- Preserved `dev.relay.ide`, window labels, the `relay:` storage keys, and the
  browser preview's original project root. Existing themes, files saved in the
  preview, run configurations, agent preferences, recent projects, and layout
  settings retain their identities. The NSIS installer is named Emdeck; older
  installed products can remain separate and share the same app data directory,
  documented in the README.
- All 30 unit tests, 20 native tests, and 46 UI workflows passed.
  TypeScript/production frontend build and Rust Clippy with warnings denied
  passed. No runtime source or frontend output retains the previous brand name.
  Historical release files and validation entries retain their original names.
- The Windows x64 executable and NSIS installer built successfully. Review
  copies are `release/Emdeck-0.1.15.exe` (4,098,560 bytes),
  `release/Emdeck.exe`, and `release/Emdeck_0.1.15_x64-setup.exe` (1,709,928
  bytes). Product metadata reports Emdeck 0.1.15; the executable company and
  NSIS manufacturer report Erdos Miller.
- The optional Rust-launched reporter test exited abnormally on this host. A
  separate direct check of the packaged status-line command passed with
  synthetic UTF-8 input, verifying the Emdeck status text, model, context
  percentage, and report file under the renamed temporary directory. Native
  desktop interaction and macOS/Linux builds were not checked for this release.

## 0.1.14 — Customizable agent overview

- Added a hideable overview beside the terminal grid with session
  search/provider/attention filters, attention-first/name/launch sorting,
  focus/maximize/rename/restart/close controls, and compact cards. Activity,
  model, context, tokens, estimated cost, limits/reset times, and duration can
  be individually configured; metric order and preferences persist. Existing
  terminal and project layouts remain available.
- Claude preset sessions use a temporary status-line settings override to
  publish allowlisted usage fields. Token labels distinguish current-context
  input from latest-response output; estimated cost is labelled separately from
  actual billing. No transcript/credential extraction or edits to saved Claude
  configuration. The integration can be disabled for new launches. Usage files
  are session-scoped and removed with the PTY reader.
- Codex account quotas use a short-lived read-only app-server request, 30-second
  successful-response cache, and manual refresh by default. Optional
  visible-only polling is configurable at 60/300 seconds. The installed
  signed-in Codex CLI roundtrip passed without starting a conversation.
  Unsupported per-session metrics remain unavailable; missing percentages are
  not treated as zero and expired quota windows require refresh.
- Agent lifecycle labels are terminal-screen heuristics, explicitly
  distinguished from reported metrics and connection state. Detection is limited
  to 28 live rows on output with coalescing, never scrollback/transcript/project
  scanning. Claude report changes are checked on output so the final short
  output burst cannot be skipped by a timer. Duration freezes at exit and
  restarts clear old readings.
- All 30 unit tests and 46 browser workflows passed across the full regression
  run and focused agent rerun. New checks cover real channel event shapes,
  zero/missing/stale usage, approval focus, filtering, saved customization,
  rename/hide/maximize without PTY restarts, exit/restart cleanup, quota error
  recovery, and polling suspension while either panel is hidden. Desktop bridge
  events are simulated in these browser tests. Reviewed full-size dark and
  900×640 dark/light layouts.
- Production TypeScript/frontend build passed. Native GUI interaction with a
  live Claude conversation and macOS/Linux builds are not part of this
  validation; provider fields remain dependent on CLI/account capabilities.
- All 20 normal native tests passed; the two opt-in checks also passed
  separately: installed Codex quota read and the packaged Windows Claude
  reporter with synthetic UTF-8 input. The reporter test uses the generated
  command's actual argv; an unnecessary `cmd` wrapper in the first test was
  removed. Rust Clippy with warnings denied passed. The Windows x64 executable
  and NSIS installer report 0.1.14 and are available in `release/`.

## 0.1.13 — Git worktrees

- Added a lazy Worktrees editor tab, accessible from Source Control and the
  branch menu. It lists main/current/open/locked/missing/detached worktrees,
  creates new or available local branches in explicit sibling/custom folders,
  accepts local/remote starting branches, and opens each folder in a separate
  project window. Existing editors and terminals remain in place; tab switching
  and Ctrl/Cmd+W use the regular tab strip.
- Creation validates destinations and refs, never overwrites an existing folder
  or branch, and leaves current uncommitted edits in their original checkout.
  Removal validates the registered absolute path and repository identity,
  confirms the folder, retains its branch, and uses Git without force.
  Main/current/locked worktrees and worktrees open in this process are
  protected. Native project registration is synchronized with removal to prevent
  another window opening a folder while it is being removed. Other applications
  and separately launched Veldri processes are outside that window protection.
- All 17 native tests and 25 unit tests passed. New real-Git tests cover paths
  with spaces, new/existing/tracking branches, unchanged source files, occupied
  branches, safe removal, retained branches,
  dirty/untracked/locked/open/main/current/unregistered refusal, invalid refs
  and destinations, plus NUL-delimited parsing. Windows canonical path arguments
  are converted from Rust's verbatim form before passing them to Git.
- All 41 browser workflows passed across the full regression run and a focused
  rerun. The rerun corrected a test assertion for native disabled select
  options; it did not change the application. Five worktree workflows exercise
  branch modes, explicit paths, remote starting refs, optional automatic
  opening, retry after creation/window errors, dirty-editor preservation, tab
  closing, cancellation, and removal errors through a mocked desktop bridge.
  Reviewed screenshots of the dark list/form and light layout at 900×640.
- TypeScript, production frontend build, and Rust Clippy with warnings denied
  passed. Worktree UI is a separate lazy chunk, approximately 2.8 kB gzipped.
  Worktree metadata refreshes on demand and while its tab is active after normal
  Git refreshes, with no indexing, fetching, or periodic polling.
- Windows x64 executable and NSIS installer built successfully and report
  version 0.1.13. Versioned review copies and the unversioned executable alias
  are in `release/`. A separate isolated Git check also verified that an
  existing local branch is selected correctly when a same-named tag points to a
  different commit.
- Native GUI interaction and macOS/Linux builds were not checked for this
  release.

## 0.1.12 — Git diffs in editor tabs

- Replaced the Git diff modal with closable tabs alongside regular files.
  Working and Staged comparisons have separate labels, repeated clicks reuse a
  tab, and Ctrl/Cmd+W closes the selected comparison. Open in editor returns to
  the file; existing source editors and terminal sessions stay mounted.
- Comparisons are read-only, with Save disabled and the save shortcut prevented
  from saving a background file. Refresh diff, successful Git refreshes, and
  returning to a tab update its saved contents. Inactive comparisons retain
  their scroll position without Git reads. Closed or replaced tabs ignore
  pending responses.
- Added loading, empty and retry states and theme-aware change colors. Diff
  contents use the full editor area; project replacement clears comparison tabs.
  Conflicted and untracked files retain their existing direct-file behavior.
- All 36 Edge browser workflows passed. Three new workflows cover multiple files
  and comparison types, deduplication, preserved edits/terminals/scroll, close
  shortcuts, read-only save behavior, refresh and retry, deleted files, project
  replacement, and a late response after closing. Visually checked Dark at
  1440×960 and Light at 900×640.
- TypeScript, the production frontend build, and Windows x64/NSIS packaging
  passed. Versioned review copies and the unversioned executable alias in
  `release/` report version 0.1.12. Native Git logic is unchanged; the new
  interaction tests use the mocked desktop bridge. Native GUI interaction and
  macOS/Linux rendering were not checked for this release.

## 0.1.11 — Markdown viewer

- Markdown documents open in formatted Preview with Edit and live Split
  controls. Source editors stay mounted across view changes, keeping unsaved
  text, selection and undo history. The renderer loads on demand and uses
  react-markdown with GitHub-style Markdown support.
- Added headings, tables, task lists, fenced code, blockquotes, project images,
  relative project links and heading navigation. HTTP/HTTPS links use a
  validated native browser-opening command. Local images use a size-limited read
  command with existing per-window project authorization; remote images load on
  request. Embedded HTML is rendered as text.
- All 25 unit tests and 12 native tests passed, including new path/URL
  validation, heading IDs, image reads and oversized-image rejection. Rust
  Clippy passed with warnings treated as errors.
- All 33 browser workflows passed across the full run and a focused Markdown
  rerun after correcting the test fixture's reload setup. New checks cover
  rendered elements, inert HTML, local images, live unsaved edits, editor/undo
  preservation, save/reopen, project/heading links, external browser links,
  requested remote image loads, and empty files at 900×640. Visually checked
  dark/light preview and split views.
- Browser checks use the preview filesystem; native image tests use isolated
  temporary files. OS-level link opening and macOS/Linux rendering were not
  manually checked.
- TypeScript, the production frontend build, and Windows x64/NSIS packaging
  passed. The renderer is a separate lazy-loaded chunk. Versioned review
  artifacts in `release/` report version 0.1.11, and the unversioned executable
  alias is updated.

## 0.1.10 — file sidebar scrollbar on hover

- The file tree scrollbar thumb is transparent until the sidebar is hovered,
  matching the terminal panes. Moving the pointer outside hides it even if a
  file row retains keyboard focus. The scrollbar gutter stays the same width so
  file names do not move.
- Checked an overflowing 100-file preview in Microsoft Edge with headless
  scrollbar suppression disabled, across Dark, Light, and Graphite. Idle and
  pointer-exit thumbs were transparent, hover thumbs were visible, wheel input
  scrolled the list, and its content width stayed at 233 px throughout.
  Inspected idle/hover screenshots.
- TypeScript, the production frontend build, and Windows x64/NSIS packaging
  passed. Review copies in `release/` report version 0.1.10; the unversioned
  executable alias is updated. This CSS change does not alter filesystem or
  native backend behavior. macOS/Linux scrollbar rendering was not checked
  locally.

## 0.1.9 — customizable terminal placement

- Added a default full-bottom layout: the terminal spans beneath the file tree
  and editor, beside the narrow activity bar. The terminal toolbar toggle and
  Settings → Workspace layout can switch to the previous below-editor placement.
  The preference is saved.
- Layout changes use CSS grid without reparenting the editor or terminal panes.
  Full-bottom maximization hides the editor and file tree while retaining the
  activity bar; Explorer restores the file tree. Hidden terminals retain their
  sessions.
- Panel dividers support dragging, arrow keys, Home/End, and double-click reset.
  Terminal height is limited to the available workspace on window resize, with
  room retained above it. Saved dimensions survive reload. Terminal toolbar
  controls adapt to a narrow editor column.
- All 29 Edge browser workflows passed, including three new checks covering
  placement geometry, mounted editor/terminal preservation,
  hide/maximize/restore, pointer and keyboard resizing, reset, persisted
  settings, and a 900×640 window. Visually checked full-bottom dark/light
  layouts and the narrow below-editor layout.
- TypeScript, the production frontend build, and Windows x64/NSIS packaging
  passed. Versioned review copies and the unversioned executable alias are
  updated in `release/`. Native backend logic is unchanged; OS-level interaction
  and macOS/Linux rendering were not checked for this release.

## 0.1.8 — reopen the last project

- Desktop startup restores the remembered project folder by default. Successful
  opens, window focus, and accepted close requests update the remembered
  project. Existing recent-project data provides a first-upgrade fallback.
- Added Settings → Startup → Reopen last project on startup, enabled by default.
  Explicit new-window targets take priority even when restoration is off. A
  delayed startup response cannot replace a project the user manually opens
  while startup is pending.
- Missing folders leave the welcome screen available with an error. Restoration
  opens only the project folder and uses existing saved preferences; terminals
  and agents are not started automatically.
- All 26 browser workflows passed, including five new startup checks for
  close/restore, recent-list upgrade and focus tracking, opt-out and explicit
  target priority, missing-folder recovery, and a manual open during delayed
  startup. Existing Git, run-command, editor, and close-window checks also
  passed.
- TypeScript, the production frontend build, and Windows x64/NSIS packaging
  passed. Both packaged artifacts report version 0.1.8, with review copies and
  the unversioned executable alias updated in `release/`.
- Native backend logic is unchanged. OS-level close/relaunch and macOS/Linux
  builds were not manually checked for this release; browser startup tests use
  the mocked desktop bridge.

## 0.1.7 — Bun-aware run commands

- Replaced the run-configuration modal with a searchable toolbar picker
  containing Recently used, My commands, and Detected scripts. Each entry has a
  direct Run action; selection supports the toolbar Run button and F5, including
  terminal focus. Custom entries support edit/remove and detected entries can be
  copied into custom commands.
- Detection recognizes package-manager declarations, Bun text/binary lockfiles,
  npm/pnpm/Yarn lockfiles, and Bun configuration hints. Ambiguous lockfiles
  require a runner choice; per-project overrides persist. Detection is
  independent of saved custom commands and reads only root metadata. Errors and
  unsupported script names are visible.
- Automatic discovery can be disabled globally from Settings or the picker.
  Custom commands, selection, runner override, and deduplicated recent launches
  persist per project. Legacy edited/custom presets survive migration; unchanged
  generated npm presets are regenerated using the detected runner.
- All 21 unit tests passed, including a generated `bun run build` command
  executed successfully by Bun 1.3.6 through PowerShell in an isolated temporary
  project. Detection tests cover both Bun lockfile formats, other supported
  managers, declaration priority, conflicts/override, invalid metadata, unsafe
  script names, migration, and recent history.
- All 21 browser workflows passed across the full run and focused rerun. The
  first run had one incorrect test selector for an existing menu item; after
  correcting it, all five new run workflows passed again, including F5 with an
  explicitly focused xterm. The desktop bridge is mocked for browser checks; no
  user project commands are executed by those tests.
- Checked screenshots of the new picker in Dark at 1440×960 and Light at the
  minimum 900×640 window size; the small-window picker stays within the viewport
  and its list scrolls independently of its settings footer.
- TypeScript, the production frontend build, and Windows x64/NSIS packaging
  passed. Both artifacts report version 0.1.7; versioned review copies and the
  unversioned executable alias are in `release/`. Native backend logic was
  unchanged. Native GUI interaction and macOS/Linux builds were not checked for
  this release.

## 0.1.6 — local and remote branch folders

- Git snapshots enumerate local and cached remote refs separately, excluding
  symbolic aliases such as `origin/HEAD`. No network fetch is triggered.
- The branch picker has separate collapsible Local/Remote sections, nested
  prefix folders, branch counts, current-branch highlighting, full-path search,
  and explicit empty states. The current branch's ancestors and search matches
  open automatically. Visually checked the final dark-theme branch picker in
  Edge.
- Local switch/delete and local/remote merge actions preserve the intended Git
  namespace. Remote checkout creates a tracking branch and refuses to overwrite
  an existing local branch. Remote checkout and merge use the same
  unsaved-buffer protection as local branch changes.
- Production frontend build and all 7 unit tests, 10 native tests, and 16
  browser workflows passed. The three branch workflows passed again after adding
  collapsible section headers. Rust Clippy passed with warnings treated as
  errors.
- The new native test uses an isolated real Git repository with cached remote
  refs, checking nested names, a local/remote name collision, exact merge
  targets, tracking checkout, existing-branch refusal, symbolic aliases, and
  invalid/missing refs. Browser workflows exercise folder expansion, section
  independence, keyboard activation, search, action arguments, and
  unsaved-buffer protection through a mocked desktop bridge.
- Windows x64 executable and NSIS installer built successfully; both report
  Veldri version 0.1.6. Review copies are in `release/`, and the unversioned
  executable alias is updated. The running 0.1.5 session was left open.
- Native desktop interaction and macOS/Linux builds were not checked for this
  change.

## 0.1.5 — close-window fix

- Enabled the native window-destroy action required by Tauri's close-request
  lifecycle for both the main and additional project windows.
- Close requests now use a single pending confirmation, report native failures,
  and can be retried. The browser-only unload guard no longer competes with
  desktop confirmation.
- TypeScript/production frontend build and all 9 Rust tests passed.
- All 13 UI workflows passed across the main run and a focused rerun after
  correcting an ambiguous test selector. Four new workflows cover immediate
  close, dirty-buffer cancellation/confirmation, repeated close requests with a
  terminal, and failure/retry. Their desktop bridge enforces the actual
  configured destroy capability.
- Windows x64 executable and NSIS installer built successfully. The native
  title-bar Close action on a clean 0.1.5 window was followed by disappearance
  of its window and process. Confirmation paths were verified with the browser
  bridge, not a manual native session.
- A further native folder-picker check could not be completed because the UI
  automation helper reported an unavailable foreground process. Existing 0.1.4
  project windows were not forcibly terminated.

## 0.1.4 — Veldri

- Renamed application branding, window titles, terminal identification, package
  names, build workflow names, and documentation to Veldri; regenerated platform
  icons from `public/veldri.svg`.
- Preserved the original application identifier and storage keys. The production
  browser preview successfully restored a previously saved theme, accent,
  layout, panel sizes, recent project, run command, and edited preview file.
  Native profile continuity was not manually checked.
- The branding tooltip and Help dialog display the package version.
- TypeScript/production frontend build, all 5 unit tests, and all 9 existing UI
  workflows passed.
- Windows x64 executable and NSIS installer built successfully; both report
  Veldri version 0.1.4 in their product metadata.
- Visually checked the new desktop icon and production preview. Native desktop
  interaction and macOS/Linux builds were not checked for this release.

## 0.1.3 — terminal content fits above the footer

- Reproduced the sizing error at 150% display scaling: the terminal extended 7
  px below its viewport, 5 px behind the pane footer, and 17 px beyond the
  usable width.
- Corrected the terminal host's box sizing so FitAddon measures usable content
  space, and added bottom padding.
- Checked complete terminal row/column bounds at 100%, 125%, 150%, and 200%
  display scaling, font sizes 12/17/24, window sizes 1440×960 and 1000×640, and
  side-by-side/stacked/grid layouts. All 72 combinations passed in Microsoft
  Edge.
- Visually verified synthetic output positioned on the last row through a mocked
  desktop bridge: descenders and the final column stay visible above the footer
  in two expanded panes.
- TypeScript/production frontend build and Windows x64 executable/NSIS packaging
  passed. Native desktop interaction and macOS/Linux rendering were not checked
  locally for this change.

## 0.1.2 — terminal scrollbars on hover

- TypeScript/production frontend build passed.
- Checked overflowing terminals in Microsoft Edge with Dark, Light, and Graphite
  themes: scrollbar thumbs stay transparent while idle, appear only in the
  hovered pane, and hide again on pointer exit. Wheel scrolling works and
  terminal dimensions remain unchanged.
- Visually checked hover and idle screenshots with the browser's headless
  scrollbar suppression disabled.
- Windows x64 executable and NSIS installer built successfully as version 0.1.2.
- Native desktop interaction and macOS/Linux rendering were not rechecked for
  this CSS change.

## 0.1.1 — independent project windows

- TypeScript/production frontend build passed.
- 9 native tests passed, including per-window project authorization, independent
  terminal groups, and prevention of terminal creation after a window closes.
- 9 browser workflows passed. New checks cover default new-window opening while
  preserving a dirty editor and a mounted terminal, explicit replacement and its
  confirmation, window creation failure, and cancelled folder selection.
- Rust Clippy passed with warnings treated as errors.
- The new browser workflows use a mocked desktop bridge; actual native resource
  isolation is tested in Rust.
- Windows x64 executable and NSIS installer built successfully. The standalone
  0.1.1 executable is 3,884,032 bytes; its installer is 1,600,433 bytes.
- Native multi-window UI interaction was not manually verified in 0.1.1. The
  existing 0.1.0 desktop session was left running during the build.

## 0.1.0

Validated locally on Windows x64 on 2026-09-08.

- `npm run build`: passed (TypeScript and production asset build).
- `npm test`: 5 tests passed (multiple text conflicts, diff3, CRLF, incomplete
  markers, cross-platform clipboard path formatting).
- `cargo test --manifest-path src-tauri/Cargo.toml`: 7 tests passed. Includes a
  real temporary Git repository with branches, safe deletion, staging/unstaging,
  commits, diffs and merge conflict resolution; scoped filesystem tests; and a
  real Windows ConPTY process with input, resize, output and exit.
- `npm run test:ui`: 6 Playwright workflows passed in Microsoft Edge. Covers
  rendering, editor saves and persistence, file create/rename/copy/trash,
  terminal layout and session preservation on hide, themes/run presets, quick
  open and Git panel access.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`:
  passed.
- Windows release executable and NSIS installer built successfully.
- Native executable launched successfully. The welcome screen, native folder
  picker, opened workspace and discovered package scripts were observed in the
  actual desktop app.

Artifacts from the local release build:

| Artifact                    |            Size |
| --------------------------- | --------------: |
| `relay-ide.exe`             | 3,845,632 bytes |
| `Relay_0.1.0_x64-setup.exe` | 1,590,254 bytes |

Sizes exclude the system WebView2 runtime and installed agent CLIs. They are
disk sizes, not RAM measurements.

No macOS or Linux build was executed locally. The supplied GitHub workflows have
not been dispatched. Signing/notarization is not configured. Long-running agent
workloads, terminal detach/reattach and remote Git workflows are outside this
validation.
