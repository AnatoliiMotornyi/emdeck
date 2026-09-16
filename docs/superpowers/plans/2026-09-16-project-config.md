# Per-project configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each project's settings in a gitignored `.emdeck/` folder at the project root, as sparse overrides layered over global defaults, so a project reopens with the colour and layout it was given.

**Architecture:** Global settings stay in `relay:settings`. Project overrides live in `.emdeck/settings.json`, reached through two new authorised Tauri commands. The two are merged for reading and never merged for writing, which is what prevents a project edit from rewriting global state. A pure service owns parsing and merging; a hook owns the load/debounce/flush lifecycle.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Tauri v2, Rust, Playwright, Bun 1.3.6, Node 22.

**Spec:** `docs/superpowers/specs/2026-09-16-project-config-design.md`

## Global Constraints

- Node 22 and Bun 1.3.6. Commit `bun.lock`; do not create another JS lockfile.
- Domain services stay independent of React, Tauri and browser storage. IO arrives through typed ports.
- Features never import sibling features. The app composes features. Contracts live in `src/shared/contracts`.
- `src/shared/contracts/*` must not import from `src/features/*`. This is why the config contract types the runs section as `unknown`.
- Separate type imports (`import type`), named JSX handlers, arrow functions in services.
- No `eslint-disable` comments.
- Code-size budgets, no exemptions: components and hooks 500 physical lines, services 700, tests 900.
- Native commands stay thin. Project authorisation remains on the native side, through `projects.root(window.label(), &root)?`.
- Native services must not import command or window-state modules.
- Preserve `dev.relay.ide`, `relay:` storage keys, window labels and the preview root unless the change includes an explicit data migration.
- Every new command name must be added to both `src/shared/contracts/desktop.ts` and the `tauri::generate_handler!` list in `src-tauri/src/lib.rs`, or `bun run architecture:check` fails.
- Before finishing: `bun run verify`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings`.
- Do not commit, push or publish beyond the commits this plan specifies.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/contracts/projectConfig.ts` (create) | `ProjectConfig`, `SettingsOverrides`, `WorkspaceOverrides`, constants |
| `src/features/settings/services/projectConfig.ts` (create) | Pure parse, sanitise, serialise, merge, override helpers |
| `src/shared/contracts/desktop.ts` (modify) | Register two command signatures |
| `src/platform/desktop/api.ts` (modify) | `readProjectConfig`, `writeProjectConfig` port methods |
| `src/platform/preview/demo.ts` (modify) | Browser-preview adapter for both commands |
| `src-tauri/src/services/project_config.rs` (create) | Folder creation, `.gitignore` seeding, atomic read/write |
| `src-tauri/src/services/project_config_tests.rs` (create) | Native unit tests |
| `src-tauri/src/services/mod.rs` (modify) | Register the service module |
| `src-tauri/src/commands/projects.rs` (modify) | Two thin authorised commands |
| `src-tauri/src/lib.rs` (modify) | Register both commands |
| `src/app/hooks/useProjectConfig.ts` (create) | Load on open, debounce writes, flush on switch |
| `src/app/hooks/useWorkspaceState.ts` (modify) | Split global settings from overrides; expose merged value |
| `src/features/settings/components/SettingsScope.tsx` (create) | Scope selector and override marker primitives |
| `src/features/settings/components/Settings.tsx` (modify) | Partial-change `onChange`, scope selector, reset controls |
| `src/App.tsx` (modify) | Pass scope props to `Settings` |
| `src/app/components/TerminalPanel.tsx` (modify) | Use `updateSettings` instead of `setSettings` |
| `src/features/runs/hooks/useRunConfigurations.ts` (modify) | Read and write runs through project config with migration |
| `tests/unit/project-config.test.ts` (create) | Service unit tests |
| `tests/e2e/project-config.spec.ts` (create) | The reported bug, end to end |
| `CHANGELOG.md`, `docs/USAGE.md` (modify) | User-facing documentation |

---

### Task 1: Pure project-config service

The whole merge model, with no IO and no React. Everything later depends on these names.

**Files:**
- Create: `src/shared/contracts/projectConfig.ts`
- Create: `src/features/settings/services/projectConfig.ts`
- Test: `tests/unit/project-config.test.ts`

**Interfaces:**
- Consumes: `Settings` and `Layout` from `src/shared/contracts/workspace.ts`.
- Produces:
  - `PROJECT_CONFIG_VERSION: 1`, `PROJECT_CONFIG_DIR: '.emdeck'`, `PROJECT_CONFIG_FILE: 'settings.json'`
  - `type SettingsOverrides = Partial<Omit<Settings, 'reopenLastProject'>>`
  - `type WorkspaceOverrides = Partial<{ layout: Layout; sidebarWidth: number; terminalHeight: number }>`
  - `interface ProjectConfig { version: number; settings: SettingsOverrides; workspace: WorkspaceOverrides; runs?: unknown }`
  - `const emptyProjectConfig: ProjectConfig`
  - `parseProjectConfig(raw: string | null): ProjectConfig | null`
  - `serialiseProjectConfig(config: ProjectConfig): string`
  - `mergeSettings(global: Settings, overrides: SettingsOverrides): Settings`
  - `withOverride(overrides: SettingsOverrides, change: SettingsOverrides): SettingsOverrides`
  - `withoutOverride(overrides: SettingsOverrides, key: keyof SettingsOverrides): SettingsOverrides`

