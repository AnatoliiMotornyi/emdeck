// Claude's current completion footer includes a clock and can retain running
// background-shell counts. Neither a custom footer nor an unsent composer draft
// changes the meaning of this completed foreground turn.
const completionKey = (line: string): string | undefined => {
  const match =
    /^\s*(?:[\p{S}\p{P}]\s*)?(Worked for \d+(?:\.\d+)?(?:ms|[hms])(?:\s+\d+(?:\.\d+)?(?:ms|[hms]))*)\s*·\s*done\s+(\d{1,2}:\d{2})\b/iu.exec(
      line
    ) ??
    /^\s*(?:[✢✳✴✶✻✼✽✺✦※·*]|[─━═]+)\s*([A-Za-z]+ed for \d+(?:\.\d+)?(?:ms|[hms])(?:\s+\d+(?:\.\d+)?(?:ms|[hms]))*)\b/i.exec(
      line
    );
  // A changing decorative glyph or background-shell count is not another turn.
  return match ? `${match[1]} ${match[2] ?? ''}`.trim().toLowerCase() : undefined;
};

export const isAgentCompletion = (line: string) => completionKey(line) !== undefined;

const counts = (lines: string[]) => {
  const result = new Map<string, number>();
  for (const line of lines) {
    const key = completionKey(line);
    if (!key) continue;
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
};

// Compare occurrences, not just text: successive turns can finish with the same
// verb/duration/clock. A retained history row is not a new completion, but a row
// replaced by a visible working indicator and then rendered again (or a second
// occurrence) is. Partial repaints without work evidence retain the baseline.
export const createAgentCompletionTracker = () => {
  let previous = new Map<string, number>();
  const begin = (lines: string[]) => {
    previous = counts(lines);
  };
  const observe = (lines: string[]): boolean => {
    const current = counts(lines);
    const fresh = [...current].some(([row, count]) => count > (previous.get(row) ?? 0));
    for (const [row, count] of current) previous.set(row, Math.max(count, previous.get(row) ?? 0));
    return fresh;
  };
  return { begin, observe };
};
