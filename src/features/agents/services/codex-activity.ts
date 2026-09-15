import type { AgentObservation } from '../../../shared/contracts/workspace';

type Activity = AgentObservation['activity'];

// Codex's question overlay includes an interrupt shortcut even while it waits
// for an answer. Inspect the current controls before generic working hints.
export const codexScreenActivity = (lines: string[]): Activity | undefined => {
  const tail = lines.slice(-64);
  const lastPrompt = tail.map(line => /^\s*[›❯>]/.test(line)).lastIndexOf(true);
  const footer = tail
    .slice(Math.max(tail.length - 4, lastPrompt + 1))
    .join(' ')
    .trim();
  const question = tail.some(line => /^\s*Question \d+\/\d+\b/.test(line));
  if (question && /\bto submit (?:answer|all)\b/i.test(footer)) return 'question';
  if (
    tail.some(line => /^\s*Submit with unanswered questions\?\s*$/.test(line)) &&
    /\bto (?:confirm|select)\b/i.test(footer)
  )
    return 'question';

  const choices = tail.filter(line => /^\s*[›❯>]?\s*\d+[.)]\s+\S/.test(line));
  const decision = choices.some(line => /\b(?:Yes|No|Allow|Approve|Deny|Decline)\b/i.test(line));
  const approval = tail.some(line =>
    /would you like to (?:run|make|grant|send)|do you want to approve|needs your approval/i.test(
      line
    )
  );
  if (decision && approval && /\bto confirm\b/i.test(footer)) return 'attention';

  // The composer remains on screen throughout streaming. This says only that
  // the composer is available; the per-process tracker decides whether idle is
  // justified. Styled placeholder text is removed by the screen adapter.
  const prompt = tail.map(line => /^\s*[›❯>]\s*$/.test(line)).lastIndexOf(true);
  const following = tail.slice(prompt + 1);
  if (
    prompt >= 0 &&
    following.every(
      line =>
        !line.trim() ||
        /^[\s─━═]+$/.test(line) ||
        /\? for shortcuts|\bcontext (?:left|remaining)|\bgpt-[\w.-]+|shift\+tab|to (?:queue|submit) message/i.test(
          line
        )
    )
  )
    return 'ready';
  return undefined;
};

// The default Codex title starts with a braille activity indicator. Its removal
// from the same title is positive idle evidence, including turns with no visible
// completion row. Never infer idle from an arbitrary title or a rename alone.
export const createCodexTitleActivity = () => {
  let previous = '';
  let activeTitle: string | null = null;
  return (value: string): Activity | null | undefined => {
    const title = value.trim().slice(0, 512);
    if (title === previous) return undefined;
    previous = title;
    const working = title.match(/^(?:●\s+)?[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+(.+)$/u);
    if (working) {
      activeTitle = working[1];
      return 'working';
    }
    const attention = title.match(/^(?:●\s+)?\[ [!.] \] Action Required(?: \| (.+))?$/);
    if (attention) {
      activeTitle = attention[1] ?? null;
      return 'attention';
    }
    if (activeTitle && title === activeTitle) return 'ready';
    activeTitle = null;
    return null;
  };
};

// Recent Codex versions print this footer after completing the final response.
// The older "── Worked for ... ──" divider precedes the final response stream
// and must never finish a turn by itself.
export const codexCompletion = (lines: string[]) =>
  lines.filter(line => /^\s*Worked for \d+[hms]\b.+·\s*done\s+\S/i.test(line)).join('\n');
