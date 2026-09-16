import { api } from '../../platform/desktop/api';
import type { useWorkspaceState } from './useWorkspaceState';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';

type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  'latest' | 'gitLock' | 'setGitBusy' | 'confirm' | 'notify' | 'fail'
> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refresh'>;

export function useDiscardActions({
  latest,
  gitLock,
  setGitBusy,
  confirm,
  notify,
  fail,
  refresh,
}: Dependencies) {
  const checkEditors = (root: string, paths: string[]) => {
    if (latest.current.project?.root !== root)
      throw new Error('The project changed. Reopen Source Control and try again.');
    const affected = new Set(paths);
    const unsaved = latest.current.files.find(
      file => affected.has(file.path) && file.content !== file.saved
    );
    if (unsaved)
      throw new Error(
        `Save or close the unsaved editor tab for ${unsaved.path} before discarding changes.`
      );
  };

  const discardChanges = async (paths: string[]) => {
    const root = latest.current.project?.root;
    if (!root || gitLock.current || !paths.length) return;
    gitLock.current = true;
    setGitBusy(true);
    try {
      checkEditors(root, paths);
      const plan = await api.previewDiscard(root, paths);
      const affected = plan.files.map(file => file.path);
      checkEditors(root, affected);
      const description = [
        'Discard staged and unstaged changes in the files below. Tracked files return to the last commit. Added files and renamed destinations marked “Remove” will be deleted from disk.',
        'Untracked files are kept. This cannot be undone through Git.',
        ...plan.files.map(
          file => `${file.effect === 'remove' ? 'Remove' : 'Restore'}: ${file.path}`
        ),
      ].join('\n\n');
      if (
        !(await confirm(
          paths.length === 1
            ? 'Discard changes to this file?'
            : `Discard changes to ${paths.length} files?`,
          description,
          'Discard changes',
          true
        ))
      )
        return;
      // Recheck after confirmation: editors and even the open project may have changed.
      checkEditors(root, affected);
      await api.discard(root, { paths: plan.paths, revision: plan.revision });
      notify(`Discarded changes to ${paths.length} ${paths.length === 1 ? 'file' : 'files'}.`);
    } catch (error) {
      fail(error);
    } finally {
      gitLock.current = false;
      setGitBusy(false);
      await refresh();
    }
  };

  return { discardChanges };
}
