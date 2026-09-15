export interface TextEdit {
  from: number;
  to: number;
  insertedLength: number;
}

// Ranges use LF-normalized editor positions. Boundary insertions belong to
// surrounding text. Edits crossing a boundary invalidate a range rather than
// guessing which neighboring text a later replacement should overwrite.
export const mapTextRanges = <T extends { from: number; to: number; valid: boolean }>(
  ranges: T[],
  edits: TextEdit[]
): T[] =>
  ranges.map(range => {
    let from = range.from,
      to = range.to,
      valid = range.valid;
    for (const edit of edits) {
      const delta = edit.insertedLength - (edit.to - edit.from);
      if (edit.to <= range.from) {
        from += delta;
        to += delta;
      } else if (edit.from >= range.to) continue;
      else if (edit.from >= range.from && edit.to <= range.to) to += delta;
      else valid = false;
    }
    return { ...range, from, to, valid };
  });
