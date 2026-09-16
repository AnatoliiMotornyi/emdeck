import type {
  AccountUsage,
  BranchComparison,
  BranchRequest,
  CreateWorktree,
  Entry,
  FileData,
  GitSnapshot,
  Worktree,
} from './workspace';
import type { SshTarget } from './remote';
import type { MachineTarget, SessionAction } from './sessions';
import type { ConflictResolution, GitConflict } from './gitConflicts';
import type { DiscardPlan, DiscardRequest } from './gitDiscard';
import type { OpenProjectResult, OpenWindowResult } from './projects';

type Command<Args, Result> = { args: Args; result: Result };
type FileLocation = { root: string; path: string };
type Repository = { root: string };

/** Public IPC payloads. Window identity and authorization are injected by Tauri. */
export interface DesktopCommands {
  session_pair: Command<{ code: string; name: string }, { credential: string; address: string }>;
  session_forget: Command<{ credential: string }, void>;
  session_connect: Command<{ target: MachineTarget }, string>;
  session_request: Command<{ connection: string; action: SessionAction }, unknown>;
  session_disconnect: Command<{ connection: string }, void>;
  open_project: Command<{ path: string }, OpenProjectResult>;
  open_project_window: Command<{ path: string }, OpenWindowResult>;
  focus_project_window: Command<{ path: string }, string | null>;
  startup_project: Command<Record<string, never>, string | null>;
  read_directory: Command<FileLocation, Entry[]>;
  read_file: Command<FileLocation, FileData>;
  find_file: Command<{ root: string; name: string }, string[]>;
  read_image: Command<FileLocation, string>;
  save_file: Command<FileLocation & { content: string; revision: string }, FileData>;
  create_entry: Command<FileLocation & { directory: boolean }, void>;
  rename_entry: Command<Repository & { from: string; to: string }, void>;
  copy_entry: Command<Repository & { from: string; to: string }, void>;
  trash_entry: Command<FileLocation, void>;
  reveal_entry: Command<FileLocation, void>;
  open_external_url: Command<{ url: string }, void>;
  git_snapshot: Command<Repository, GitSnapshot>;
  git_discard_preview: Command<Repository & { paths: string[] }, DiscardPlan>;
  git_discard_apply: Command<Repository & { request: DiscardRequest }, void>;
  git_conflict: Command<FileLocation, GitConflict>;
  git_resolve_conflict: Command<Repository & { request: ConflictResolution }, void>;
  git_action: Command<
    Repository & { action: string; value: string; original: string | null },
    string
  >;
  git_branch_action: Command<Repository & { request: BranchRequest }, string>;
  git_compare: Command<
    Repository & { base: string; head: string; working: boolean },
    BranchComparison
  >;
  git_diff: Command<FileLocation & { staged: boolean }, string>;
  git_worktrees: Command<Repository, Worktree[]>;
  git_worktree_create: Command<Repository & { request: CreateWorktree }, string>;
  git_worktree_remove: Command<FileLocation, void>;
  terminal_spawn: Command<
    Repository & {
      cwd: string;
      shell: string;
      command: string;
      cols: number;
      rows: number;
      enhancedUsage: boolean;
      onEvent: unknown;
    },
    string
  >;
  terminal_write: Command<{ id: string; data: string }, void>;
  terminal_attachment: Command<{ id: string; name: string; data: number[] }, string>;
  terminal_path_input: Command<{ id: string; paths: string[] }, string>;
  terminal_connect_remote: Command<
    Repository & { target: SshTarget; cols: number; rows: number; onEvent: unknown },
    string
  >;
  terminal_resize: Command<{ id: string; cols: number; rows: number }, void>;
  terminal_close: Command<{ id: string }, void>;
  codex_account_usage: Command<Record<string, never>, AccountUsage>;
}

export type DesktopCommand = keyof DesktopCommands;
export type CommandArguments<C extends DesktopCommand> = DesktopCommands[C]['args'];
export type CommandResult<C extends DesktopCommand> = DesktopCommands[C]['result'];
