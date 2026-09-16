import {
  ChevronDown,
  GitBranch,
  GitMerge,
  LayoutPanelLeft,
  PanelBottom,
  Play,
  Search,
  Settings2,
} from 'lucide-react';
import { version } from '../../../package.json';
import BranchPicker from '../../features/git/components/BranchPicker';
import { BranchStatus } from '../../features/git/components/BranchStatus';
import { integrationRef, shortRef } from '../../features/git/services/references';
import ProjectMenu from '../../features/projects/components/ProjectMenu';
import RunPicker from '../../features/runs/components/RunPicker';
import { native } from '../../platform/desktop/api';
import type { WorkspaceController } from '../hooks/useWorkspace';
const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
type Props = {
  model: Pick<
    WorkspaceController,
    | 'project'
    | 'recent'
    | 'openProject'
    | 'branchMenu'
    | 'setBranchMenu'
    | 'git'
    | 'gitBusy'
    | 'refreshGit'
    | 'branchAction'
    | 'createBranch'
    | 'showWorktrees'
    | 'showConflicts'
    | 'setPalette'
    | 'setPaletteQuery'
    | 'runsOpen'
    | 'settings'
    | 'runs'
    | 'setRunsOpen'
    | 'run'
    | 'runSelected'
    | 'setSettings'
    | 'launchRun'
    | 'editRun'
    | 'toggleSidebar'
    | 'setTerminalVisible'
    | 'setSettingsOpen'
  >;
};
export default function WorkspaceTopbar({ model }: Props) {
  const handleOpen: React.ComponentProps<typeof ProjectMenu>['onOpen'] = (path, target) =>
    void openProject(path, target);
  const handleManageBranchesClick = () => {
    setBranchMenu(s => !s);
  };
  const handleBranchMenuClick = () => setBranchMenu(false);
  const handleRefresh = () => void refreshGit();
  const handleAction: React.ComponentProps<typeof BranchPicker>['onAction'] = (action, branch) =>
    void branchAction(action, branch);
  const handleCreate = () => void createBranch();
  const handleSyncClick = () => {
    if (syncRef) void branchAction('sync', syncRef);
  };
  const handleResolve = () => showConflicts();
  const handlePaletteClick = () => {
    setPalette(true);
    setPaletteQuery('');
  };
  const handleManageRunConfigurationsClick = () => {
    if (!runsOpen && settings.detectRunScripts) runs.refresh();
    setRunsOpen(open => !open);
  };
  const handleRunsOpenClick = () => setRunsOpen(false);
  const handleSettingsToggle: React.ComponentProps<typeof RunPicker>['onToggle'] = enabled =>
    setSettings(previous => ({ ...previous, detectRunScripts: enabled }));
  const handleRunsOpenSelect: React.ComponentProps<typeof RunPicker>['onSelect'] = id => {
    runs.select(id);
    setRunsOpen(false);
  };
  const handleEdit: React.ComponentProps<typeof RunPicker>['onEdit'] = run => void editRun(run);
  const handleToggleTerminalPanelClick = () => setTerminalVisible(s => !s);
  const handleSettingsClick = () => setSettingsOpen(true);
  const {
    project,
    recent,
    openProject,
    branchMenu,
    setBranchMenu,
    git,
    gitBusy,
    refreshGit,
    branchAction,
    createBranch,
    showWorktrees,
    showConflicts,
    setPalette,
    setPaletteQuery,
    runsOpen,
    settings,
    runs,
    setRunsOpen,
    run,
    runSelected,
    setSettings,
    launchRun,
    editRun,
    toggleSidebar,
    setTerminalVisible,
    setSettingsOpen,
  } = model;
  const syncRef = git?.available ? integrationRef(git.branch, git.localBranches) : null;
  return (
    <header className='topbar'>
      <div className='brand' title={`Emdeck ${version} by Erdos Miller`}>
        <img src='/emdeck.svg' alt='' />
        <span>
          emdeck<span className='brand-period'>.</span>
        </span>
      </div>
      <div className='topbar-divider' />
      <ProjectMenu project={project} recent={recent} onOpen={handleOpen} />
      {project && (
        <div className='branch-wrapper'>
          <button
            className={`branch-button ${branchMenu ? 'active' : ''}`}
            aria-label='Manage branches'
            aria-expanded={branchMenu}
            onClick={handleManageBranchesClick}
          >
            <GitBranch size={14} />
            <span>{git?.available ? git.branch : native ? 'No repository' : 'Preview'}</span>
            <BranchStatus
              branch={git?.branchDetails?.find(b => b.reference === `refs/heads/${git.branch}`)}
            />
            <ChevronDown size={11} />
          </button>
          {syncRef && (
            <button
              className='icon-button branch-sync'
              aria-label={`Update from ${shortRef(syncRef)}`}
              title={`Fetch, then merge '${shortRef(syncRef)}' into '${git?.branch}'. Both branches are fast-forwarded from their tracked branches first.`}
              disabled={gitBusy}
              onClick={handleSyncClick}
            >
              <GitMerge size={14} />
            </button>
          )}
          {branchMenu && (
            <>
              <div className='popover-dismiss' onClick={handleBranchMenuClick} />
              <BranchPicker
                key={project.root}
                git={git}
                busy={gitBusy}
                onRefresh={handleRefresh}
                onAction={handleAction}
                onCreate={handleCreate}
                onWorktrees={showWorktrees}
                onResolve={handleResolve}
              />
            </>
          )}
        </div>
      )}
      <div className='spacer' />
      <button className='quick-search' onClick={handlePaletteClick}>
        <Search size={13} />
        <span>Jump to a file or action</span>
        <kbd>{mod} P</kbd>
      </button>
      <div className='spacer' />
      <div className='run-wrapper'>
        <div className='run-controls'>
          <button
            className='run-config'
            title='Manage run configurations'
            disabled={!project}
            aria-expanded={runsOpen}
            onClick={handleManageRunConfigurationsClick}
          >
            <span className='run-indicator' />
            <span>{run?.name ?? (runs.loading ? 'Detecting scripts…' : 'Choose command')}</span>
            <ChevronDown size={12} />
          </button>
          <button
            className='run-button'
            title='Run selected configuration (F5)'
            onClick={runSelected}
            disabled={!project || (runs.loading && run?.source !== 'custom')}
          >
            <Play size={15} fill='currentColor' />
          </button>
        </div>
        {runsOpen && project && (
          <>
            <div className='popover-dismiss' onClick={handleRunsOpenClick} />
            <RunPicker
              key={project.root}
              runs={runs}
              enabled={settings.detectRunScripts}
              onToggle={handleSettingsToggle}
              onSelect={handleRunsOpenSelect}
              onRun={launchRun}
              onEdit={handleEdit}
            />
          </>
        )}
      </div>
      <div className='topbar-divider' />
      <button className='icon-button' title='Toggle sidebar' onClick={toggleSidebar}>
        <LayoutPanelLeft size={16} />
      </button>
      <button
        className='icon-button'
        title='Toggle terminal panel'
        onClick={handleToggleTerminalPanelClick}
      >
        <PanelBottom size={16} />
      </button>
      <button className='icon-button' title='Settings' onClick={handleSettingsClick}>
        <Settings2 size={16} />
      </button>
    </header>
  );
}