- [ ] **Step 1: Write the contract**

Create `src/shared/contracts/projectConfig.ts`:

```ts
import type { Layout, Settings } from './workspace';
export const PROJECT_CONFIG_VERSION = 1;
export const PROJECT_CONFIG_DIR = '.emdeck';
export const PROJECT_CONFIG_FILE = 'settings.json';
/** `reopenLastProject` is read before a project exists, so it cannot be overridden. */
export type SettingsOverrides = Partial<Omit<Settings, 'reopenLastProject'>>;
export type WorkspaceOverrides = Partial<{
  layout: Layout;
  sidebarWidth: number;
  terminalHeight: number;
}>;
/** Run preferences stay `unknown` here: contracts cannot import feature types. */
export interface ProjectConfig {
  version: number;
  settings: SettingsOverrides;
  workspace: WorkspaceOverrides;
  runs?: unknown;
}
export const emptyProjectConfig: ProjectConfig = {
  version: PROJECT_CONFIG_VERSION,
  settings: {},
  workspace: {},
};
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/project-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  mergeSettings,
  parseProjectConfig,
  serialiseProjectConfig,
  withOverride,
  withoutOverride,
} from '../../src/features/settings/services/projectConfig';
import { defaults } from '../../src/features/settings/lib/defaults';
import { emptyProjectConfig } from '../../src/shared/contracts/projectConfig';

describe('merging project overrides over global settings', () => {
  it('returns global settings unchanged when nothing is overridden', () => {
    expect(mergeSettings(defaults, {})).toEqual(defaults);
  });
  it('lets a project override a single value without touching the rest', () => {
    const merged = mergeSettings(defaults, { accent: '#e8dd7a' });
    expect(merged.accent).toBe('#e8dd7a');
    expect(merged.fontSize).toBe(defaults.fontSize);
  });
  it('distinguishes an explicit false from an absent key', () => {
    const global = { ...defaults, wordWrap: true };
    expect(mergeSettings(global, { wordWrap: false }).wordWrap).toBe(false);
    expect(mergeSettings(global, {}).wordWrap).toBe(true);
  });
  it('never lets an override introduce reopenLastProject', () => {
    const merged = mergeSettings(defaults, { accent: '#e8dd7a' });
    expect(merged.reopenLastProject).toBe(defaults.reopenLastProject);
  });
});

describe('editing the override set', () => {
  it('adds a key without disturbing existing overrides', () => {
    expect(withOverride({ accent: '#e8dd7a' }, { fontSize: 15 })).toEqual({
      accent: '#e8dd7a',
      fontSize: 15,
    });
  });
  it('removes a key so the global value is inherited again', () => {
    expect(withoutOverride({ accent: '#e8dd7a', fontSize: 15 }, 'accent')).toEqual({
      fontSize: 15,
    });
  });
  it('drops undefined rather than storing it, so absence stays meaningful', () => {
    expect(withOverride({ accent: '#e8dd7a' }, { accent: undefined })).toEqual({});
  });
});

describe('reading a configuration file', () => {
  it('reads a sparse file', () => {
    const parsed = parseProjectConfig('{"version":1,"settings":{"accent":"#e8dd7a"}}');
    expect(parsed?.settings).toEqual({ accent: '#e8dd7a' });
    expect(parsed?.workspace).toEqual({});
  });
  it('rejects malformed JSON so the caller can fall back to global settings', () => {
    expect(parseProjectConfig('{ not json')).toBeNull();
  });
  it('rejects a version it does not understand', () => {
    expect(parseProjectConfig('{"version":99,"settings":{"accent":"#e8dd7a"}}')).toBeNull();
  });
  it('treats a missing file as no overrides rather than an error', () => {
    expect(parseProjectConfig(null)).toEqual(emptyProjectConfig);
  });
  it('drops values that fail validation instead of failing the whole file', () => {
    const parsed = parseProjectConfig(
      '{"version":1,"settings":{"accent":"banana","fontSize":13,"theme":"neon"}}'
    );
    expect(parsed?.settings).toEqual({ fontSize: 13 });
  });
  it('clamps a numeric override into the supported range', () => {
    expect(parseProjectConfig('{"version":1,"settings":{"fontSize":900}}')?.settings).toEqual({
      fontSize: 24,
    });
  });
});

describe('writing a configuration file', () => {
  it('serialises sparse overrides and ends with a newline', () => {
    const text = serialiseProjectConfig({
      version: 1,
      settings: { accent: '#e8dd7a' },
      workspace: {},
    });
    expect(text).toBe('{\n  "version": 1,\n  "settings": {\n    "accent": "#e8dd7a"\n  }\n}\n');
  });
  it('omits empty sections so an untouched project stays minimal', () => {
    expect(serialiseProjectConfig(emptyProjectConfig)).toBe('{\n  "version": 1\n}\n');
  });
  it('round-trips through parse', () => {
    const config = {
      version: 1,
      settings: { accent: '#e8dd7a', wordWrap: false },
      workspace: { sidebarWidth: 320 },
    };
    expect(parseProjectConfig(serialiseProjectConfig(config))).toEqual(config);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test:unit -- project-config`
Expected: FAIL — cannot resolve `src/features/settings/services/projectConfig`.

