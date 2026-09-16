export type SessionState = 'working' | 'blocked' | 'idle' | 'done' | 'unknown' | 'stopped';
export type MachineTarget =
  | { kind: 'local' }
  | { kind: 'ssh'; host: string; port: number | null; binary: string }
  | { kind: 'direct'; credential: string };
export type RemoteManagement =
  | { operation: 'status' | 'disable' | 'invite' }
  | { operation: 'enable'; address: string; port: number }
  | { operation: 'revoke'; id: string };
export interface RemoteSharingStatus {
  enabled: boolean;
  address: string | null;
  port: number | null;
  error: string | null;
  devices: { id: string; name: string; pairedAt: number }[];
}
export interface PairingCode {
  code: string;
  expiresAt: number;
}
export interface MachineProfile {
  id: string;
  name: string;
  target: MachineTarget;
  enabled: boolean;
}
export interface SessionLaunch {
  workspaceId: string;
  name: string;
  cwd: string;
  shell: string;
  command: string;
  resumeOnRestart: boolean;
}
export interface SessionPane {
  id: string;
  generation: string;
  title?: string | null;
  launch: SessionLaunch;
  running: boolean;
  restored: boolean;
  exitCode: number | null;
  startedAt: number;
  cols: number;
  rows: number;
  agent: {
    kind: string;
    state: SessionState;
    source: string;
    reason: string;
    sessionId: string | null;
  };
}
export interface SessionWorkspace {
  id: string;
  name: string;
  root: string;
}
export interface SessionSnapshot {
  protocol: number;
  serverId: string;
  revision: number;
  workspaces: SessionWorkspace[];
  panes: SessionPane[];
}
export interface SessionRead {
  sequence: number;
  reset: boolean;
  data: string;
  text: string;
  pane: SessionPane;
}
export interface SessionMethods {
  'remote.manage': { params: RemoteManagement; result: RemoteSharingStatus | PairingCode };
  ping: { params: undefined; result: { protocol: number; serverId: string } };
  'session.snapshot': {
    params: { after: number | null; wait_ms: number };
    result: SessionSnapshot;
  };
  'workspace.create': { params: { root: string; name: string }; result: SessionWorkspace };
  'workspace.remove': { params: { id: string }; result: null };
  'pane.create': {
    params: { launch: SessionLaunch; cols: number; rows: number };
    result: SessionPane;
  };
  'pane.restart': { params: { id: string; resume: boolean }; result: SessionPane };
  'pane.stop': { params: { id: string }; result: null };
  'pane.remove': { params: { id: string }; result: null };
  'pane.attach': { params: { id: string; client: string; takeover: boolean }; result: SessionPane };
  'pane.detach': { params: { id: string; client: string }; result: null };
  'pane.read': {
    params: { id: string; after: number | null; wait_ms: number };
    result: SessionRead;
  };
  'pane.input': { params: { id: string; client: string; text: string }; result: null };
  'pane.resize': {
    params: { id: string; client: string; cols: number; rows: number };
    result: null;
  };
  'agent.report': {
    params: { id: string; generation: string; state: SessionState; session_id: string | null };
    result: SessionPane;
  };
  'agent.prompt': { params: { id: string; generation: string; text: string }; result: null };
  'agent.wait': {
    params: { id: string; generation: string; states: SessionState[]; timeout_ms: number };
    result: { matched: boolean; pane: SessionPane };
  };
  'server.stop': { params: undefined; result: null };
}
export type SessionAction = {
  [M in keyof SessionMethods]: { method: M; params: SessionMethods[M]['params'] };
}[keyof SessionMethods];
export interface MachineConnection {
  profile: MachineProfile;
  connection?: string;
  snapshot?: SessionSnapshot;
  status: 'offline' | 'connecting' | 'connected';
  error?: string;
}
