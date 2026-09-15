import type { AgentKind, AgentObservation } from '../../../shared/contracts/workspace';
import { agentScreenTail, detectAgentActivity } from './agent-activity';
import { createAgentCompletionTracker } from './agent-completion';
import { createCodexActivityTracker } from './codex-activity-tracker';

type Activity = AgentObservation['activity'];

// Per-process evidence, not a timer-based guess. Output silence cannot finish a
// task. A submit invalidates the old prompt even before the CLI repaints it.
export const createAgentActivityTracker = (kind: AgentKind) => {
  if (kind === 'codex') return createCodexActivityTracker();
  let activity: Activity = 'unknown';
  let draft = '';
  let busy = false;
  let completed = false;
  let submittedScreen: string | null = null;
  const completion = createAgentCompletionTracker();
  let lastLines: string[] = [];
  const inspect = (lines: string[]): Activity => {
    lastLines = agentScreenTail(lines);
    const screen = lastLines.join('\n');
    if (submittedScreen === screen) return activity;
    const detected = detectAgentActivity(kind, lastLines);
    if (detected === 'working') {
      completion.begin(lastLines);
      busy = true;
      completed = false;
      submittedScreen = null;
    } else if (detected === 'question' || detected === 'attention') {
      busy = false;
      completed = false;
      submittedScreen = null;
    } else if (busy) {
      const freshCompletion = completion.observe(lastLines);
      if (freshCompletion && (kind === 'claude' || detected === 'ready')) {
        busy = false;
        completed = kind === 'claude';
        submittedScreen = null;
        activity = 'ready';
        return activity;
      } else {
        // A surviving input box is ambiguous during streaming. Do not advertise
        // readiness unless the turn has positively completed.
        activity = detected === 'ready' && submittedScreen === null ? 'unknown' : 'working';
        return activity;
      }
    }
    // A completed Claude turn stays ready through draft/footer repaints, until
    // input submission or newer work/question/approval evidence supersedes it.
    activity = completed && detected === 'unknown' ? 'ready' : detected;
    return activity;
  };
  const input = (data: string): Activity => {
    if (kind === 'shell' || kind === 'custom') return activity;
    if (data === '\r' || data === '\n') {
      if (draft || activity === 'attention' || activity === 'question') {
        completion.begin(lastLines);
        submittedScreen = lastLines.join('\n');
        busy = true;
        completed = false;
        activity = 'working';
      }
      draft = '';
    } else if (data === '\x03' || data === '\x1b') {
      draft = '';
      submittedScreen = null;
      busy = false;
      completed = false;
      activity = 'unknown';
    } else if (data === '\x7f' || data === '\b') {
      draft = draft.slice(0, -1);
    } else if (data === '\x15') {
      draft = '';
    } else if (!data.startsWith('\x1b') || data.startsWith('\x1b[200~') || data === '\x1b[A') {
      if ([...data].some(char => char > ' ')) draft = (draft + data).slice(-4096);
    }
    return activity;
  };
  return { inspect, input, title: (_value: string) => {} };
};
