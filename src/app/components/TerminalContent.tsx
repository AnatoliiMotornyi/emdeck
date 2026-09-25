import { lazy, Suspense } from 'react';
import { Plus, TerminalSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TerminalPanelModel } from './terminal-panel-model';
import type { TerminalSessions } from '../hooks/useTerminalSessions';
import AgentPanel from '../../features/agents/components/AgentPanel';
import SessionRail from '../../features/agents/components/SessionRail';
import SessionDesk from '../../features/agents/components/SessionDesk';
import SessionNotices from '../../features/agents/components/SessionNotices';
import SessionCanvas from '../../features/agents/components/SessionCanvas';
import SessionTabs from './SessionTabs';
import { paneName, sessionName } from '../../features/agents/services/terminal-title';
import type { RemoteProfile } from '../../shared/contracts/remote';
const TerminalPane = lazy(() => import('../../features/agents/components/TerminalPane'));
const BackgroundTerminal = lazy(
  () => import('../../features/agents/components/BackgroundTerminal')
);

export default function TerminalContent({
  model,
  workspace,
}: {
  model: TerminalPanelModel;
  workspace: TerminalSessions;
}) {
  const {
    panes,
    project,
    settings,
    layout,
    maxPane,
    setMaxPane,
    selectedPane,
    setSelectedPane,
    paneStates,
    agentObservations,
    agentUsage,
    agentPreferences,
    setAgentPreferences,
    focusAgent,
    renameAgent,
    restartAgent,
    closePane,
    fail,
    paneState,
    observeAgent,
    updateAgentUsage,
    updateTerminalTitle,
    paneFocus,
    runAgentCommand,
    git,
    terminalVisible,
    setAgentMenu,
    addPane,
  } = model;
  const background = workspace.background;
  const server = workspace.view === 'server';
  const showMachines = server || (workspace.view === 'workspaces' && workspace.manageBackground);
  const handleConnections = () => workspace.setConnectionsOpen(true);
  const handleConnect = (profile: RemoteProfile) => void workspace.connect(profile);
  const handleManage = () => workspace.setManageBackground(true);
  const handleBack = () => workspace.setManageBackground(false);
  const handleLaunch = () => setAgentMenu(true);
  const handleStart = () => addPane('Terminal');
  const handleRename: React.ComponentProps<typeof AgentPanel>['onRename'] = pane =>
    void renameAgent(pane);
  const handleClose: React.ComponentProps<typeof AgentPanel>['onClose'] = pane =>
    void closePane(pane);
  const handleCommand: React.ComponentProps<typeof TerminalPane>['onCommand'] = (id, command) =>
    void runAgentCommand(command, panes.find(pane => pane.id === id)?.cwd ?? '').catch(fail);
  const visibleBackground =
    workspace.view === 'workspaces'
      ? background.tiles.filter(
          session => workspace.activeSpace === 'all' || session.space === workspace.activeSpace
        )
      : [];
  const visibleKeys = server
    ? background.visibleKeys
    : [
        ...workspace.visiblePanes.flatMap(pane =>
          (workspace.view === 'panes' || !workspace.maxBackground) &&
          (!maxPane || pane.id === maxPane)
            ? [`terminal:${pane.id}`]
            : []
        ),
        ...visibleBackground.flatMap(session =>
          !maxPane && (!workspace.maxBackground || session.key === workspace.maxBackground)
            ? [session.key]
            : []
        ),
      ];
  const handleArrange = () => {
    background.setSolo(null);
    workspace.clearMaximized();
  };
  const handleSpace = (key: string) => {
    background.selectSpace(key);
    if (!server) workspace.selectSpace(key === 'all' ? key : `background:${key}`);
  };
  const handleAttach: React.ComponentProps<typeof SessionDesk>['onAttach'] = (machine, pane) => {
    if (background.attach(machine, pane) && !server) {
      workspace.selectSpace('all');
      workspace.clearMaximized();
    }
  };
  const tiles = [
    ...panes.map(pane => {
      const handleMaximize = () => {
        workspace.setMaxBackground(null);
        setMaxPane(value => (value === pane.id ? null : pane.id));
      };
      const handleClose = () => void closePane(pane);
      const handlePaneRename = () => void renameAgent(pane);
      const handleRestart = () => restartAgent(pane);
      const handleFocus = () => {
        setSelectedPane(pane.id);
        workspace.setSelectedBackground(null);
      };
      return {
        key: `terminal:${pane.id}`,
        title: paneName(pane),
        render: () => (
          <Suspense fallback={<div className='loading'>Starting terminal…</div>}>
            <TerminalPane
              pane={pane}
              root={project!.root}
              settings={settings}
              maximized={maxPane === pane.id}
              onMaximize={handleMaximize}
              onClose={handleClose}
              onRename={handlePaneRename}
              onRestart={handleRestart}
              onState={paneState}
              onTitle={updateTerminalTitle}
              onError={fail}
              onObservation={observeAgent}
              onUsage={updateAgentUsage}
              onCommand={handleCommand}
              enhancedUsage={agentPreferences.claudeUsage}
              focusRequest={paneFocus.id === pane.id ? paneFocus.sequence : 0}
              selected={!workspace.selectedBackground && selectedPane === pane.id}
              onFocus={handleFocus}
            />
          </Suspense>
        ),
      };
    }),
    ...background.tiles.map(session => {
      const handleDetach = () => workspace.detachBackground(session.key);
      const handleMaximize = () => {
        if (server) background.setSolo(previous => (previous === session.key ? null : session.key));
        else {
          setMaxPane(null);
          workspace.setMaxBackground(previous => (previous === session.key ? null : session.key));
        }
      };
      const handleFocus = () => workspace.setSelectedBackground(session.key);
      return {
        key: session.key,
        title: sessionName(session.pane),
        render: (grip?: ReactNode) => (
          <Suspense fallback={<div className='loading'>Attaching session…</div>}>
            <BackgroundTerminal
              session={session}
              model={background}
              settings={settings}
              arrangeControl={grip}
              onDetach={handleDetach}
              onMaximize={handleMaximize}
              onFocus={handleFocus}
              focusRequest={
                workspace.backgroundFocus.key === session.key
                  ? workspace.backgroundFocus.sequence
                  : 0
              }
            />
          </Suspense>
        ),
      };
    }),
  ];
  return (
    <div className={`terminal-workspace ${server ? 'session-desk' : ''}`}>
      {workspace.view === 'workspaces' && !showMachines && (
        <SessionRail
          panes={panes}
          projectName={project?.name ?? 'No project'}
          branch={git?.branch}
          profiles={workspace.profiles}
          selectedSpace={workspace.activeSpace}
          selectedPane={workspace.selectedBackground ? null : selectedPane}
          states={paneStates}
          observations={agentObservations}
          usage={agentUsage}
          onSpace={workspace.selectSpace}
          onPane={workspace.selectPane}
          onConnect={handleConnect}
          onConnections={handleConnections}
          onLaunch={handleLaunch}
          background={background.sessions}
          attached={background.attachedKeys}
          selectedBackground={workspace.selectedBackground}
          onBackground={workspace.selectBackground}
          onManageBackground={handleManage}
        />
      )}
      <div className='workspace-machines' style={{ display: showMachines ? undefined : 'none' }}>
        {!server && (
          <button className='workspace-back' onClick={handleBack}>
            ← Back to sessions
          </button>
        )}
        <SessionDesk
          model={background}
          active={showMachines}
          root={project?.root}
          projectName={project?.name}
          onAttach={handleAttach}
          onSpace={handleSpace}
        />
      </div>
      {project && (
        <AgentPanel
          panes={panes}
          states={paneStates}
          observations={agentObservations}
          usage={agentUsage}
          selected={selectedPane}
          preferences={{
            ...agentPreferences,
            visible: workspace.view === 'panes' && agentPreferences.visible,
          }}
          active={terminalVisible && agentPreferences.visible && workspace.view === 'panes'}
          onPreferences={setAgentPreferences}
          onFocus={focusAgent}
          onRename={handleRename}
          onRestart={restartAgent}
          onClose={handleClose}
          onLaunch={handleLaunch}
        />
      )}
      <div className='terminal-canvas session-stage'>
        {workspace.view !== 'panes' && <SessionNotices model={background} />}
        {workspace.view === 'workspaces' && (
          <SessionTabs
            workspace={workspace}
            maxPane={maxPane}
            selectedPane={selectedPane}
            background={visibleBackground}
            onRename={handleRename}
          />
        )}
        <SessionCanvas
          active={server}
          tiles={tiles}
          attached={background.attached}
          visibleKeys={visibleKeys}
          initialLayout={layout}
          gridLayout={server ? undefined : layout}
          onArrange={handleArrange}
          empty={
            server ? undefined : (
              <div className='terminal-empty'>
                <div className='terminal-empty-icon'>
                  <TerminalSquare size={24} />
                </div>
                <div>
                  <h3>Bring your agents to the table.</h3>
                  <p>Start a terminal or open a background session from the sidebar.</p>
                </div>
                <button className='button secondary' disabled={!project} onClick={handleStart}>
                  <Plus size={14} />
                  Start a terminal
                </button>
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
