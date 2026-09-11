import {
  Archive,
  Check,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitMerge,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import type { Change, GitSnapshot } from '../../../shared/contracts/workspace';
import { basename } from '../../../shared/lib/paths';
import { FileIcon } from '../../../shared/ui/FileIcon';
import { BranchStatus } from './BranchStatus';
interface Props {
  git: GitSnapshot | null;
  busy: boolean;
  onRefresh: () => void;
  onAction: (action: string, value: string, original?: string | null) => Promise<void>;
  onBranchAction: (action: string) => void;
  onOpen: (path: string) => void;
  onDiff: (path: string, staged: boolean) => void;
  onBranches: () => void;
  onWorktrees: () => void;
  onResolve: (path?: string) => void;
  selected: string[];
  onSelect: (path: string, picked: boolean) => void;
  onShelve: () => void;
  onShelves: () => void;
}
export default function GitPanel({
  git,
  busy,
  onRefresh,
  onAction,
  onBranchAction,
  onOpen,
  onDiff,
  onBranches,
  onWorktrees,
  onResolve,
  selected,
  onSelect,
  onShelve,
  onShelves,
}: Props) {
  const handleBranchActionClick = () => onBranchAction('fetch');
  const handleBranchActionClick2 = () => onBranchAction('push');
  const handleBranchActionClick3 = () => onBranchAction('continue');
  const handleBranchActionClick4 = () => onBranchAction('abort');
  const handleActionSubmit: React.ComponentProps<'form'>['onSubmit'] = e => {
    e.preventDefault();
    void onAction('commit', message)
      .then(() => setMessage(''))
      .catch(() => {});
  };
  const handleCommitMessageChange: React.ComponentProps<'textarea'>['onChange'] = e =>
    setMessage(e.target.value);
  const [message, setMessage] = useState('');
  const handleResolve = () => onResolve();
  const conflicted = git?.changes.filter(change => change.conflict) ?? [];
  const staged = git?.changes.filter(c => ![' ', '?'].includes(c.index) && !c.conflict) ?? [];
  const working =
    git?.changes.filter(c => !c.conflict && (c.working !== ' ' || c.index === '?')) ?? [];
  const render = (change: Change, isStaged: boolean) => {
    const handleOpenClick = () =>
      change.conflict
        ? onResolve(change.path)
        : change.index === '?'
          ? onOpen(change.path)
          : onDiff(change.path, isStaged);
    const handleOpenFileClick = () =>
      change.conflict ? onResolve(change.path) : onOpen(change.path);
    const handleActionClick = () =>
      change.conflict
        ? onResolve(change.path)
        : void onAction(isStaged ? 'unstage' : 'stage', change.path, change.originalPath);
    const handleSelectChange: React.ComponentProps<'input'>['onChange'] = e =>
      onSelect(change.path, e.target.checked);
    return (
      <div className='change-row' key={change.path}>
        {!change.conflict && (
          <input
            type='checkbox'
            className='change-select'
            aria-label={`Select ${isStaged ? 'staged ' : ''}${change.path}`}
            checked={selected.includes(change.path)}
            onChange={handleSelectChange}
          />
        )}
        <button className='change-file' title={change.path} onClick={handleOpenClick}>
          <FileIcon path={change.path} />
          <span className='truncate'>{basename(change.path)}</span>
          <span className={`git-letter ${change.conflict ? 'conflict' : ''}`}>
            {change.conflict
              ? '!'
              : isStaged
                ? change.index
                : change.working === '?'
                  ? 'U'
                  : change.working}
          </span>
        </button>
        <button
          className='icon-button'
          title={change.conflict ? 'Resolve file' : 'Open file'}
          onClick={handleOpenFileClick}
        >
          <FileDiff size={13} />
        </button>
        <button
          disabled={busy}
          className='icon-button'
          title={isStaged ? 'Unstage file' : change.conflict ? 'Resolve conflict' : 'Stage file'}
          onClick={handleActionClick}
        >
          {change.conflict ? (
            <GitMerge size={13} />
          ) : isStaged ? (
            <Minus size={13} />
          ) : (
            <Plus size={13} />
          )}
        </button>
      </div>
    );
  };
  return (
    <>
      <div className='sidebar-heading'>
        <span>SOURCE CONTROL</span>
        <span className='spacer' />
        <button disabled={busy} className='icon-button' title='Refresh Git' onClick={onRefresh}>
          <RefreshCw size={14} className={busy ? 'spinning' : ''} />
        </button>
      </div>
      {!git?.available ? (
        <div className='sidebar-empty'>
          <GitBranch size={28} />
          <h3>{git ? 'Your repository, connected.' : 'Reading repository…'}</h3>
          <p>{git?.message || 'Git runs only when needed.'}</p>
        </div>
      ) : (
        <div className='git-content'>
          <button className='git-current' onClick={onBranches}>
            <GitBranch size={16} />
            <strong>{git.branch}</strong>
            <BranchStatus
              branch={git.branchDetails?.find(b => b.reference === `refs/heads/${git.branch}`)}
            />
            <span>Manage</span>
          </button>
          <div className='git-sync-actions'>
            <button
              className='button secondary'
              disabled={busy || !git.remotes?.length}
              onClick={handleBranchActionClick}
            >
              Fetch
            </button>
            <button
              className='button secondary'
              disabled={
                busy ||
                Boolean(git.operation) ||
                !git.remotes?.length ||
                !git.localBranches.includes(git.branch)
              }
              onClick={handleBranchActionClick2}
            >
              Push…
            </button>
          </div>
          {git.operation && (
            <div className='git-operation' role='status'>
              <strong>{git.operation} in progress</strong>
              <p>Resolve conflicted files in the merge dialog, then continue.</p>
              <div className='git-sync-actions'>
                <button
                  className='button primary'
                  disabled={busy || git.changes.some(c => c.conflict)}
                  onClick={handleBranchActionClick3}
                >
                  Continue {git.operation}
                </button>
                <button
                  className='button secondary'
                  disabled={busy}
                  onClick={handleBranchActionClick4}
                >
                  Abort…
                </button>
              </div>
            </div>
          )}
          {conflicted.length > 0 && (
            <>
              <button
                className='button secondary git-resolve-all'
                disabled={busy}
                onClick={handleResolve}
              >
                <GitMerge size={14} /> Resolve conflicts… ({conflicted.length})
              </button>
              <div className='git-group-title'>
                MERGE CONFLICTS<span>{conflicted.length}</span>
              </div>
              {conflicted.map(change => render(change, false))}
            </>
          )}
          <button className='git-worktrees' onClick={onWorktrees}>
            <GitFork size={15} />
            Worktrees<span>Manage</span>
          </button>
          <div className='git-sync-actions'>
            <button
              className='button secondary'
              disabled={busy || selected.length === 0}
              title='Shelve selected changes'
              onClick={onShelve}
            >
              <Archive size={14} />
              Shelve
            </button>
            <button className='button secondary' title='Shelved changes' onClick={onShelves}>
              Shelved changes
            </button>
          </div>
          <form className='commit-form' onSubmit={handleActionSubmit}>
            <textarea
              aria-label='Commit message'
              placeholder='Message for your next commit…'
              value={message}
              onChange={handleCommitMessageChange}
              rows={3}
            />
            <button
              type='submit'
              className='button primary'
              disabled={busy || Boolean(git.operation) || !staged.length || !message.trim()}
            >
              <Check size={14} />
              Commit staged changes
            </button>
          </form>
          <div className='git-group-title'>
            STAGED CHANGES<span>{staged.length}</span>
          </div>
          {staged.map(c => render(c, true))}
          {!staged.length && <p className='empty-caption'>Stage files to prepare a commit.</p>}
          <div className='git-group-title'>
            CHANGES<span>{working.length}</span>
          </div>
          {working.map(c => render(c, false))}
          {!working.length && <p className='empty-caption'>Working tree is clean.</p>}
          <div className='git-group-title history-title'>RECENT COMMITS</div>
          {git.commits.map(c => (
            <div className='commit-item' key={c.hash}>
              <GitCommitHorizontal size={14} />
              <div>
                <strong>{c.subject}</strong>
                <small>
                  <code>{c.hash}</code> · {c.age}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
