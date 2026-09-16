import { describe, expect, it } from 'vitest';
import type { Shelf, ShelfEntryKind } from '../../src/shared/contracts/workspace';
import {
  conflictSummary,
  shelfLabel,
  shelfSummary,
} from '../../src/features/shelves/services/shelves';

const shelf = (kinds: ShelfEntryKind[], name = 'Work in progress'): Shelf => ({
  id: 'abc-0',
  name,
  root: '/project',
  createdAt: '1757500000000',
  entries: kinds.map((kind, index) => ({ path: `file${index}.ts`, originalPath: null, kind })),
});

describe('shelfSummary', () => {
  it('counts files and breaks them down by kind', () => {
    expect(shelfSummary(shelf(['modified', 'modified', 'added']))).toBe(
      '3 files · 2 modified, 1 added'
    );
  });

  it('uses the singular for a lone file', () => {
    expect(shelfSummary(shelf(['deleted']))).toBe('1 file · 1 deleted');
  });
});

describe('shelfLabel', () => {
  it('prefers the name the user gave', () => {
    expect(shelfLabel(shelf(['added']))).toBe('Work in progress');
  });

  it('falls back to the creation date when the name is blank', () => {
    expect(shelfLabel(shelf(['added'], '   '))).toMatch(/\d/);
  });
});

describe('conflictSummary', () => {
  it('stays silent when everything applied', () => {
    expect(conflictSummary({ applied: ['a.ts'], conflicts: [] })).toBeNull();
  });

  it('names the files that were left alone', () => {
    expect(
      conflictSummary({
        applied: [],
        conflicts: [
          { path: 'a.ts', reason: 'changed' },
          { path: 'b.ts', reason: 'changed' },
        ],
      })
    ).toBe('2 files changed since they were shelved and were left untouched: a.ts, b.ts');
  });
});
