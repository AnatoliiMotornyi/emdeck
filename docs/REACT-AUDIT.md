# React audit — 0.1.19

## Unreleased — terminal scrollback during resizing

React Doctor 0.9.13 retains the four reviewed Worktrees errors and 70 advisory
warnings. No new diagnostics were introduced. Existing TerminalPane complexity
and size advice remains below the repository's component budget. Scrollback
restoration stays in the pure fitter service; terminal effects only bind and
clean up interaction listeners. The change does not alter effect dependencies,
terminal identity or attachment lifetime. No diagnostics were suppressed.

## Unreleased — compact Workspaces sidebar

React Doctor 0.9.13 retains the four reviewed Worktrees errors and reports 70
warnings. The new advisory is control-flow complexity in `SessionRail`, which
coordinates filtering and expanded/compact controls within the component budget.
Job rendering is extracted into `SessionRailJob`; both modes share the existing
status presenter and colors. Collapse changes no terminal ownership or effects.
Browser coverage verifies keyboard selection, live status changes, remembered
collapse, hidden search handling, short-window scrolling and stable background
attachments. No diagnostics were suppressed or budgets increased.

## Unreleased — one window per project

React Doctor 0.9.13 retains the four reviewed Worktrees errors and 69 warnings.
The project-opening hook adds native focus outcomes without changing mounted
editor or terminal identity. No diagnostic targets that hook. Five new browser
workflows cover retained drafts and terminals, replacement races and initial
renderer startup. No findings were suppressed.

## Unreleased — background terminals in Workspaces

React Doctor 0.9.13 reports the same four reviewed Worktrees errors and 69
warnings. Avoidable repeated array scans and the state-independent launch
callback were corrected. The composition warning moves from `TerminalPanel` to
the extracted `TerminalContent`, which remains within the 500-line budget. It
assembles both terminal sources through stable keyed render slots; connection
state and workspace projection have separate ownership. Mixed-view browser tests
verify DOM continuity and the absence of duplicate connections, leases or
process starts. No findings were suppressed or budgets changed.

## Unreleased — collapsible background sidebar

React Doctor 0.9.13 retains the four reviewed Worktrees errors and reports 69
warnings. The new advisory concerns conditional controls in
`SessionMachineCard`, which is within the component size budget. Sidebar
preferences and disclosures are isolated from connection and terminal lifetimes.
Collapsed content remains mounted to retain form drafts, sharing controls and
scroll position; attention navigation expands the machine groups through
explicit event handlers. No diagnostics were suppressed.

## Unreleased — background terminal layouts

React Doctor 0.9.13 reports four reviewed Worktrees errors and 68 advisory
warnings. The new advisories concern the bounded machine/pane selection loop in
`SessionDesk` and a JSON round-trip test that deliberately checks the persisted
layout format. Repeated membership lookups now use sets. Tree operations and
geometry remain pure services; pointer handling lives in a separate hook and
layout persistence stays in the view. Terminal views keep stable keyed parents
through docking, resizing, filtering and theme changes. No rules were suppressed
or size limits increased.

## Unreleased — direct Tailscale session access

React Doctor 0.9.13 retains the four reviewed Worktrees errors and 68 existing
warnings. Five new findings were addressed: both new forms specify submit button
types, and machine restoration caches repeated target properties. Sharing
settings load only when opened; no new polling or terminal remounts were
introduced. Tests cover explicit sharing, successful and failed pairing, native
credential references in preferences, revocation and existing background
terminal continuity. No rules were suppressed.

## Unreleased — main branch ordering

The pinned 0.9.13 audit retains four reviewed Worktrees errors and 68 warnings,
with no new findings. The picker passes local/remote scope into its existing
pure tree service so `main` sorts first in its group. Filtering and folder state
remain unchanged; unit and browser tests cover ordering and refreshes.

## Unreleased — persistent merge block actions

React Doctor 0.9.13 reports the same four reviewed Worktrees errors and 68
warnings. The one new advisory recommends a dynamic CodeMirror import in
`mergeBlockHistory`; this helper already loads through the lazy `MergeCodePane`.
Block metadata travels with editor transactions so undo and redo restore text,
boundaries and accepted sides together. Browser tests cover both choice orders,
replacement, appending, file switching and stale source versions. No diagnostics
were suppressed or size budgets changed.

## Unreleased — three-pane merge review

React Doctor 0.9.13 reports four existing Worktrees errors and 67 warnings. The
five new warnings recommend dynamic imports for CodeMirror in `MergeCodePane`,
its decoration helper and the extracted shared editor theme. These modules
already load through the application's lazy editor render slots; the source
panes do not create a new eager editor dependency. They retain their views
through theme and draft updates, with block choices recorded as undo steps. The
normal editor shares the extracted syntax palette without changing its lifetime.
No diagnostics were suppressed.

