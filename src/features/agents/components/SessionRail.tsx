import { paneName, sessionName } from '../services/terminal-title';
import {
  Bot,
  CircleAlert,
  Globe,
  Layers,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { readStored, store } from '../../../platform/storage/preferences';
import type { RemoteProfile } from '../../../shared/contracts/remote';
import type {
  AgentObservation,
  AgentUsage,
  Pane,
  PaneState,
} from '../../../shared/contracts/workspace';
import { agentKind } from '../lib/agents';
import { sessionStatus } from '../lib/session-status';
import { terminalSpaces } from '../services/connections';
import { backgroundSpaces } from '../services/background-workspaces';
import type { BackgroundSession } from '../services/background-workspaces';
import { backgroundStatus } from '../lib/background-status';
import SessionRailJob from './SessionRailJob';

interface Props {
  panes: Pane[];
  background: BackgroundSession[];
  attached: Set<string>;
  selectedBackground: string | null;
  onBackground: (session: BackgroundSession) => void;
  onManageBackground: () => void;
  projectName: string;
  branch?: string;
  profiles: RemoteProfile[];
  selectedSpace: string;
  selectedPane: string | null;
  states: Record<string, PaneState>;
  observations: Record<string, AgentObservation>;
  usage: Record<string, AgentUsage>;
  onSpace: (id: string) => void;
  onPane: (pane: Pane) => void;
  onConnect: (profile: RemoteProfile) => void;
  onConnections: () => void;
  onLaunch: () => void;
}
export default function SessionRail({
  panes,
  background,
  attached,
  selectedBackground,
  onBackground,
  onManageBackground,
  projectName,
  branch,
  profiles,
  selectedSpace,
  selectedPane,
  states,
  observations,
  usage,
  onSpace,
  onPane,
  onConnect,
  onConnections,
  onLaunch,
}: Props) {
  const [collapsed, setCollapsed] = useState(
    () => readStored<unknown>('relay:workspace-sidebar-collapsed', false) === true
  );
  const bodyId = useId();
  useEffect(() => {
    store('relay:workspace-sidebar-collapsed', collapsed);
  }, [collapsed]);
  const handleCollapse = () => setCollapsed(value => !value);
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const spaces = terminalSpaces(panes, projectName);
  const handleQuery: React.ChangeEventHandler<HTMLInputElement> = event =>
    setQuery(event.target.value);
  const handleAll = () => onSpace('all');
  const handleAttention = () => setAttentionOnly(value => !value);
  const statuses = new Map(
    panes.map(pane => [
      pane.id,
      sessionStatus(states[pane.id], observations[pane.id], !!pane.remote),
    ])
  );
  const attentionCount =
    panes.filter(pane => statuses.get(pane.id)!.needsAttention).length +
    background.filter(session => backgroundStatus(session).needsAttention).length;
  // Keep hidden search text from hiding a job that needs attention in the mini rail.
  const search = collapsed ? '' : query.toLowerCase();
  const shownBackground = background.filter(
    session =>
      `${sessionName(session.pane)} ${session.workspace} ${session.machine.profile.name}`
        .toLowerCase()
        .includes(search) &&
      (!attentionOnly || backgroundStatus(session).needsAttention)
  );
  const shown = panes.filter(
    pane =>
      `${paneName(pane)} ${pane.cwd} ${pane.remote?.target.host ?? ''}`
        .toLowerCase()
        .includes(search) &&
      (!attentionOnly || statuses.get(pane.id)!.needsAttention)
  );
  return (
    <aside
      className={`session-rail ${collapsed ? 'is-collapsed' : ''}`}
      aria-label='Terminal workspaces'
    >
      <header className='rail-heading'>
        <Layers size={14} className='rail-expanded-only' />
        <strong className='rail-expanded-only'>SPACES</strong>
        <button
          className='icon-button rail-expanded-only'
          title='Manage remote connections'
          onClick={onConnections}
        >
          <Monitor size={14} />
        </button>
        <button
          type='button'
          className='icon-button'
          onClick={handleCollapse}
          aria-label={collapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          title={collapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </header>
      <div id={bodyId} className='rail-body'>
        {collapsed && (
          <button
            type='button'
            className='rail-mini-all'
            title='All sessions'
            aria-label='All sessions'
            aria-pressed={selectedSpace === 'all'}
            onClick={handleAll}
          >
            <Layers size={16} />
            <small>{panes.length + background.length}</small>
          </button>
        )}
        <div className='session-spaces rail-expanded-only'>
          <button
            className={`space-button ${selectedSpace === 'all' ? 'active' : ''}`}
            onClick={handleAll}
          >
            <Layers size={14} />
            <span>
              <strong>All sessions</strong>
              <small>
                {projectName}
                {branch ? ` · ${branch}` : ''}
              </small>
            </span>
            <b>{panes.length + background.length}</b>
          </button>
          {spaces.map(space => {
            const handleSelect = () => onSpace(space.id);
            return (
              <button
                key={space.id}
                className={`space-button ${selectedSpace === space.id ? 'active' : ''}`}
                onClick={handleSelect}
                title={space.detail}
              >
                <i className={space.remote ? 'remote-dot' : 'local-dot'} />
                <span>
                  <strong>{space.name}</strong>
                  <small>{space.detail}</small>
                </span>
                <b>{space.panes.length}</b>
              </button>
            );
          })}
          {backgroundSpaces(background).map(space => {
            const handleSelect = () => onSpace(space.id);
            return (
              <button
                key={space.id}
                className={`space-button ${selectedSpace === space.id ? 'active' : ''}`}
                onClick={handleSelect}
                title={space.detail}
              >
                <Monitor size={14} />
                <span>
                  <strong>{space.name}</strong>
                  <small>{space.detail}</small>
                </span>
                <b>{space.count}</b>
              </button>
            );
          })}
          <button className='rail-background-manage' onClick={onManageBackground}>
            <Monitor size={13} />
            Background machines
          </button>
          {!spaces.length && !background.length && (
            <p className='rail-note'>Launch a terminal to create your first space.</p>
          )}
        </div>
        {profiles.length > 0 && (
          <div className='rail-connections rail-expanded-only'>
            <h4>CONNECTIONS</h4>
            {profiles.map(profile => {
              const handleConnect = () => onConnect(profile);
              return (
                <button
                  key={profile.id}
                  onClick={handleConnect}
                  title={
                    profile.kind === 'web'
                      ? 'Open official session in browser'
                      : 'Connect or show the existing terminal'
                  }
                >
                  {profile.kind === 'web' ? <Globe size={13} /> : <Monitor size={13} />}
                  <span>{profile.name}</span>
                  <small>{profile.kind === 'web' ? 'web' : profile.target.backend}</small>
                </button>
              );
            })}
          </div>
        )}
        <header className='rail-expanded-only'>
          <Bot size={14} />
          <strong>SESSIONS</strong>
          <button className='icon-button' title='Launch an agent' onClick={onLaunch}>
            <Plus size={14} />
          </button>
        </header>
        <div className='rail-search rail-expanded-only'>
          <Search size={12} />
          <input
            aria-label='Find terminal sessions'
            value={query}
            onChange={handleQuery}
            placeholder='Find a session…'
          />
        </div>
        <button
          className={`rail-attention ${attentionOnly ? 'active' : ''} ${attentionCount ? 'has-attention' : ''}`}
          aria-label='Needs attention'
          aria-pressed={attentionOnly}
          title='Show sessions waiting for an approval or answer'
          onClick={handleAttention}
        >
          {collapsed ? <CircleAlert size={15} aria-hidden='true' /> : 'Needs attention'}
          <b aria-label={`${attentionCount} sessions need attention`}>{attentionCount}</b>
        </button>
        <div className='rail-sessions'>
          {shown.map(pane => {
            const status = statuses.get(pane.id)!;
            const context = usage[pane.id]?.contextPercent ?? observations[pane.id]?.contextPercent;
            const handleSelect = () => onPane(pane);
            return (
              <SessionRailJob
                key={pane.id}
                name={paneName(pane)}
                location={pane.remote?.target.host ?? (pane.cwd || projectName)}
                provider={pane.remote?.target.backend ?? agentKind(pane.command)}
                status={status}
                selected={selectedPane === pane.id}
                collapsed={collapsed}
                context={!pane.remote ? context : undefined}
                focusTitle={`Focus ${paneName(pane)}`}
                onSelect={handleSelect}
              />
            );
          })}
          {shownBackground.map(session => {
            const status = backgroundStatus(session);
            const handleSelect = () => onBackground(session);
            return (
              <SessionRailJob
                key={session.key}
                name={sessionName(session.pane)}
                location={`${session.machine.profile.name} · ${session.workspace}`}
                provider={session.pane.agent.kind}
                status={status}
                selected={selectedBackground === session.key}
                collapsed={collapsed}
                background
                attached={attached.has(session.key)}
                focusTitle={`Focus ${sessionName(session.pane)} on ${session.machine.profile.name}`}
                onSelect={handleSelect}
              />
            );
          })}
          {!shown.length && !shownBackground.length && (
            <p className='rail-note'>
              {panes.length + background.length
                ? 'No sessions match.'
                : 'Your agents will appear here.'}
            </p>
          )}
        </div>
        <footer className='rail-expanded-only'>
          <span className='local-dot' />
          Local + remote
          <button title='Add or edit remote connections' onClick={onConnections}>
            Configure
          </button>
        </footer>
        {collapsed && (
          <footer className='rail-mini-actions'>
            <button
              type='button'
              className='icon-button'
              title='Launch an agent'
              aria-label='Launch an agent'
              onClick={onLaunch}
            >
              <Plus size={16} />
            </button>
            <button
              type='button'
              className='icon-button'
              title='Background machines'
              aria-label='Background machines'
              onClick={onManageBackground}
            >
              <Monitor size={16} />
            </button>
            <button
              type='button'
              className='icon-button'
              title='Manage remote connections'
              aria-label='Manage remote connections'
              onClick={onConnections}
            >
              <Globe size={16} />
            </button>
          </footer>
        )}
      </div>
    </aside>
  );
}
