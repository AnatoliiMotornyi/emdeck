import {
  Bot,
  ChevronDown,
  Columns2,
  Grid2X2,
  Maximize2,
  Monitor,
  Minus,
  PanelBottom,
  Plus,
  Rows2,
  TerminalSquare,
} from 'lucide-react';
import { lazy, Suspense, useId, useRef, useState } from 'react';
import AgentPanel from '../../features/agents/components/AgentPanel';
import RemoteConnections from '../../features/agents/components/RemoteConnections';
import SessionRail from '../../features/agents/components/SessionRail';
import { useTerminalWorkspace } from '../../features/agents/hooks/useTerminalWorkspace';
import type { RemoteProfile, TerminalView } from '../../shared/contracts/remote';
import type { WorkspaceController } from '../hooks/useWorkspace';
import TerminalLaunchMenu from './TerminalLaunchMenu';
import { paneName } from '../../features/agents/services/terminal-title';
const TerminalPane = lazy(() => import('../../features/agents/components/TerminalPane'));
const SessionDesk = lazy(() => import('../../features/agents/components/SessionDesk'));
type Props = {
  model: Pick<
    WorkspaceController,
    | 'terminalVisible'
    | 'terminalFull'
    | 'resize'
    | 'resizeKey'
    | 'setTerminalHeight'
    | 'terminalPanel'
    | 'panes'
    | 'agentPreferences'
    | 'setAgentPreferences'
    | 'layout'
    | 'setLayout'
    | 'setMaxPane'
    | 'settings'
    | 'setSettings'
    | 'project'
    | 'setAgentMenu'
    | 'agentMenu'
    | 'addPane'
    | 'customPane'
    | 'setTerminalFull'
    | 'setTerminalVisible'
    | 'paneStates'
    | 'agentObservations'
    | 'agentUsage'
    | 'selectedPane'
    | 'focusAgent'
    | 'renameAgent'
    | 'restartAgent'
    | 'closePane'
    | 'maxPane'
    | 'paneState'
    | 'fail'
    | 'observeAgent'
    | 'updateAgentUsage'
    | 'runAgentCommand'
    | 'updateTerminalTitle'
    | 'paneFocus'
    | 'setSelectedPane'
    | 'git'
  >;
};
export default function TerminalPanel({ model }: Props) {
  const launchTrigger = useRef<HTMLButtonElement>(null);
  const launchMenuId = useId();
  const handleResizeTerminalPanelPointerDown: React.ComponentProps<'div'>['onPointerDown'] = e =>
    resize('terminal', e);
  const handleResizeTerminalPanelKeyDown: React.ComponentProps<'div'>['onKeyDown'] = e =>
    resizeKey('terminal', e);
  const handleResizeTerminalPanelDoubleClick = () => setTerminalHeight(310);
  const handleToggleAgentOverviewClick = () => {
    if (workspace.view !== 'panes') {
      workspace.setView('panes');
      setAgentPreferences(value => ({ ...value, visible: true }));
    } else setAgentPreferences(value => ({ ...value, visible: !value.visible }));
  };
  const handleFullWidthTerminalPanelClick = () =>
    setSettings(previous => ({
      ...previous,
      terminalPlacement: previous.terminalPlacement === 'workspace' ? 'editor' : 'workspace',
    }));
  const handleAgentMenuClick = () => setAgentMenu(s => !s);
  const handleAgentMenuClick2 = () => setAgentMenu(false);
  const handleClick = () => void customPane();
  const handleTerminalFullClick = () => setTerminalFull(f => !f);
  const handleHideTerminalsSessionsKeepClick = () => setTerminalVisible(false);
  const handleRename: React.ComponentProps<typeof AgentPanel>['onRename'] = pane =>
    void renameAgent(pane);
  const handleClose: React.ComponentProps<typeof AgentPanel>['onClose'] = pane =>
    void closePane(pane);
  const handleAgentMenuLaunch = () => setAgentMenu(true);
  const handleClick2 = () => addPane('Terminal');
  const {
    terminalVisible,
    terminalFull,
    resize,
    resizeKey,
    setTerminalHeight,
    terminalPanel,
    panes,
    agentPreferences,
    setAgentPreferences,
    layout,
    setLayout,
    setMaxPane,
    settings,
    setSettings,
    project,
    setAgentMenu,
    agentMenu,
    addPane,
    customPane,
    setTerminalFull,
    setTerminalVisible,
    paneStates,
    agentObservations,
    agentUsage,
    selectedPane,
    focusAgent,
    renameAgent,
    restartAgent,
    closePane,
    maxPane,
    paneState,
    fail,
    observeAgent,
    updateAgentUsage,
    runAgentCommand,
    updateTerminalTitle,
    paneFocus,
    setSelectedPane,
    git,
  } = model;
  const clearMaximized = () => setMaxPane(null);
  const workspace = useTerminalWorkspace({
    panes,
    projectName: project?.name ?? 'No project',
    addPane,
    focus: focusAgent,
    clearMaximized,
    fail,
  });
  const [serverLoaded, setServerLoaded] = useState(workspace.view === 'server');
  const handleViewChange: React.ChangeEventHandler<HTMLSelectElement> = event => {
    if (event.target.value === 'server') setServerLoaded(true);
    workspace.setView(event.target.value as TerminalView);
  };
  const handleConnections = () => workspace.setConnectionsOpen(true);
  const handleConnectionsClose = () => workspace.setConnectionsOpen(false);
  const handleConnect = (profile: RemoteProfile) => void workspace.connect(profile);
  const handleAgentCommand: React.ComponentProps<typeof TerminalPane>['onCommand'] = (
    id,
    command
  ) => void runAgentCommand(command, panes.find(pane => pane.id === id)?.cwd ?? '').catch(fail);
  const visibleIds = new Set(workspace.visiblePanes.map(pane => pane.id));
  return (
    <>
      <div
        style={{ display: terminalVisible && !terminalFull ? undefined : 'none' }}
        role='separator'
        aria-label='Resize terminal panel'
        aria-orientation='horizontal'
        tabIndex={0}
        title='Drag to resize terminals. Double-click to reset.'
        className='terminal-resizer'
        onPointerDown={handleResizeTerminalPanelPointerDown}
        onKeyDown={handleResizeTerminalPanelKeyDown}
        onDoubleClick={handleResizeTerminalPanelDoubleClick}
      />
      <section
        ref={terminalPanel}
        className={`terminal-panel ${terminalFull ? 'full' : ''} terminal-view-${workspace.view}`}
        style={{
          display: terminalVisible ? undefined : 'none',
        }}
      >
        <header className='terminal-toolbar'>
          <div className='terminal-heading'>
            <TerminalSquare size={14} />
            <strong>TERMINALS</strong>
            {workspace.view !== 'server' && <span className='count-badge'>{panes.length}</span>}
          </div>
          <span className='terminal-subtitle'>A place for every agent.</span>
          <div className='spacer' />
          <select
            className='terminal-view-select'
            aria-label='Terminal view'
            value={workspace.view}
            onChange={handleViewChange}
          >
            <option value='panes'>Panes</option>
            <option value='workspaces'>Workspaces</option>
            <option value='server'>Background sessions</option>
          </select>
          <button className='icon-button' title='Remote connections' onClick={handleConnections}>
            <Monitor size={15} />
          </button>
          <button
            className={`icon-button ${workspace.view === 'panes' && agentPreferences.visible ? 'selected' : ''}`}
            title={workspace.view !== 'panes' ? 'Show agent overview' : 'Toggle agent overview'}
            aria-pressed={workspace.view === 'panes' && agentPreferences.visible}
            onClick={handleToggleAgentOverviewClick}
          >
            <Bot size={15} />
          </button>
          <div className='layout-controls'>
            {(
              [
                ['columns', Columns2, 'Side by side'],
                ['rows', Rows2, 'Stacked'],
                ['grid', Grid2X2, 'Grid'],
              ] as const
            ).map(([value, Icon, title]) => {
              const handleLayoutClick = () => {
                setLayout(value);
                setMaxPane(null);
              };
              return (
                <button
                  key={value}
                  className={`icon-button ${layout === value ? 'selected' : ''}`}
                  title={title}
                  onClick={handleLayoutClick}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
          <span className='toolbar-separator' />
          <button
            className={`icon-button ${settings.terminalPlacement === 'workspace' ? 'selected' : ''}`}
            title='Full-width terminal panel'
            aria-pressed={settings.terminalPlacement === 'workspace'}
            onClick={handleFullWidthTerminalPanelClick}
          >
            <PanelBottom size={15} />
          </button>
          <span className='toolbar-separator' />
          <div
            className='agent-menu-wrapper'
            style={{ display: workspace.view === 'server' ? 'none' : undefined }}
          >
            <button
              ref={launchTrigger}
              className='add-terminal'
              disabled={!project}
              aria-expanded={agentMenu}
              aria-controls={agentMenu ? launchMenuId : undefined}
              onClick={handleAgentMenuClick}
            >
              <Plus size={14} />
              New terminal
              <ChevronDown size={11} />
            </button>
            {agentMenu && terminalVisible && workspace.view !== 'server' && (
              <TerminalLaunchMenu
                id={launchMenuId}
                anchor={launchTrigger}
                onClose={handleAgentMenuClick2}
                onLaunch={addPane}
                onCustom={handleClick}
              />
            )}
          </div>
          <button
            className='icon-button'
            title={terminalFull ? 'Restore editor' : 'Expand terminals'}
            onClick={handleTerminalFullClick}
          >
            {terminalFull ? <Minus size={14} /> : <Maximize2 size={13} />}
          </button>
          <button
            className='icon-button'
            title='Hide terminals (sessions keep running)'
            onClick={handleHideTerminalsSessionsKeepClick}
          >
            <ChevronDown size={15} />
          </button>
        </header>
        {serverLoaded && (
          <Suspense fallback={<div className='loading'>Loading sessions…</div>}>
            <SessionDesk
              active={workspace.view === 'server'}
              settings={settings}
              root={project?.root}
              projectName={project?.name}
              layout={layout}
            />
          </Suspense>
        )}
        <div
          className='terminal-workspace'
          style={{ display: workspace.view === 'server' ? 'none' : undefined }}
        >
          {workspace.view === 'workspaces' && (
            <SessionRail
              panes={panes}
              projectName={project?.name ?? 'No project'}
              branch={git?.branch}
              profiles={workspace.profiles}
              selectedSpace={workspace.activeSpace}
              selectedPane={selectedPane}
              states={paneStates}
              observations={agentObservations}
              usage={agentUsage}
              onSpace={workspace.selectSpace}
              onPane={workspace.selectPane}
              onConnect={handleConnect}
              onConnections={handleConnections}
              onLaunch={handleAgentMenuLaunch}
            />
          )}
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
              onLaunch={handleAgentMenuLaunch}
            />
          )}
          <div className='terminal-canvas'>
            {workspace.view === 'workspaces' && (
              <div className='session-tabs' role='toolbar' aria-label='Session tabs'>
                <button
                  className={!maxPane ? 'active' : ''}
                  aria-pressed={!maxPane}
                  onClick={clearMaximized}
                >
                  <Grid2X2 size={13} />
                  Split view
                </button>
                {workspace.visiblePanes.map(pane => {
                  const handleSelect = () => workspace.selectPane(pane);
                  // Maximizing decides what the grid shows; focus decides where
                  // typing goes. In split view every pane is visible, so only
                  // the focus marker tells the two terminals apart.
                  const focused = selectedPane === pane.id;
                  return (
                    <button
                      key={pane.id}
                      className={`${maxPane === pane.id ? 'active' : ''} ${focused ? 'focused' : ''}`}
                      aria-pressed={maxPane === pane.id}
                      aria-current={focused}
                      onClick={handleSelect}
                    >
                      <i style={{ background: pane.color }} />
                      {paneName(pane)}
                    </button>
                  );
                })}
              </div>
            )}
            <div
              className={`terminal-grid layout-${layout} ${maxPane ? 'has-maximized' : ''}`}
              style={{ '--pane-count': workspace.visiblePanes.length } as React.CSSProperties}
            >
              {panes.length ? (
                <Suspense fallback={<div className='loading'>Starting terminals…</div>}>
                  {panes.map(pane => {
                    const handleMaxPaneMaximize = () =>
                      setMaxPane(v => (v === pane.id ? null : pane.id));
                    const handleClose = () => void closePane(pane);
                    const handleRestart = () => restartAgent(pane);
                    const handleSelectedPaneFocus = () => setSelectedPane(pane.id);
                    return (
                      <div
                        className={`pane-container ${!visibleIds.has(pane.id) || (maxPane && maxPane !== pane.id) ? 'pane-hidden' : ''}`}
                        key={pane.id}
                      >
                        <TerminalPane
                          pane={pane}
                          root={project!.root}
                          settings={settings}
                          maximized={maxPane === pane.id}
                          onMaximize={handleMaxPaneMaximize}
                          onClose={handleClose}
                          onRestart={handleRestart}
                          onState={paneState}
                          onTitle={updateTerminalTitle}
                          onError={fail}
                          onObservation={observeAgent}
                          onUsage={updateAgentUsage}
                          onCommand={handleAgentCommand}
                          enhancedUsage={agentPreferences.claudeUsage}
                          focusRequest={paneFocus.id === pane.id ? paneFocus.sequence : 0}
                          selected={selectedPane === pane.id}
                          onFocus={handleSelectedPaneFocus}
                        />
                      </div>
                    );
                  })}
                </Suspense>
              ) : (
                <div className='terminal-empty'>
                  <div className='terminal-empty-icon'>
                    <TerminalSquare size={24} />
                  </div>
                  <div>
                    <h3>Bring your agents to the table.</h3>
                    <p>Run Codex, Claude Code, or any CLI in its own terminal.</p>
                  </div>
                  <button className='button secondary' disabled={!project} onClick={handleClick2}>
                    <Plus size={14} />
                    Start a terminal
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      {workspace.connectionsOpen && (
        <RemoteConnections
          profiles={workspace.profiles}
          panes={panes}
          hasProject={!!project}
          onSave={workspace.saveProfile}
          onRemove={workspace.removeProfile}
          onConnect={handleConnect}
          onClose={handleConnectionsClose}
        />
      )}
    </>
  );
}
