import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import type {
  CommandArguments,
  CommandResult,
  DesktopCommand,
} from '../../shared/contracts/desktop';
import type {
  BranchRequest,
  CreateWorktree,
  TerminalEvent,
} from '../../shared/contracts/workspace';
import type { SshTarget } from '../../shared/contracts/remote';
import type { ConflictResolution } from '../../shared/contracts/gitConflicts';
import type { DiscardRequest } from '../../shared/contracts/gitDiscard';
export const native = isTauri();
export async function call<C extends DesktopCommand>(
  command: C,
  ...parameters: C extends 'startup_project' | 'codex_account_usage'
    ? [args?: CommandArguments<C>]
    : [args: CommandArguments<C>]
): Promise<CommandResult<C>> {
  const args = parameters[0] ?? {};
  return native
    ? invoke<CommandResult<C>>(command, args)
    : (await import('../preview/demo')).demoCall<CommandResult<C>>(command, args);
}
export const api = {
  open: (path: string) => call('open_project', { path }),
  openWindow: (path: string) => call('open_project_window', { path }),
  focusProject: (path: string) => call('focus_project_window', { path }),
  startupProject: () => call('startup_project'),
  list: (root: string, path = '') => call('read_directory', { root, path }),
  read: (root: string, path: string) => call('read_file', { root, path }),
  find: (root: string, name: string) => call('find_file', { root, name }),
  save: (root: string, path: string, content: string, revision: string) =>
    call('save_file', { root, path, content, revision }),
  git: (root: string) => call('git_snapshot', { root }),
  previewDiscard: (root: string, paths: string[]) => call('git_discard_preview', { root, paths }),
  discard: (root: string, request: DiscardRequest) => call('git_discard_apply', { root, request }),
  conflict: (root: string, path: string) => call('git_conflict', { root, path }),
  resolveConflict: (root: string, request: ConflictResolution) =>
    call('git_resolve_conflict', { root, request }),
  gitAction: (root: string, action: string, value: string, original: string | null = null) =>
    call('git_action', { root, action, value, original }),
  branchAction: (root: string, request: BranchRequest) =>
    call('git_branch_action', { root, request }),
  compare: (root: string, base: string, head: string, working: boolean) =>
    call('git_compare', { root, base, head, working }),
  diff: (root: string, path: string, staged: boolean) => call('git_diff', { root, path, staged }),
  worktrees: (root: string) => call('git_worktrees', { root }),
  createWorktree: (root: string, request: CreateWorktree) =>
    call('git_worktree_create', { root, request }),
  removeWorktree: (root: string, path: string) => call('git_worktree_remove', { root, path }),
};
export async function spawnTerminal(
  root: string,
  cwd: string,
  shell: string,
  command: string,
  cols: number,
  rows: number,
  onEvent: (event: TerminalEvent) => void,
  enhancedUsage = false,
  remote?: SshTarget
) {
  const channel = new Channel<TerminalEvent>();
  channel.onmessage = onEvent;
  if (remote)
    return call('terminal_connect_remote', { root, target: remote, cols, rows, onEvent: channel });
  return call('terminal_spawn', {
    root,
    cwd,
    shell,
    command,
    cols,
    rows,
    onEvent: channel,
    enhancedUsage,
  });
}
