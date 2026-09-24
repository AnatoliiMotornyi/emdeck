import { useState } from 'react';
import { useSessionDesk } from '../../features/agents/hooks/useSessionDesk';
import { useTerminalWorkspace } from '../../features/agents/hooks/useTerminalWorkspace';
import { backgroundSpaces } from '../../features/agents/services/background-workspaces';
import type { BackgroundSession } from '../../features/agents/services/background-workspaces';
import type { WorkspaceController } from './useWorkspace';

export const useTerminalSessions = (
  model: Pick<
    WorkspaceController,
    'panes' | 'project' | 'addPane' | 'focusAgent' | 'setMaxPane' | 'fail'
  >
) => {
  const [manageBackground, setManageBackground] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [maxBackground, setMaxBackground] = useState<string | null>(null);
  const [backgroundFocus, setBackgroundFocus] = useState({ key: '', sequence: 0 });
  const [backgroundActive, setBackgroundActive] = useState(false);
  const background = useSessionDesk(backgroundActive);
  const clearMaximized = () => {
    model.setMaxPane(null);
    setMaxBackground(null);
  };
  const focus = (id: string, solo?: boolean) => {
    setSelectedBackground(null);
    setMaxBackground(null);
    model.focusAgent(id, solo);
  };
  const workspace = useTerminalWorkspace({
    panes: model.panes,
    projectName: model.project?.name ?? 'No project',
    addPane: model.addPane,
    focus,
    clearMaximized,
    fail: model.fail,
    extraSpaces: backgroundSpaces(background.sessions),
  });
  // Activating a session view is explicit. Neither opening a project nor the
  // ordinary Panes view should start a connection or a background agent.
  const active = workspace.view !== 'panes';
  if (active && !backgroundActive) setBackgroundActive(true);
  const selectBackground = (session: BackgroundSession) => {
    if (!background.attach(session.machine, session.pane)) return;
    workspace.selectSpace(session.space);
    setSelectedBackground(session.key);
    setMaxBackground(session.key);
    setBackgroundFocus(previous => ({ key: session.key, sequence: previous.sequence + 1 }));
  };
  const detachBackground = (key: string) => {
    background.detach(key);
    if (maxBackground === key) setMaxBackground(null);
    if (selectedBackground === key) setSelectedBackground(null);
  };
  return {
    ...workspace,
    background,
    manageBackground,
    setManageBackground,
    selectedBackground,
    setSelectedBackground,
    maxBackground:
      background.attachedKeys.has(maxBackground ?? '') &&
      background.tiles.some(session => session.key === maxBackground)
        ? maxBackground
        : null,
    setMaxBackground,
    backgroundFocus,
    selectBackground,
    detachBackground,
    clearMaximized,
  };
};
export type TerminalSessions = ReturnType<typeof useTerminalSessions>;
