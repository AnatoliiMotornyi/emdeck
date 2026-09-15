import { Bell, Layers, PanelLeftOpen } from 'lucide-react';
import type { terminalSpaces } from '../services/connections';

interface Props {
  spaces: ReturnType<typeof terminalSpaces>;
  selectedSpace: string;
  paneCount: number;
  attentionCount: number;
  onSpace: (id: string) => void;
  onExpand: () => void;
}
/**
 * The collapsed Spaces rail. It keeps the space switcher and the attention
 * count reachable, because those are the two reasons to expand it again, and
 * drops everything that cannot be read in a 42px column.
 */
export default function SessionRailStrip({
  spaces,
  selectedSpace,
  paneCount,
  attentionCount,
  onSpace,
  onExpand,
}: Props) {
  const handleAll = () => onSpace('all');
  return (
    <aside className='session-rail collapsed' aria-label='Terminal workspaces'>
      <button
        className='icon-button'
        title='Expand spaces'
        aria-label='Expand spaces'
        aria-expanded='false'
        onClick={onExpand}
      >
        <PanelLeftOpen size={14} />
      </button>
      <div className='session-spaces'>
        <button
          className={`space-chip ${selectedSpace === 'all' ? 'active' : ''}`}
          title={`All sessions · ${paneCount}`}
          aria-label={`All sessions · ${paneCount}`}
          onClick={handleAll}
        >
          <Layers size={14} />
          <b>{paneCount}</b>
        </button>
        {spaces.map(space => {
          const handleSelect = () => onSpace(space.id);
          return (
            <button
              key={space.id}
              className={`space-chip ${selectedSpace === space.id ? 'active' : ''}`}
              title={`${space.name} · ${space.detail}`}
              aria-label={`${space.name} · ${space.panes.length} sessions`}
              onClick={handleSelect}
            >
              <i className={space.remote ? 'remote-dot' : 'local-dot'} />
              <b>{space.panes.length}</b>
            </button>
          );
        })}
      </div>
      <div
        className={`rail-strip-attention ${attentionCount ? 'has-attention' : ''}`}
        title='Sessions waiting for an approval or answer'
      >
        <Bell size={12} />
        <b aria-label={`${attentionCount} sessions need attention`}>{attentionCount}</b>
      </div>
    </aside>
  );
}
