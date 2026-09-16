import { hasUnsavedFiles } from '../../features/editor/services/documents';
import { hasConflictMarkers } from '../../features/git/services/conflicts';
import { qualifyRef, shortRef } from '../../features/git/services/references';
import { api } from '../../platform/desktop/api';
import type { AgentCommand, BranchRequest } from '../../shared/contracts/workspace';
import type { useEditorActions } from './useEditorActions';
import type { useTabActions } from './useTabActions';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';
import type { useWorkspaceState } from './useWorkspaceState';
import type { useConflictActions } from './useConflictActions';
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'project'
  | 'gitLock'
  | 'files'
  | 'notify'
  | 'confirm'
  | 'git'
  | 'setGitBusy'
  | 'setBranchMenu'
  | 'fail'
  | 'setDiffTabs'
  | 'setActiveDiffId'
  | 'setWorktreesActive'
  | 'setTerminalFull'
  | 'setWorktreeSeed'
  | 'latest'
  | 'ask'
  | 'setSidebar'
  | 'setSidebarVisible'
> &
  Pick<ReturnType<typeof useEditorActions>, 'saveFile' | 'openFile'> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refresh'> &
  Pick<ReturnType<typeof useTabActions>, 'showWorktrees'> &
  Pick<ReturnType<typeof useConflictActions>, 'showConflicts'>;
