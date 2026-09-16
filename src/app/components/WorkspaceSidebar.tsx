import { FolderOpen } from 'lucide-react';
import Explorer from '../../features/explorer/components/Explorer';
import GitPanel from '../../features/git/components/GitPanel';
import type { WorkspaceController } from '../hooks/useWorkspace';
type Props = {
  model: Pick<
    WorkspaceController,
    | 'sidebarVisible'
    | 'project'
    | 'sidebar'
    | 'directories'
    | 'expanded'
    | 'activeDiff'
    | 'active'
    | 'settings'
    | 'git'
    | 'toggleFolder'
    | 'openFile'
    | 'setContext'
    | 'refresh'
    | 'newEntry'
    | 'setExpanded'
    | 'gitBusy'
    | 'refreshGit'
    | 'gitAction'
    | 'discardChanges'
    | 'branchAction'
    | 'showDiff'
    | 'setBranchMenu'
    | 'showWorktrees'
    | 'showConflicts'
    | 'openProject'
    | 'resize'
    | 'resizeKey'
    | 'setSidebarWidth'
  >;
};
export default function WorkspaceSidebar({ model }: Props) {
  const handleToggle: React.ComponentProps<typeof Explorer>['onToggle'] = p => void toggleFolder(p);
  const handleOpen: React.ComponentProps<typeof Explorer>['onOpen'] = p => void openFile(p);
  const handleContextContext: React.ComponentProps<typeof Explorer>['onContext'] = (entry, x, y) =>
    setContext({ entry, x, y });
  const handleRefresh = () => void refresh();
  const handleNew: React.ComponentProps<typeof Explorer>['onNew'] = d => void newEntry(d);
  const handleExpandedCollapse = () => setExpanded(new Set());
  const handleRefresh2 = () => void refreshGit();
  const handleBranchAction: React.ComponentProps<typeof GitPanel>['onBranchAction'] = action =>
    void branchAction(action, `refs/heads/${git?.branch}`);
  const handleOpen2: React.ComponentProps<typeof GitPanel>['onOpen'] = p => void openFile(p);
  const handleDiff: React.ComponentProps<typeof GitPanel>['onDiff'] = (p, s) => void showDiff(p, s);
  const handleDiscard: React.ComponentProps<typeof GitPanel>['onDiscard'] = paths =>
    void discardChanges(paths);
  const handleBranchMenuBranches = () => setBranchMenu(true);
  const handleClick = () => void openProject();
  const handleResizeSidebarPointerDown: React.ComponentProps<'div'>['onPointerDown'] = e =>
    resize('sidebar', e);
  const handleResizeSidebarKeyDown: React.ComponentProps<'div'>['onKeyDown'] = e =>
    resizeKey('sidebar', e);
  const handleResizeSidebarDoubleClick = () => setSidebarWidth(240);
  const {
    sidebarVisible,
    project,
    sidebar,
    directories,
    expanded,
    activeDiff,
    active,
    settings,
    git,
    toggleFolder,
    openFile,
    setContext,
    refresh,
    newEntry,
    setExpanded,
    gitBusy,
    refreshGit,
    gitAction,
    discardChanges,
    branchAction,
    showDiff,
    setBranchMenu,
    showWorktrees,
    showConflicts,
    openProject,
    resize,
    resizeKey,
    setSidebarWidth,
  } = model;
  return (
    sidebarVisible && (
      <>
        <aside className='sidebar'>
          {project ? (
            sidebar === 'files' ? (
              <Explorer
                project={project}
                directories={directories}
                expanded={expanded}
                selected={activeDiff?.path ?? active}
                showHidden={settings.showHidden}
                changes={git?.changes ?? []}
                onToggle={handleToggle}
                onOpen={handleOpen}
                onContext={handleContextContext}
                onRefresh={handleRefresh}
                onNew={handleNew}
                onCollapse={handleExpandedCollapse}
              />
            ) : (
              <GitPanel
                git={git}
                busy={gitBusy}
                onRefresh={handleRefresh2}
                onAction={gitAction}
                onDiscard={handleDiscard}
                onBranchAction={handleBranchAction}
                onOpen={handleOpen2}
                onDiff={handleDiff}
                onBranches={handleBranchMenuBranches}
                onWorktrees={showWorktrees}
                onResolve={showConflicts}
              />
            )
          ) : (
            <>
              <div className='sidebar-heading'>EXPLORER</div>
              <div className='sidebar-empty'>
                <FolderOpen size={26} />
                <h3>A space for your project</h3>
                <p>Open a folder to explore its files.</p>
                <button className='button secondary' onClick={handleClick}>
                  Open folder
                </button>
              </div>
            </>
          )}
        </aside>
        <div
          role='separator'
          aria-label='Resize sidebar'
          aria-orientation='vertical'
          tabIndex={0}
          title='Drag to resize sidebar. Double-click to reset.'
          className='sidebar-resizer'
          onPointerDown={handleResizeSidebarPointerDown}
          onKeyDown={handleResizeSidebarKeyDown}
          onDoubleClick={handleResizeSidebarDoubleClick}
        />
      </>
    )
  );
}
