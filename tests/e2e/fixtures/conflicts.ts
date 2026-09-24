import { expect } from './desktop';
import type { Page } from './desktop';
import type { GitConflict } from '../../../src/shared/contracts/gitConflicts';

export const prepareConflicts = async (
  page: Page,
  options: {
    clean?: boolean;
    binary?: boolean;
    deleted?: boolean;
    rebase?: boolean;
    extension?: string;
  } = {}
) => {
  await page.evaluate(options => {
    const state = window as unknown as Record<string, unknown>;
    const api = state.__TAURI_INTERNALS__ as {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    const original = api.invoke;
    const calls = state.__emdeckCalls as { command: string; args: Record<string, unknown> }[];
    const text = (content: string | null) => ({ exists: content !== null, binary: false, content });
    const files: Record<string, GitConflict> = Object.fromEntries(
      [`src/config.${options.extension ?? 'ts'}`, `notes.${options.extension ?? 'ts'}`].map(
        path => [
          path,
          {
            path,
            revision: `revision-${path}`,
            base: text('const first = 0;\nconst second = 0;\n'),
            ours: text('const first = 1;\nconst second = 1;\n'),
            theirs: text('const first = 2;\nconst second = 2;\n'),
            working: text(
              '<<<<<<< HEAD\nconst first = 1;\n=======\nconst first = 2;\n>>>>>>> incoming\n<<<<<<< HEAD\nconst second = 1;\n=======\nconst second = 2;\n>>>>>>> incoming\n'
            ),
            oursLabel: options.rebase ? 'Ours — rebased destination' : 'Ours — current branch',
            theirsLabel: options.rebase
              ? 'Theirs — commit being replayed'
              : 'Theirs — incoming changes',
            manualAllowed: true,
          },
        ]
      )
    );
    if (options.deleted) files['src/config.ts'].ours = text(null);
    if (options.binary) {
      for (const side of ['base', 'ours', 'theirs', 'working'] as const)
        files['src/config.ts'][side] = { exists: true, binary: true, content: null };
      files['src/config.ts'].manualAllowed = false;
    }
    const snapshot = {
      available: true,
      message: '',
      branch: 'main',
      localBranches: ['main', 'incoming'],
      remoteBranches: [],
      remotes: [],
      operation: options.clean ? null : options.rebase ? 'rebase' : 'merge',
      commits: [],
      changes: options.clean
        ? []
        : Object.keys(files).map(path => ({
            path,
            index: 'U',
            working: 'U',
            conflict: true,
            originalPath: null,
          })),
    };
    state.__emdeckGit = snapshot;
    state.__emdeckConflictFiles = files;
    state.__emdeckResolved = [];
    api.invoke = async (command, args = {}) => {
      if (command === 'git_conflict') {
        calls.push({ command, args });
        if (state.__emdeckConflictReadError) throw state.__emdeckConflictReadError;
        return structuredClone(files[String(args.path)]);
      }
      if (command === 'git_resolve_conflict') {
        calls.push({ command, args });
        if (state.__emdeckResolveError) throw state.__emdeckResolveError;
        const request = args.request as {
          path: string;
          choice: 'ours' | 'theirs' | 'manual';
          content?: string;
        };
        const file = files[request.path];
        file.working =
          request.choice === 'manual' ? text(request.content ?? '') : file[request.choice];
        file.revision = `saved-${file.path}`;
        snapshot.changes = snapshot.changes.map(change =>
          change.path === request.path
            ? { ...change, conflict: false, index: 'M', working: ' ' }
            : change
        );
        (state.__emdeckResolved as unknown[]).push(request);
        return null;
      }
      if (command === 'git_branch_action' && options.clean) {
        calls.push({ command, args });
        snapshot.operation = 'merge';
        snapshot.changes = Object.keys(files).map(path => ({
          path,
          index: 'U',
          working: 'U',
          conflict: true,
          originalPath: null,
        }));
        throw 'Automatic merge failed; fix conflicts and then commit the result.';
      }
      if (command === 'read_file' && files[String(args.path)]) {
        const file = files[String(args.path)];
        if (!file.working.exists || file.working.binary) throw 'Cannot read this file as text';
        return { content: file.working.content, revision: file.revision };
      }
      return original(command, args);
    };
  }, options);
  await page.getByTitle('Source control', { exact: true }).click();
  await page.getByTitle('Refresh Git', { exact: true }).click();
  if (!options.clean)
    await expect(
      page.getByRole('button', { name: 'Resolve conflicts… (2)', exact: true })
    ).toBeEnabled();
};

export const openResolver = async (page: Page) => {
  await page.getByRole('button', { name: 'Resolve conflicts… (2)', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Resolve merge conflicts', exact: true });
  await expect(dialog.getByRole('button', { name: 'Merge manually', exact: true })).toBeEnabled();
  return dialog;
};
