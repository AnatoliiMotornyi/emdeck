import { expect } from './desktop';
import type { Page } from './desktop';
import type { DiscardPlan, DiscardRequest } from '../../../src/shared/contracts/gitDiscard';

export const prepareDiscard = async (page: Page) => {
  await page.evaluate(() => {
    const state = window as unknown as Record<string, unknown>;
    const api = state.__TAURI_INTERNALS__ as {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    const original = api.invoke;
    const calls = state.__emdeckCalls as { command: string; args: Record<string, unknown> }[];
    const snapshot = {
      available: true,
      message: '',
      branch: 'main',
      localBranches: ['main'],
      remoteBranches: [],
      commits: [],
      changes: [
        { path: 'notes.ts', index: 'M', working: 'M', conflict: false, originalPath: null },
        { path: 'added.txt', index: 'A', working: ' ', conflict: false, originalPath: null },
        { path: 'deleted.txt', index: ' ', working: 'D', conflict: false, originalPath: null },
        { path: 'untracked.txt', index: '?', working: '?', conflict: false, originalPath: null },
      ],
    };
    let restored = false;
    state.__emdeckGit = snapshot;
    api.invoke = async (command, args = {}) => {
      if (command === 'git_discard_preview') {
        calls.push({ command, args });
        if (state.__emdeckDiscardPreviewError) throw state.__emdeckDiscardPreviewError;
        const paths = args.paths as string[];
        return {
          paths,
          revision: 'reviewed-revision',
          files: paths.map(path => ({ path, effect: path === 'added.txt' ? 'remove' : 'restore' })),
        } satisfies DiscardPlan;
      }
      if (command === 'git_discard_apply') {
        calls.push({ command, args });
        if (state.__emdeckDiscardError) throw state.__emdeckDiscardError;
        const request = args.request as DiscardRequest;
        snapshot.changes = snapshot.changes.filter(change => !request.paths.includes(change.path));
        restored ||= request.paths.includes('notes.ts');
        return null;
      }
      if (command === 'read_file' && args.path === 'notes.ts')
        return {
          content: restored ? 'const original = true;\n' : 'const changed = true;\n',
          revision: restored ? 'original' : 'changed',
        };
      return original(command, args);
    };
  });
  await page.getByTitle('Source control', { exact: true }).click();
  await page.getByTitle('Refresh Git', { exact: true }).click();
  await expect(page.locator('.git-content .change-file')).toHaveCount(5);
};

export const discardCalls = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __emdeckCalls: { command: string; args: Record<string, unknown> }[];
      }
    ).__emdeckCalls.filter(call => call.command === 'git_discard_apply')
  );
