import { invertedEffects } from '@codemirror/commands';
import { StateEffect, StateField } from '@codemirror/state';
import type { MergeResultBlock } from '../../../shared/contracts/gitConflicts';
import { mapTextRanges } from '../../../shared/lib/textRanges';
import type { TextEdit } from '../../../shared/lib/textRanges';

export const setMergeBlocks = StateEffect.define<MergeResultBlock[]>();
export const mergeBlocksField = StateField.define<MergeResultBlock[]>({
  create: () => [],
  update: (blocks, transaction) => {
    const edits: TextEdit[] = [];
    transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
      edits.push({ from, to, insertedLength: inserted.length });
    });
    let next = mapTextRanges(blocks, edits);
    for (const effect of transaction.effects) if (effect.is(setMergeBlocks)) next = effect.value;
    return next;
  },
});

// Undo/redo must restore block boundaries and accepted sides with their text,
// including grouped typing and edits that temporarily remove multiple blocks.
export const mergeBlockHistory = invertedEffects.of(transaction =>
  transaction.docChanged || transaction.effects.some(effect => effect.is(setMergeBlocks))
    ? [setMergeBlocks.of(transaction.startState.field(mergeBlocksField))]
    : []
);
