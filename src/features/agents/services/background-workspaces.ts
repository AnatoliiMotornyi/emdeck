import type { MachineConnection, SessionPane } from '../../../shared/contracts/sessions';
import { sessionKey } from './session-model';

export interface BackgroundSession {
  key: string;
  space: string;
  machine: MachineConnection;
  pane: SessionPane;
  workspace: string;
}

export const backgroundSessions = (machines: MachineConnection[]): BackgroundSession[] =>
  machines.flatMap(machine =>
    (machine.snapshot?.panes ?? []).map(pane => ({
      key: sessionKey(machine.profile.id, pane.id),
      space: `background:${sessionKey(machine.profile.id, pane.launch.workspaceId)}`,
      machine,
      pane,
      workspace:
        machine.snapshot?.workspaces.find(item => item.id === pane.launch.workspaceId)?.name ??
        pane.launch.cwd,
    }))
  );

export const backgroundSpaces = (sessions: BackgroundSession[]) => {
  const groups = new Map<string, { id: string; name: string; detail: string; count: number }>();
  for (const session of sessions) {
    const group = groups.get(session.space);
    if (group) group.count++;
    else
      groups.set(session.space, {
        id: session.space,
        name: session.workspace,
        detail: `${session.machine.profile.name} · Background`,
        count: 1,
      });
  }
  return [...groups.values()];
};
