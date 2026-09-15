import { describe, expect, it } from 'vitest';
import { createMergeReview, mapMergePosition } from '../../src/features/git/services/mergeReview';
import { conflicts, resolveConflict } from '../../src/features/git/services/conflicts';
import type { GitConflict } from '../../src/shared/contracts/gitConflicts';

const text = (content: string) => ({ exists: true, binary: false, content });
const conflict = (ours: string, theirs: string) =>
  `<<<<<<< HEAD\n${ours}=======\n${theirs}>>>>>>> incoming\n`;
const source = (base: string, ours: string, theirs: string, working: string): GitConflict => ({
  path: 'sample.ts',
  revision: 'fixture',
  base: text(base),
  ours: text(ours),
  theirs: text(theirs),
  working: text(working),
  oursLabel: 'Ours',
  theirsLabel: 'Theirs',
  manualAllowed: true,
});

describe('three-way merge review', () => {
  it('locates repeated conflict text using document context, not the first matching string', () => {
    const same = 'const repeated = 1;\n';
    const other = 'const repeated = 2;\n';
    const separator = '// unchanged separator\n';
    const working = same + separator + conflict(same, other) + separator + conflict(same, other);
    const ours = same + separator + same + separator + same;
    const theirs = same + separator + other + separator + other;
    const review = createMergeReview(source('', ours, theirs, working), working);
    expect(review.conflictLocations.map(location => location.ours)).toEqual([
      same.length + separator.length,
      2 * (same.length + separator.length),
    ]);
    expect(
      review.conflictLocations.map(location =>
        theirs.slice(location.theirs, location.theirs + other.length)
      )
    ).toEqual([other, other]);
  });

  it('shows independent changes on both sides and keeps them when resolving a later conflict', () => {
    const context = '// middle\n';
    const base =
      'const local = 0;\n' + context + 'const value = 0;\n' + context + 'const remote = 0;\n';
    const ours = base.replace('local = 0', 'local = 1').replace('value = 0', 'value = 1');
    const theirs = base.replace('remote = 0', 'remote = 2').replace('value = 0', 'value = 2');
    const working =
      'const local = 1;\n' +
      context +
      conflict('const value = 1;\n', 'const value = 2;\n') +
      context +
      'const remote = 2;\n';
    const file = source(base, ours, theirs, working);
    const review = createMergeReview(file, working);
    expect(review.blocks).toHaveLength(1);
    expect(review.locations.filter(location => location.conflict === -1)).toHaveLength(2);
    expect(review.ours.some(range => range.kind === 'ours')).toBe(true);
    expect(review.theirs.some(range => range.kind === 'theirs')).toBe(true);
    const result = resolveConflict(working, conflicts(working)[0], 'theirs');
    expect(result).toBe(
      'const local = 1;\n' + context + 'const value = 2;\n' + context + 'const remote = 2;\n'
    );
    expect(createMergeReview(file, result).blocks).toHaveLength(0);
    expect(createMergeReview(file, result).locations.length).toBeGreaterThan(0);
  });

  it('uses normalized editor offsets without changing CRLF resolution text', () => {
    const working = ('// header\n' + conflict('a\n', 'b\n')).replace(/\n/g, '\r\n');
    const file = source('// header\r\nc\r\n', '// header\r\na\r\n', '// header\r\nb\r\n', working);
    const review = createMergeReview(file, working);
    expect(review.conflictLocations[0]).toEqual({ result: 10, ours: 10, theirs: 10, conflict: 0 });
    expect(resolveConflict(working, conflicts(working)[0], 'ours')).toBe('// header\r\na\r\n');
  });

  it('handles empty sides, EOF deletions, diff3 markers and fully edited results', () => {
    const working = '<<<<<<< HEAD\n||||||| base\nold\n=======\nnew\n>>>>>>> incoming';
    const file = source('old\n', '', 'new\n', working);
    const review = createMergeReview(file, working);
    expect(review.conflictLocations[0].ours).toBe(0);
    expect(review.ours.find(range => range.kind === 'conflict')).toEqual({
      from: 0,
      to: 0,
      kind: 'conflict',
    });
    expect(createMergeReview(file, 'hand edited\n').blocks).toEqual([]);
    expect(createMergeReview(file, '').result).toEqual([{ from: 0, to: 0, kind: 'changed' }]);
  });

  it('maps insertions, deletions, equal text and both range boundaries', () => {
    const delta = [
      { fromA: 2, toA: 2, fromB: 2, toB: 5 },
      { fromA: 6, toA: 9, fromB: 9, toB: 9 },
    ];
    expect(mapMergePosition(1, delta)).toBe(1);
    expect(mapMergePosition(2, delta)).toBe(2);
    expect(mapMergePosition(2, delta, true)).toBe(5);
    expect(mapMergePosition(4, delta)).toBe(7);
    expect(mapMergePosition(8, delta)).toBe(9);
    expect(mapMergePosition(10, delta)).toBe(10);
  });
});
