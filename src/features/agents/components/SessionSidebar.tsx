import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AlertCircle, Layers, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type {
  MachineConnection,
  MachineProfile,
  SessionLaunch,
  SessionPane,
} from '../../../shared/contracts/sessions';
import { readStored, store } from '../../../platform/storage/preferences';
import SessionMachineCard from './SessionMachineCard';
import SessionForms from './SessionForms';
import SessionPairing from './SessionPairing';

interface Props {
  machines: MachineConnection[];
  attached: Set<string>;
  space: string;
  projectRoot?: string;
  projectName?: string;
  onAll: () => void;
  onWorkspace: (key: string) => void;
  onAttach: (machine: MachineConnection, pane: SessionPane) => void;
  onConnect: (profile: MachineProfile) => Promise<void>;
  onDisconnect: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onSave: (profile: MachineProfile) => void;
  onLaunch: (
    machine: MachineConnection,
    workspace: { root: string; name: string },
    launch: Omit<SessionLaunch, 'workspaceId'>
  ) => Promise<void>;
  onError: (message: string) => void;
}
export default function SessionSidebar({
  machines,
  attached,
  space,
  projectRoot,
  projectName,
  onAll,
  onWorkspace,
  onAttach,
  onConnect,
  onDisconnect,
  onRemove,
  onSave,
  onLaunch,
  onError,
}: Props) {
  const [collapsed, setCollapsed] = useState(
    () => readStored<unknown>('relay:session-sidebar-collapsed', false) === true
  );
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [folded, setFolded] = useState(new Set<string>());
  const [showDetails, setShowDetails] = useState(() => readStored('relay:session-details', true));
  const bodyId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    store('relay:session-sidebar-collapsed', collapsed);
  }, [collapsed]);
  useEffect(() => {
    store('relay:session-details', showDetails);
  }, [showDetails]);
  const handleToggle = () => setCollapsed(previous => !previous);
  const handleBlocked = (event: ChangeEvent<HTMLInputElement>) => {
    setBlockedOnly(event.target.checked);
    if (event.target.checked) setFolded(new Set());
  };
  const handleDetails = (event: ChangeEvent<HTMLInputElement>) =>
    setShowDetails(event.target.checked);
  const attention = machines.reduce(
    (count, machine) =>
      count + (machine.snapshot?.panes.filter(pane => pane.agent.state === 'blocked').length ?? 0),
    0
  );
  const handleAttention = () => {
    setBlockedOnly(true);
    setFolded(new Set());
    setCollapsed(false);
    toggle.current?.focus();
  };
  const attentionLabel = `${attention} ${attention === 1 ? 'session needs' : 'sessions need'} attention`;
  return (
    <aside
      className={`session-machines ${collapsed ? 'is-collapsed' : ''}`}
      aria-label='Background machines and agents'
    >
      <header className='session-sidebar-header'>
        <div hidden={collapsed}>
          <strong>Background sessions</strong>
          <small>Machines & workspaces</small>
        </div>
        <button
          ref={toggle}
          type='button'
          className='icon-button'
          onClick={handleToggle}
          aria-label={collapsed ? 'Show sessions sidebar' : 'Collapse sessions sidebar'}
          title={collapsed ? 'Show sessions sidebar' : 'Collapse sessions sidebar'}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </header>
      {collapsed && attention > 0 && (
        <button
          type='button'
          className='session-attention-shortcut'
          onClick={handleAttention}
          title={attentionLabel}
          aria-label={attentionLabel}
        >
          <AlertCircle size={16} />
          <span>{attention}</span>
        </button>
      )}
      <div id={bodyId} hidden={collapsed} className='session-sidebar-body'>
        <div className='session-sidebar-view'>
          <button
            type='button'
            className='session-all-panes'
            aria-label='All panes'
            aria-pressed={space === 'all'}
            onClick={onAll}
          >
            <Layers size={15} />
            <span>All panes</span>
            <small aria-hidden='true'>{attached.size}</small>
          </button>
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
        </div>
        <div className='session-sidebar-section-heading'>
          <span>Machines</span>
          <small>{machines.length}</small>
        </div>
        {machines.map(machine => {
          const handleFold = () =>
            setFolded(previous => {
              const next = new Set(previous);
              if (next.has(machine.profile.id)) next.delete(machine.profile.id);
              else next.add(machine.profile.id);
              return next;
            });
          const handleConnect = () => void onConnect(machine.profile);
          const handleDisconnect = () => onDisconnect(machine.profile.id);
          const handleRemove = () =>
            void onRemove(machine.profile.id).catch(error => onError(String(error)));
          return (
            <SessionMachineCard
              key={machine.profile.id}
              machine={machine}
              attached={attached}
              space={space}
              blockedOnly={blockedOnly}
              showDetails={showDetails}
              expanded={!folded.has(machine.profile.id)}
              onToggle={handleFold}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onRemove={handleRemove}
              onWorkspace={onWorkspace}
              onAttach={onAttach}
              onError={onError}
            />
          );
        })}
        <section className='session-sidebar-setup' aria-label='New sessions and connections'>
          <div className='session-sidebar-section-heading'>New & connect</div>
          <SessionForms
            machines={machines}
            projectRoot={projectRoot}
            projectName={projectName}
            onMachine={onSave}
            onLaunch={onLaunch}
          />
          <SessionPairing onMachine={onSave} />
        </section>
      </div>
    </aside>
  );
}
