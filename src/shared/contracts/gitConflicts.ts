export interface ConflictVersion {
  exists: boolean;
  content: string | null;
  binary: boolean;
}

export interface GitConflict {
  path: string;
  revision: string;
  base: ConflictVersion;
  ours: ConflictVersion;
  theirs: ConflictVersion;
  working: ConflictVersion;
  oursLabel: string;
  theirsLabel: string;
  manualAllowed: boolean;
}

export type ConflictChoice = 'ours' | 'theirs' | 'manual';
export interface ConflictResolution {
  path: string;
  revision: string;
  choice: ConflictChoice;
  content?: string;
}

export interface ConflictPort {
  read: (path: string) => Promise<GitConflict>;
  resolve: (request: ConflictResolution) => Promise<void>;
}

export interface MergeEditorProps {
  path: string;
  content: string;
  label: string;
  readOnly: boolean;
  highlights: MergeHighlight[];
  actions?: MergeBlockAction[];
  resultBlocks?: MergeResultBlock[];
  reveal?: { position: number; sequence: number };
  onResolve?: (block: number, choice: MergeBlockChoice, mode?: MergeBlockMode) => void;
  onChange: (content: string, blocks?: MergeResultBlock[]) => void;
  onSave: () => void;
}

export type MergeBlockChoice = 'ours' | 'theirs' | 'both';
export type MergeBlockMode = 'replace' | 'append';
export interface MergeResultBlock {
  id: number;
  from: number;
  to: number;
  valid: boolean;
  ours: string;
  theirs: string;
  sourcePositions: { ours: number; theirs: number };
  accepted: ('ours' | 'theirs')[];
}
export interface MergeHighlight {
  from: number;
  to: number;
  kind: 'conflict' | 'ours' | 'theirs' | 'changed';
  selected?: boolean;
}
export interface MergeBlockAction {
  at: number;
  block: number;
  choice: MergeBlockChoice;
  resolved?: boolean;
  applied?: boolean;
  canAppend?: boolean;
  disabled?: boolean;
}
