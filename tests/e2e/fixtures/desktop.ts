import { test as base, expect } from '@playwright/test';
import capabilities from '../../../src-tauri/capabilities/default.json' with { type: 'json' };
export const test = base.extend<{ desktop: void }>({
  desktop: [
    async ({ page }, use) => {
      await page.addInitScript(permissions => {
        const state = window as unknown as Record<string, unknown>;
        const calls: { command: string; args: Record<string, unknown> }[] = [];
        let callbackId = 0;
        const callbacks = new Map<number, (event: unknown) => unknown>();
        const listeners = new Map<string, number>();
        const terminals = new Map<string, { onmessage: (event: unknown) => void }>();
        state.__emdeckEmitTerminal = (id: string, event: unknown) =>
          terminals.get(id)?.onmessage(event);
        state.isTauri = true;
        state.__emdeckCalls = calls;
        state.__emdeckStartup = JSON.parse(
          localStorage.getItem('test:startup') ?? '"/projects/first"'
        );
        state.__emdeckPicker = '/projects/second';
        state.__emdeckDestroyed = [];
        state.__emdeckCloseTasks = [];
        state.__emdeckRequestClose = () => {
          const id = listeners.get('tauri://close-requested');
          if (id === undefined) throw new Error('Close listener is not registered');
          return callbacks.get(id)!({ event: 'tauri://close-requested', id, payload: null });
        };
        state.__emdeckDrop = (payload: unknown) => {
          const registered = calls.filter(
            call =>
              call.command === 'plugin:event|listen' && call.args.event === 'tauri://drag-drop'
          );
          if (!registered.length) throw new Error('Drop listener is not registered');
          for (const call of registered) {
            const id = Number(call.args.handler);
            callbacks.get(id)?.({ event: 'tauri://drag-drop', id, payload });
          }
        };
        state.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
        state.__TAURI_INTERNALS__ = {
          metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
          transformCallback: (callback: (event: unknown) => unknown) => {
            callbacks.set(++callbackId, callback);
            return callbackId;
          },
          unregisterCallback: (id: number) => callbacks.delete(id),
          invoke: async (command: string, args: Record<string, unknown> = {}) => {
            calls.push({ command, args });
            switch (command) {
              case 'startup_project':
                if (localStorage.getItem('test:delay-startup') === 'true')
                  await new Promise<void>(resolve => {
                    state.__emdeckReleaseStartup = resolve;
                  });
                return state.__emdeckStartup;
              case 'plugin:dialog|open':
                return state.__emdeckPicker;
              case 'open_project':
                if (args.path === localStorage.getItem('test:missing-project'))
                  throw 'Project folder no longer exists. Open another folder.';
                if (state.__emdeckOpenFocused)
                  return { kind: 'focused', window: state.__emdeckOpenFocused };
                return {
                  kind: 'opened',
                  project: { root: args.path, name: String(args.path).split('/').pop() },
                };
              case 'focus_project_window':
                return state.__emdeckFocusExisting ?? null;
              case 'open_project_window':
                if (state.__emdeckWindowError) throw 'Could not create a new window';
                return { label: 'workspace-1', reused: state.__emdeckWindowReused === true };
              case 'read_directory':
                return [{ name: 'notes.ts', path: 'notes.ts', isDir: false, isSymlink: false }];
              case 'read_file':
                if (args.path === 'package.json')
                  return { content: '{"scripts":{"dev":"vite"}}', revision: 'package' };
                return { content: 'const original = true;\n', revision: 'notes' };
              case 'git_snapshot':
                return (
                  state.__emdeckGit ?? {
                    available: true,
                    message: '',
                    branch: 'main',
                    localBranches: ['main'],
                    remoteBranches: [],
                    changes: [],
                    commits: [],
                  }
                );
              case 'git_action':
              case 'git_branch_action':
                if (state.__emdeckBranchError) throw state.__emdeckBranchError;
                return 'Git operation completed.';
              case 'git_compare':
                return {
                  diff: 'diff --git a/notes.ts b/notes.ts\n-old\n+new\n',
                  left: [{ hash: 'abc1234', subject: 'Branch-only commit', age: '1 hour ago' }],
                  right: [],
                  leftCount: 1,
                  rightCount: 0,
                };
              case 'git_worktrees':
                if (state.__emdeckWorktreeListError) throw 'Could not read worktrees';
                return structuredClone(state.__emdeckWorktrees ?? []);
              case 'git_worktree_create': {
                if (state.__emdeckWorktreeCreateError) throw 'Destination already exists';
                const request = args.request as { path: string; branch: string };
                (state.__emdeckWorktrees as unknown[]).push({
                  path: request.path,
                  branch: request.branch,
                  head: 'abc1234',
                  main: false,
                  bare: false,
                  current: false,
                  open: false,
                  missing: false,
                  locked: null,
                  prunable: null,
                });
                return request.path;
              }
              case 'git_worktree_remove':
                if (state.__emdeckWorktreeRemoveError)
                  throw 'Worktree contains modified or untracked files';
                state.__emdeckWorktrees = (state.__emdeckWorktrees as { path: string }[]).filter(
                  item => item.path !== args.path
                );
                return null;
              case 'git_diff': {
                if (state.__emdeckDelayDiff === args.path)
                  await new Promise<void>(resolve => {
                    state.__emdeckReleaseDiff = resolve;
                  });
                if (state.__emdeckDiffError) throw 'Could not read this diff';
                const key = `${args.staged ? 'staged' : 'working'}:${args.path}`;
                return (state.__emdeckDiffs as Record<string, string> | undefined)?.[key] ?? '';
              }
              case 'terminal_spawn':
              case 'terminal_connect_remote': {
                if (command === 'terminal_connect_remote' && state.__emdeckRemoteError)
                  throw state.__emdeckRemoteError;
                const id = `pty-${terminals.size}`;
                terminals.set(id, args.onEvent as { onmessage: (event: unknown) => void });
                return id;
              }
              case 'plugin:event|listen':
                listeners.set(String(args.event), Number(args.handler));
                if (args.event === 'tauri://close-requested') state.__emdeckCloseReady = true;
                return args.handler;
              case 'plugin:event|unlisten':
                listeners.delete(String(args.event));
                return null;
              case 'plugin:window|destroy':
                // Enforce the actual capability so omitting it cannot silently pass in a mock.
                if (!permissions.includes('core:window:allow-destroy'))
                  throw 'window.destroy not allowed';
                if (state.__emdeckDestroyError) throw 'Could not close the window';
                (state.__emdeckDestroyed as string[]).push(String(args.label));
                return null;
              default:
                return null;
            }
          },
        };
      }, capabilities.permissions);
      await page.goto('/');
      await expect(page.locator('.project-switch')).toContainText('first');

      await use();
    },
    { auto: true },
  ],
});
export { expect };
export type { Page } from '@playwright/test';
