import { describe, expect, it } from 'vitest';
import type { MachineConnection } from '../../src/shared/contracts/sessions';
import {
  backgroundSessions,
  backgroundSpaces,
} from '../../src/features/agents/services/background-workspaces';
import { backgroundStatus } from '../../src/features/agents/lib/background-status';

const machine = (id: string): MachineConnection => ({
  profile: { id, name: id, target: { kind: 'local' }, enabled: true },
  connection: id,
  status: 'connected',
  snapshot: {
    protocol: 1,
    serverId: id,
    revision: 1,
    workspaces: [{ id: 'same-space', name: 'A project', root: '/synthetic' }],
    panes: [
      {
        id: 'same-pane',
        generation: '1',
        title: 'Agent',
        running: true,
        restored: false,
        exitCode: null,
        startedAt: 1,
        cols: 80,
        rows: 24,
        launch: {
          workspaceId: 'same-space',
          name: 'Agent',
          cwd: '/synthetic',
          command: 'claude',
          shell: '',
          resumeOnRestart: false,
        },
        agent: {
          kind: 'claude',
          state: 'working',
          source: 'report',
          reason: 'Task running',
          sessionId: null,
        },
      },
    ],
  },
});

describe('background workspace projection', () => {
  it('keeps equal pane and workspace IDs on different machines distinct', () => {
    const sessions = backgroundSessions([machine('a'), machine('b')]);
    expect(sessions.map(item => item.key)).toEqual(['a/same-pane', 'b/same-pane']);
    expect(backgroundSpaces(sessions)).toEqual([
      { id: 'background:a/same-space', name: 'A project', detail: 'a · Background', count: 1 },
      { id: 'background:b/same-space', name: 'A project', detail: 'b · Background', count: 1 },
    ]);
    expect(backgroundSpaces([...sessions, sessions[0]])[0].count).toBe(2);
  });
  it('handles missing snapshots and workspace metadata without inventing sessions', () => {
    const host = machine('a');
    host.snapshot!.workspaces = [];
    expect(backgroundSessions([host])[0].workspace).toBe('/synthetic');
    host.snapshot = undefined;
    expect(backgroundSessions([host])).toEqual([]);
  });
  it('uses live server evidence and prioritizes offline and stopped states', () => {
    const host = machine('a');
    const session = backgroundSessions([host])[0];
    expect(backgroundStatus(session)).toMatchObject({ kind: 'working', needsAttention: false });
    session.pane.agent.state = 'blocked';
    expect(backgroundStatus(session)).toMatchObject({ kind: 'question', needsAttention: true });
    session.pane.agent.state = 'done';
    expect(backgroundStatus(session)).toMatchObject({ kind: 'ready', label: 'Done' });
    session.pane.running = false;
    expect(backgroundStatus(session).kind).toBe('exited');
    host.connection = undefined;
    host.status = 'offline';
    expect(backgroundStatus(session)).toMatchObject({
      kind: 'unknown',
      label: 'Offline',
      needsAttention: false,
    });
  });
});
