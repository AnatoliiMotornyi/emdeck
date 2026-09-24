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
import { useId, useRef } from 'react';
import RemoteConnections from '../../features/agents/components/RemoteConnections';
import type { RemoteProfile, TerminalView } from '../../shared/contracts/remote';
import type { TerminalPanelModel } from './terminal-panel-model';
import { useTerminalSessions } from '../hooks/useTerminalSessions';
import TerminalContent from './TerminalContent';
import TerminalLaunchMenu from './TerminalLaunchMenu';
type Props = { model: TerminalPanelModel };
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
    settings,
    setSettings,
    project,
    setAgentMenu,
    agentMenu,
    addPane,
    customPane,
    setTerminalFull,
    setTerminalVisible,
  } = model;
  const workspace = useTerminalSessions(model);
  const handleViewChange: React.ChangeEventHandler<HTMLSelectElement> = event => {
    workspace.setView(event.target.value as TerminalView);
  };
  const handleConnections = () => workspace.setConnectionsOpen(true);
  const handleConnectionsClose = () => workspace.setConnectionsOpen(false);
  const handleConnect = (profile: RemoteProfile) => void workspace.connect(profile);
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
            {workspace.view !== 'server' && (
              <span className='count-badge'>
                {panes.length +
                  (workspace.view === 'workspaces' ? workspace.background.tiles.length : 0)}
              </span>
            )}
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
          {workspace.view !== 'server' && (
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
                  workspace.clearMaximized();
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
          )}
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
        <TerminalContent model={model} workspace={workspace} />
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
