import type {
  ProjectConfig,
  SettingsOverrides,
  WorkspaceOverrides,
} from '../../../shared/contracts/projectConfig';
import {
  PROJECT_CONFIG_VERSION,
  emptyProjectConfig,
} from '../../../shared/contracts/projectConfig';
import type { Layout, Settings } from '../../../shared/contracts/workspace';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clamp = (value: unknown, low: number, high: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(high, Math.max(low, Math.round(value)))
    : undefined;

const bool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** Invalid values are dropped rather than corrected, so the project inherits the global value. */
const sanitiseSettings = (raw: unknown): SettingsOverrides => {
  if (!isRecord(raw)) return {};
  const result: SettingsOverrides = {};
  if (raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'graphite')
    result.theme = raw.theme;
  if (typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent))
    result.accent = raw.accent;
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

/**
 * The global layer has no sparse form — every key is always present — so an
 * `undefined` value is dropped rather than stored, exactly as `withOverride`
 * drops it from an override set. Neither layer ever holds an `undefined` value.
 */
export const withGlobalChange = (global: Settings, change: Partial<Settings>): Settings => {
  const defined: Partial<Settings> = { ...change };
  for (const key of Object.keys(defined) as (keyof Settings)[])
    if (defined[key] === undefined) delete defined[key];
  return { ...global, ...defined };
};

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
