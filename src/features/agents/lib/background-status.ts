import type { BackgroundSession } from '../services/background-workspaces';
import type { sessionStatus } from './session-status';

export const backgroundStatus = ({
  machine,
  pane,
}: BackgroundSession): ReturnType<typeof sessionStatus> => {
  if (!machine.connection)
    return {
      kind: machine.status === 'connecting' ? 'starting' : 'unknown',
      label: machine.status === 'connecting' ? 'Connecting' : 'Offline',
      description: 'Reconnect to see the current agent state. Last reported activity may be stale.',
      needsAttention: false,
    };
  if (!pane.running || pane.agent.state === 'stopped')
    return {
      kind: 'exited',
      label: 'Stopped',
      description: 'The background process has ended.',
      needsAttention: false,
    };
  const state = pane.agent.state;
  return {
    kind: state === 'blocked' ? 'question' : state === 'idle' || state === 'done' ? 'ready' : state,
    label:
      state === 'blocked'
        ? 'Needs attention'
        : state === 'idle'
          ? 'Ready'
          : state === 'done'
            ? 'Done'
            : state === 'working'
              ? 'Working'
              : 'Unknown',
    description: `${pane.agent.source}: ${pane.agent.reason}`,
    needsAttention: state === 'blocked',
  };
};