## Unreleased — Codex activity signals

The pinned 0.9.13 audit retains four reviewed Worktrees errors and 62 advisory
warnings, with no new rule/file/message findings. Codex title events feed a
provider-specific domain tracker in the existing terminal lifetime. Screen
extraction uses a typed cell-attribute port; it adds no polling, remounts or
provider configuration changes. Browser tests cover title-only completion,
streaming, question/approval controls, narrow panes and terminal continuity. No
rules were suppressed.

## Unreleased — agent activity accuracy

The pinned 0.9.13 audit retains four reviewed Worktrees errors and 62 advisory
warnings, with no new rule/file/message findings. Activity tracking belongs to
the existing terminal effect and receives parsed screen and input events. It
adds no polling, mount dependencies or persisted transcripts. Synthetic browser
tests cover soft wraps, tall screens, submission before repaint, uncertain
composers, completion and terminal continuity. No rules were suppressed.

## Unreleased — workspace session statuses

The pinned 0.9.13 audit retains the same four reviewed Worktrees errors and 62
advisory warnings, with no new rule/file findings. Sidebar badges and the
attention count derive from existing terminal state and bounded screen
observations; they add no effects, polling or terminal remounts. Browser tests
check badge contrast in every theme, attention navigation, state transitions and
session continuity. The pure question detector covers prompt controls and
rejects stale conversation and ordinary log mentions. No rules were suppressed.

## Unreleased — editor selection visibility

Current-line colors are now translucent so they cannot cover CodeMirror's
selection layer. No editor state or lifecycle code changed. Browser regressions
compare painted screenshot pixels for keyboard selections in all three themes,
focused and unfocused, and verify mouse selections across lines, theme switching
and undo history. The pinned audit retains the existing reviewed findings.

## Unreleased — Source Control discard actions

The pinned 0.9.13 audit found one new advisory warning for repeated array
lookups in the unsaved-buffer check; those lookups now use a Set. The existing
GitPanel complexity warning also covers the new conditional discard controls.
Those controls delegate IO and confirmation to the application hook; the native
Git service owns path validation and mutation. Browser tests cover cancellation,
single/bulk discard, unsaved buffers, stale previews and in-progress operations.
Replacing a confirmation cancels its pending promise outside React's state
updaters, so cancelling a native close prompt cannot strand the Git operation.
The four previously reviewed Worktrees errors remain. No rules were suppressed.

## Unreleased — environment file highlighting

React Doctor 0.9.13 reports the same four reviewed Worktrees errors and 62
advisory warnings, with no new rule/file findings. The editor loads the dotenv
tokenizer on demand through its existing language compartment. Theme and
document lifetimes remain unchanged; browser regressions cover token colors,
plain-text fallback and undo across theme and tab switches. No rules were
suppressed or size budgets changed.

## Unreleased — terminal keyboard input

React Doctor 0.9.13 still reports four reviewed Worktrees errors and 62 advisory
warnings, with no new rule/file findings. Both terminal views install the same
keyboard adapter without adding render state or changing session identity.
Browser regressions cover paste event ownership, multiline bracketed paste,
clipboard images, modified Enter and background input leases. No rules were
suppressed or size budgets changed.

## Unreleased — terminal attachments

React Doctor 0.9.13 reports four reviewed Worktrees errors and 62 advisory
warnings. The new `async-await-in-loop` advisory in `terminalAttachments.ts` is
intentional: files are staged sequentially to bound memory and preserve input
order, with per-file, batch and terminal limits. Attachment listeners are
cleaned up with the terminal and reject late results after disposal. No rules
were suppressed or size limits changed.

## Unreleased — terminal session titles

React Doctor 0.9.13 reports four previously reviewed Worktrees errors and 61
advisory warnings, unchanged from the terminal menu audit. No new rule/file
findings were introduced. The existing TerminalPane complexity advisory remains
within the mandatory size budget. Title events update pane metadata through a
stable callback, without becoming dependencies of the PTY lifetime effect.
Browser tests cover automatic updates, manual overrides, session preservation,
search, long titles, restart and background session metadata. No rules were
suppressed or size budgets changed.

## Unreleased — adaptive terminal launch menu

React Doctor 0.9.13 reports the same four reviewed Worktrees false positives and
61 advisory warnings, down from 63. No diagnostic targets the extracted launch
menu or its pure placement helper. The existing TerminalPanel complexity
advisory remains. Menu positioning is isolated DOM layout work with observers
scoped to the open menu; it does not update React state or recreate terminals.
Browser tests cover both opening directions, scrolling and keyboard access in
short windows, live resizing, dismissal, launching and terminal preservation. No
rules were suppressed or size limits changed.

