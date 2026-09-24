import type {
  GitConflict,
  MergeBlockChoice,
  MergeBlockMode,
  MergeResultBlock,
  MergeBlockAction,
} from '../../../shared/contracts/gitConflicts';
import { mapTextRanges } from '../../../shared/lib/textRanges';
import { createMergeReview } from './mergeReview';
import type { Conflict } from './conflicts';
import { hasConflictMarkers } from './conflicts';

export const mergeBlockActions = (
  blocks: MergeResultBlock[],
  conflicts: Conflict[],
  side: 'ours' | 'theirs' | 'result'
): MergeBlockAction[] =>
  blocks.flatMap<MergeBlockAction>(block => {
    const unresolved = conflicts.some(
      current => current.start >= block.from && current.end <= block.to
    );
    if (side === 'result')
      return unresolved && block.valid ? [{ at: block.from, block: block.id, choice: 'both' }] : [];
    return [
      {
        at: block.sourcePositions[side],
        block: block.id,
        choice: side,
        resolved: !unresolved,
        applied: block.accepted.includes(side),
        canAppend: !unresolved && !block.accepted.includes(side) && Boolean(block[side]),
        disabled: !block.valid,
      },
    ];
  });

export const initializeMergeBlocks = (source: GitConflict): MergeResultBlock[] => {
  const review = createMergeReview(source, source.working.content ?? '');
  return review.blocks.map((block, id) => ({
    id,
    from: block.start,
    to: block.end,
    valid: true,
    ours: block.ours,
    theirs: block.theirs,
    accepted: [],
    sourcePositions: {
      ours: review.conflictLocations[id].ours,
      theirs: review.conflictLocations[id].theirs,
    },
  }));
};

const rawPosition = (text: string, position: number) => {
  let raw = 0;
  for (let count = 0; count < position && raw < text.length; count++, raw++)
    if (text[raw] === '\r' && text[raw + 1] === '\n') raw++;
  return raw;
};

export const applyMergeBlock = (
  content: string,
  blocks: MergeResultBlock[],
  id: number,
  choice: MergeBlockChoice,
  mode: MergeBlockMode = 'replace'
): { content: string; blocks: MergeResultBlock[] } | null => {
  const block = blocks.find(block => block.id === id);
  if (
    !block?.valid ||
    (mode === 'append' && (choice === 'both' || block.accepted.includes(choice)))
  )
    return null;
  const normalized = content.replace(/\r\n/g, '\n');
  if (block.from < 0 || block.to < block.from || block.to > normalized.length) return null;
  const selected = choice === 'both' ? block.ours + block.theirs : block[choice];
  const previous = normalized.slice(block.from, block.to);
  if (mode === 'append' && hasConflictMarkers(previous)) return null;
  if (mode === 'append' && !selected) return null;
  const insert =
    mode === 'append'
      ? previous + (previous && !previous.endsWith('\n') ? '\n' : '') + selected
      : selected;
  const mapped = mapTextRanges(blocks, [
    { from: block.from, to: block.to, insertedLength: insert.length },
  ]);
  const accepted: MergeResultBlock['accepted'] =
    choice === 'both'
      ? ['ours', 'theirs']
      : mode === 'append'
        ? [...block.accepted, choice]
        : [choice];
  return {
    content:
      content.slice(0, rawPosition(content, block.from)) +
      insert.replace(/\n/g, content.includes('\r\n') ? '\r\n' : '\n') +
      content.slice(rawPosition(content, block.to)),
    blocks: mapped.map(item =>
      item.id === id
        ? { ...item, from: block.from, to: block.from + insert.length, accepted }
        : item
    ),
  };
};

export const sameMergeSides = (
  a: Pick<GitConflict, 'ours' | 'theirs'>,
  b: Pick<GitConflict, 'ours' | 'theirs'>
) =>
  a.ours.content === b.ours.content &&
  a.theirs.content === b.theirs.content &&
  a.ours.exists === b.ours.exists &&
  a.theirs.exists === b.theirs.exists;
