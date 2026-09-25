import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from '../../../platform/desktop/api';
import { sessionCall } from '../../../platform/desktop/sessions';
import { readStored, store } from '../../../platform/storage/preferences';
import type {
  MachineConnection,
  MachineProfile,
  SessionSnapshot,
} from '../../../shared/contracts/sessions';
import { restoreMachines } from '../services/session-model';

export const useSessionMachines = (active: boolean) => {
  const [profiles, setProfiles] = useState(() =>
    restoreMachines(readStored('relay:session-machines', []))
  );
  const [states, setStates] = useState<Record<string, Omit<MachineConnection, 'profile'>>>({});
  const [storageError, setStorageError] = useState('');
  const editsDuringRestore = useRef(new Map<string, MachineProfile | null>());
  const connections = useRef(new Map<string, { cancelled: boolean; id?: string }>());
  const connect = useCallback(async (profile: MachineProfile) => {
    if (connections.current.has(profile.id)) return;
    const task = { cancelled: false, id: undefined as string | undefined };
    connections.current.set(profile.id, task);
    setStates(previous => ({
      ...previous,
      [profile.id]: { ...previous[profile.id], status: 'connecting', error: undefined },
    }));
    try {
      if (!native) throw new Error('Persistent sessions require the desktop app.');
      const connection = await call('session_connect', { target: profile.target });
      task.id = connection;
      if (task.cancelled) {
        await call('session_disconnect', { connection });
        return;
      }
      editsDuringRestore.current.set(profile.id, { ...profile, enabled: true });
      setProfiles(previous =>
        previous.map(p => (p.id === profile.id ? { ...p, enabled: true } : p))
      );
      let after: number | null = null;
      while (!task.cancelled) {
        const snapshot: SessionSnapshot = await sessionCall(connection, 'session.snapshot', {
          after,
          wait_ms: 20000,
        });
        if (task.cancelled) break;
        after = snapshot.revision;
        setStates(previous => ({
          ...previous,
          [profile.id]: { status: 'connected', connection, snapshot },
        }));
      }
    } catch (error) {
      if (!task.cancelled)
        setStates(previous => ({
          ...previous,
          [profile.id]: {
            ...previous[profile.id],
            connection: undefined,
            status: 'offline',
            error: String(error),
          },
        }));
    } finally {
      if (task.id) void call('session_disconnect', { connection: task.id }).catch(() => {});
      if (connections.current.get(profile.id) === task) connections.current.delete(profile.id);
    }
  }, []);
  const disconnect = (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (profile) editsDuringRestore.current.set(id, { ...profile, enabled: false });
    const task = connections.current.get(id);
    if (task) {
      task.cancelled = true;
      if (task.id) void call('session_disconnect', { connection: task.id }).catch(() => {});
    }
    connections.current.delete(id);
    setProfiles(previous => previous.map(p => (p.id === id ? { ...p, enabled: false } : p)));
    setStates(previous => ({
      ...previous,
      [id]: { ...previous[id], connection: undefined, status: 'offline' },
    }));
  };
  const autoConnected = useRef(false);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!active || autoConnected.current) return;
    let cancelled = false;
    const legacy = restoreMachines(readStored('relay:session-machines', []));
    const load = async () => {
      try {
        const durable = native
          ? await call('session_machines_load', { legacy: legacy.filter(p => p.id !== 'local') })
          : legacy;
        if (cancelled) return;
        const restored = restoreMachines(durable).map(profile => ({
          ...profile,
          enabled: legacy.some(
            p =>
              p.id === profile.id &&
              p.enabled &&
              JSON.stringify(p.target) === JSON.stringify(profile.target)
          ),
        }));
        const merged = new Map(restored.map(profile => [profile.id, profile]));
        for (const [id, profile] of editsDuringRestore.current) {
          if (profile) merged.set(id, profile);
          else merged.delete(id);
        }
        const saved = [...merged.values()];
        autoConnected.current = true;
        setProfiles(saved);
        setInitialized(true);
        setStorageError('');
        saved.filter(p => p.enabled).forEach(p => void connect(p));
      } catch (error) {
        if (!cancelled) setStorageError(`Could not restore saved machines: ${String(error)}`);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [active, connect]);
  useEffect(() => {
    if (initialized) store('relay:session-machines', profiles);
  }, [profiles, initialized]);
  useEffect(() => {
    const tasks = connections.current;
    return () => {
      for (const task of tasks.values()) {
        task.cancelled = true;
        if (task.id) void call('session_disconnect', { connection: task.id }).catch(() => {});
      }
      tasks.clear();
    };
  }, []);
  const save = (profile: MachineProfile) => {
    const persist = async () => {
      try {
        if (native) await call('session_machine_save', { profile });
        editsDuringRestore.current.set(profile.id, profile);
        setProfiles(previous => [...previous.filter(p => p.id !== profile.id), profile]);
        setStorageError('');
      } catch (error) {
        setStorageError(`Could not save this machine: ${String(error)}`);
      }
    };
    void persist();
  };
  const remove = async (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (profile?.target.kind === 'direct')
      await call('session_forget', { credential: profile.target.credential });
    if (native) await call('session_machine_remove', { id });
    disconnect(id);
    editsDuringRestore.current.set(id, null);
    setProfiles(previous => previous.filter(p => p.id !== id || p.id === 'local'));
  };
  const machines: MachineConnection[] = profiles.map(profile => ({
    profile,
    ...(states[profile.id] ?? { status: 'offline' }),
  }));
  return { machines, connect, disconnect, save, remove, storageError };
};
