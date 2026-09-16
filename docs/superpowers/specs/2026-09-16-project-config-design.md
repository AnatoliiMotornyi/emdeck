# Per-project configuration design

Date: 2026-09-16
Status: Approved for implementation

## Problem

Every Emdeck preference lives in one global `relay:settings` entry in
`localStorage`. `loadSettings` in `src/features/settings/lib/settings.ts` reads
that single key with no project in it, and `useWorkspaceState` writes the whole
settings object straight back on every change:

```ts
document.documentElement.dataset.theme = settings.theme;
document.documentElement.style.setProperty('--accent', settings.accent);
store('relay:settings', settings);
```

Two consequences follow. A project cannot carry its own accent colour, and the
last edit in any window silently becomes the default for every project. A user
who sets one repository to yellow and another to blue ends up with a single
colour everywhere, because both edits target the same key.

Run configurations are the one exception. `useRunConfigurations` already keys
`relay:run-preferences:${root}` and `relay:runs:${root}` by project root, so
project-scoped data exists but lives in global browser storage rather than with
the project.

## Goals

- Give each project its own settings, stored beside the project.
- Keep project settings out of Git without touching files the user tracks.
- Store only explicit overrides, so global defaults still reach every project
  that has not customised a value.
- Guarantee that editing a project never rewrites global state, and that global
  edits never rewrite a project.

## Non-goals

- Agent, session and remote-terminal preferences stay global. Those six
  `relay:` keys describe how a person works rather than what a project is, and
  the remote profiles in `src/shared/contracts/remote.ts` carry machine-specific
  hosts that do not belong in a repository folder.
- No file watching. A project reloads its configuration when it opens.
- No sharing of configuration between machines. The folder is deliberately
  ignored by Git.

## Storage

Each project gets an `.emdeck/` folder at its root holding two files.

`.emdeck/.gitignore` contains a single line:

```gitignore
*
```

That pattern ignores every file in the folder including the `.gitignore`
itself, so the directory never appears in `git status` and no tracked file is
modified. JetBrains uses the same mechanism for `.idea/.gitignore`. Appending
`.emdeck/` to the repository's own `.gitignore` was rejected because it dirties
a tracked file, and `.git/info/exclude` was rejected because Emdeck opens
folders that are not Git repositories.

`.emdeck/settings.json` holds the overrides:

```json
{
  "version": 1,
  "settings": { "accent": "#e8dd7a" },
  "workspace": { "sidebarWidth": 320 },
  "runs": { "preferences": { "runner": "bun" }, "configs": [] }
}
```

Every section is sparse. A project with only a custom accent stores only that
accent. `version` carries the schema number so later formats can migrate.

Both files are created on first write, never on project open. Opening a project
and changing nothing leaves no trace in it.

## Merge semantics

Effective settings are computed in one direction:

```
defaults  <-  global (relay: keys)  <-  project overrides (.emdeck)
```

Absence is meaningful. `{"wordWrap": false}` must stay distinguishable from an
unset `wordWrap`, or a project could never override a global `true` back to
`false`. Two rules preserve that:

- Serialisation omits keys whose value is `undefined`; it never writes
  `"key": undefined` or a placeholder.
- Merging tests `key in overrides`, never truthiness.

`reopenLastProject` is excluded from the override type at the type level. It is
read before any project is open, so a project-scoped value could never apply.

## Architecture

Module ownership follows `docs/ARCHITECTURE.md`: domain services stay free of
React, Tauri and browser storage, and features never import one another.

| Layer | File | Responsibility |
| --- | --- | --- |
| Contract | `src/shared/contracts/projectConfig.ts` | `ProjectConfig`, `SettingsOverrides`, `WorkspaceOverrides` |
| Contract | `src/shared/contracts/desktop.ts` | register `read_project_config`, `write_project_config` |
| Service | `src/features/settings/services/projectConfig.ts` | `parseProjectConfig`, `serialiseProjectConfig`, `mergeSettings`, `diffOverrides` — pure, no IO |
| Port | `src/platform/desktop/api.ts` | `readProjectConfig(root)`, `writeProjectConfig(root, content)` |
| Preview | `src/platform/preview/demo.ts` | browser-mode adapter for both commands |
| Native | `src-tauri/src/services/project_config.rs` | folder creation, `.gitignore` seeding, atomic write |
| Native | `src-tauri/src/commands/projects.rs` | two thin authorised commands |
| Hook | `src/app/hooks/useProjectConfig.ts` | load on open, debounce writes, expose merged settings |

