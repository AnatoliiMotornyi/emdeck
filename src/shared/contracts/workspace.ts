import type { SshProfile } from './remote';

export interface Project {
  root: string;
  name: string;
}
export interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
}
export interface FileData {
  content: string;
  revision: string;
}
export interface OpenFile extends FileData {
  path: string;
  saved: string;
  external?: boolean;
}
export interface DiffTab {
  id: string;
  path: string;
  staged: boolean;
  revision: number;
  comparison?: {
    base: string;
    head: string;
    working: boolean;
  };
}
export interface BranchDetail {
  reference: string;
  name: string;
  upstream: string | null;
  remote: string | null;
  remoteRef: string | null;
  ahead: number | null;
  behind: number | null;
  gone: boolean;
  worktree: string | null;
}
export interface BranchRequest {
  action: string;
  reference: string;
  expectedCurrent: string;
  name?: string;
  remote?: string;
}
export interface BranchComparison {
  diff: string;
  left: {
    hash: string;
    subject: string;
    age: string;
  }[];
  right: {
    hash: string;
    subject: string;
    age: string;
  }[];
  leftCount: number;
  rightCount: number;
}
export interface Change {
  path: string;
  originalPath: string | null;
  index: string;
  working: string;
  conflict: boolean;
}
export interface GitSnapshot {
  available: boolean;
  message: string;
  branch: string;
  localBranches: string[];
  remoteBranches: string[];
  branchDetails?: BranchDetail[];
  remotes?: string[];
  operation?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null;
  changes: Change[];
  commits: {
    hash: string;
    subject: string;
    age: string;
  }[];
}
export interface Worktree {
  path: string;
  branch: string;
  head: string;
  main: boolean;
  bare: boolean;
  current: boolean;
  open: boolean;
  missing: boolean;
  locked: string | null;
  prunable: string | null;
}
export interface CreateWorktree {
  path: string;
  branch: string;
  newBranch: boolean;
  startPoint: string;
}
export interface RunConfig {
  id: string;
  name: string;
  command: string;
  cwd: string;
  source: 'custom' | 'detected';
  script?: string;
}
export type PaneState = 'starting' | 'running' | 'output' | 'exited' | 'error' | 'preview';
export interface Pane {
  id: string;
  name: string;
  title?: string;
  customName?: string;
  command: string;
  cwd: string;
  shell: string;
  color: string;
  startedAt?: number;
  endedAt?: number;
  restart?: number;
  remote?: SshProfile;
}
export type Layout = 'columns' | 'rows' | 'grid';
export interface Settings {
  theme: 'dark' | 'light' | 'graphite';
  accent: string;
  fontSize: number;
  terminalFontSize: number;
  wordWrap: boolean;
  showHidden: boolean;
  shell: string;
  scrollback: number;
  detectRunScripts: boolean;
  reopenLastProject: boolean;
  terminalPlacement: 'workspace' | 'editor';
}
export type TerminalEvent =
  | {
      type: 'data';
      data: number[];
    }
  | {
      type: 'exit';
      code: number | null;
    }
  | {
      type: 'usage';
      usage: AgentUsage;
    }
  | {
      type: 'command';
      command: AgentCommand;
    };
export type AgentCommand =
  | {
      op: 'showDiff';
      reference: string;
      working: boolean;
    }
  | {
      op: 'openFile';
      path: string;
      line?: number;
      column?: number;
    };
export type AgentKind = 'claude' | 'codex' | 'gemini' | 'custom' | 'shell';
export interface LimitWindow {
  label: string;
  usedPercent: number;
  resetsAt: number | null;
}
export interface AgentUsage {
  source: string;
  updatedAt: number;
  model: string | null;
  sessionId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  contextSize: number | null;
  contextPercent: number | null;
  costUsd: number | null;
  limits: LimitWindow[];
}
export interface AgentObservation {
  activity: 'attention' | 'question' | 'working' | 'ready' | 'unknown';
  contextPercent: number | null;
  model: string | null;
  observedAt: number;
}
export type AgentMetric =
  'model' | 'activity' | 'context' | 'tokens' | 'cost' | 'limits' | 'resets' | 'elapsed';
export interface AgentPreferences {
  visible: boolean;
  compact: boolean;
  showShells: boolean;
  claudeUsage: boolean;
  refreshSeconds: number;
  metrics: AgentMetric[];
}
export interface AccountUsage {
  source: string;
  updatedAt: number;
  limits: LimitWindow[];
}
