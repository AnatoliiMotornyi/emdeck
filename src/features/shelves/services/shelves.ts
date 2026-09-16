import type { Shelf, ShelfEntryKind, UnshelveReport } from '../../../shared/contracts/workspace';

const order: ShelfEntryKind[] = ['modified', 'added', 'deleted'];

export const shelfSummary = (shelf: Shelf) => {
  const counts = order
    .map(kind => ({ kind, total: shelf.entries.filter(entry => entry.kind === kind).length }))
    .filter(entry => entry.total > 0)
    .map(entry => `${entry.total} ${entry.kind}`);
  const files = shelf.entries.length === 1 ? '1 file' : `${shelf.entries.length} files`;
  return `${files} · ${counts.join(', ')}`;
};

export const shelfLabel = (shelf: Shelf) =>
  shelf.name.trim() || new Date(Number(shelf.createdAt)).toLocaleString();

export const conflictSummary = (report: UnshelveReport) => {
  if (report.conflicts.length === 0) return null;
  const files = report.conflicts.length === 1 ? '1 file' : `${report.conflicts.length} files`;
  const names = report.conflicts.map(conflict => conflict.path).join(', ');
  return `${files} changed since they were shelved and were left untouched: ${names}`;
};
