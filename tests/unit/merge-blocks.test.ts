import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { Transaction } from '@codemirror/state';
import { history, isolateHistory, redo, undo } from '@codemirror/commands';
import {
  initializeMergeBlocks,
  applyMergeBlock,
} from '../../src/features/git/services/mergeBlocks';
import { mapTextRanges } from '../../src/shared/lib/textRanges';
import {
  mergeBlocksField,
  mergeBlockHistory,
  setMergeBlocks,
} from '../../src/features/editor/lib/mergeBlockHistory';
import type { GitConflict } from '../../src/shared/contracts/gitConflicts';

const marker = (ours: string, theirs: string) =>
  `<<<<<<< HEAD\n${ours}=======\n${theirs}>>>>>>> incoming\n`;
const sample = (): GitConflict => {
  const text = (content: string) => ({ exists: true, binary: false, content });
  return {
    path: 'config.ts',
    revision: 'fixture',
    manualAllowed: true,
    oursLabel: 'Ours',
    theirsLabel: 'Theirs',
    base: text('before\nbase\nmiddle\nbase\nafter\n'),
    ours: text('before\nours\nmiddle\nours\nafter\n'),
    theirs: text('before\ntheirs\nmiddle\ntheirs\nafter\n'),
    working: text(
      'before\n' +
        marker('ours\n', 'theirs\n') +
        'middle\n' +
        marker('ours\n', 'theirs\n') +
        'after\n'
    ),
  };
};

describe('persistent merge block choices', () => {
  for (const first of ['ours', 'theirs'] as const) {
    const other = first === 'ours' ? 'theirs' : 'ours';
    it(`replaces first with ${first}, then appends ${other} inside the same block`, () => {
      const file = sample();
      const initial = initializeMergeBlocks(file);
      const one = applyMergeBlock(file.working.content!, initial, 0, first)!;
      const two = applyMergeBlock(one.content, one.blocks, 0, other, 'append')!;
      expect(two.content).toBe(
        `before\n${first}\n${other}\nmiddle\n` + marker('ours\n', 'theirs\n') + 'after\n'
      );
      expect(two.blocks[0].accepted).toEqual([first, other]);
      expect(two.content.slice(two.blocks[1].from, two.blocks[1].to)).toBe(
        marker('ours\n', 'theirs\n')
      );
      expect(applyMergeBlock(two.content, two.blocks, 0, other, 'append')).toBeNull();
      const replaced = applyMergeBlock(two.content, two.blocks, 0, other)!;
      expect(replaced.content).toBe(
        `before\n${other}\nmiddle\n` + marker('ours\n', 'theirs\n') + 'after\n'
      );
      expect(replaced.blocks[0].accepted).toEqual([other]);
    });
  }

  it('preserves CRLF and handles accepting an empty side before adding the other', () => {
    const file = sample();
    file.ours.content = 'before\nmiddle\nours\nafter\n';
    file.working.content = (
      'before\n' +
      marker('', 'theirs\n') +
      'middle\n' +
      marker('ours\n', 'theirs\n') +
      'after\n'
    ).replace(/\n/g, '\r\n');
    const one = applyMergeBlock(file.working.content, initializeMergeBlocks(file), 0, 'ours')!;
    expect(one.blocks[0].from).toBe(one.blocks[0].to);
    const two = applyMergeBlock(one.content, one.blocks, 0, 'theirs', 'append')!;
    expect(two.content).toBe(
      ('before\ntheirs\nmiddle\n' + marker('ours\n', 'theirs\n') + 'after\n').replace(/\n/g, '\r\n')
    );
  });

  it('does not append into unresolved markers or apply an invalidated block', () => {
    const file = sample(),
      blocks = initializeMergeBlocks(file);
    expect(applyMergeBlock(file.working.content!, blocks, 0, 'theirs', 'append')).toBeNull();
    expect(
      applyMergeBlock(
        file.working.content!,
        blocks.map(b => ({ ...b, valid: false })),
        0,
        'ours'
      )
    ).toBeNull();
  });

  it('tracks edits inside and outside blocks, invalidating edits crossing their boundaries', () => {
    const ranges = [
      { from: 10, to: 20, valid: true },
      { from: 20, to: 30, valid: true },
    ];
    expect(mapTextRanges(ranges, [{ from: 5, to: 5, insertedLength: 4 }])).toEqual([
      { from: 14, to: 24, valid: true },
      { from: 24, to: 34, valid: true },
    ]);
    expect(mapTextRanges(ranges, [{ from: 15, to: 16, insertedLength: 3 }])).toEqual([
      { from: 10, to: 22, valid: true },
      { from: 22, to: 32, valid: true },
    ]);
    expect(mapTextRanges(ranges, [{ from: 20, to: 20, insertedLength: 4 }])).toEqual([
      { from: 10, to: 20, valid: true },
      { from: 24, to: 34, valid: true },
    ]);
    expect(
      mapTextRanges(ranges, [{ from: 15, to: 25, insertedLength: 0 }]).every(b => !b.valid)
    ).toBe(true);
  });

  it('undo and redo restore text, exact anchors and accepted sides together', () => {
    const file = sample(),
      blocks = initializeMergeBlocks(file);
    let state = EditorState.create({
      doc: file.working.content!,
      extensions: [history(), mergeBlocksField.init(() => blocks), mergeBlockHistory],
    });
    const dispatch = (transaction: Transaction) => {
      state = transaction.state;
    };
    const one = applyMergeBlock(state.sliceDoc(), blocks, 0, 'theirs')!;
    state = state.update({
      changes: { from: 0, to: state.doc.length, insert: one.content },
      effects: setMergeBlocks.of(one.blocks),
      annotations: isolateHistory.of('full'),
    }).state;
    const two = applyMergeBlock(state.sliceDoc(), one.blocks, 0, 'ours', 'append')!;
    state = state.update({
      changes: { from: 0, to: state.doc.length, insert: two.content },
      effects: setMergeBlocks.of(two.blocks),
      annotations: isolateHistory.of('full'),
    }).state;
    expect(undo({ state, dispatch })).toBe(true);
    expect(state.sliceDoc()).toBe(one.content);
    expect(state.field(mergeBlocksField)).toEqual(one.blocks);
    expect(undo({ state, dispatch })).toBe(true);
    expect(state.sliceDoc()).toBe(file.working.content);
    expect(state.field(mergeBlocksField)).toEqual(blocks);
    expect(redo({ state, dispatch })).toBe(true);
    expect(state.field(mergeBlocksField)).toEqual(one.blocks);
    state = state.update({
      changes: { from: 0, to: state.doc.length, insert: 'manual\n' },
      annotations: isolateHistory.of('full'),
    }).state;
    expect(state.field(mergeBlocksField).every(b => !b.valid)).toBe(true);
    undo({ state, dispatch });
    expect(state.field(mergeBlocksField)).toEqual(one.blocks);
  });
});