`SettingsOverrides` is `Partial<Omit<Settings, 'reopenLastProject'>>`.
`WorkspaceOverrides` is `Partial<{ layout: Layout; sidebarWidth: number;
terminalHeight: number }>`, covering the three keys in the workspace bucket.

`src/features/settings/` gains a `services/` directory. That mirrors
`features/agents/` and `features/editor/`, which already hold pure domain logic
in `services/` beside simpler loaders in `lib/`.

### Why new native commands

`save_file` requires a `revision` argument for the editor's optimistic
concurrency check and returns a `Document`. This path needs neither, and does
need directory creation and `.gitignore` seeding. Two small commands are
thinner than bending the editor path around a fabricated revision.

Both commands resolve the project through
`projects.root(window.label(), &root)?`, the same per-window authorisation every
other workspace command uses. Writes go to a temporary file inside `.emdeck/`
and are renamed into place, so an interrupted write cannot truncate an existing
configuration.

`docs/ARCHITECTURE.md` notes that `architecture:check` compares the command list
in `shared/contracts/desktop.ts` against Rust registration, so both sides must
be updated together.

### Why a new hook

`useWorkspaceState` is 263 physical lines against the 500-line budget that
`AGENTS.md` applies with no grandfathering. The load, merge, debounce and flush
lifecycle goes in `useProjectConfig`, which `useWorkspaceState` consumes.

## State separation

The overwrite bug is prevented structurally rather than by care. Global
settings and project overrides are two state variables that are merged for
reading and never merged for writing:

- `globalSettings` persists to `relay:settings`, exactly as today.
- `projectOverrides` persists to `.emdeck/settings.json`.
- `settings` is the merged, read-only value the application renders from.

The existing `store('relay:settings', settings)` call changes to persist
`globalSettings`. No code path writes a merged value to either destination.

## Settings panel

`src/features/settings/components/Settings.tsx` gains a scope selector reading
"This project" and "All projects".

- With a project open the selector defaults to "This project", and edits write
  overrides.
- On the welcome screen the selector is fixed to "All projects", because there
  is no project to override.
- In project scope, a field whose value is overridden shows a marker and a
  "Reset to global" control that deletes the key from the overrides, restoring
  inheritance.

Implicit routing, where edits always target the open project, was rejected
because changing a global default would require closing the project first.

## Lifecycle

- **Open.** Read `.emdeck/settings.json`, parse, merge, apply. The read is
  asynchronous, so the merged value is applied in a single effect to keep the
  transition to one frame rather than a visible flash.
- **Edit.** Update state immediately; write the file on a 300 ms debounce.
- **Switch.** Flush any pending write before the root changes, then load the new
  project's configuration.
- **Concurrent windows.** Two windows on one project are last-write-wins. Each
  window loads at open; there is no watcher.

## Error handling

- Unreadable or malformed JSON: log, fall back to global settings, and leave the
  file untouched. A corrupt file is never overwritten automatically, so a user
  can repair it by hand.
- Unknown `version`: treat as unreadable.
- Unwritable project folder, such as a read-only checkout: surface one toast
  through the existing `notify` path and continue with in-memory overrides. A
  project that cannot store settings still opens.

## Migration

`AGENTS.md` requires `relay:` storage keys to be preserved unless a change
carries an explicit migration.

- `relay:settings`, `relay:layout`, `relay:sidebar-width` and
  `relay:terminal-height` keep their current meaning as the global layer. No
  migration is needed; existing preferences become the defaults every project
  inherits, so nothing changes visibly until a project is customised.
- `relay:run-preferences:${root}` and `relay:runs:${root}` are migrated. On the
  first open of a project with no `.emdeck/settings.json`, existing values for
  that root seed the file's `runs` section. The old keys are left in place for
  one release rather than deleted, so a downgrade does not lose run history.

## Testing

- **Unit.** Merge precedence across the three layers; absent versus `false`;
  `diffOverrides` producing sparse output; `serialiseProjectConfig` omitting
  `undefined`; corrupt JSON and unknown `version` falling back without writing.
- **Native.** Folder and `.gitignore` creation on first write; `.gitignore`
  contents; atomic replacement; rejection of roots outside the authorised
  project; a project folder that is not a Git repository.
- **Integration.** A write-then-read round trip through the real command pair.
- **End to end.** The reported bug: set project A's accent, open project B and
  confirm it is unaffected, reload and confirm A's accent survived. A second
  case asserts that editing a project leaves `relay:settings` unchanged.

## Verification

`bun run verify`, plus
`cargo fmt --manifest-path src-tauri/Cargo.toml --check` and
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings`,
as `AGENTS.md` requires before finishing.
