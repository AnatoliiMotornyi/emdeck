import { diff } from '@codemirror/merge';
import type { Change } from '@codemirror/merge';
import type { GitConflict, MergeHighlight } from '../../../shared/contracts/gitConflicts';
import { conflicts } from './conflicts';
import type { Conflict } from './conflicts';

const normalize = (text: string) => text.replace(/\r\n/g, '\n');
const changes = (a: string, b: string) => diff(a, b, { scanLimit: 500, timeout: 30 });

// Positions in a changed span map to its boundary. Equal text outside it maps exactly.
// Mapping whole documents, rather than searching for block text, handles repeated code.
export const mapMergePosition = (position: number, delta: readonly Change[], end = false) => {
  let offset = 0;
  for (const change of delta) {
    if (position < change.fromA) break;
    if (position <= change.toA) {
      if (position === change.toA && change.fromA !== change.toA) return change.toB;
      return end ? change.toB : change.fromB;
    }
    offset = change.toB - change.toA;
  }
  return position + offset;
};

const projectSide = (content: string, blocks: Conflict[], side: 'ours' | 'theirs') => {
  let text = '';
  let previous = 0;
  const ranges = blocks.map(block => {
    text += content.slice(previous, block.start);
    const from = text.length;
    text += block[side];
    previous = block.end;
    return { from, to: text.length };
  });
  text += content.slice(previous);
  return { text, ranges };
};

const changedRanges = (
  base: string,
  text: string,
  kind: MergeHighlight['kind']
): MergeHighlight[] =>
  changes(base, text).map(change => ({
    from: change.fromB,
    to: change.toB,
    kind,
  }));

export const createMergeReview = (source: GitConflict, rawContent: string) => {
  const content = normalize(rawContent);
  const base = normalize(source.base.content ?? '');
  const ours = normalize(source.ours.content ?? '');
  const theirs = normalize(source.theirs.content ?? '');
  const blocks = conflicts(content);
  const sideRanges = (side: 'ours' | 'theirs', text: string) => {
    const projection = projectSide(content, blocks, side);
    const delta = changes(projection.text, text);
    return projection.ranges.map(range => ({
      from: mapMergePosition(range.from, delta),
      to: mapMergePosition(range.to, delta, true),
      kind: 'conflict' as const,
    }));
  };
  const oursConflicts = sideRanges('ours', ours);
  const theirsConflicts = sideRanges('theirs', theirs);
  const resultConflicts: MergeHighlight[] = blocks.map(block => ({
    from: block.start,
    to: block.end,
    kind: 'conflict',
  }));
  // Diff a marker-free projection so marker insertions cannot make unchanged
  // context look modified. Restore exact working-file offsets afterward.
  const projected = projectSide(content, blocks, 'ours');
  const resultChanges = changedRanges(base, projected.text, 'changed');
  const restoreMarkers = projected.ranges.map((range, index) => ({
    fromA: range.from,
    toA: range.to,
    fromB: blocks[index].start,
    toB: blocks[index].end,
  }));
  const resultToOurs = changes(content, ours);
  const resultToTheirs = changes(content, theirs);
  const conflictLocations = blocks.map((block, index) => ({
    result: block.start,
    ours: oursConflicts[index].from,
    theirs: theirsConflicts[index].from,
    conflict: index,
  }));
  const nonconflicting = resultChanges.flatMap(range => {
    let pieces = [range];
    for (const block of projected.ranges)
      pieces = pieces.flatMap(piece => {
        if (block.from === block.to && piece.from === block.from && piece.to === block.to)
          return [];
        if (piece.to <= block.from || piece.from >= block.to) return [piece];
        const outside: MergeHighlight[] = [];
        if (piece.from < block.from) outside.push({ ...piece, to: block.from });
        if (piece.to > block.to) outside.push({ ...piece, from: block.to });
        return outside;
      });
    return pieces.map(piece => ({
      ...piece,
      from: mapMergePosition(piece.from, restoreMarkers, true),
      to: mapMergePosition(piece.to, restoreMarkers),
    }));
  });
  // Multiple word changes on one line are one navigation stop.
  const seen = new Set<number>();
  const otherLocations = nonconflicting.flatMap(range => {
    const start = content.lastIndexOf('\n', Math.max(0, range.from - 1)) + 1;
    if (seen.has(start)) return [];
    seen.add(start);
    return [
      {
        result: range.from,
        ours: mapMergePosition(range.from, resultToOurs),
        theirs: mapMergePosition(range.from, resultToTheirs),
        conflict: -1,
      },
    ];
  });
  return {
    blocks,
    ours: [...changedRanges(base, ours, 'ours'), ...oursConflicts],
    theirs: [...changedRanges(base, theirs, 'theirs'), ...theirsConflicts],
    result: [...nonconflicting, ...resultConflicts],
    conflictLocations,
    locations: [...conflictLocations, ...otherLocations].sort((a, b) => a.result - b.result),
  };
};
