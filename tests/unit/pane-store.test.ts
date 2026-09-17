import { beforeEach, describe, expect, it } from 'vitest';
import {
  PANE_COLORS,
  rememberPanes,
  restorePanes,
  storedPanes,
} from '../../src/features/agents/lib/pane-store';
import type { SshProfile } from '../../src/shared/contracts/remote';
import type { AgentUsage, Pane } from '../../src/shared/contracts/workspace';

const remote: SshProfile = {
  id: 'buildbox',
  name: 'Build box',
  kind: 'ssh',
  target: {
    backend: 'cmux',
    host: 'dev@buildbox',
    port: null,
    session: 'agents',
    binary: 'cmux',
    command: '',
  },
};
const usage = (sessions: Record<string, string | null>): Record<string, AgentUsage> =>
  Object.fromEntries(
    Object.entries(sessions).map(([id, sessionId]) => [
      id,
      { source: 'report', updatedAt: 0, model: null, sessionId } as AgentUsage,
    ])
  );
const pane = (id: string, over: Partial<Pane> = {}): Pane => ({
  id,
  name: 'Claude',
  command: 'claude',
  cwd: 'packages/api',
  shell: '/bin/zsh',
  color: PANE_COLORS[0],
  ...over,
});

beforeEach(() => {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
    },
  });
});

describe('terminal persistence', () => {
  it('returns a project to the panes it had, and keeps projects apart', () => {
    rememberPanes('/work/api', [pane('one'), pane('two', { name: 'Shell', command: '' })], {});
    rememberPanes('/work/web', [pane('three', { remote })], {});
    expect(storedPanes('/work/api').map(p => [p.id, p.name, p.command])).toEqual([
      ['one', 'Claude', 'claude'],
      ['two', 'Shell', ''],
    ]);
    expect(storedPanes('/work/web')).toEqual([pane('three', { remote })]);
    expect(storedPanes('/work/unopened')).toEqual([]);
  });

  it('remembers every kind of terminal, not just agents', () => {
    const all = [
      pane('shell', { name: 'Terminal', command: '' }),
      pane('codex', { name: 'Codex', command: 'codex' }),
      pane('ssh', { name: 'Build box', command: '', remote }),
    ];
    rememberPanes('/work/api', all, {});
    expect(storedPanes('/work/api')).toEqual(all);
  });

  it('drops how the last run went so a restored pane starts clean', () => {
    rememberPanes(
      '/work/api',
      [pane('one', { startedAt: 111, endedAt: 222, restart: 3, title: 'npm run dev' })],
      {}
    );
    const [restored] = storedPanes('/work/api');
    expect(restored.startedAt).toBeUndefined();
    expect(restored.endedAt).toBeUndefined();
    expect(restored.restart).toBeUndefined();
    expect(restored.title).toBeUndefined();
  });

  it('keeps the agent session so a restored pane resumes its conversation', () => {
    rememberPanes('/work/api', [pane('one'), pane('two')], usage({ one: 'abc_123-XY' }));
    const [claude, shell] = storedPanes('/work/api');
    expect(claude.resume).toBe('abc_123-XY');
    expect(shell.resume).toBeUndefined();
  });

  it('replaces the remembered session each time the agent reports a newer one', () => {
    rememberPanes('/work/api', [pane('one')], usage({ one: 'first' }));
    rememberPanes('/work/api', [pane('one')], usage({ one: 'second' }));
    expect(storedPanes('/work/api')[0].resume).toBe('second');
  });

  it('keeps the restored session through the save that reopening triggers', () => {
    rememberPanes('/work/api', [pane('one')], usage({ one: 'abc_123-XY' }));
    const restored = storedPanes('/work/api');
    rememberPanes('/work/api', restored, {});
    expect(storedPanes('/work/api')[0].resume).toBe('abc_123-XY');
  });

  it('refuses a session id a shell could read as syntax', () => {
    for (const id of ['a; rm -rf ~', 'a b', '$(whoami)', '-flag', '', 'a'.repeat(201)]) {
      rememberPanes('/work/api', [pane('one')], usage({ one: id }));
      expect(storedPanes('/work/api')[0].resume).toBeUndefined();
    }
    const [restored] = restorePanes([{ id: 'one', command: 'claude', resume: 'a`id`' }]);
    expect(restored.resume).toBeUndefined();
  });

  it('replaces a project’s panes rather than accumulating them', () => {
    rememberPanes('/work/api', [pane('one'), pane('two')], {});
    rememberPanes('/work/api', [pane('three')], {});
    expect(storedPanes('/work/api').map(p => p.id)).toEqual(['three']);
  });

  it('caps panes per project and projects overall', () => {
    rememberPanes(
      '/work/api',
      Array.from({ length: 20 }, (_, i) => pane(`pane-${i}`)),
      {}
    );
    expect(storedPanes('/work/api')).toHaveLength(12);
    for (let i = 0; i < 10; i++) rememberPanes(`/work/p${i}`, [pane(`p${i}`)], {});
    expect(storedPanes('/work/p9')).toHaveLength(1);
    expect(storedPanes('/work/p1')).toEqual([]);
  });

  it('survives storage written by something else', () => {
    expect(restorePanes(null)).toEqual([]);
    expect(restorePanes('panes')).toEqual([]);
    expect(restorePanes([null, 42, {}, { id: '' }])).toEqual([]);
    const [restored] = restorePanes([
      {
        id: 'one',
        name: 7,
        command: {},
        color: 'javascript:x',
        startedAt: 1,
        endedAt: 2,
        restart: 3,
        title: 'x',
      },
    ]);
    expect(restored).toEqual({
      id: 'one',
      name: 'Terminal',
      customName: undefined,
      command: '',
      cwd: '',
      shell: '',
      color: PANE_COLORS[0],
      remote: undefined,
    });
  });

  it('keeps a valid SSH target and discards a malformed one', () => {
    expect(restorePanes([{ id: 'one', remote }])[0].remote).toEqual(remote);
    expect(
      restorePanes([{ id: 'one', remote: { id: 'x', name: 'x', kind: 'ssh' } }])[0].remote
    ).toBeUndefined();
    expect(restorePanes([{ id: 'one', remote: 'dev@buildbox' }])[0].remote).toBeUndefined();
  });
});
