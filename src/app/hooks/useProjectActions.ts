import { useEffect } from 'react';
import { hasUnsavedFiles } from '../../features/editor/services/documents';
import { lastProjectPath, rememberProject } from '../../features/projects/lib/startup';
import { api, native } from '../../platform/desktop/api';
import { readStored, store } from '../../platform/storage/preferences';
import type { OpenTarget } from '../../shared/contracts/projects';
import type { Project } from '../../shared/contracts/workspace';
import { useLatest } from '../../shared/hooks/useLatest';
import type { useEditorActions } from './useEditorActions';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';
import type { useWorkspaceState } from './useWorkspaceState';
const colors = ['#b8ee86', '#c4a0ed', '#8bbbf5', '#f1b17f', '#f38ea2'];
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'opening'
  | 'notify'
  | 'latest'
  | 'confirm'
  | 'setProject'
  | 'setFiles'
  | 'setActive'
  | 'setDiffTabs'
  | 'setActiveDiffId'
  | 'setWorktreesOpen'
  | 'setWorktreeSeed'
  | 'setWorktreesActive'
  | 'setDirectories'
  | 'setExpanded'
  | 'setGit'
  | 'setPanes'
  | 'setPaneStates'
  | 'setAgentObservations'
  | 'setAgentUsage'
  | 'setSelectedPane'
  | 'setMaxPane'
  | 'setTerminalFull'
  | 'setRecent'
  | 'fail'
> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refreshDirectory' | 'refreshGit'> &
  Pick<ReturnType<typeof useEditorActions>, 'openFile'>;
export function useProjectActions({
  opening,
  notify,
  latest,
  confirm,
  setProject,
  setFiles,
  setActive,
  setDiffTabs,
  setActiveDiffId,
  setWorktreesOpen,
  setWorktreeSeed,
  setWorktreesActive,
  setDirectories,
  setExpanded,
  setGit,
  setPanes,
  setPaneStates,
  setAgentObservations,
  setAgentUsage,
  setSelectedPane,
  setMaxPane,
  setTerminalFull,
  setRecent,
  refreshDirectory,
  refreshGit,
  openFile,
  fail,
}: Dependencies) {
  const openProject = async (path?: string, target: OpenTarget = 'auto') => {
    if (opening.current) return;
    opening.current = true;
    try {
      if (!path) {
        if (!native) {
          notify('This is the browser preview. Run npm run desktop to open local folders.');
          return;
        }
        const { open } = await import('@tauri-apps/plugin-dialog');
        const picked = await open({
          directory: true,
          multiple: false,
          title: 'Open a project in Emdeck',
        });
        if (!picked) return;
        path = picked;
      }
      if (target === 'new' || (target === 'auto' && latest.current.project)) {
        const result = await api.openWindow(path);
        notify(
          result.reused
            ? 'Showing the existing project window.'
            : 'Project opened in a new Emdeck window.'
        );
        return;
      }
      // Native path identity includes aliases and filesystem case rules. Check
      // before asking to discard anything in this window.
      if (native && latest.current.project && (await api.focusProject(path))) {
        notify('Showing the existing project window.');
        return;
      }
      if (
        (hasUnsavedFiles(latest.current.files) || latest.current.panes.length > 0) &&
        !(await confirm(
          'Switch workspace?',
          'Unsaved edits will be discarded. Local terminals will close and remote connections in this workspace will disconnect.',
          'Switch workspace'
        ))
      )
        return;
      const result = await api.open(path);
      // Another window may claim the folder while the confirmation is open.
      if (result.kind === 'focused') {
        notify('Showing the existing project window.');
        return;
      }
      const p = result.project;
      latest.current.project = p;
      latest.current.files = [];
      latest.current.expanded = new Set();
      setProject(p);
      setFiles([]);
      setActive('');
      setDiffTabs([]);
      setActiveDiffId(null);
      setWorktreesOpen(false);
      setWorktreeSeed(null);
      setWorktreesActive(false);
      setDirectories({});
      setExpanded(new Set());
      setGit(null);
      setPanes([]);
      setPaneStates({});
      setAgentObservations({});
      setAgentUsage({});
      setSelectedPane(null);
      setMaxPane(null);
      setTerminalFull(false);
      const nextRecent = [
        p,
        ...readStored<Project[]>('relay:recent', []).filter(r => r.root !== p.root),
      ].slice(0, 8);
      setRecent(nextRecent);
      if (native) {
        store('relay:recent', nextRecent);
        rememberProject(p);
      }
      await refreshDirectory('', p);
      void refreshGit(p);
      if (!native) {
        await refreshDirectory('src', p);
        setExpanded(new Set(['src']));
        await openFile('src/app.ts', p);
        setPanes([
          {
            id: 'preview-codex',
            name: 'Codex',
            command: 'codex',
            cwd: '',
            shell: '',
            color: colors[0],
          },
          {
            id: 'preview-claude',
            name: 'Claude',
            command: 'claude',
            cwd: '',
            shell: '',
            color: colors[1],
          },
          {
            id: 'preview-shell',
            name: 'Terminal',
            command: '',
            cwd: '',
            shell: '',
            color: colors[2],
          },
        ]);
      }
      if (native) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        void getCurrentWindow().setTitle(`${p.name} — Emdeck`);
      }
    } catch (e) {
      fail(e);
    } finally {
      opening.current = false;
    }
  };
  const startupOpen = useLatest(openProject);
  useEffect(() => {
    if (!native) void startupOpen.current('/preview/hello-relay', 'current');
    else
      void api
        .startupProject()
        .then(path => {
          // A manual open during startup must not be replaced by a delayed restore.
          if (latest.current.project || opening.current) return;
          const target =
            path ?? (latest.current.settings.reopenLastProject ? lastProjectPath() : null);
          if (target) return startupOpen.current(target, 'current');
        })
        .catch(fail);
  }, [fail, latest, opening, startupOpen]);
  return { openProject };
}
