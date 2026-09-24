import { useEffect } from 'react';
import { hasUnsavedFiles } from '../../features/editor/services/documents';
import { rememberProject } from '../../features/projects/lib/startup';
import { native } from '../../platform/desktop/api';
import { useLatest } from '../../shared/hooks/useLatest';
import type { useProjectActions } from './useProjectActions';
import type { useRunActions } from './useRunActions';
import type { useTabActions } from './useTabActions';
import type { useTerminalActions } from './useTerminalActions';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';
import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<ReturnType<typeof useTabActions>, 'saveCurrentFile' | 'closeActiveTab'> &
  Pick<ReturnType<typeof useProjectActions>, 'openProject'> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refresh'> &
  Pick<ReturnType<typeof useTerminalActions>, 'addPane'> &
  Pick<ReturnType<typeof useRunActions>, 'runSelected'> &
  Pick<
    ReturnType<typeof useWorkspaceState>,
    | 'toggleSidebar'
    | 'active'
    | 'fail'
    | 'setPalette'
    | 'setPaletteQuery'
    | 'setSettingsOpen'
    | 'setTerminalVisible'
    | 'setContext'
    | 'setBranchMenu'
    | 'setRunsOpen'
    | 'setAgentMenu'
    | 'latest'
    | 'mergeDraftDirty'
    | 'confirm'
    | 'flushProjectConfig'
  >;
export function useWorkspaceLifecycle({
  saveCurrentFile,
  openProject,
  closeActiveTab,
  refresh,
  addPane,
  runSelected,
  toggleSidebar,
  active,
  fail,
  setPalette,
  setPaletteQuery,
  setSettingsOpen,
  setTerminalVisible,
  setContext,
  setBranchMenu,
  setRunsOpen,
  setAgentMenu,
  latest,
  mergeDraftDirty,
  confirm,
  flushProjectConfig,
}: Dependencies) {
  const handlers = useLatest({
    saveCurrentFile,
    openProject,
    closeActiveTab,
    refresh,
    addPane,
    runSelected,
    toggleSidebar,
    active,
    flushProjectConfig,
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handlers.current.saveCurrentFile().catch(fail);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPalette(true);
        setPaletteQuery('');
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void handlers.current.openProject(undefined, e.shiftKey ? 'new' : 'auto');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handlers.current.toggleSidebar();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setTerminalVisible(s => !s);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handlers.current.closeActiveTab();
      } else if (e.key === 'F5') {
        e.preventDefault();
        handlers.current.runSelected();
      } else if (e.key === 'Escape') {
        setContext(null);
        setBranchMenu(false);
        setRunsOpen(false);
        setAgentMenu(false);
      }
    };
    const focus = () => {
      if (native) rememberProject(latest.current.project);
      void handlers.current.refresh();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      // Desktop windows use the explicit close confirmation below.
      if (!native && (hasUnsavedFiles(latest.current.files) || mergeDraftDirty.current)) {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', key);
    window.addEventListener('focus', focus);
    window.addEventListener('beforeunload', beforeUnload);
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let closePending = false;
    if (native)
      void import('@tauri-apps/api/window')
        .then(async ({ getCurrentWindow }) => {
          const win = getCurrentWindow();
          const stop = await win.onCloseRequested(async event => {
            // Own the whole close operation, including errors and repeated requests.
            event.preventDefault();
            // Start the debounced project write before anything can destroy the
            // window, so a setting changed moments ago still reaches the disk.
            handlers.current.flushProjectConfig();
            if (closePending || disposed) return;
            closePending = true;
            try {
              if (
                (hasUnsavedFiles(latest.current.files) ||
                  mergeDraftDirty.current ||
                  latest.current.panes.length > 0) &&
                !(await confirm(
                  'Close this Emdeck window?',
                  'Unsaved file and merge edits in this window will be discarded. Local terminals will end and remote connections will disconnect. Other Emdeck windows will stay open.',
                  'Close window',
                  true
                ))
              )
                return;
              // close() would emit another close request and re-enter this handler.
              if (!disposed) {
                rememberProject(latest.current.project);
                await win.destroy();
              }
            } catch (error) {
              fail(error);
            } finally {
              closePending = false;
            }
          });
          if (disposed) stop();
          else unlisten = stop;
        })
        .catch(fail);
    return () => {
      disposed = true;
      unlisten?.();
      document.removeEventListener('keydown', key);
      window.removeEventListener('focus', focus);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [
    fail,
    confirm,
    latest,
    mergeDraftDirty,
    setAgentMenu,
    setBranchMenu,
    setContext,
    setPalette,
    setPaletteQuery,
    setRunsOpen,
    setSettingsOpen,
    setTerminalVisible,
    handlers,
  ]);
  return { handlers };
}