- [ ] **Step 4: Write the service**

Create `src/features/settings/services/projectConfig.ts`:

```ts
import type {
  ProjectConfig,
  SettingsOverrides,
  WorkspaceOverrides,
} from '../../../shared/contracts/projectConfig';
import { PROJECT_CONFIG_VERSION, emptyProjectConfig } from '../../../shared/contracts/projectConfig';
import type { Layout, Settings } from '../../../shared/contracts/workspace';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clamp = (value: unknown, low: number, high: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(high, Math.max(low, Math.round(value)))
    : undefined;

const bool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** Invalid values are dropped rather than corrected, so the project inherits the global value. */
const sanitiseSettings = (raw: unknown): SettingsOverrides => {
  if (!isRecord(raw)) return {};
  const result: SettingsOverrides = {};
  if (raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'graphite')
    result.theme = raw.theme;
  if (typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent)) result.accent = raw.accent;
  const fontSize = clamp(raw.fontSize, 10, 24);
  if (fontSize !== undefined) result.fontSize = fontSize;
  const terminalFontSize = clamp(raw.terminalFontSize, 10, 24);
  if (terminalFontSize !== undefined) result.terminalFontSize = terminalFontSize;
  const scrollback = clamp(raw.scrollback, 500, 20000);
  if (scrollback !== undefined) result.scrollback = scrollback;
  const wordWrap = bool(raw.wordWrap);
  if (wordWrap !== undefined) result.wordWrap = wordWrap;
  const showHidden = bool(raw.showHidden);
  if (showHidden !== undefined) result.showHidden = showHidden;
  const detectRunScripts = bool(raw.detectRunScripts);
  if (detectRunScripts !== undefined) result.detectRunScripts = detectRunScripts;
  const shell = text(raw.shell);
  if (shell !== undefined) result.shell = shell;
  if (raw.terminalPlacement === 'workspace' || raw.terminalPlacement === 'editor')
    result.terminalPlacement = raw.terminalPlacement;
  return result;
};

const layouts: Layout[] = ['columns', 'rows', 'grid'];

const sanitiseWorkspace = (raw: unknown): WorkspaceOverrides => {
  if (!isRecord(raw)) return {};
  const result: WorkspaceOverrides = {};
  if (layouts.includes(raw.layout as Layout)) result.layout = raw.layout as Layout;
  const sidebarWidth = clamp(raw.sidebarWidth, 140, 720);
  if (sidebarWidth !== undefined) result.sidebarWidth = sidebarWidth;
  const terminalHeight = clamp(raw.terminalHeight, 80, 2000);
  if (terminalHeight !== undefined) result.terminalHeight = terminalHeight;
  return result;
};

/** `null` means unreadable: the caller keeps global settings and leaves the file alone. */
export const parseProjectConfig = (raw: string | null): ProjectConfig | null => {
  if (raw === null) return emptyProjectConfig;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== PROJECT_CONFIG_VERSION) return null;
  const config: ProjectConfig = {
    version: PROJECT_CONFIG_VERSION,
    settings: sanitiseSettings(parsed.settings),
    workspace: sanitiseWorkspace(parsed.workspace),
  };
  if (parsed.runs !== undefined) config.runs = parsed.runs;
  return config;
};

export const serialiseProjectConfig = (config: ProjectConfig): string => {
  const body: Record<string, unknown> = { version: PROJECT_CONFIG_VERSION };
  if (Object.keys(config.settings).length) body.settings = config.settings;
  if (Object.keys(config.workspace).length) body.workspace = config.workspace;
  if (config.runs !== undefined) body.runs = config.runs;
  return `${JSON.stringify(body, null, 2)}\n`;
};

export const mergeSettings = (global: Settings, overrides: SettingsOverrides): Settings => ({
  ...global,
  ...overrides,
  reopenLastProject: global.reopenLastProject,
});

/** Assigning `undefined` clears the key, so absence keeps meaning "inherit". */
export const withOverride = (
  overrides: SettingsOverrides,
  change: SettingsOverrides
): SettingsOverrides => {
  const result: SettingsOverrides = { ...overrides, ...change };
  for (const key of Object.keys(change) as (keyof SettingsOverrides)[])
    if (change[key] === undefined) delete result[key];
  return result;
};

export const withoutOverride = (
  overrides: SettingsOverrides,
  key: keyof SettingsOverrides
): SettingsOverrides => {
  const result = { ...overrides };
  delete result[key];
  return result;
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test:unit -- project-config`
Expected: PASS, all cases.

If `Layout` is not the union `'columns' | 'rows' | 'grid'`, read its definition in `src/shared/contracts/workspace.ts` and correct the `layouts` array to list exactly its members.

- [ ] **Step 6: Check style and boundaries**

Run: `bun run lint:check && bun run type-check && bun run format:check && bun run architecture:check`
Expected: all pass. The contract must not import from `src/features`.

- [ ] **Step 7: Commit**

```bash
git add src/shared/contracts/projectConfig.ts src/features/settings/services/projectConfig.ts tests/unit/project-config.test.ts
git commit -m "feat: add pure project configuration service"
```

---

### Task 2: Native storage for `.emdeck/`

