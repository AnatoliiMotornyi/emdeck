import { conflicts } from '../../features/git/services/conflicts';
import { useEditorActions } from './useEditorActions';
import { useConflictActions } from './useConflictActions';
import { useDiscardActions } from './useDiscardActions';
import { useExplorerActions } from './useExplorerActions';
import { useGitActions } from './useGitActions';
import { useLayoutActions } from './useLayoutActions';
import { useProjectActions } from './useProjectActions';
import { useRunActions } from './useRunActions';
import { useTabActions } from './useTabActions';
import { useTerminalActions } from './useTerminalActions';
import { useWorkspaceLifecycle } from './useWorkspaceLifecycle';
import { useWorkspaceRefresh } from './useWorkspaceRefresh';
import { useWorkspaceState } from './useWorkspaceState';
export function useWorkspace() {
  const workspaceState = useWorkspaceState();
  const workspaceRefresh = useWorkspaceRefresh({ ...workspaceState });
  const conflictActions = useConflictActions({ ...workspaceState, ...workspaceRefresh });
  const discardActions = useDiscardActions({ ...workspaceState, ...workspaceRefresh });
  const editorActions = useEditorActions({ ...workspaceState, ...workspaceRefresh });
  const projectActions = useProjectActions({
    ...workspaceState,
    ...workspaceRefresh,
    ...editorActions,
  });
  const terminalActions = useTerminalActions({
    ...workspaceState,
  });
  const runActions = useRunActions({
    ...workspaceState,
    ...terminalActions,
  });
  const explorerActions = useExplorerActions({
    ...workspaceState,
    ...workspaceRefresh,
    ...editorActions,
  });
  const tabActions = useTabActions({
    ...workspaceState,
    ...workspaceRefresh,
    ...editorActions,
  });
  const gitActions = useGitActions({
    ...conflictActions,
    ...workspaceState,
    ...workspaceRefresh,
    ...editorActions,
    ...tabActions,
  });
  const layoutActions = useLayoutActions({
    ...workspaceState,
  });
  const workspaceLifecycle = useWorkspaceLifecycle({
    ...workspaceState,
    ...workspaceRefresh,
    ...projectActions,
    ...terminalActions,
    ...runActions,
    ...tabActions,
  });
  const { file, directories, files, paletteQuery, paneStates, runs } = workspaceState;
  const activeConflicts = file ? conflicts(file.content) : [];
  const listedFiles = [
    ...new Map([
      ...Object.values(directories)
        .flat()
        .filter(e => !e.isDir)
        .map(e => [e.path, e.path] as const),
      ...files.map(f => [f.path, f.path] as const),
    ]).values(),
  ].filter(path => path.toLowerCase().includes(paletteQuery.toLowerCase()));
  const connectedPanes = Object.values(paneStates).filter(
    s => s === 'running' || s === 'output'
  ).length;
  const run = runs.selected;
  return {
    ...discardActions,
    ...conflictActions,
    ...workspaceState,
    ...workspaceRefresh,
    ...editorActions,
    ...projectActions,
    ...terminalActions,
    ...runActions,
    ...explorerActions,
    ...tabActions,
    ...gitActions,
    ...layoutActions,
    ...workspaceLifecycle,
    activeConflicts,
    listedFiles,
    connectedPanes,
    run,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
