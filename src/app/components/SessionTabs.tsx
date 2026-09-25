import { Grid2X2 } from 'lucide-react';
import type { TerminalSessions } from '../hooks/useTerminalSessions';
import { paneName, sessionName } from '../../features/agents/services/terminal-title';
import type { BackgroundSession } from '../../features/agents/services/background-workspaces';
import type { Pane } from '../../shared/contracts/workspace';

interface Props {
  workspace: TerminalSessions;
  maxPane: string | null;
  selectedPane: string | null;
  background: BackgroundSession[];
  onRename: (pane: Pane) => void;
}

export default function SessionTabs({
  workspace,
  maxPane,
  selectedPane,
  background,
  onRename,
}: Props) {
  return (
    <div className='session-tabs' role='toolbar' aria-label='Session tabs'>
      <button
        className={!maxPane && !workspace.maxBackground ? 'active' : ''}
        aria-pressed={!maxPane && !workspace.maxBackground}
        onClick={workspace.clearMaximized}
      >
        <Grid2X2 size={13} />
        Split view
      </button>
      {workspace.visiblePanes.map(pane => {
        const handleSelect = () => workspace.selectPane(pane);
        // Maximizing decides what the grid shows; focus decides where
        // typing goes. In split view every pane is visible, so only
        // the focus marker tells the two terminals apart.
        const focused = !workspace.selectedBackground && selectedPane === pane.id;
        // Double-click matches the tab-renaming habit from other editors. The
        // pane header keeps the single-click path, so this is never the only way.
        const handleRename = () => onRename(pane);
        return (
          <button
            key={pane.id}
            className={`${maxPane === pane.id ? 'active' : ''} ${focused ? 'focused' : ''}`}
            aria-pressed={maxPane === pane.id}
            aria-current={focused}
            title={`${paneName(pane)} — double-click to rename`}
            onClick={handleSelect}
            onDoubleClick={handleRename}
          >
            <i style={{ background: pane.color }} />
            {paneName(pane)}
          </button>
        );
      })}
      {background.map(session => {
        const handleSelect = () => workspace.selectBackground(session);
        return (
          <button
            key={session.key}
            className={workspace.maxBackground === session.key ? 'active' : ''}
            aria-pressed={workspace.maxBackground === session.key}
            onClick={handleSelect}
            title={`${session.machine.profile.name} · Background`}
          >
            {sessionName(session.pane)} · Background
          </button>
        );
      })}
    </div>
  );
}
