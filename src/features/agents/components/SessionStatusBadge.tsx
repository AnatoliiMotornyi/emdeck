import {
  Check,
  CircleHelp,
  CircleX,
  Clock3,
  Ellipsis,
  Monitor,
  Plug,
  ShieldAlert,
  Square,
} from 'lucide-react';
import type { sessionStatus } from '../lib/session-status';

const icons = {
  approval: ShieldAlert,
  question: CircleHelp,
  working: Ellipsis,
  ready: Check,
  output: Ellipsis,
  connected: Plug,
  unknown: CircleHelp,
  starting: Clock3,
  exited: Square,
  error: CircleX,
  preview: Monitor,
};

export default function SessionStatusBadge({
  status,
}: {
  status: ReturnType<typeof sessionStatus>;
}) {
  const Icon = icons[status.kind];
  return (
    <small className='rail-status' title={status.description}>
      <Icon size={12} aria-hidden='true' />
      {status.label}
    </small>
  );
}