**Files:**
- Create: `src-tauri/src/services/project_config.rs`
- Create: `src-tauri/src/services/project_config_tests.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Modify: `src-tauri/src/commands/projects.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `crate::services::workspace::{err, Result}`, `crate::state::Projects`.
- Produces: `project_config::read(root: &Path) -> Result<Option<String>>`, `project_config::write(root: &Path, content: &str) -> Result<()>`, and commands `read_project_config` / `write_project_config`.

- [ ] **Step 1: Write the failing native tests**

Create `src-tauri/src/services/project_config_tests.rs`:

```rust
use super::*;
use std::fs;

fn temp_root(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("emdeck-config-{name}"));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn reports_no_configuration_before_anything_is_written() {
    let root = temp_root("absent");
    assert_eq!(read(&root).unwrap(), None);
}

#[test]
fn creates_the_folder_and_seeds_a_self_ignoring_gitignore() {
    let root = temp_root("seed");
    write(&root, "{\n  \"version\": 1\n}\n").unwrap();
    assert_eq!(fs::read_to_string(root.join(".emdeck/.gitignore")).unwrap(), "*\n");
    assert_eq!(read(&root).unwrap().unwrap(), "{\n  \"version\": 1\n}\n");
}

#[test]
fn replaces_an_existing_configuration_without_losing_the_ignore_file() {
    let root = temp_root("replace");
    write(&root, "{\n  \"version\": 1\n}\n").unwrap();
    write(&root, "{\n  \"version\": 1,\n  \"settings\": {}\n}\n").unwrap();
    assert!(read(&root).unwrap().unwrap().contains("settings"));
    assert!(root.join(".emdeck/.gitignore").exists());
}

#[test]
fn keeps_a_gitignore_the_user_edited() {
    let root = temp_root("custom-ignore");
    fs::create_dir_all(root.join(".emdeck")).unwrap();
    fs::write(root.join(".emdeck/.gitignore"), "# mine\n*\n").unwrap();
    write(&root, "{\n  \"version\": 1\n}\n").unwrap();
    assert_eq!(fs::read_to_string(root.join(".emdeck/.gitignore")).unwrap(), "# mine\n*\n");
}

#[test]
fn refuses_a_configuration_larger_than_the_limit() {
    let root = temp_root("oversize");
    let huge = "x".repeat((MAX_CONFIG_SIZE + 1) as usize);
    assert!(write(&root, &huge).is_err());
}

#[test]
fn reports_non_utf8_contents_as_an_error_rather_than_panicking() {
    let root = temp_root("binary");
    fs::create_dir_all(root.join(".emdeck")).unwrap();
    fs::write(root.join(".emdeck/settings.json"), [0xff, 0xfe, 0x00]).unwrap();
    assert!(read(&root).is_err());
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked project_config`
Expected: FAIL — module `project_config` does not exist.

- [ ] **Step 3: Write the native service**

Create `src-tauri/src/services/project_config.rs`:

```rust
use crate::services::workspace::{err, Result};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

const DIR: &str = ".emdeck";
const FILE: &str = "settings.json";
const IGNORE: &str = "*\n";
const MAX_CONFIG_SIZE: u64 = 1024 * 1024;

fn folder(root: &Path) -> PathBuf {
    root.join(DIR)
}

/// Returns `None` when the project has never stored settings.
pub fn read(root: &Path) -> Result<Option<String>> {
    let path = folder(root).join(FILE);
    let Ok(metadata) = fs::metadata(&path) else {
        return Ok(None);
    };
    if metadata.len() > MAX_CONFIG_SIZE {
        return Err("Project configuration exceeds the 1 MB limit.".into());
    }
    let bytes = fs::read(&path).map_err(err)?;
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "Project configuration is not UTF-8 text.".into())
}

pub fn write(root: &Path, content: &str) -> Result<()> {
    if content.len() as u64 > MAX_CONFIG_SIZE {
        return Err("Project configuration exceeds the 1 MB limit.".into());
    }
    let dir = folder(root);
    fs::create_dir_all(&dir).map_err(err)?;
    seed_ignore(&dir)?;
    persist(&dir.join(FILE), content)
}

/// A `*` pattern ignores every file in the folder including this one, so the
/// directory never reaches `git status` and no tracked file is modified.
fn seed_ignore(dir: &Path) -> Result<()> {
    let path = dir.join(".gitignore");
    if path.exists() {
        return Ok(());
    }
    fs::write(&path, IGNORE).map_err(err)
}

fn persist(path: &Path, content: &str) -> Result<()> {
    let parent = path.parent().ok_or("Invalid parent")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    temp.write_all(content.as_bytes()).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    for attempt in 0..6 {
        match temp.persist(path) {
            Ok(_) => return Ok(()),
            // Windows briefly denies replacement while a scanner holds the file.
            Err(failure) if cfg!(windows) && attempt < 5 => {
                temp = failure.file;
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
            Err(failure) => return Err(err(failure)),
        }
    }
    Err("Could not save the project configuration.".into())
}

#[cfg(test)]
#[path = "project_config_tests.rs"]
mod tests;
```

Add to `src-tauri/src/services/mod.rs`, keeping alphabetical order (after `markdown`):

```rust
pub(crate) mod project_config;
```

- [ ] **Step 4: Run the native tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked project_config`
Expected: PASS, six tests.

- [ ] **Step 5: Add the two commands**

Append to `src-tauri/src/commands/projects.rs`, and add `project_config` to the existing `crate::services` import:

```rust
#[tauri::command]
pub(crate) async fn read_project_config(
    window: tauri::Window,
    root: String,
    projects: State<'_, Projects>,
) -> Result<Option<String>> {
    project_config::read(&projects.root(window.label(), &root)?)
}

