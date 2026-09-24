import { useCallback } from 'react';
import { native } from '../../platform/desktop/api';
import { PANE_COLORS } from '../../features/agents/lib/pane-store';
import { paneName, terminalTitle } from '../../features/agents/services/terminal-title';
import type { SshProfile } from '../../shared/contracts/remote';
import type {
  AgentObservation,
  AgentUsage,
  Pane,
  PaneState,
} from '../../shared/contracts/workspace';
import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'project'
  | 'notify'
  | 'panes'
  | 'setPanes'
  | 'settings'
  | 'setTerminalVisible'
  | 'setMaxPane'
  | 'setAgentMenu'
  | 'ask'
  | 'paneStates'
  | 'confirm'
  | 'setAgentUsage'
  | 'setAgentObservations'
  | 'selectedPane'
  | 'setSelectedPane'
  | 'maxPane'
  | 'setPaneStates'
  | 'setPaneFocus'
>;
export function useTerminalActions({
  project,
  notify,
  panes,
  setPanes,
  settings,
  setTerminalVisible,
  setMaxPane,
  setAgentMenu,
  ask,
  paneStates,
  confirm,
  setAgentUsage,
  setAgentObservations,
  selectedPane,
  setSelectedPane,
  maxPane,
  setPaneStates,
  setPaneFocus,
}: Dependencies) {
  const addPane = (
    name: string,
    command = '',
    cwd = '',
    remote?: SshProfile,
    customName?: string
  ) => {
    if (!project) {
      notify('Open a project folder first.');
      return false;
    }
    if (panes.length >= 12) {
      notify('Close a pane before opening another. You can have up to 12 panes.');
      return false;
    }
    setPanes(ps => [
      ...ps,
      {
        id: crypto.randomUUID(),
        name,
        customName,
        command,
        cwd,
        shell: settings.shell,
        color: PANE_COLORS[ps.length % PANE_COLORS.length],
        startedAt: Date.now(),
        remote,
      },
    ]);
    setTerminalVisible(true);
    setMaxPane(null);
    setAgentMenu(false);
    return true;
  };
  const customPane = async () => {
    setAgentMenu(false);
    const data = await ask({
      title: 'New terminal',
      description: 'Run any installed agent or shell command in a dedicated pane.',
      submit: 'Launch terminal',
      fields: [
        { name: 'name', label: 'Pane name', value: 'My agent' },
        {
          name: 'command',
          label: 'Command',
          placeholder: 'codex, claude, aider… (empty for shell)',
          optional: true,
        },
        {
          name: 'cwd',
          label: 'Working directory',
          placeholder: 'Relative to project root',
          optional: true,
        },
      ],
    });
    if (data) addPane(data.name, data.command, data.cwd, undefined, data.name);
  };
  const closePane = async (pane: Pane) => {
    const state = paneStates[pane.id];
    if (
      native &&
      state !== 'exited' &&
      state !== 'error' &&
      !(await confirm(
        `${pane.remote ? 'Disconnect' : 'Close'} ${paneName(pane)}?`,
        pane.remote
          ? pane.remote.target.backend === 'shell'
            ? 'Close this SSH connection. Processes in an ordinary remote shell may stop.'
            : 'Detach this SSH client. The existing remote multiplexer session keeps running.'
          : 'This will terminate the terminal session and its attached process.',
        pane.remote ? 'Disconnect' : 'Close terminal',
        true
      ))
    )
      return;
    setPanes(ps => ps.filter(p => p.id !== pane.id));
    setPaneStates(previous => {
      const next = { ...previous };
      delete next[pane.id];
      return next;
    });
    setAgentUsage(value => {
      const next = { ...value };
      delete next[pane.id];
      return next;
    });
    setAgentObservations(value => {
      const next = { ...value };
      delete next[pane.id];
      return next;
    });
    if (selectedPane === pane.id) setSelectedPane(null);
    if (maxPane === pane.id) setMaxPane(null);
  };
  const paneState = useCallback(
    (id: string, state: PaneState) => {
      setPaneStates(s => (s[id] === state ? s : { ...s, [id]: state }));
      if (state === 'exited' || state === 'error')
        setPanes(panes => panes.map(p => (p.id === id ? { ...p, endedAt: Date.now() } : p)));
    },
    [setPaneStates, setPanes]
  );
  const observeAgent = useCallback(
    (id: string, value: AgentObservation | null) =>
      setAgentObservations(previous => {
        const next = { ...previous };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      }),
    [setAgentObservations]
  );
  const updateAgentUsage = useCallback(
    (id: string, value: AgentUsage | null) =>
      setAgentUsage(previous => {
        const next = { ...previous };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      }),
    [setAgentUsage]
  );
  const focusAgent = (id: string, solo = false) => {
    setSelectedPane(id);
    setTerminalVisible(true);
    if (solo) setMaxPane(id);
    else if (maxPane && maxPane !== id) setMaxPane(null);
    setPaneFocus(previous => ({ id, sequence: previous.sequence + 1 }));
  };
  const renameAgent = async (pane: Pane) => {
    const data = await ask({
      title: 'Rename session',
      description:
        'Set a fixed name, or leave it empty to follow the title reported by the terminal.',
      fields: [{ name: 'name', label: 'Session name', value: paneName(pane), optional: true }],
      submit: 'Rename',
    });
    if (data)
      setPanes(previous =>
        previous.map(item =>
          item.id === pane.id ? { ...item, customName: terminalTitle(data.name) } : item
        )
      );
  };
  const updateTerminalTitle = useCallback(
    (id: string, value: string) => {
      const title = terminalTitle(value);
      setPanes(previous => {
        if (!previous.some(pane => pane.id === id && (pane.title ?? '') !== title)) return previous;
        return previous.map(pane => (pane.id === id ? { ...pane, title } : pane));
      });
    },
    [setPanes]
  );
  const restartAgent = (pane: Pane) =>
    setPanes(previous =>
      previous.map(item =>
        item.id === pane.id
          ? {
              ...item,
              title: undefined,
              restart: (item.restart ?? 0) + 1,
              startedAt: Date.now(),
              endedAt: undefined,
            }
          : item
      )
    );
  return {
    addPane,
    customPane,
    closePane,
    paneState,
    observeAgent,
    updateAgentUsage,
    focusAgent,
    renameAgent,
    updateTerminalTitle,
    restartAgent,
  };
}
