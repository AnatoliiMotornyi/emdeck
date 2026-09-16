import { ChevronRight, Command, Keyboard, Search, TerminalSquare, X } from 'lucide-react';
import { useState } from 'react';
import { version } from '../package.json';
import ActivityBar from './app/components/ActivityBar';
import EditorPanel from './app/components/EditorPanel';
import ExplorerContextMenu from './app/components/ExplorerContextMenu';
import PreviewBanner from './app/components/PreviewBanner';
import StatusBar from './app/components/StatusBar';
import TerminalPanel from './app/components/TerminalPanel';
import WorkspaceSidebar from './app/components/WorkspaceSidebar';
import WorkspaceTopbar from './app/components/WorkspaceTopbar';
import WorkspaceConflicts from './app/components/WorkspaceConflicts';
import { useWorkspace } from './app/hooks/useWorkspace';
import Settings from './features/settings/components/Settings';
import type { SettingsScope } from './features/settings/components/SettingsScope';
import type { SettingsOverrides } from './shared/contracts/projectConfig';
import type { Settings as SettingsType } from './shared/contracts/workspace';
import Dialog, { Modal } from './shared/ui/Dialog';
import { FileIcon } from './shared/ui/FileIcon';
const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
export default function App() {
  const handleContextClick = () => {
    if (context) setContext(null);
  };
  const handleSettingsOpenClose = () => setSettingsOpen(false);
  const handleDialogClose = () => setDialog(null);
  const handleJumpToAFileClose = () => setPalette(false);
  const handleSearchFilesAndActionsChange: React.ComponentProps<'input'>['onChange'] = e =>
    setPaletteQuery(e.target.value);
  const handleHelpOpenClose = () => setHelpOpen(false);
  const handleHelpOpenClick = () => setHelpOpen(false);
  const handleDismissNotificationClick = () => setToast(null);
  const model = useWorkspace();
  const [chosenScope, setChosenScope] = useState<SettingsScope>('project');
  const {
    context,
    setContext,
    project,
    openProject,
    git,
    showWorktrees,
    setPalette,
    setPaletteQuery,
    settings,
    globalSettings,
    overrides,
    updateSettings,
    resetOverride,
    projectScopeAvailable,
    setSettingsOpen,
    setHelpOpen,
    terminalFull,
    workspaceArea,
    sidebarVisible,
    terminalVisible,
    sidebarWidth,
    terminalHeight,
    openFile,
    refresh,
    addPane,
    settingsOpen,
    dialog,
    setDialog,
    palette,
    paletteQuery,
    listedFiles,
    helpOpen,
    toast,
    setToast,
  } = model;
  // With no project open there is nothing to override, so the panel is pinned
  // to the global layer however the selector was left last time.
  const settingsScope: SettingsScope = projectScopeAvailable ? chosenScope : 'global';
  const handleSettingsChange = (change: Partial<SettingsType>) =>
    updateSettings(change, settingsScope);
  const handleSettingsReset = (field: keyof SettingsOverrides) => resetOverride(field);
  const handleSettingsResetAll = () => {
    for (const field of Object.keys(overrides) as (keyof SettingsOverrides)[]) resetOverride(field);
  };
  return (
    <div className='app' onClick={handleContextClick}>
      <WorkspaceTopbar model={model} />
      <PreviewBanner model={model} />
      <div className='workspace'>
        <ActivityBar model={model} />
        <main
          ref={workspaceArea}
          className={`main-workspace terminal-placement-${settings.terminalPlacement} ${sidebarVisible ? '' : 'sidebar-hidden'} ${terminalVisible ? '' : 'terminals-hidden'} ${terminalFull && terminalVisible ? 'terminals-expanded' : ''}`}
          style={
            {
              '--sidebar-width': `${sidebarWidth}px`,
              '--terminal-height': `${terminalHeight}px`,
            } as React.CSSProperties
          }
        >
          <WorkspaceSidebar model={model} />
          <EditorPanel model={model} />
          <TerminalPanel model={model} />
        </main>
      </div>
      <StatusBar model={model} />

      <ExplorerContextMenu model={model} />
      {settingsOpen && (
        // Global scope shows the layer it edits, not the merged value: a
        // project override must never be mistaken for the global default.
        <Settings
          settings={settingsScope === 'global' ? globalSettings : settings}
          overrides={overrides}
          scope={settingsScope}
          projectScopeAvailable={projectScopeAvailable}
          projectName={project?.name ?? ''}
          onScopeChange={setChosenScope}
          onChange={handleSettingsChange}
          onReset={handleSettingsReset}
          onResetAll={handleSettingsResetAll}
          onClose={handleSettingsOpenClose}
        />
      )}
      <WorkspaceConflicts model={model} />
      {dialog && <Dialog spec={dialog} onClose={handleDialogClose} />}
      {palette && (
        <Modal title='Jump to a file or action' onClose={handleJumpToAFileClose}>
          <div className='palette-search'>
            <Search size={18} />
            <input
              autoFocus
              aria-label='Search files and actions'
              placeholder='Search loaded files and actions…'
              value={paletteQuery}
              onChange={handleSearchFilesAndActionsChange}
            />
          </div>
          <div className='palette-results'>
            {[
              ['Open project folder', () => void openProject(), `${mod} O`],
              [
                'Open project in new window',
                () => void openProject(undefined, 'new'),
                `${mod} Shift O`,
              ],
              ['Replace project in this window', () => void openProject(undefined, 'current'), ''],
              ['New terminal', () => addPane('Terminal'), ''],
              ['Settings', () => setSettingsOpen(true), `${mod} ,`],
              ['Refresh workspace', () => void refresh(), ''],
              ...(project && git?.available ? [['Manage Git worktrees', showWorktrees, '']] : []),
            ]
              .filter(([label]) => String(label).toLowerCase().includes(paletteQuery.toLowerCase()))
              .map(([label, action, shortcut]) => {
                const handlePaletteClick = () => {
                  setPalette(false);
                  (action as () => void)();
                };
                return (
                  <button key={String(label)} onClick={handlePaletteClick}>
                    <Command size={14} />
                    <span>{String(label)}</span>
                    <kbd>{String(shortcut)}</kbd>
                  </button>
                );
              })}
            {listedFiles.map(path => {
              const handlePaletteClick = () => {
                setPalette(false);
                void openFile(path);
              };
              return (
                <button key={path} onClick={handlePaletteClick}>
                  <FileIcon path={path} />
                  <span>{path}</span>
                  <ChevronRight size={12} />
                </button>
              );
            })}
          </div>
          <div className='palette-footnote'>
            Files from expanded folders and open tabs. No project scan.
          </div>
        </Modal>
      )}
      {helpOpen && (
        <Modal title={`Emdeck ${version}`} onClose={handleHelpOpenClose}>
          <p className='dialog-description'>
            Emdeck by Erdos Miller. Your code. Your agents. One workspace.
          </p>
          <div className='help-launch'>
            <TerminalSquare size={17} />
            <div>
              <strong>Launch the desktop app</strong>
              <code>
                bun install --frozen-lockfile
                <br />
                bun run desktop
              </code>
              <small>Requires Rust and your platform's Tauri build prerequisites.</small>
            </div>
          </div>
          <div className='shortcut-list'>
            {[
              ['Open project', `${mod} O`],
              ['Open project in new window', `${mod} Shift O`],
              ['Quick open', `${mod} P`],
              ['Save file', `${mod} S`],
              ['Close file', `${mod} W`],
              ['Find / replace in editor', `${mod} F / ${mod} H`],
              ['Toggle explorer', `${mod} B`],
              ['Toggle terminals', `${mod} \``],
              ['Settings', `${mod} ,`],
              ['Run configuration', 'F5'],
            ].map(([label, keys]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </div>
          <p className='help-note'>
            <Keyboard size={16} />
            Agent CLIs use your existing installation and authentication. Sessions end when their
            pane or Emdeck closes.
          </p>
          <footer className='dialog-footer'>
            <button className='button primary' onClick={handleHelpOpenClick}>
              Got it
            </button>
          </footer>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          <span>{toast.text}</span>
          <button
            className='icon-button'
            title='Dismiss notification'
            onClick={handleDismissNotificationClick}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