#[tauri::command]
pub(crate) async fn write_project_config(
    window: tauri::Window,
    root: String,
    content: String,
    projects: State<'_, Projects>,
) -> Result<()> {
    project_config::write(&projects.root(window.label(), &root)?, &content)
}
```

Register both in `src-tauri/src/lib.rs`, inside `tauri::generate_handler![`, next to the other `commands::projects::` entries:

```rust
            commands::projects::read_project_config,
            commands::projects::write_project_config,
```

- [ ] **Step 6: Verify the native side builds clean**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml --check && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/services/project_config.rs src-tauri/src/services/project_config_tests.rs src-tauri/src/services/mod.rs src-tauri/src/commands/projects.rs src-tauri/src/lib.rs
git commit -m "feat: store project configuration in a gitignored .emdeck folder"
```

---

### Task 3: Typed port and preview adapter

**Files:**
- Modify: `src/shared/contracts/desktop.ts`
- Modify: `src/platform/desktop/api.ts`
- Modify: `src/platform/preview/demo.ts`

**Interfaces:**
- Consumes: the native commands from Task 2.
- Produces: `api.readProjectConfig(root: string): Promise<string | null>` and `api.writeProjectConfig(root: string, content: string): Promise<void>`.

- [ ] **Step 1: Add the command signatures**

In `src/shared/contracts/desktop.ts`, inside `DesktopCommands`, after `startup_project`:

```ts
  read_project_config: Command<Repository, string | null>;
  write_project_config: Command<Repository & { content: string }, void>;
```

- [ ] **Step 2: Add the port methods**

In `src/platform/desktop/api.ts`, inside the `api` object after `startupProject`:

```ts
  readProjectConfig: (root: string) => call('read_project_config', { root }),
  writeProjectConfig: (root: string, content: string) =>
    call('write_project_config', { root, content }),
```

- [ ] **Step 3: Add the preview adapter cases**

In `src/platform/preview/demo.ts`, inside the `switch`, before `default`:

```ts
    case 'read_project_config':
      result = readStored<string | null>('relay:demo-project-config', null);
      break;
    case 'write_project_config':
      store('relay:demo-project-config', String(args.content ?? ''));
      break;
```

- [ ] **Step 4: Verify the command lists agree**

Run: `bun run architecture:check && bun run type-check`
Expected: PASS. This check compares the TypeScript command list against Rust registration, so a missing entry on either side fails here.

- [ ] **Step 5: Commit**

```bash
git add src/shared/contracts/desktop.ts src/platform/desktop/api.ts src/platform/preview/demo.ts
git commit -m "feat: expose project configuration through the desktop port"
```

---

### Task 4: Load, merge and persist in the workspace

The task that fixes the reported bug. Global settings and project overrides become two state variables that are merged for reading and never for writing.

**Files:**
- Create: `src/app/hooks/useProjectConfig.ts`
- Modify: `src/app/hooks/useWorkspaceState.ts:26` and `:142-155`
- Modify: `src/app/components/TerminalPanel.tsx:37-41`

**Interfaces:**
- Consumes: Task 1's service, Task 3's port, `Project` from `src/shared/contracts/workspace.ts`.
- Produces from `useProjectConfig(project, fail)`:
  - `overrides: SettingsOverrides`
  - `workspaceOverrides: WorkspaceOverrides`
  - `runs: unknown`
  - `ready: boolean`
  - `setOverrides(change: (previous: SettingsOverrides) => SettingsOverrides): void`
  - `setRuns(value: unknown): void`
- Produces from `useWorkspaceState`: `settings` (merged), `globalSettings`, `overrides`, `updateSettings(change: SettingsOverrides, scope?: 'project' | 'global')`, `resetOverride(key: keyof SettingsOverrides)`, `projectScopeAvailable: boolean`.

- [ ] **Step 1: Write the hook**

Create `src/app/hooks/useProjectConfig.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../platform/desktop/api';
import {
  parseProjectConfig,
  serialiseProjectConfig,
} from '../../features/settings/services/projectConfig';
import type {
  ProjectConfig,
  SettingsOverrides,
} from '../../shared/contracts/projectConfig';
import { emptyProjectConfig } from '../../shared/contracts/projectConfig';
import type { Project } from '../../shared/contracts/workspace';

const SAVE_DELAY = 300;

export function useProjectConfig(project: Project | null, fail: (error: unknown) => void) {
  const root = project?.root ?? '';
  const [state, setState] = useState({ root: '', config: emptyProjectConfig, ready: false });
  // A corrupt file is never rewritten, so a user can repair it by hand.
  const writable = useRef(true);
  const pending = useRef<{ root: string; config: ProjectConfig } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const queued = pending.current;
    pending.current = null;
    if (!queued) return;
    void api
      .writeProjectConfig(queued.root, serialiseProjectConfig(queued.config))
      .catch(error => {
        writable.current = false;
        fail(error);
      });
  }, [fail]);

  useEffect(() => {
    flush();
    if (!root) {
      setState({ root: '', config: emptyProjectConfig, ready: true });
      return;
    }
    let cancelled = false;
    setState({ root, config: emptyProjectConfig, ready: false });
    void api
      .readProjectConfig(root)
      .then(raw => {
        if (cancelled) return;
        const parsed = parseProjectConfig(raw);
        writable.current = parsed !== null;
        if (!parsed) fail('This project has an unreadable .emdeck/settings.json. Using global settings.');
        setState({ root, config: parsed ?? emptyProjectConfig, ready: true });
      })
      .catch(error => {
        if (cancelled) return;
        writable.current = false;
        fail(error);
        setState({ root, config: emptyProjectConfig, ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, [root, flush, fail]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const queue = useCallback(
    (change: (previous: ProjectConfig) => ProjectConfig) => {
      setState(previous => {
        if (previous.root !== root || !root || !previous.ready) return previous;
        const config = change(previous.config);
        if (writable.current) {
          pending.current = { root, config };
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const queued = pending.current;
            pending.current = null;
            if (!queued) return;
            void api
              .writeProjectConfig(queued.root, serialiseProjectConfig(queued.config))
              .catch(error => {
                writable.current = false;
                fail(error);
              });
          }, SAVE_DELAY);
        }
        return { ...previous, config };
      });
    },
    [root, fail]
  );

  return {
    overrides: state.root === root ? state.config.settings : {},
    workspaceOverrides: state.root === root ? state.config.workspace : {},
    runs: state.root === root ? state.config.runs : undefined,
    ready: state.ready && state.root === root,
    setOverrides: useCallback(
      (change: (previous: SettingsOverrides) => SettingsOverrides) =>
        queue(config => ({ ...config, settings: change(config.settings) })),
      [queue]
    ),
    setRuns: useCallback(
      (value: unknown) => queue(config => ({ ...config, runs: value })),
      [queue]
    ),
  };
}
```

- [ ] **Step 2: Split the settings state**

In `src/app/hooks/useWorkspaceState.ts`, rename the settings state so the global layer is explicit. Replace line 26:

```ts
  const [globalSettings, setGlobalSettings] = useState(loadSettings);
```

After `fail` is defined (it is needed by the hook), add:

```ts
  const config = useProjectConfig(project, fail);
  const settings = mergeSettings(globalSettings, config.overrides);
  const projectScopeAvailable = Boolean(project);
  const updateSettings = useCallback(
    (change: SettingsOverrides, scope: 'project' | 'global' = 'project') => {
      if (scope === 'project' && projectScopeAvailable)
        config.setOverrides(previous => withOverride(previous, change));
      else setGlobalSettings(previous => ({ ...previous, ...change }));
    },
    [config, projectScopeAvailable]
  );
  const resetOverride = useCallback(
    (key: keyof SettingsOverrides) =>
      config.setOverrides(previous => withoutOverride(previous, key)),
    [config]
  );
```

Add the imports at the top:

```ts
import { useProjectConfig } from './useProjectConfig';
import {
  mergeSettings,
  withOverride,
  withoutOverride,
} from '../../features/settings/services/projectConfig';
import type { SettingsOverrides } from '../../shared/contracts/projectConfig';
```

- [ ] **Step 3: Persist the global layer only**

Replace the effect at `src/app/hooks/useWorkspaceState.ts:142-145` with:

```ts
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--accent', settings.accent);
  }, [settings.theme, settings.accent]);
  useEffect(() => {
    // Only the global layer reaches relay:settings. A project edit must never land here.
    store('relay:settings', globalSettings);
  }, [globalSettings]);
```

Update the returned object: keep `settings` (now merged), drop `setSettings`, and add `globalSettings`, `overrides: config.overrides`, `updateSettings`, `resetOverride`, `projectScopeAvailable`.

- [ ] **Step 4: Update the other caller**

In `src/app/components/TerminalPanel.tsx:37-41`, replace the `setSettings` updater with the routing API, and change the hook's `Pick` contract from `'setSettings'` to `'updateSettings'`:

```ts
  const handleFullWidthTerminalPanelClick = () =>
    updateSettings({
      terminalPlacement: settings.terminalPlacement === 'workspace' ? 'editor' : 'workspace',
    });
```

- [ ] **Step 5: Verify nothing else calls the removed setter**

Run: `grep -rn "setSettings" src/`
Expected: no matches. Any remaining call site must be converted to `updateSettings` before continuing.

- [ ] **Step 6: Type-check and test**

Run: `bun run type-check && bun run test:unit && bun run lint:check && bun run code-size:check`
Expected: PASS. `code-size:check` confirms `useWorkspaceState.ts` is still under 500 lines; if it is not, move the block from Step 2 into `useProjectConfig.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/app/hooks/useProjectConfig.ts src/app/hooks/useWorkspaceState.ts src/app/components/TerminalPanel.tsx
git commit -m "fix: keep project settings separate from global defaults"
```

---

### Task 5: Move run configurations into the project folder

**Files:**
- Modify: `src/features/runs/hooks/useRunConfigurations.ts:9-31`
- Modify: `src/app/hooks/useWorkspaceState.ts:68`
- Test: `tests/unit/project-config.test.ts`

**Interfaces:**
- Consumes: `config.runs` and `config.setRuns` from Task 4; `restoreRuns` and `emptyRuns` from `src/features/runs/services/runDiscovery.ts`.
- Produces: unchanged public surface of `useRunConfigurations`; only its storage changes.

- [ ] **Step 1: Write the failing migration test**

Append to `tests/unit/project-config.test.ts`:

Note the existing signature before writing this: `restoreRuns(saved: unknown, legacy: unknown)`
takes a `RunPreferences`-shaped record as `saved` and an **array of run configs** as
`legacy` — the two distinct old keys. The migration helper keeps that arity and only
chooses which source supplies `saved`.

```ts
import { migrateStoredRuns } from '../../src/features/runs/services/runDiscovery';

describe('migrating run preferences into the project folder', () => {
  const preferences = { version: 1, custom: [], selected: 'dev', runner: 'bun', recent: [] };
  it('adopts legacy localStorage preferences when the project has no runs section', () => {
    expect(migrateStoredRuns(undefined, preferences, []).selected).toBe('dev');
    expect(migrateStoredRuns(undefined, preferences, []).runner).toBe('bun');
  });
  it('prefers the project folder once it holds a runs section', () => {
    const stored = { version: 1, custom: [], selected: 'build', runner: 'auto', recent: [] };
    expect(migrateStoredRuns(stored, preferences, []).selected).toBe('build');
  });
  it('falls back to empty preferences when no source is usable', () => {
    expect(migrateStoredRuns(undefined, null, []).selected).toBe('');
    expect(migrateStoredRuns(undefined, null, []).runner).toBe('auto');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test:unit -- project-config`
Expected: FAIL — `migrateStoredRuns` is not exported.

- [ ] **Step 3: Add the migration helper**

Append to `src/features/runs/services/runDiscovery.ts`:

```ts
/** The project folder wins once it has a runs section; the old keys seed the first write. */
export const migrateStoredRuns = (
  stored: unknown,
  savedPreferences: unknown,
  legacyRuns: unknown
): RunPreferences => restoreRuns(stored ?? savedPreferences, legacyRuns);
```

- [ ] **Step 4: Read and write runs through the project config**

In `src/features/runs/hooks/useRunConfigurations.ts`, widen the signature to accept the config slice, replace the load effect, and replace the save effect:

```ts
export function useRunConfigurations(
  project: Project | null,
  enabled: boolean,
  runs: unknown,
  setRuns: (value: unknown) => void,
  ready: boolean
) {
```

```ts
  useEffect(() => {
    if (!root || !ready) return;
    setState({
      root,
      prefs: migrateStoredRuns(
        runs,
        readStored(`relay:run-preferences:${root}`, null),
        readStored(`relay:runs:${root}`, [])
      ),
    });
  }, [root, ready, runs]);
  useEffect(() => {
    if (root && active && ready) setRuns(prefs);
  }, [root, active, ready, prefs, setRuns]);
```

Import `migrateStoredRuns` alongside the existing `runDiscovery` imports. Leave the `relay:run-preferences:${root}` read in place: `AGENTS.md` requires the old keys to survive one release, and nothing writes them any more.

In `src/app/hooks/useWorkspaceState.ts:68`, pass the new arguments:

```ts
  const runs = useRunConfigurations(
    project,
    settings.detectRunScripts,
    config.runs,
    config.setRuns,
    config.ready
  );
```

- [ ] **Step 5: Run the tests**

Run: `bun run test:unit && bun run type-check && bun run lint:check`
Expected: PASS, including the existing `tests/unit/runs.test.ts` and `discover-project-runs.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/features/runs/services/runDiscovery.ts src/features/runs/hooks/useRunConfigurations.ts src/app/hooks/useWorkspaceState.ts tests/unit/project-config.test.ts
git commit -m "feat: store run configurations with the project"
```

---

### Task 6: Scope selector in the settings panel

**Files:**
- Create: `src/features/settings/components/SettingsScope.tsx`
- Modify: `src/features/settings/components/Settings.tsx`
- Modify: `src/App.tsx:87`
- Modify: `src/styles/` — add rules to the stylesheet that already owns dialog and settings rules

**Interfaces:**
- Consumes: `updateSettings`, `resetOverride`, `overrides`, `projectScopeAvailable` from Task 4.
- Produces: `Settings` props `{ settings, overrides, scope, onScopeChange, onChange, onReset, projectScopeAvailable, projectName, onClose }` where `onChange: (change: SettingsOverrides) => void`.

- [ ] **Step 1: Write the scope primitives**

Create `src/features/settings/components/SettingsScope.tsx`:

```tsx
import type { SettingsOverrides } from '../../../shared/contracts/projectConfig';
export type SettingsScope = 'project' | 'global';
export function ScopeSelector({
  scope,
  available,
  projectName,
  onChange,
}: {
  scope: SettingsScope;
  available: boolean;
  projectName: string;
  onChange: (scope: SettingsScope) => void;
}) {
  const handleProjectClick = () => onChange('project');
  const handleGlobalClick = () => onChange('global');
  return (
    <div className='settings-scope' role='group' aria-label='Settings scope'>
      <button
        type='button'
        disabled={!available}
        aria-pressed={scope === 'project'}
        className={scope === 'project' ? 'chosen' : ''}
        onClick={handleProjectClick}
      >
        This project
        <small>{available ? projectName : 'No project open'}</small>
      </button>
      <button
        type='button'
        aria-pressed={scope === 'global'}
        className={scope === 'global' ? 'chosen' : ''}
        onClick={handleGlobalClick}
      >
        All projects
        <small>Defaults for projects that have no override</small>
      </button>
    </div>
  );
}
export function OverrideMarker({
  field,
  overrides,
  scope,
  onReset,
}: {
  field: keyof SettingsOverrides;
  overrides: SettingsOverrides;
  scope: SettingsScope;
  onReset: (field: keyof SettingsOverrides) => void;
}) {
  const handleResetClick = () => onReset(field);
  if (scope !== 'project' || !(field in overrides)) return null;
  return (
    <button type='button' className='override-marker' onClick={handleResetClick}>
      Overridden · Reset to global
    </button>
  );
}
```

- [ ] **Step 2: Convert `Settings` to partial changes**

In `src/features/settings/components/Settings.tsx`:

- Change the prop type to `onChange: (change: SettingsOverrides) => void` and replace the body of `update` with `const update = (change: SettingsOverrides) => onChange(change);`. Every existing `handleChange*` already calls `update` with a single key, so none of them change.
- Replace `handleChangeClick` (the reset control) so it clears rather than assigns defaults: in project scope call `onResetAll()`, in global scope call `onChange(defaults)`.
- Render `<ScopeSelector …/>` directly under the `dialog-description` paragraph.
- Render `<OverrideMarker field='accent' …/>` beside the accent row, and the same for `theme`, `fontSize`, `terminalFontSize`, `wordWrap`, `showHidden`, `shell`, `scrollback`, `detectRunScripts`.
- Keep the `reopenLastProject` row rendered only when `scope === 'global'`, since it cannot be overridden.

- [ ] **Step 3: Wire the panel**

In `src/App.tsx:87`, replace the render with the full prop set, taking `scope` from a new `useState<SettingsScope>('project')` in `App` that is forced to `'global'` whenever `projectScopeAvailable` is false:

```tsx
        <Settings
          settings={settings}
          overrides={overrides}
          scope={projectScopeAvailable ? scope : 'global'}
          onScopeChange={setScope}
          projectScopeAvailable={projectScopeAvailable}
          projectName={project?.name ?? ''}
          onChange={handleSettingsChange}
          onReset={resetOverride}
          onClose={handleSettingsOpenClose}
        />
```

where `const handleSettingsChange = (change: SettingsOverrides) => updateSettings(change, projectScopeAvailable ? scope : 'global');`

- [ ] **Step 4: Add the styles**

Find the stylesheet that already defines `.settings-section` and `.setting-row` (`grep -rln "settings-section" src/styles/`) and add `.settings-scope` and `.override-marker` rules there, following the surrounding conventions. Do not create a new stylesheet; `src/styles/styles.css` controls ordering.

- [ ] **Step 5: Verify**

Run: `bun run check && bun run test:unit`
Expected: PASS, including `code-size:check` for `Settings.tsx` under 500 lines.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/components/SettingsScope.tsx src/features/settings/components/Settings.tsx src/App.tsx src/styles
git commit -m "feat: choose between project and global settings scope"
```

---

### Task 7: End-to-end proof and documentation

**Files:**
- Create: `tests/e2e/project-config.spec.ts`
- Modify: `CHANGELOG.md`
- Modify: `docs/USAGE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no new interfaces.

- [ ] **Step 1: Write the end-to-end test**

Read `tests/e2e/terminal-titles.spec.ts` first and copy its fixture and selector conventions exactly. Create `tests/e2e/project-config.spec.ts` covering, in the browser-preview build:

1. Open the settings panel, confirm the scope selector defaults to "This project".
2. Set the accent to `#e8dd7a`, close and reopen the panel, confirm the accent persisted and the accent row shows the override marker.
3. Confirm `localStorage['relay:settings']` does not contain `#e8dd7a` — the project edit must not have touched the global layer.
4. Click "Reset to global" and confirm the accent returns to the global value and the marker disappears.
5. Reload the page and confirm the override is restored from storage rather than reset.

- [ ] **Step 2: Run the end-to-end test**

Run: `bun run test:e2e`
Expected: PASS. It builds first, so it is slow; run it once here rather than per step.

- [ ] **Step 3: Document the feature**

Add a `CHANGELOG.md` entry under the unreleased heading, matching the surrounding style:

```markdown
- Project settings are stored in a gitignored `.emdeck/` folder, so each project keeps its own accent, theme, layout and run configurations across restarts. Settings you have not overridden still follow your global defaults.
```

Add a short section to `docs/USAGE.md` explaining the scope selector, where the file lives, that `.emdeck/.gitignore` keeps it out of Git, and that deleting the folder restores global defaults.

- [ ] **Step 4: Run the full verification**

Run each and confirm it passes:

```bash
bun run verify
```

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/project-config.spec.ts CHANGELOG.md docs/USAGE.md
git commit -m "test: cover per-project settings end to end"
```

---

## Manual verification

Before opening the pull request, confirm the original report is fixed in the real desktop app:

1. `bun run desktop`, open `repo5`, set the accent to yellow.
2. Open `repo6` and set the accent to blue. Confirm `repo5` is unaffected.
3. Quit the app completely and relaunch it.
4. Open `repo5`: it is yellow. Open `repo6`: it is blue.
5. In both, run `git status` and confirm the tree is clean and `.emdeck/` is absent from the output.
6. Open a project you never customised and confirm it uses the global defaults.
