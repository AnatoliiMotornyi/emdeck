import { sessionName } from '../services/terminal-title';
import { useEffect, useState } from 'react';
import { sessionCall } from '../../../platform/desktop/sessions';
import { readStored, store } from '../../../platform/storage/preferences';
import type {
  MachineConnection,
  SessionLaunch,
  SessionPane,
} from '../../../shared/contracts/sessions';
import type { Settings } from '../../../shared/contracts/workspace';
import { useSessionMachines } from '../hooks/useSessionMachines';
import { sessionKey, stateLabel } from '../services/session-model';
import SessionForms from './SessionForms';
import SessionTerminal from './SessionTerminal';
import SessionPairing from './SessionPairing';
import SessionSharing from './SessionSharing';

interface Props {
  active: boolean;
  settings: Settings;
  root?: string;
  projectName?: string;
  layout: string;
}
export default function SessionDesk({ active, settings, root, projectName, layout }: Props) {
  const controller = useSessionMachines(active);
  const [attached, setAttached] = useState<string[]>(() => {
    const value = readStored<unknown>('relay:session-views', []);
    return Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(0, 64) : [];
  });
  const [space, setSpace] = useState('all');
  const [solo, setSolo] = useState<string | null>(null);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [showDetails, setShowDetails] = useState(() => readStored('relay:session-details', true));
  const [error, setError] = useState('');
  const [stop, setStop] = useState<{ machine: MachineConnection; pane: SessionPane } | null>(null);
  useEffect(() => {
    store('relay:session-views', attached);
  }, [attached]);
  useEffect(() => {
    store('relay:session-details', showDetails);
  }, [showDetails]);
  const handleAll = () => {
    setSpace('all');
    setSolo(null);
  };
  const handleBlocked: React.ChangeEventHandler<HTMLInputElement> = e =>
    setBlockedOnly(e.target.checked);
  const handleDetails: React.ChangeEventHandler<HTMLInputElement> = e =>
    setShowDetails(e.target.checked);
  const attach = (machine: MachineConnection, pane: SessionPane) => {
    const key = sessionKey(machine.profile.id, pane.id);
    setAttached(previous => (previous.includes(key) ? previous : [...previous, key]));
    setSpace('all');
    setSolo(key);
  };
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
    attach(machine, pane);
  };
  const handleCancelStop = () => setStop(null);
  const handleConfirmStop = () => {
    if (!stop?.machine.connection) return;
    void sessionCall(stop.machine.connection, 'pane.stop', { id: stop.pane.id }).catch(e =>
      setError(String(e))
    );
    setStop(null);
  };
  const tiles = controller.machines
    .flatMap(machine =>
      (machine.snapshot?.panes ?? []).map(pane => ({
        machine,
        pane,
        key: sessionKey(machine.profile.id, pane.id),
      }))
    )
    .filter(tile => attached.includes(tile.key));
  return (
    <div className='session-desk' style={{ display: active ? undefined : 'none' }}>
      <aside className='session-machines' aria-label='Background machines and agents'>
        <header>
          <strong>BACKGROUND SESSIONS</strong>
          <button onClick={handleAll}>All panes</button>
        </header>
        <div className='session-options'>
          <label>
            <input type='checkbox' checked={blockedOnly} onChange={handleBlocked} />
            Needs attention
          </label>
          <label>
            <input type='checkbox' checked={showDetails} onChange={handleDetails} />
            Show details
          </label>
        </div>
        {controller.machines.map(machine => {
          const handleConnect = () => void controller.connect(machine.profile);
          const handleDisconnect = () => controller.disconnect(machine.profile.id);
          const handleRemove = () =>
            void controller.remove(machine.profile.id).catch(e => setError(String(e)));
          return (
            <section className='session-machine' key={machine.profile.id}>
              <header>
                <strong>{machine.profile.name}</strong>
                <small>{machine.status}</small>
              </header>
              <div className='session-machine-actions'>
                {machine.status === 'connected' ? (
                  <button onClick={handleDisconnect}>Disconnect</button>
                ) : (
                  <button disabled={machine.status === 'connecting'} onClick={handleConnect}>
                    {machine.status === 'connecting'
                      ? 'Connecting…'
                      : machine.profile.target.kind === 'local'
                        ? 'Connect local server'
                        : 'Connect'}
                  </button>
                )}
                {machine.profile.id !== 'local' && <button onClick={handleRemove}>Forget</button>}
              </div>
              {machine.error && (
                <p className='session-error' role='alert'>
                  {machine.error}
                </p>
              )}
              {machine.profile.target.kind === 'local' && machine.connection && (
                <SessionSharing key={machine.connection} connection={machine.connection} />
              )}
              {machine.snapshot?.workspaces.map(workspace => {
                const handleWorkspace = () => {
                  setSpace(sessionKey(machine.profile.id, workspace.id));
                  setSolo(null);
                };
                const panes = machine.snapshot!.panes.filter(
                  p =>
                    p.launch.workspaceId === workspace.id &&
                    (!blockedOnly || p.agent.state === 'blocked')
                );
                const handleRemoveWorkspace = () =>
                  void sessionCall(machine.connection!, 'workspace.remove', {
                    id: workspace.id,
                  }).catch(e => setError(String(e)));
                return (
                  <div className='session-workspace-group' key={workspace.id}>
                    <button
                      className='session-workspace-name'
                      onClick={handleWorkspace}
                      title={workspace.root}
                    >
                      {workspace.name}
                    </button>
                    {!machine.snapshot!.panes.some(p => p.launch.workspaceId === workspace.id) && (
                      <button disabled={!machine.connection} onClick={handleRemoveWorkspace}>
                        Remove empty workspace
                      </button>
                    )}
                    {panes.map(pane => {
                      const handleAttach = () => attach(machine, pane);
                      const handleRestart = () =>
                        void sessionCall(machine.connection!, 'pane.restart', {
                          id: pane.id,
                          resume: false,
                        })
                          .then(next => attach(machine, next))
                          .catch(e => setError(String(e)));
                      const handleResume = () =>
                        void sessionCall(machine.connection!, 'pane.restart', {
                          id: pane.id,
                          resume: true,
                        })
                          .then(next => attach(machine, next))
                          .catch(e => setError(String(e)));
                      const handleRemovePane = () =>
                        void sessionCall(machine.connection!, 'pane.remove', { id: pane.id }).catch(
                          e => setError(String(e))
                        );
                      return (
                        <div className='session-agent-row' key={pane.id}>
                          <button disabled={!machine.connection} onClick={handleAttach}>
                            <strong>{sessionName(pane)}</strong>
                            <span
                              className={`session-state ${stateLabel(pane, !!machine.connection)}`}
                            >
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
                              <button onClick={handleRestart}>Start again</button>
                              {pane.agent.sessionId && (
                                <button onClick={handleResume}>Resume</button>
                              )}
                              <button onClick={handleRemovePane}>Remove</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          );
        })}
        <SessionPairing onMachine={controller.save} />
        <SessionForms
          machines={controller.machines}
          projectRoot={root}
          projectName={projectName}
          onMachine={controller.save}
          onLaunch={launch}
        />
      </aside>
      <div className='session-stage'>
        {error && (
          <p className='session-error' role='alert'>
            {error}
          </p>
        )}
        {stop && (
          <div className='session-stop-confirm' role='alert'>
            <span>
              Stop {sessionName(stop.pane)} on {stop.machine.profile.name}? Its running process will
              end.
            </span>
            <button onClick={handleConfirmStop}>Stop process</button>
            <button onClick={handleCancelStop}>Keep running</button>
          </div>
        )}
        <div
          className={`terminal-grid layout-${layout}`}
          style={
            {
              '--pane-count': Math.max(
                1,
                tiles.filter(
                  t =>
                    (!solo || solo === t.key) &&
                    (space === 'all' ||
                      space === sessionKey(t.machine.profile.id, t.pane.launch.workspaceId))
                ).length
              ),
            } as React.CSSProperties
          }
        >
          {tiles.map(({ machine, pane, key }) => {
            const handleDetach = () => {
              setAttached(previous => previous.filter(id => id !== key));
              setSolo(null);
            };
            const handleStop = () => setStop({ machine, pane });
            const handleMaximize = () => setSolo(previous => (previous === key ? null : key));
            const hidden =
              (solo && solo !== key) ||
              (space !== 'all' &&
                space !== sessionKey(machine.profile.id, pane.launch.workspaceId));
            return (
              <div key={key} className={`pane-container ${hidden ? 'pane-hidden' : ''}`}>
                {machine.connection ? (
                  <SessionTerminal
                    connection={machine.connection}
                    pane={pane}
                    settings={settings}
                    onDetach={handleDetach}
                    onStop={handleStop}
                    onMaximize={handleMaximize}
                  />
                ) : (
                  <div className='session-disconnected'>
                    <strong>{sessionName(pane)}</strong>
                    <p>
                      {machine.profile.name} is offline. Last reported state: {pane.agent.state}.
                      Input is disabled.
                    </p>
                    <button onClick={handleDetach}>Detach view</button>
                  </div>
                )}
              </div>
            );
          })}
          {!tiles.length && (
            <div className='terminal-empty'>
              <div>
                <h3>Your agents can keep working.</h3>
                <p>
                  Connect a machine, then open a background terminal. Saved workspaces and agent
                  states appear here even when no view is attached.
                </p>
                <p>Use Panes for terminals that end when Emdeck closes.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
