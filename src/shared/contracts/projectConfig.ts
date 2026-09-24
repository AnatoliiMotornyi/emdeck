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
