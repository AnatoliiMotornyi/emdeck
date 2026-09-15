import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type {
  ConflictVersion,
  GitConflict,
  MergeEditorProps,
  MergeResultBlock,
} from '../../../shared/contracts/gitConflicts';
import { createMergeReview } from '../services/mergeReview';
import { mergeBlockActions } from '../services/mergeBlocks';
import { useMergeNavigation } from '../hooks/useMergeNavigation';

interface Props {
  source: GitConflict;
  content: string;
  blocks: MergeResultBlock[];
  onResolve: NonNullable<MergeEditorProps['onResolve']>;
  manual: boolean;
  busy: boolean;
  onChange: MergeEditorProps['onChange'];
  onSave: () => void;
  renderEditor: (props: MergeEditorProps) => ReactNode;
}
const ignoreChange = () => {};
function VersionPreview({
  label,
  version,
  editor,
}: {
  label: string;
  version: ConflictVersion;
  editor: ReactNode;
}) {
  return (
    <section className='merge-version' aria-label={label}>
      <h3>
        {label}
        <span>Read only</span>
      </h3>
      {!version.exists ? (
        <p className='merge-placeholder'>File deleted in this version</p>
      ) : version.binary ? (
        <p className='merge-placeholder'>Binary file — accept a complete version</p>
      ) : (
        <div className='merge-result-editor'>{editor}</div>
      )}
    </section>
  );
}

function AncestorPreview({ source, renderEditor }: Pick<Props, 'source' | 'renderEditor'>) {
  return (
    <details className='merge-base'>
      <summary>Common ancestor</summary>
      {source.base.exists && !source.base.binary ? (
        <div className='merge-base-editor'>
          {renderEditor({
            path: source.path,
            label: 'Common ancestor code',
            content: source.base.content ?? '',
            readOnly: true,
            highlights: [],
            onChange: ignoreChange,
            onSave: ignoreChange,
          })}
        </div>
      ) : (
        <p className='merge-placeholder'>
          {source.base.exists
            ? 'Binary common ancestor'
            : 'This file was added without a common ancestor.'}
        </p>
      )}
    </details>
  );
}

export default function MergeVersions({
  source,
  content,
  blocks,
  onResolve,
  manual,
  busy,
  onChange,
  onSave,
  renderEditor,
}: Props) {
  const review = useMemo(() => createMergeReview(source, content), [source, content]);
  const {
    navigation,
    locations,
    index,
    selectedBlock,
    reveal,
    handlePrevious,
    handleNext,
    handleScope,
    handleNavigationKey,
  } = useMergeNavigation(source.path, review, busy);
  const target = review.blocks[selectedBlock];
  const selected =
    target &&
    blocks.find(block => block.valid && block.from <= target.start && block.to >= target.end);
  const pane = (side: 'ours' | 'theirs' | 'result') =>
    renderEditor({
      path: source.path,
      label:
        side === 'result'
          ? 'Edit merged result'
          : `${side === 'ours' ? source.oursLabel : source.theirsLabel} code`,
      content: side === 'result' ? content : (source[side].content ?? ''),
      readOnly: side !== 'result' || !manual || !source.manualAllowed,
      highlights: review[side].map(range => ({
        ...range,
        selected:
          range.kind === 'conflict' &&
          selectedBlock >= 0 &&
          range.from === review.conflictLocations[selectedBlock]?.[side],
      })),
      actions: source.manualAllowed ? mergeBlockActions(blocks, review.blocks, side) : [],
      resultBlocks: side === 'result' ? blocks : undefined,
      reveal: reveal?.[side],
      onResolve,
      onChange: side === 'result' ? onChange : ignoreChange,
      onSave,
    });
  return (
    <>
      <div className='merge-navigation' inert={busy} onKeyDown={handleNavigationKey}>
        <div role='group' aria-label='Navigate merge changes'>
          <button
            className='button secondary'
            aria-label='Previous change'
            title='Previous change (Shift+F7)'
            disabled={!locations.length}
            onClick={handlePrevious}
          >
            <ArrowUp size={14} />
          </button>
          <span>
            {locations.length
              ? `${navigation.all ? 'Change' : 'Conflict'} ${index + 1} of ${locations.length}`
              : navigation.all
                ? 'No changes'
                : 'No remaining conflicts'}
          </span>
          <button
            className='button secondary'
            aria-label='Next change'
            title='Next change (F7)'
            disabled={!locations.length}
            onClick={handleNext}
          >
            <ArrowDown size={14} />
          </button>
          <button className='button secondary' aria-pressed={navigation.all} onClick={handleScope}>
            All changes
          </button>
        </div>
        <div className='merge-legend'>
          <span className='conflict'>Conflict</span>
          <span className='ours'>Ours changed</span>
          <span className='theirs'>Theirs changed</span>
          <span className='changed'>Result changed</span>
        </div>
        <p>
          Changes are compared with the common ancestor. Git’s non-conflicting changes are included
          in the initial result.
        </p>
        {blocks.some(block => !block.valid) && (
          <p className='merge-block-notice'>
            Arrows are disabled where block boundaries or source versions changed. You can undo text
            edits or finish the result manually.
          </p>
        )}
      </div>
      <div className='merge-panes manual' inert={busy} onKeyDown={handleNavigationKey}>
        <VersionPreview label={source.oursLabel} version={source.ours} editor={pane('ours')} />
        <section className='merge-result' aria-label='Merged result'>
          <h3>
            Result{' '}
            <span>
              {review.blocks.length} conflict block{review.blocks.length === 1 ? '' : 's'} remaining
              · {manual ? 'Editable' : 'Preview'}
            </span>
          </h3>
          {selectedBlock >= 0 && source.manualAllowed && (
            <div
              className='merge-block-actions'
              role='group'
              aria-label='Resolve selected conflict block'
            >
              <span>Conflict {(selected?.id ?? selectedBlock) + 1}:</span>
              {(['ours', 'theirs', 'both'] as const).map(choice => {
                const handleBlock = () => {
                  if (selected) onResolve(selected.id, choice);
                };
                return (
                  <button
                    key={choice}
                    className='button secondary'
                    disabled={!selected}
                    onClick={handleBlock}
                  >
                    Use {choice}
                  </button>
                );
              })}
            </div>
          )}
          <div className='merge-result-editor'>
            {source.manualAllowed ? (
              pane('result')
            ) : (
              <p className='merge-placeholder'>Accept a complete version for this file.</p>
            )}
          </div>
        </section>
        <VersionPreview
          label={source.theirsLabel}
          version={source.theirs}
          editor={pane('theirs')}
        />
      </div>
      <AncestorPreview source={source} renderEditor={renderEditor} />
    </>
  );
}
