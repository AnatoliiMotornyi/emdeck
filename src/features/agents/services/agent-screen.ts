interface ScreenRow {
  isWrapped: boolean;
  translateToString: (trim?: boolean) => string;
  getCell?: (column: number) => { isDim: () => number } | undefined;
}

interface LiveBuffer {
  baseY: number;
  length: number;
  getLine: (index: number) => ScreenRow | undefined;
}

// Read the live viewport, never viewportY/scrollback. Blank space below a TUI
// must not displace its status, and soft wraps must not split control labels.
export const readAgentScreen = (buffer: LiveBuffer, rows: number, codex = false): string[] => {
  const end = Math.min(buffer.length, buffer.baseY + rows);
  const lines: string[] = [];
  for (let index = Math.max(buffer.baseY, end - 256); index < end; index++) {
    const row = buffer.getLine(index);
    let text = (row?.translateToString(false) ?? '').slice(0, 4096);
    // Codex renders its empty composer's suggestion dimmed, with a non-dim
    // prompt. Strip only that styled placeholder, never a typed draft, option
    // picker or disabled sub-agent composer. ASCII prefix offsets equal cells.
    const prompt = codex && !row?.isWrapped ? text.match(/^(\s*[›❯>]\s+)(\S.*)$/) : null;
    if (
      prompt &&
      !/^\d+[.)]/.test(prompt[2]) &&
      row?.getCell &&
      row.getCell(prompt[1].search(/[›❯>]/))?.isDim() === 0
    ) {
      const start = prompt[1].length;
      const end = text.trimEnd().length;
      if (
        Array.from({ length: end - start }, (_, index) =>
          row.getCell!(start + index)?.isDim()
        ).every(Boolean)
      )
        text = prompt[1].trimEnd();
    }
    if (row?.isWrapped && lines.length) lines[lines.length - 1] += text;
    else lines.push(text);
  }
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  return lines.map(line => line.trimEnd());
};
