import { Folder, Monitor } from 'lucide-react';
import type { sessionStatus } from '../lib/session-status';
import SessionStatusBadge from './SessionStatusBadge';

interface Props {
  name: string;
  location: string;
  provider: string;
  status: ReturnType<typeof sessionStatus>;
  selected: boolean;
  collapsed: boolean;
  background?: boolean;
  attached?: boolean;
  context?: number | null;
  focusTitle: string;
  onSelect: () => void;
}

export default function SessionRailJob({
  name,
  location,
  provider,
  status,
  selected,
  collapsed,
  background,
  attached,
  context,
  focusTitle,
  onSelect,
}: Props) {
  const details = `${name} — ${status.label} — ${provider}${background ? ' · Background' : ''} — ${location}${context != null ? ` — ${context.toFixed(0)}% context` : ''}`;
  return (
    <button
      type='button'
      className={`rail-session ${selected ? 'active' : ''}`}
      data-status={status.kind}
      data-needs-attention={status.needsAttention}
      aria-label={details}
      aria-pressed={selected}
      onClick={onSelect}
      title={collapsed ? details : focusTitle}
    >
      <i aria-hidden='true' />
      {collapsed && (
        <span className='rail-job-avatar' aria-hidden='true'>
          {Array.from(name.trim()).slice(0, 2).join('').toUpperCase() || '…'}
          {background && <Monitor size={9} />}
        </span>
      )}
      <span className='rail-job-content'>
        <strong>{name}</strong>
        <SessionStatusBadge status={status} compact={collapsed} />
        <small className='rail-location'>
          {background ? <Monitor size={10} /> : <Folder size={10} />}
          <span>{location}</span>
        </small>
        <small className='rail-provider'>
          {provider}
          {background ? ' · Background' : ''}
          {background && attached && <b>Open</b>}
          {!background && context != null && <b title='Context used'>{context.toFixed(0)}%</b>}
        </small>
      </span>
    </button>
  );
}
