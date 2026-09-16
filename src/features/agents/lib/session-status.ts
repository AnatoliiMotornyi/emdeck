import type { AgentObservation, PaneState } from '../../../shared/contracts/workspace';
import { agentStatus } from './agents';
import { remoteStatus } from '../services/connections';

export type SessionStatusKind =
  | 'approval'
  | 'question'
  | 'working'
  | 'ready'
  | 'output'
  | 'connected'
  | 'unknown'
  | 'starting'
  | 'exited'
  | 'error'
  | 'preview';

export const sessionStatus = (
  state?: PaneState,
  observation?: AgentObservation,
  remote = false
): { kind: SessionStatusKind; label: string; description: string; needsAttention: boolean } => {
  const status = agentStatus(state, remote ? undefined : observation);
  let kind: SessionStatusKind = 'connected';
  if (!state || state === 'starting') kind = 'starting';
  else if (state === 'error' || state === 'exited' || state === 'preview') kind = state;
  else if (!remote) {
    if (observation?.activity === 'attention') kind = 'approval';
    else if (observation?.activity === 'question') kind = 'question';
    else if (observation?.activity === 'working' || observation?.activity === 'ready')
      kind = observation.activity;
    else if (observation?.activity === 'unknown') kind = 'unknown';
    else if (state === 'output') kind = 'output';
  }
  const descriptions: Record<SessionStatusKind, string> = {
    approval: 'An approval prompt was detected. Open this session to review it.',
    question: 'A question awaiting your answer was detected. Open this session to reply.',
    working: 'A task was submitted or a work indicator was detected; no completion is confirmed.',
    ready: 'The agent appears ready for a new message; no pending question was detected.',
    unknown:
      'The current terminal screen does not confirm whether the agent is working or ready. Open the session to check.',
    output: 'Recent terminal output; the agent’s activity is not known.',
    connected: 'The terminal is connected; the agent’s activity is not known.',
    starting: 'The terminal is starting.',
    exited: 'The terminal process has ended.',
    error: 'The terminal encountered an error.',
    preview: 'Browser preview; no real terminal is running.',
  };
  return {
    kind,
    label: remote
      ? remoteStatus(state ?? 'starting')
      : kind === 'approval'
        ? 'Needs approval'
        : status.label.replace(' · detected', ''),
    description: remote
      ? 'SSH connection status only. Remote agent questions and activity are not detected here.'
      : descriptions[kind],
    needsAttention: kind === 'approval' || kind === 'question',
  };
};
