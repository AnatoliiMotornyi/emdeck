import { useId } from 'react';
import { ChevronDown, Folder, Monitor, Server, Settings2, TerminalSquare } from 'lucide-react';
import type { MachineConnection, SessionPane } from '../../../shared/contracts/sessions';
import { sessionCall } from '../../../platform/desktop/sessions';
import { sessionKey, stateLabel } from '../services/session-model';
import { sessionName } from '../services/terminal-title';
import SessionSharing from './SessionSharing';

interface Props {
  machine: MachineConnection;
  attached: Set<string>;
  space: string;
  blockedOnly: boolean;
  showDetails: boolean;
  expanded: boolean;
  onToggle: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onWorkspace: (key: string) => void;
  onAttach: (machine: MachineConnection, pane: SessionPane) => void;
  onError: (message: string) => void;
}
export default function SessionMachineCard({
  machine,
  attached,
  space,
  blockedOnly,
  showDetails,
  expanded,
  onToggle,
  onConnect,
  onDisconnect,
  onRemove,
  onWorkspace,
  onAttach,
  onError,
}: Props) {
  const contentId = useId();
  const local = machine.profile.target.kind === 'local';
  const panes = machine.snapshot?.panes ?? [];
  return (
    <section className='session-machine'>
      <button
        type='button'
        className='session-machine-heading'
        onClick={onToggle}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${machine.profile.name}`}
        aria-expanded={expanded}
        aria-controls={contentId}
      >
        {local ? <Monitor size={16} /> : <Server size={16} />}
        <span className='session-machine-title'>
          <strong>{machine.profile.name}</strong>
          <span className={`session-connection-state ${machine.status}`}>
            <i aria-hidden='true' />
            {machine.status} · {panes.length} {panes.length === 1 ? 'session' : 'sessions'}
          </span>
        </span>
        <ChevronDown size={14} className={expanded ? '' : 'collapsed'} />
      </button>
      <div id={contentId} hidden={!expanded} className='session-machine-content'>
        {machine.status !== 'connected' && (
          <button
            type='button'
            className='button secondary session-connect-button'
            disabled={machine.status === 'connecting'}
            onClick={onConnect}
          >
            {machine.status === 'connecting'
              ? 'Connecting…'
              : local
                ? 'Connect local server'
                : 'Connect'}
          </button>
        )}
        {machine.error && (
          <p className='session-error' role='alert'>
            {machine.error}
          </p>
        )}
        {machine.snapshot?.workspaces.map(workspace => {
          const key = sessionKey(machine.profile.id, workspace.id);
          const handleWorkspace = () => onWorkspace(key);
          const all = panes.filter(pane => pane.launch.workspaceId === workspace.id);
          const shown = blockedOnly ? all.filter(pane => pane.agent.state === 'blocked') : all;
          const handleRemoveWorkspace = () =>
            void sessionCall(machine.connection!, 'workspace.remove', { id: workspace.id }).catch(
              error => onError(String(error))
            );
          if (blockedOnly && !shown.length) return null;
          return (
            <div className='session-workspace-group' key={workspace.id}>
              <button
                type='button'
                className='session-workspace-name'
                onClick={handleWorkspace}
                aria-label={workspace.name}
                aria-pressed={space === key}
                title={workspace.root}
              >
                <Folder size={13} />
                <span>{workspace.name}</span>
                <small aria-hidden='true'>{all.length}</small>
              </button>
              {!all.length && (
                <button
                  type='button'
                  disabled={!machine.connection}
                  onClick={handleRemoveWorkspace}
                >
                  Remove empty workspace
                </button>
              )}
              {shown.map(pane => {
                const open = attached.has(sessionKey(machine.profile.id, pane.id));
                const handleAttach = () => onAttach(machine, pane);
                const restart = (resume: boolean) =>
                  void sessionCall(machine.connection!, 'pane.restart', { id: pane.id, resume })
                    .then(next => onAttach(machine, next))
                    .catch(error => onError(String(error)));
                const handleRestart = () => restart(false);
                const handleResume = () => restart(true);
                const handleRemovePane = () =>
                  void sessionCall(machine.connection!, 'pane.remove', { id: pane.id }).catch(
                    error => onError(String(error))
                  );
                return (
                  <div className={`session-agent-row ${open ? 'is-attached' : ''}`} key={pane.id}>
                    <button type='button' disabled={!machine.connection} onClick={handleAttach}>
                      <span className='session-agent-title'>
                        <TerminalSquare size={13} />
                        <strong>{sessionName(pane)}</strong>
                        {open && <small>Open</small>}
                      </span>
                      <span className={`session-state ${stateLabel(pane, !!machine.connection)}`}>
                        {stateLabel(pane, !!machine.connection)} · {pane.agent.kind}
                      </span>
                      {showDetails && (
                        <small title={pane.agent.reason}>
                          {pane.agent.source}: {pane.agent.reason}
                        </small>
                      )}
                    </button>
                    {!pane.running && machine.connection && (
                      <div className='session-machine-actions'>
                        <button type='button' onClick={handleRestart}>
                          Start again
                        </button>
                        {pane.agent.sessionId && (
                          <button type='button' onClick={handleResume}>
                            Resume
                          </button>
                        )}
                        <button type='button' onClick={handleRemovePane}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {machine.connection && !panes.length && (
          <p className='session-sidebar-hint'>
            No sessions yet. Start a background terminal below.
          </p>
        )}
        {blockedOnly && panes.length > 0 && !panes.some(pane => pane.agent.state === 'blocked') && (
          <p className='session-sidebar-hint'>No sessions need attention.</p>
        )}
        <details className='session-machine-settings'>
          <summary>
            <Settings2 size={13} />
            Machine settings
          </summary>
          <div className='session-machine-actions'>
            {machine.status === 'connected' && (
              <button type='button' onClick={onDisconnect}>
                Disconnect
              </button>
            )}
            {machine.profile.id !== 'local' && (
              <button type='button' onClick={onRemove}>
                Forget
              </button>
            )}
          </div>
          {local && machine.connection && (
            <SessionSharing key={machine.connection} connection={machine.connection} />
          )}
          <p className='session-sidebar-hint'>Disconnecting leaves background processes running.</p>
        </details>
      </div>
    </section>
  );
}
