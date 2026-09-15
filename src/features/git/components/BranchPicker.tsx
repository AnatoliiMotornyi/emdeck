import { Download, GitFork, Plus, RefreshCw, Upload, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GitSnapshot } from '../../../shared/contracts/workspace';
import { branchTree } from '../services/branchTree';
import { shortRef } from '../services/references';
import { BranchStatus } from './BranchStatus';
import BranchTree from './BranchTree';
interface Props {
  git: GitSnapshot | null;
  busy: boolean;
  onRefresh: () => void;
  onAction: (action: string, reference: string) => void;
  onCreate: () => void;
  onWorktrees: () => void;
  onResolve: () => void;
}
export default function BranchPicker({
  git,
  busy,
  onRefresh,
  onAction,
  onCreate,
  onWorktrees,
  onResolve,
}: Props) {
  const handleBranchesKeyDown: React.ComponentProps<'div'>['onKeyDown'] = e => {
    const inSubmenu = submenu.current?.contains(e.target as Node);
    if ((e.key === 'Escape' || (e.key === 'ArrowLeft' && inSubmenu)) && selected) {
      e.preventDefault();
      e.stopPropagation();
      back();
    }
    if (inSubmenu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const buttons = [
        ...(selectedMenu.current?.querySelectorAll<HTMLButtonElement>(
          'button[role="menuitem"]:not(:disabled)'
        ) ?? []),
      ];
      if (!buttons.length) return;
      e.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus();
    }
  };
  const handleFetchAllRemotesAndClick = () => onAction('fetch', '');
  const handleFastForwardTheCurrentClick = () => onAction('update', currentRef);
  const handleActionClick = () => onAction('push', currentRef);
  const handleFilterBranchesFocus = () => setSelected(null);
  const handleFilterBranchesChange: React.ComponentProps<'input'>['onChange'] = e => {
    setSelected(null);
    setQuery(e.target.value);
    setExpanded({});
  };
  const handleSelectedScroll = () => setSelected(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const rootMenu = useRef<HTMLDivElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const selectedMenu = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hoverTimer.current), [selected, query, expanded]);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    submenuLeft: number;
    submenuTop: number;
    submenuWidth: number;
  } | null>(null);
  const id = useId();
  const local = useMemo(
    () => branchTree(git?.localBranches ?? [], query),
    [git?.localBranches, query]
  );
  const remote = useMemo(
    () => branchTree(git?.remoteBranches ?? [], query, 'remote'),
    [git?.remoteBranches, query]
  );
  const details = useMemo(
    () => new Map(git?.branchDetails?.map(b => [b.reference, b])),
    [git?.branchDetails]
  );
  const currentRef = `refs/heads/${git?.branch}`;
  const currentDetail = details.get(currentRef);
  const currentExists = git?.localBranches.includes(git.branch);
  const info = selected ? details.get(selected) : undefined;
  const isLocal = selected?.startsWith('refs/heads/');
  const isCurrent = selected === currentRef;
  const targetName = shortRef(selected ?? '');
  const operating = Boolean(git?.operation);
  useLayoutEffect(() => {
    function place() {
      const root = rootMenu.current;
      const anchor = root?.parentElement?.getBoundingClientRect();
      if (!root || !anchor) return;
      const margin = 8,
        gap = 6;
      const width = Math.min(360, window.innerWidth - margin * 2);
      const submenuWidth = Math.min(420, window.innerWidth - width - gap - margin * 2);
      let left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
      let submenuLeft = left + width + gap;
      if (selected && submenuLeft + submenuWidth > window.innerWidth - margin) {
        if (left - submenuWidth - gap >= margin) submenuLeft = left - submenuWidth - gap;
        else {
          left = Math.max(margin, window.innerWidth - width - gap - submenuWidth - margin);
          submenuLeft = left + width + gap;
        }
      }
      const top = Math.max(
        margin,
        Math.min(anchor.bottom + 6, window.innerHeight - root.offsetHeight - margin)
      );
      const row = document.getElementById(`${id}-${selected}`)?.getBoundingClientRect();
      const submenuTop = Math.max(
        margin,
        Math.min(
          row?.top ?? top,
          window.innerHeight - (submenu.current?.offsetHeight ?? 0) - margin
        )
      );
      const next = { left, top, width, submenuLeft, submenuTop, submenuWidth };
      setPosition(old => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [selected, query, expanded, git, id, position?.left, position?.width, position?.submenuWidth]);
  function select(reference: string, focus = true) {
    clearTimeout(hoverTimer.current);
    setSelected(reference);
    requestAnimationFrame(() => {
      selectedMenu.current?.scrollTo(0, 0);
      if (focus)
        selectedMenu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });
  }
  function back() {
    clearTimeout(hoverTimer.current);
    const previous = selected;
    setSelected(null);
    requestAnimationFrame(() => document.getElementById(`${id}-${previous}`)?.focus());
  }
  const action = (key: string, label: string, disabled = false, title?: string) => {
    const handleActionClick = () => selected && onAction(key, selected);
    return (
      <button
        key={key}
        role='menuitem'
        className={`menu-item ${key === 'delete' ? 'danger' : ''}`}
        disabled={
          busy || disabled || (operating && !['compare', 'diff-working', 'worktree'].includes(key))
        }
        title={title}
        onClick={handleActionClick}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      ref={rootMenu}
      className='branch-popover popover'
      style={
        position
          ? { position: 'fixed', left: position.left, top: position.top, width: position.width }
          : undefined
      }
      role='region'
      aria-label='Branches'
      onKeyDown={handleBranchesKeyDown}
    >
      <div className='popover-title'>
        BRANCHES
        <button
          className='icon-button'
          title='Refresh branches'
          disabled={busy}
          onClick={onRefresh}
        >
          <RefreshCw size={13} className={busy ? 'spinning' : ''} />
        </button>
      </div>
      {git?.available ? (
        <>
          <div className='branch-toolbar'>
            <button
              disabled={busy || !git.remotes?.length}
              title='Fetch all remotes and prune deleted remote branches'
              onClick={handleFetchAllRemotesAndClick}
            >
              <Download size={14} />
              Fetch
            </button>
            <button
              disabled={busy || operating || !currentDetail?.upstream}
              title='Fast-forward the current branch from its tracked branch'
              onClick={handleFastForwardTheCurrentClick}
            >
              <RefreshCw size={14} />
              Update
            </button>
            <button
              disabled={busy || operating || !currentExists || !git.remotes?.length}
              onClick={handleActionClick}
            >
              <Upload size={14} />
              Push…
            </button>
          </div>
          {operating && (
            <p className='branch-operation'>
              {git.operation} in progress — resolve files in Source Control.
            </p>
          )}
          {git.changes.some(change => change.conflict) && (
            <button className='button secondary branch-resolve' disabled={busy} onClick={onResolve}>
              Resolve conflicts…
            </button>
          )}
          <input
            autoFocus
            onFocus={handleFilterBranchesFocus}
            aria-label='Filter branches'
            placeholder='Find a branch…'
            value={query}
            onChange={handleFilterBranchesChange}
          />
          <div className='branch-list' onScroll={handleSelectedScroll}>
            <BranchTree
              git={git}
              busy={busy}
              local={local}
              remote={remote}
              query={query}
              expanded={expanded}
              selected={selected}
              id={id}
              currentRef={currentRef}
              details={details}
              setSelected={setSelected}
              setExpanded={setExpanded}
              select={select}
              hoverTimer={hoverTimer}
            />
          </div>
          <button
            className='menu-item branch-create'
            disabled={busy || operating}
            onClick={onCreate}
          >
            <Plus size={14} />
            Create branch…
          </button>
          <button className='menu-item' onClick={onWorktrees}>
            <GitFork size={14} />
            Manage worktrees…
          </button>

          {selected &&
            createPortal(
              <div
                ref={submenu}
                className='branch-submenu popover'
                style={{
                  left: position?.submenuLeft ?? 0,
                  top: position?.submenuTop ?? 8,
                  width: position?.submenuWidth ?? 420,
                }}
              >
                <div className='branch-selected'>
                  <strong title={targetName}>{targetName}</strong>
                  <button
                    className='icon-button branch-submenu-close'
                    title='Close branch actions'
                    onClick={back}
                  >
                    <X size={13} />
                  </button>
                  <BranchStatus branch={info} />
                  <small>
                    {isLocal
                      ? isCurrent
                        ? 'Current local branch'
                        : 'Local branch'
                      : 'Remote branch'}
                    {info?.worktree && !isCurrent ? ' · In a worktree' : ''}
                  </small>
                  {info?.upstream && (
                    <small title={shortRef(info.upstream)}>
                      Tracks {shortRef(info.upstream)}
                      {info.gone ? ' (missing)' : ''}
                    </small>
                  )}
                </div>
                <div
                  id={`${id}-actions`}
                  ref={selectedMenu}
                  className='branch-actions-menu'
                  role='menu'
                  aria-label={`Branch actions for ${targetName}`}
                >
                  {action('checkout', 'Checkout', isCurrent)}
                  {action('create-from', `New Branch from '${targetName}'…`)}
                  {!isCurrent &&
                    action(
                      'checkout-rebase',
                      `Checkout and Rebase onto '${git.branch}'`,
                      !currentExists
                    )}
                  {!isCurrent &&
                    action(
                      'checkout-update',
                      'Checkout and Update',
                      Boolean(isLocal && !info?.upstream)
                    )}
                  <hr />
                  {action('compare', `Compare with '${git.branch}'`, isCurrent)}
                  {action('diff-working', 'Show Diff with Working Tree')}
                  {!isCurrent && (
                    <>
                      <hr />
                      {action(
                        'rebase',
                        `Rebase '${git.branch}' onto '${targetName}'`,
                        !currentExists
                      )}
                      {action(
                        'merge',
                        `Merge '${targetName}' into '${git.branch}'`,
                        !currentExists
                      )}
                    </>
                  )}
                  <hr />
                  {action('worktree', `New Worktree from '${targetName}'…`)}
                  {isLocal && (
                    <>
                      <hr />
                      {action(
                        'update',
                        'Update',
                        !info?.upstream,
                        'Fetch and fast-forward this branch. Your current branch stays selected.'
                      )}
                      {action('push', 'Push…', !git.remotes?.length)}
                      {action(
                        'track',
                        `Tracked Branch${info?.upstream ? ` '${shortRef(info.upstream)}'` : ''}…`
                      )}
                      <hr />
                      {action('rename', 'Rename…')}
                      {action('delete', 'Delete', isCurrent || Boolean(info?.worktree))}
                    </>
                  )}
                </div>
              </div>,
              document.body
            )}
          <p className='branch-hint'>
            <span className='branch-incoming'>↓ Incoming</span> · ↑ Outgoing · Relative to tracked
            branch, as of last fetch.
          </p>
        </>
      ) : (
        <p className='popover-note'>
          {git?.message || 'Open a Git repository to manage branches.'}
        </p>
      )}
    </div>
  );
}
