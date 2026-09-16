import { useEffect, useState } from 'react';
import { sessionCall } from '../../../platform/desktop/sessions';
import { readStored, store } from '../../../platform/storage/preferences';
import type {
  MachineConnection,
  SessionLaunch,
  SessionPane,
} from '../../../shared/contracts/sessions';
import { useSessionMachines } from './useSessionMachines';
import { sessionKey } from '../services/session-model';
import { backgroundSessions } from '../services/background-workspaces';

const launch = async (
  machine: MachineConnection,
  workspace: { root: string; name: string },
  launch: Omit<SessionLaunch, 'workspaceId'>
) => {
  const created = await sessionCall(machine.connection!, 'workspace.create', workspace);
  const pane = await sessionCall(machine.connection!, 'pane.create', {
    launch: { ...launch, workspaceId: created.id },
    cols: 100,
    rows: 30,
  });
  return pane;
};

export const useSessionDesk = (active: boolean) => {
  const controller = useSessionMachines(active);
  const [attached, setAttached] = useState<string[]>(() => {
    const value = readStored<unknown>('relay:session-views', []);
    return Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(0, 64) : [];
  });
  const [space, setSpace] = useState('all');
  const [solo, setSolo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [stop, setStop] = useState<{ machine: MachineConnection; pane: SessionPane } | null>(null);
  useEffect(() => {
    store('relay:session-views', attached);
  }, [attached]);
  const selectSpace = (key: string) => {
    setSpace(key);
    setSolo(null);
  };
  const attach = (machine: MachineConnection, pane: SessionPane) => {
    const key = sessionKey(machine.profile.id, pane.id);
    if (!attached.includes(key) && attached.length >= 64) {
      setError('Up to 64 terminal views can be open at once. Detach a view to open another.');
      return false;
    }
    setError('');
    setAttached(previous => (previous.includes(key) ? previous : [...previous, key]));
    selectSpace('all');
    return true;
  };
  const detach = (key: string) => {
    setAttached(previous => previous.filter(id => id !== key));
    setSolo(null);
  };
  const confirmStop = () => {
    if (!stop?.machine.connection) return;
    void sessionCall(stop.machine.connection, 'pane.stop', { id: stop.pane.id }).catch(e =>
      setError(String(e))
    );
    setStop(null);
  };
  const sessions = backgroundSessions(controller.machines);
  const attachedKeys = new Set(attached);
  const tiles = sessions.filter(session => attachedKeys.has(session.key));
  const visibleKeys = tiles.flatMap(session =>
    (!solo || solo === session.key) && (space === 'all' || `background:${space}` === session.space)
      ? [session.key]
      : []
  );
  return {
    ...controller,
    attached,
    attachedKeys,
    sessions,
    tiles,
    visibleKeys,
    space,
    solo,
    error,
    stop,
    setError,
    setStop,
    setSolo,
    selectSpace,
    attach,
    launch,
    detach,
    confirmStop,
  };
};
export type SessionDeskController = ReturnType<typeof useSessionDesk>;
