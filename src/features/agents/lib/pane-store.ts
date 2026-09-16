import { readStored, store } from '../../../platform/storage/preferences';
import type { Pane } from '../../../shared/contracts/workspace';
import { restoreProfiles } from '../services/connections';

export const PANE_COLORS = ['#b8ee86', '#c4a0ed', '#8bbbf5', '#f1b17f', '#f38ea2'];

const KEY = 'relay:panes';
const MAX_PANES = 12;
const MAX_PROJECTS = 8;
const MAX_TEXT = 400;
const HEX = /^#[0-9a-f]{3,8}$/i;

interface StoredProject {
  root: string;
  panes: Pane[];
}

const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, MAX_TEXT) : '');

const remoteOf = (value: unknown) => {
  const [profile] = restoreProfiles([value]);
  return profile?.kind === 'ssh' ? profile : undefined;
};

/** A restored pane describes how to launch, never how the last run went. */
const durable = (pane: Pane, index: number): Pane => ({
  id: pane.id,
  name: pane.name,
  customName: pane.customName,
  command: pane.command,
  cwd: pane.cwd,
  shell: pane.shell,
  color: HEX.test(pane.color) ? pane.color : PANE_COLORS[index % PANE_COLORS.length],
  remote: pane.remote,
});

export const restorePanes = (value: unknown): Pane[] => {
  if (!Array.isArray(value)) return [];
  const panes: Pane[] = [];
  for (const item of value.slice(0, MAX_PANES)) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) continue;
    panes.push(
      durable(
        {
          id: item.id.slice(0, 100),
          name: text(item.name) || 'Terminal',
          customName: typeof item.customName === 'string' ? text(item.customName) : undefined,
          command: text(item.command),
          cwd: text(item.cwd),
          shell: text(item.shell),
          color: text(item.color),
          remote: remoteOf(item.remote),
        },
        panes.length
      )
    );
  }
  return panes;
};

const projects = (): StoredProject[] => {
  const value = readStored<unknown>(KEY, []);
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry =>
    entry && typeof entry === 'object' && typeof entry.root === 'string' && entry.root
      ? [{ root: entry.root, panes: restorePanes(entry.panes) }]
      : []
  );
};

export const storedPanes = (root: string): Pane[] =>
  projects().find(entry => entry.root === root)?.panes ?? [];

export const rememberPanes = (root: string, panes: Pane[]) => {
  const rest = projects().filter(entry => entry.root !== root);
  const next = { root, panes: panes.slice(0, MAX_PANES).map(durable) };
  store(KEY, [next, ...rest].slice(0, MAX_PROJECTS));
};
