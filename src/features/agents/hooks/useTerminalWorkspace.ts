import { useEffect, useRef, useState } from 'react';
import { call, native } from '../../../platform/desktop/api';
import { readStored, store } from '../../../platform/storage/preferences';
import type { RemoteProfile, SshProfile, TerminalView } from '../../../shared/contracts/remote';
import type { Pane } from '../../../shared/contracts/workspace';
import { restoreProfiles, spaceId, terminalSpaces, validateProfile } from '../services/connections';

interface Input {
  panes: Pane[];
  extraSpaces?: { id: string }[];
  projectName: string;
  addPane: (name: string, command: string, cwd: string, remote?: SshProfile) => boolean;
  focus: (id: string, solo?: boolean) => void;
  clearMaximized: () => void;
  fail: (error: unknown) => void;
}
export const useTerminalWorkspace = ({
  panes,
  extraSpaces = [],
  projectName,
  addPane,
  focus,
  clearMaximized,
  fail,
}: Input) => {
  const [view, setView] = useState<TerminalView>(() => {
    const stored = readStored<string>('relay:terminal-view', 'panes');
    return stored === 'server' || stored === 'workspaces' ? stored : 'panes';
  });
  const [profiles, setProfiles] = useState(() =>
    restoreProfiles(readStored<unknown>('relay:remote-connections', []))
  );
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [space, setSpace] = useState('all');
  const previousPanes = useRef(panes);
  useEffect(() => {
    const known = new Set(previousPanes.current.map(pane => pane.id));
    const added = panes.find(pane => !known.has(pane.id));
    previousPanes.current = panes;
    // Launches can also come from run configurations and the explorer. Reveal
    // their space without changing any existing terminal's lifetime.
    if (added) {
      clearMaximized();
      setSpace(spaceId(added));
      setView(view => (view === 'server' ? 'panes' : view));
    }
  }, [panes, clearMaximized]);
  useEffect(() => {
    store('relay:terminal-view', view);
  }, [view]);
  useEffect(() => {
    store('relay:remote-connections', profiles);
  }, [profiles]);
  const spaces = terminalSpaces(panes, projectName);
  const activeSpace = [...spaces, ...extraSpaces].some(item => item.id === space) ? space : 'all';
  const visiblePanes =
    view === 'panes' || activeSpace === 'all'
      ? panes
      : panes.filter(p => spaceId(p) === activeSpace);
  const selectSpace = (id: string) => {
    setSpace(id);
    clearMaximized();
  };
  const selectPane = (pane: Pane, solo = true) => {
    setSpace(spaceId(pane));
    focus(pane.id, solo);
  };
  const saveProfile = (profile: RemoteProfile) => {
    const issue = validateProfile(profile);
    if (issue) {
      fail(issue);
      return;
    }
    setProfiles(previous =>
      previous.some(p => p.id === profile.id)
        ? previous.map(p => (p.id === profile.id ? profile : p))
        : [...previous, profile]
    );
  };
  const removeProfile = (id: string) =>
    setProfiles(previous => previous.filter(profile => profile.id !== id));
  const connect = async (profile: RemoteProfile) => {
    const issue = validateProfile(profile);
    if (issue) {
      fail(issue);
      return;
    }
    if (!native) {
      fail('Remote connections are available in the desktop app.');
      return;
    }
    if (profile.kind === 'web') {
      try {
        await call('open_external_url', { url: profile.url });
      } catch (error) {
        fail(error);
      }
      return;
    }
    const existing = panes.find(pane => pane.remote?.id === profile.id);
    if (existing) selectPane(existing);
    else if (addPane(profile.name, '', '', profile)) setSpace(`remote:${profile.id}`);
    else return;
    setConnectionsOpen(false);
  };
  return {
    view,
    setView,
    profiles,
    connectionsOpen,
    setConnectionsOpen,
    spaces,
    activeSpace,
    visiblePanes,
    selectSpace,
    selectPane,
    saveProfile,
    removeProfile,
    connect,
  };
};
