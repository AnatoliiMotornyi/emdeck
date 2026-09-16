import { useState } from 'react';
import { conflictSummary } from '../../features/shelves/services/shelves';
import { api } from '../../platform/desktop/api';
import type { Shelf } from '../../shared/contracts/workspace';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';
import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<ReturnType<typeof useWorkspaceState>, 'project' | 'notify'> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refreshGit'>;
export function useShelfActions({ project, notify, refreshGit }: Dependencies) {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [shelvesOpen, setShelvesOpen] = useState(false);
  const [shelfBusy, setShelfBusy] = useState(false);
  const guard = async <T>(work: (root: string) => Promise<T>) => {
    if (!project || shelfBusy) return null;
    setShelfBusy(true);
    try {
      return await work(project.root);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
      return null;
    } finally {
      setShelfBusy(false);
    }
  };
  const selectChange = (path: string, picked: boolean) =>
    setSelectedChanges(current =>
      picked ? [...new Set([...current, path])] : current.filter(entry => entry !== path)
    );
  const shelveChanges = () =>
    void guard(async root => {
      await api.createShelf(root, '', selectedChanges);
      setSelectedChanges([]);
      // The tree is clean now, so Source Control must stop showing those files.
      await refreshGit();
    });
  const showShelves = () =>
    void guard(async root => {
      setShelves(await api.shelves(root));
      setShelvesOpen(true);
    });
  const unshelve = (id: string) =>
    void guard(async root => {
      const report = await api.applyShelf(root, id, false);
      const summary = conflictSummary(report);
      if (summary) notify(summary, true);
      setShelves(await api.shelves(root));
      await refreshGit();
    });
  const removeShelf = (id: string) =>
    void guard(async root => {
      await api.deleteShelf(root, id);
      setShelves(await api.shelves(root));
    });
  const closeShelves = () => setShelvesOpen(false);
  return {
    shelves,
    selectedChanges,
    shelvesOpen,
    shelfBusy,
    selectChange,
    shelveChanges,
    showShelves,
    unshelve,
    removeShelf,
    closeShelves,
  };
}
