import type { AgentObservation } from '../../../shared/contracts/workspace';
import { agentScreenTail, detectAgentActivity } from './agent-activity';
import { codexCompletion, codexScreenActivity, createCodexTitleActivity } from './codex-activity';

type Activity = AgentObservation['activity'];

export const createCodexActivityTracker = () => {
  const readTitle = createCodexTitleActivity();
  let activity: Activity = 'unknown';
  let reported: Activity | null = null;
  let busy = false;
  let draft = '';
  let lastLines: string[] = [];
  let invalidatedScreen: string | null = null;
  let completionBeforeTurn = '';

  const begin = () => {
    if (!busy) completionBeforeTurn = codexCompletion(lastLines);
    busy = true;
    activity = 'working';
  };
  const title = (value: string) => {
    const next = readTitle(value);
    if (next === undefined) return;
    if (next !== reported) {
      // An OSC update may precede the repaint that removes an old approval or
      // working row. Do not let that old screen undo the new lifecycle signal.
      invalidatedScreen = lastLines.join('\n');
      if (next === 'working') begin();
      else if (next) {
        busy = false;
        activity = next;
      }
    }
    reported = next;
  };
  const inspect = (lines: string[]): Activity => {
    lastLines = agentScreenTail(lines);
    if (invalidatedScreen === lastLines.join('\n')) return activity;
    invalidatedScreen = null;
    const detected = detectAgentActivity('codex', lastLines);
    const answering =
      detected === 'question' &&
      (busy || reported === 'working') &&
      codexScreenActivity(lastLines) !== 'question';
    if (answering) activity = 'working';
    else if (detected === 'attention' || detected === 'question') {
      busy = false;
      activity = detected;
    } else if (reported) {
      activity = reported;
    } else if (detected === 'working') {
      begin();
    } else if (busy) {
      const previous = new Set(completionBeforeTurn.split('\n'));
      const finished = codexCompletion(lastLines)
        .split('\n')
        .some(line => line && !previous.has(line));
      if (detected === 'ready' && finished) {
        busy = false;
        activity = 'ready';
      } else activity = 'working';
    } else activity = detected;
    return activity;
  };
  const input = (data: string): Activity => {
    // Tab submits/queues a Codex composer draft, but completes slash commands.
    // Modified Enter and bracketed multiline pastes do not submit a turn.
    const control = activity === 'attention' || activity === 'question';
    const command = draft.trimStart().startsWith('/');
    const submit = data === '\r' || data === '\n' || (data === '\t' && !control && !command);
    if (submit) {
      if ((!command && draft) || control) {
        reported = null;
        invalidatedScreen = lastLines.join('\n');
        begin();
      }
      draft = '';
    } else if (data === '\x03' || data === '\x1b') {
      draft = '';
      // The CLI decides whether this interrupts a turn or closes a popup. Keep
      // work until its next title/screen update instead of falsely showing idle.
    } else if (data === '\x7f' || data === '\b') draft = draft.slice(0, -1);
    else if (data === '\x15') draft = '';
    else if (!data.startsWith('\x1b') || data.startsWith('\x1b[200~') || data === '\x1b[A') {
      if ([...data].some(char => char > ' ')) draft = (draft + data).slice(-4096);
    }
    return activity;
  };
  return { inspect, input, title };
};
