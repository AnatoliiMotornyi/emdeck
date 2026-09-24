import { Check, GitMerge, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ConflictPort, MergeEditorProps } from '../../../shared/contracts/gitConflicts';
import { Modal } from '../../../shared/ui/Dialog';
import { useConflictResolution } from '../hooks/useConflictResolution';
import ConflictFooter from './ConflictFooter';
import MergeVersions from './MergeVersions';

interface Props {
  paths: string[];
  initialPath?: string;
  operation?: string | null;
  port: ConflictPort;
  renderEditor: (props: MergeEditorProps) => ReactNode;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
}

export default function ConflictResolver({
  paths,
  initialPath,
  operation,
  port,
  renderEditor,
  onDirtyChange,
  onClose,
}: Props) {
  const model = useConflictResolution({ paths, initialPath, port, onDirtyChange, onClose });
  const { draft, selected, remaining, loading, saving, error } = model;
  const source = draft?.source;
  const handleOurs = () => void model.resolve('ours');
  const handleTheirs = () => void model.resolve('theirs');
  const handleSave = () => void model.resolve('manual');
  const disabled = loading || saving || !source;
  return (
    <Modal title='Resolve merge conflicts' onClose={model.close} className='conflict-modal'>
      <p className='merge-summary' role='status'>
        <GitMerge size={16} /> {remaining.length} file{remaining.length === 1 ? '' : 's'} remaining
        <span>Accepting a version or saving a result marks that file resolved and stages it.</span>
      </p>
      {operation === 'rebase' && (
        <p className='merge-rebase-note'>
          During a rebase, Ours is the destination branch and Theirs is the commit being replayed.
        </p>
      )}
      <div className='conflict-layout'>
        <nav className='conflict-files' aria-label='Conflicted files'>
          {remaining.map(path => {
            const handleSelect = () => model.select(path);
            return (
              <button
                key={path}
                aria-current={selected === path ? 'true' : undefined}
                title={path}
                disabled={saving}
                onClick={handleSelect}
              >
                <GitMerge size={14} />
                <span>{path}</span>
              </button>
            );
          })}
          {!remaining.length && (
            <p className='merge-placeholder'>
              <Check size={16} /> All files resolved
            </p>
          )}
        </nav>
        <div className='conflict-detail' aria-busy={loading || saving}>
          {selected ? (
            <>
              <div className='merge-file-heading'>
                <strong>{selected}</strong>
                <button
                  className='button secondary'
                  disabled={loading || saving}
                  onClick={model.reloadVersions}
                >
                  <RefreshCw size={13} /> Reload versions
                </button>
              </div>
              {error && (
                <p className='merge-error' role='alert'>
                  {error}
                </p>
              )}
              {loading && <p className='merge-placeholder'>Loading conflict versions…</p>}
              {source && (
                <>
                  <div className='merge-actions'>
                    <button className='button secondary' disabled={disabled} onClick={handleOurs}>
                      Accept Ours{source.ours.exists ? '' : ' (delete file)'}
                    </button>
                    <button className='button secondary' disabled={disabled} onClick={handleTheirs}>
                      Accept Theirs{source.theirs.exists ? '' : ' (delete file)'}
                    </button>
                    <button
                      className='button primary'
                      disabled={disabled || !source.manualAllowed}
                      aria-pressed={draft.manual}
                      onClick={model.startManual}
                    >
                      Merge manually
                    </button>
                  </div>
                  <MergeVersions
                    source={source}
                    content={draft.content}
                    blocks={draft.blocks}
                    onResolve={model.applyBlock}
                    manual={draft.manual}
                    busy={saving || loading}
                    onChange={model.change}
                    onSave={handleSave}
                    renderEditor={renderEditor}
                  />
                </>
              )}
            </>
          ) : (
            <div className='merge-complete'>
              <Check size={32} />
              <h3>All conflicts resolved</h3>
              <p>
                {operation
                  ? `Close this dialog, review the staged changes, then continue the ${operation} in Source Control.`
                  : 'Close this dialog and review the staged changes.'}
              </p>
            </div>
          )}
        </div>
      </div>
      <ConflictFooter model={model} onSave={handleSave} />
    </Modal>
  );
}