export function useGitActions({
  project,
  gitLock,
  files,
  notify,
  confirm,
  saveFile,
  openFile,
  git,
  setGitBusy,
  setBranchMenu,
  fail,
  refresh,
  setDiffTabs,
  setActiveDiffId,
  setWorktreesActive,
  setTerminalFull,
  setWorktreeSeed,
  showWorktrees,
  latest,
  ask,
  setSidebar,
  setSidebarVisible,
  showConflicts,
}: Dependencies) {
  const gitAction = async (action: string, value: string, original: string | null = null) => {
    if (!project || gitLock.current) return;
    try {
      if (
        ['switch', 'create', 'merge', 'checkout-remote', 'merge-remote'].includes(action) &&
        hasUnsavedFiles(files)
      ) {
        notify('Save or close unsaved files before changing branches.', true);
        return;
      }
      if (action === 'stage') {
        const f = files.find(f => f.path === value);
        if (f && f.content !== f.saved) {
          if (
            !(await confirm(
              'Save before staging?',
              'This file has unsaved edits. Save the editor version and stage it.',
              'Save and stage'
            ))
          )
            return;
          await saveFile(value, false);
        }
        try {
          const data = await api.read(project.root, value);
          if (hasConflictMarkers(data.content)) {
            notify('Resolve all conflict markers before staging this file.', true);
            return;
          }
        } catch (e) {
          if (String(e).includes('EXTERNAL_CHANGE'))
            throw e; /* Deleted and binary files can also be staged. */
        }
      }
      if (
        action === 'delete' &&
        !(await confirm(
          `Delete branch ${value}?`,
          'Git will refuse to delete a branch with unmerged work.',
          'Delete branch',
          true
        ))
      )
        return;
      if (
        (action === 'merge' || action === 'merge-remote') &&
        !(await confirm(
          `Merge ${action === 'merge-remote' ? 'remote' : 'local'} branch ${value} into ${git?.branch}?`,
          'Git may create a merge commit. Conflicted files will appear in Source Control.',
          'Merge branch'
        ))
      )
        return;
      gitLock.current = true;
      setGitBusy(true);
      setBranchMenu(false);
      const output = await api.gitAction(project.root, action, value, original);
      notify(output.trim() || 'Git operation completed.');
    } catch (e) {
      fail(e);
      if (action === 'commit') throw e;
    } finally {
      gitLock.current = false;
      setGitBusy(false);
      const result = await refresh();
      if (
        ['merge', 'merge-remote'].includes(action) &&
        result?.changes.some(change => change.conflict)
      )
        showConflicts();
    }
  };
  const branchAction = async (action: string, reference: string) => {
    if (!project || !git || gitLock.current) return;
    if (action === 'compare' || action === 'diff-working') {
      const comparison = {
        base: reference,
        head: git.localBranches.includes(git.branch) ? `refs/heads/${git.branch}` : 'HEAD',
        working: action === 'diff-working',
      };
      const path = `${shortRef(reference)} → ${comparison.working ? 'Working Tree' : git.branch}`;
      const id = JSON.stringify(comparison);
      setDiffTabs(tabs =>
        tabs.some(tab => tab.id === id)
          ? tabs.map(tab => (tab.id === id ? { ...tab, revision: tab.revision + 1 } : tab))
          : [...tabs, { id, path, staged: false, revision: 0, comparison }]
      );
      setActiveDiffId(id);
      setWorktreesActive(false);
      setTerminalFull(false);
      setBranchMenu(false);
      return;
    }
    if (action === 'worktree') {
      setWorktreeSeed(old => ({ reference, revision: (old?.revision ?? 0) + 1 }));
      showWorktrees();
      return;
    }
    if (
      [
        'checkout',
        'create-from',
        'checkout-update',
        'checkout-rebase',
        'merge',
        'rebase',
        'continue',
        'abort',
        'update',
        'sync',
      ].includes(action) &&
      hasUnsavedFiles(latest.current.files)
    ) {
      notify('Save or close unsaved files before changing branches.', true);
      return;
    }
    gitLock.current = true;
    const request: BranchRequest = { action, reference, expectedCurrent: git.branch };
    const name = shortRef(reference);
    const detail = git.branchDetails?.find(b => b.reference === reference);
    let attempted = false;
    try {
      if (action === 'create-from' || action === 'rename') {
        const data = await ask({
          title: action === 'rename' ? `Rename '${name}'` : `New Branch from '${name}'`,
          description:
            action === 'rename'
              ? 'Rename this local branch. Its remote branch keeps its current name.'
              : `Create and check out a new local branch starting at ${name}.`,
          fields: [
            {
              name: 'name',
              label: 'Branch name',
              value: action === 'rename' ? name : '',
              placeholder: 'feature/my-next-idea',
            },
          ],
          submit: action === 'rename' ? 'Rename branch' : 'Create branch',
        });
        if (!data) return;
        request.name = data.name.trim();
      }
      if (action === 'push') {
        const remotes = git.remotes ?? [];
        if (!remotes.length) {
          notify('Add a Git remote before pushing.', true);
          return;
        }
        const data = await ask({
          title: `Push '${name}'`,
          description: `Publish commits from ${name} to the destination below and track that branch. Git will reject a push that would overwrite remote commits.`,
          fields: [
            {
              name: 'remote',
              label: 'Remote',
              value: remotes.includes(detail?.remote ?? '')
                ? detail!.remote!
                : remotes.includes('origin')
                  ? 'origin'
                  : remotes[0],
              options: remotes.map(value => ({ value, label: value })),
            },
            {
              name: 'name',
              label: 'Remote branch',
              value: detail?.remoteRef?.replace(/^refs\/heads\//, '') ?? name,
            },
          ],
          submit: 'Push commits',
        });
        if (!data) return;
        request.remote = data.remote;
        request.name = data.name.trim();
      }
      if (action === 'track') {
        const options = [
          { value: '', label: 'No tracked branch' },
          ...git.remoteBranches.map(branch => ({
            value: `refs/remotes/${branch}`,
            label: branch,
          })),
          ...git.localBranches
            .filter(branch => branch !== name)
            .map(branch => ({ value: `refs/heads/${branch}`, label: `${branch} (local)` })),
        ];
        const data = await ask({
          title: `Tracked branch for '${name}'`,
          description:
            'Incoming and outgoing indicators compare this branch with its tracked branch.',
          fields: [
            {
              name: 'name',
              label: 'Tracked branch',
              value:
                detail?.upstream && options.some(option => option.value === detail.upstream)
                  ? detail.upstream
                  : '',
              optional: true,
              options,
            },
          ],
          submit: 'Save tracking',
        });
        if (!data || (!data.name && !detail?.upstream)) return;
        request.name = data.name;
      }
      if (
        action === 'delete' &&
        !(await confirm(
          `Delete local branch '${name}'?`,
          'Git will refuse to delete a checked-out branch or a branch with unmerged work. The remote branch is kept.',
          'Delete branch',
          true
        ))
      )
        return;
      if (
        action === 'merge' &&
        !(await confirm(
          `Merge '${name}' into '${git.branch}'?`,
          'Git may create a merge commit. Resolve conflicts in Source Control, then continue or abort the merge.',
          'Merge branch'
        ))
      )
        return;
      if (action === 'rebase' || action === 'checkout-rebase') {
        const moved = action === 'rebase' ? git.branch : name;
        const onto = action === 'rebase' ? name : git.branch;
        if (
          !(await confirm(
            `Rebase '${moved}' onto '${onto}'?`,
            `This rewrites commits on ${moved}. ${action === 'checkout-rebase' ? `Emdeck will check out ${name} first. ` : ''}If conflicts occur, resolve them in Source Control and continue or abort.`,
            'Rebase branch'
          ))
        )
          return;
      }
      if (
        action === 'abort' &&
        !(await confirm(
          `Abort ${git.operation}?`,
          'Restore the state from before this Git operation. Conflict-resolution edits made during the operation will be discarded.',
          'Abort operation',
          true
        ))
      )
        return;
      if (latest.current.project?.root !== project.root) return;
      setGitBusy(true);
      if (action !== 'fetch') setBranchMenu(false);
      attempted = true;
      const output = await api.branchAction(project.root, request);
      notify(
        output.trim() ||
          (action === 'fetch'
            ? 'Fetch completed. Branch indicators are refreshed.'
            : 'Git operation completed.')
      );
    } catch (error) {
      fail(error);
      if (['merge', 'rebase', 'checkout-rebase', 'continue', 'sync'].includes(action)) {
        setSidebar('git');
        setSidebarVisible(true);
      }
    } finally {
      gitLock.current = false;
      setGitBusy(false);
      if (attempted) {
        const result = await refresh();
        if (
          [
            'merge',
            'rebase',
            'checkout-rebase',
            'checkout-update',
            'update',
            'continue',
            'sync',
          ].includes(action) &&
          result?.changes.some(change => change.conflict)
        )
          showConflicts();
      }
    }
  };
  const createBranch = async () => {
    setBranchMenu(false);
    const data = await ask({
      title: 'Create branch',
      description: 'Create and switch to a branch from your current HEAD.',
      fields: [{ name: 'name', label: 'Branch name', placeholder: 'feature/my-next-idea' }],
      submit: 'Create branch',
    });
    if (data) await gitAction('create', data.name);
  };
  // Agents address paths from the pane's own directory, which is relative to the root.
  const runAgentCommand = async (command: AgentCommand, cwd: string) => {
    if (command.op === 'openFile') {
      let relative = command.path.replace(/^\.\//, '');
      const target = command.line ? { line: command.line, column: command.column } : undefined;
      // Compilers and agents print absolute paths, which only resolve inside this project.
      if (/^(\/|[A-Za-z]:[\\/])/.test(relative)) {
        const root = project?.root.replace(/[\\/]$/, '') ?? '';
        if (!root || !relative.startsWith(root))
          throw new Error(`'${relative}' is outside this project.`);
        relative = relative.slice(root.length).replace(/^[\\/]+/, '');
      }
      // A bare name cannot be resolved by joining, so search the project for it.
      if (project && !relative.includes('/')) {
        const matches = await api.find(project.root, relative);
        if (!matches.length) throw new Error(`No file named '${relative}' in this project.`);
        if (matches.length > 1) notify(`Opened ${matches[0]} of ${matches.length} matches.`);
        await openFile(matches[0], undefined, target);
        return;
      }
      const resolved = cwd ? `${cwd.replace(/\/$/, '')}/${relative}` : relative;
      if (resolved.split('/').some(part => part === '..'))
        throw new Error(`'${resolved}' points outside the project.`);
      await openFile(resolved, undefined, target);
      return;
    }
    if (!project || !git) throw new Error('Open a Git project before requesting a diff.');
    if (gitLock.current) throw new Error('Emdeck is busy with another Git operation.');
    const reference = qualifyRef(command.reference, git.localBranches, git.remoteBranches);
    if (!reference) throw new Error(`No branch named '${command.reference}'.`);
    await branchAction(command.working ? 'diff-working' : 'compare', reference);
  };
  return { gitAction, branchAction, createBranch, runAgentCommand };
}
