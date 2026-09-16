import type { Page } from './desktop';
import { expect } from './desktop';
import type { SessionAction, SessionSnapshot } from '../../../src/shared/contracts/sessions';

export const installBackgroundLayout = async (page: Page) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'relay:session-machines',
      JSON.stringify([
        { id: 'local', name: 'This computer', target: { kind: 'local' }, enabled: false },
        {
          id: 'remote',
          name: 'Linux server',
          target: { kind: 'ssh', host: 'synthetic.test', port: null, binary: 'emdeck-session' },
          enabled: false,
        },
      ])
    );
    const state = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      __layoutConnections: string[];
      __layoutCalls: { connection: string; action: SessionAction }[];
      __layoutSnapshots: Record<string, SessionSnapshot>;
    };
    state.__layoutCalls = [];
    state.__layoutConnections = [];
    const original = state.__TAURI_INTERNALS__.invoke;
    const snapshots: Record<string, SessionSnapshot> = {};
    for (const machine of ['local', 'remote']) {
      snapshots[machine] = {
        protocol: 1,
        serverId: machine,
        revision: 1,
        workspaces: [{ id: machine, name: `${machine} project`, root: `/synthetic/${machine}` }],
        panes: ['claude', 'codex'].map((kind, i) => ({
          id: String(i),
          generation: `${machine}-${i}`,
          title: `${kind} ${machine}`,
          launch: {
            workspaceId: machine,
            name: kind,
            cwd: `/synthetic/${machine}`,
            shell: '',
            command: kind,
            resumeOnRestart: false,
          },
          running: true,
          restored: false,
          exitCode: null,
          startedAt: 1,
          cols: 80,
          rows: 24,
          agent: {
            kind,
            state: 'idle',
            source: 'report',
            reason: 'Waiting for input',
            sessionId: null,
          },
        })),
      };
    }
    state.__layoutSnapshots = snapshots;
    state.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (command === 'session_connect') {
        const connection = (args.target as { kind: string }).kind === 'local' ? 'local' : 'remote';
        state.__layoutConnections.push(connection);
        return connection;
      }
      if (command === 'session_disconnect') return null;
      if (command !== 'session_request') return original(command, args);
      const action = args.action as SessionAction;
      const connection = String(args.connection);
      state.__layoutCalls.push({ connection, action });
      const snapshot = snapshots[connection];
      if (action.method === 'workspace.create') return snapshot.workspaces[0];
      if (action.method === 'pane.create') {
        const pane = {
          ...structuredClone(snapshot.panes[0]),
          id: String(snapshot.panes.length),
          title: action.params.launch.name,
          launch: action.params.launch,
        };
        snapshot.panes.push(pane);
        return pane;
      }
      if (action.method === 'session.snapshot') {
        await new Promise(resolve => setTimeout(resolve, 100));
        return structuredClone(snapshot);
      }
      if (action.method === 'pane.read') {
        await new Promise(resolve => setTimeout(resolve, 100));
        const text =
          Array.from({ length: 100 }, (_, i) => `${connection} output ${i}`).join('\r\n') +
          '\r\nREADY> ';
        return {
          sequence: 1,
          reset: action.params.after === null,
          data: action.params.after === null ? btoa(text) : '',
          text,
          pane: structuredClone(snapshot.panes.find(pane => pane.id === action.params.id)),
        };
      }
      if (action.method === 'pane.attach')
        return snapshot.panes.find(pane => pane.id === action.params.id);
      return null;
    };
  });
};
export const connectBackgroundLayout = async (page: Page) => {
  await page.getByLabel('Terminal view').selectOption('server');
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  await rail.getByRole('button', { name: 'Connect local server', exact: true }).click();
  await rail.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(rail.getByRole('button', { name: /^codex remote/ })).toBeVisible();
};
export const openBackgroundPanes = async (page: Page) => {
  await installBackgroundLayout(page);
  await connectBackgroundLayout(page);
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  for (const name of ['claude local', 'codex local', 'claude remote', 'codex remote']) {
    await rail.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await expect(page.locator('.session-terminal:visible')).toHaveCount(4);
  await expect.poll(() => page.locator('.session-terminal .xterm-screen').count()).toBe(4);
};
export const backgroundCalls = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __layoutCalls: { connection: string; action: SessionAction }[] })
        .__layoutCalls
  );
export const backgroundPane = (page: Page, key: string) =>
  page.locator(`.session-canvas-pane[data-session-key="${key}"]`);
