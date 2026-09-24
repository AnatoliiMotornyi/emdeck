import { readStored, store } from '../../../platform/storage/preferences';
import type { AgentUsage, Pane } from '../../../shared/contracts/workspace';
import { restoreProfiles } from '../services/connections';

export const PANE_COLORS = ['#b8ee86', '#c4a0ed', '#8bbbf5', '#f1b17f', '#f38ea2'];

const KEY = 'relay:panes';
const MAX_PANES = 12;
const MAX_PROJECTS = 8;
const MAX_TEXT = 400;
const HEX = /^#[0-9a-f]{3,8}$/i;
// Matches the runtime's resume_command charset, which a shell cannot read as syntax.
const SESSION = /^[a-z0-9][a-z0-9_-]{0,199}$/i;

interface StoredProject {
  root: string;
  panes: Pane[];
}

const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, MAX_TEXT) : '');

const remoteOf = (value: unknown) => {
  const [profile] = restoreProfiles([value]);
  return profile?.kind === 'ssh' ? profile : undefined;
};

/** A restored pane describes how to launch and which conversation to resume, nothing else. */
const durable = (pane: Pane, index: number): Pane => ({
  id: pane.id,
  name: pane.name,
  customName: pane.customName,
  command: pane.command,
  cwd: pane.cwd,
  shell: pane.shell,
  color: HEX.test(pane.color) ? pane.color : PANE_COLORS[index % PANE_COLORS.length],
  remote: pane.remote,
  resume: pane.resume && SESSION.test(pane.resume) ? pane.resume : undefined,
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
          resume: text(item.resume),
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

export const rememberPanes = (root: string, panes: Pane[], usage: Record<string, AgentUsage>) => {
  const rest = projects().filter(entry => entry.root !== root);
  const next = {
    root,
    panes: panes
      .slice(0, MAX_PANES)
      // Reopening clears reported usage, so the restored id stands until a newer one arrives.
      .map((pane, index) =>
        durable({ ...pane, resume: usage[pane.id]?.sessionId ?? pane.resume }, index)
      ),
  };
  store(KEY, [next, ...rest].slice(0, MAX_PROJECTS));
};