## Unreleased — conflict resolution modal

The immediate-close fix was audited again with the same pinned command: four
reviewed errors and 63 advisories, with no new diagnostics. Draft transitions
update the close guard outside React state updaters and render; layout cleanup
clears it on unmount. The regression requests native close in the editor
mutation microtask and also verifies closing after discarding the draft.

React Doctor 0.9.13 reports the same four reviewed Worktrees false positives and
63 advisory warnings. The new merge UI was split into the file dialog,
version/result panes, footer and a hook with an injected IO port. Duplicate path
filtering was removed. The remaining two new advisories concern the dialog's
conditional actions and selection reconciliation after Git refreshes. Selection
changes are deferred while saving or holding an unsaved draft; native index and
file revisions still guard every write. Browser tests cover draft retention,
error recovery, nested close dialogs and small windows. No audit rule was
suppressed or size budget increased.

## Unreleased — background session server

React Doctor 0.9.13 reports four previously reviewed Worktrees false positives
and 61 advisory warnings. The three new findings concern list iterations and
array lookups in `SessionDesk` and `useSessionMachines`, bounded to 16 machine
profiles and 64 panes per server. They are retained as optimization advice.
Input is serialized, pane identities remain stable across view/layout changes,
and the server view loads only when selected. Mandatory architecture, size, lint
and behavioral checks remain separate; no rules or limits were relaxed.

## Unreleased — terminal workspaces and remote connections

React Doctor 0.9.13 was repeated with the same options for the optional spaces
rail, connection manager, and terminal integration. It reports the same four
reviewed `Worktrees.tsx` false positives and 58 advisory warnings. Five warnings
were added: complexity in `ConnectionForm`, and complexity/size in
`TerminalPanel` and `TerminalPane`. These components remain within the mandatory
500-line budget. Connection validation, persistence, and native SSH construction
have separate ownership; the panel composes the views without moving or
recreating live terminals. Browser and native lifetime checks cover that
boundary. The findings are retained as maintainability advice, with no rule
suppression or budget changes.

## 0.1.21 follow-up

The same pinned audit was repeated for the terminal fitting change: four
previously reviewed errors remain, with 53 advisory warnings. The additional
warning is `plugin-update-trust-risk` in the manual Windows installer review
workflow. It downloads and executes the maintainer-selected artifact from this
repository in a disposable GitHub runner, verifies its version/target, and uses
read-only repository/actions permissions. That execution is the purpose of the
installer test; it is not an application updater or an automatic PR download. No
warning or error rule was suppressed.

## Architecture audit

React Doctor 0.9.13 was run against the saved pre-refactor source and the final
source, with score, telemetry and supply-chain network checks disabled. Both
scans completed. The baseline was an isolated temporary checkout so the parent's
ignored backup folder would not cause a misleading zero-file scan.

| Scan                    | Source files | Reported errors | Warnings |
| ----------------------- | -----------: | --------------: | -------: |
| Original architecture   |           26 |              11 |       51 |
| Refactored architecture |           89 |               4 |       52 |

Render-time ref mutations were removed. `useLatest` publishes values in a layout
effect, giving event handlers and asynchronous IO the last committed values.
Terminal initialization and editor document switching remain separate from live
appearance/content updates. The browser regression suite covers their lifetime
behavior, including rename, hide, layout changes, undo history and close flows.

The four remaining error-level diagnostics are reviewed false positives in
`Worktrees.tsx`: the checker treats callbacks passed to its normal async `run`
helper as React state updaters. That helper invokes its callback once inside a
guarded operation; it does not pass it to a React setter. No rule was disabled.
Creation, removal, failed creation/window opening and retry are covered by the
worktree workflows.

Warnings remain for accessibility of dismissing overlays, larger view functions,
effect-driven adapter state, render helpers and small iteration/formatting
optimizations. This is an advisory report, not a claim of zero findings. The
mandatory lint, type, size and dependency checks are separate and pass without
exemptions. Splitting code changes the checker’s warning locations and counts;
warnings should be reviewed by behavior rather than hidden to reach a score.

To repeat the audit in PowerShell:

```powershell
$env:REACT_DOCTOR_NO_TELEMETRY = '1'
npm exec --yes --package=react-doctor@0.9.13 -- react-doctor . --no-score --no-supply-chain --no-parallel --yes --json --json-out .tmp/react-doctor.json --blocking none
```

On macOS/Linux, prefix the same `npm exec` command with
`REACT_DOCTOR_NO_TELEMETRY=1`. This audit installs no agent hooks or application
runtime dependencies. It is not run inside Emdeck against opened projects.

CLI reference: [React Doctor](https://github.com/millionco/react-doctor).
