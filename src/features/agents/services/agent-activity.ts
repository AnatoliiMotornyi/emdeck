import type { AgentKind, AgentObservation } from '../../../shared/contracts/workspace';
import { codexCompletion, codexScreenActivity } from './codex-activity';
import { isAgentCompletion } from './agent-completion';

const emptyPrompt = /^\s*[❯›>]\s*$/;
const directQuestion =
  /^(?:[●•]\s*)?(?:which|what|how|where|when|who|why|should|shall|would|could|can|do|does|is|are|will)\b[^\n]*\?\s*$/i;
const separator = /^[\s─━═╌┄┈╭╮╰╯│┌┐└┘├┤┬┴┼]+$/;
const lastIndex = (lines: string[], match: (line: string) => boolean): number => {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (match(lines[index])) return index;
  }
  return -1;
};

export const agentScreenTail = (lines: string[]): string[] => {
  let end = lines.length;
  while (end && !lines[end - 1].trim()) end--;
  return lines.slice(Math.max(0, end - 128), end);
};

const workingIndicator = (line: string) =>
  /(?:esc(?:ape)?|ctrl\s*\+\s*c)\s+to\s+(?:interrupt|stop)|(?:thinking|working|generating|running|pondering|crafting|reasoning)(?:…|\.\.\.)/i.test(
    line
  ) ||
  /^\s*[✢✳✶✻✽✺·*⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+\S[^\n]*(?:…|\.\.\.)(?:\s*\([^\n]*\))?\s*$/.test(line) ||
  /^\s*(?:[•●◦]\s*)?(?:Working|Thinking|Running|Reconnecting|Compacting)\b[^\n]*\(\d+[hms][^\n]*\)\s*$/i.test(
    line
  );

// Inspect only the current screen tail. A question mark in logs or older
// conversation is not sufficient evidence that the agent is awaiting input.
export const detectAgentActivity = (
  kind: AgentKind,
  lines: string[]
): AgentObservation['activity'] => {
  if (kind === 'shell' || kind === 'custom') return 'unknown';
  const live = agentScreenTail(lines);
  const codex = kind === 'codex' ? codexScreenActivity(live) : undefined;
  if (codex === 'question' || codex === 'attention') return codex;
  const tail = live.slice(-16);
  const bottom = tail.join('\n');
  let prompt = -1;
  for (let index = tail.length - 1; index >= 0; index--) {
    if (/^\s*[❯›>]/.test(tail[index])) {
      prompt = index;
      break;
    }
  }
  const hasQuestion = tail.some(line => directQuestion.test(line.trim()));
  const choices = tail.filter(line => /^\s*[❯›>]?\s*\d+[.)]\s+\S/.test(line));
  const questionPicker =
    hasQuestion &&
    choices.length >= 2 &&
    (prompt < 0 || /^\s*[❯›>]\s*\d+[.)]/.test(tail[prompt])) &&
    /enter to (?:select|submit|confirm)|(?:↑|↓|arrow keys).*select|(?:^|\n)\s*[❯›>]\s*\d+[.)]/i.test(
      bottom
    );
  const approval =
    /press enter to approve/i.test(bottom) ||
    (!questionPicker && /press enter to confirm/i.test(bottom)) ||
    (/do you want to (?:allow|proceed)|would you like to (?:run|approve)|allow (?:once|this|claude)|requires? (?:your )?approval|permission (?:required|request)/i.test(
      bottom
    ) &&
      /(?:^|\n)\s*[❯›>]?\s*(?:[1-9][.)]\s*)?(?:yes|no|allow once|allow always|deny|approve once)\b|\[y\/n\]/i.test(
        bottom
      ));
  const workingRow = lastIndex(
    live,
    line =>
      workingIndicator(line) && !(kind === 'codex' && /\bto submit (?:answer|all)\b/i.test(line))
  );
  const completionRow = lastIndex(
    live,
    line => isAgentCompletion(line) || (kind === 'codex' && !!codexCompletion([line]))
  );
  const controlRow =
    approval || questionPicker
      ? lastIndex(
          live,
          line =>
            /^\s*[❯›>]?\s*\d+[.)]\s+\S/.test(line) ||
            /press enter to (?:approve|confirm)/i.test(line)
        )
      : -1;
  if (workingRow > Math.max(completionRow, controlRow)) return 'working';
  if (approval) return 'attention';

  if (questionPicker) return 'question';
  if (/esc(?:ape)? to cancel/i.test(bottom)) return 'working';

  if (prompt >= 0 && emptyPrompt.test(tail[prompt])) {
    const preceding = tail.slice(0, prompt).filter(line => line.trim() && !separator.test(line));
    const lastMessage = preceding.at(-1)?.trim() ?? '';
    const activePrompt =
      codex === 'ready' ||
      tail
        .slice(prompt + 1)
        .every(
          line =>
            !line.trim() ||
            separator.test(line) ||
            /\? for shortcuts|context|shift\+tab|ctrl\+|bypass permissions|auto mode|accept edits/i.test(
              line
            )
        );
    if (
      activePrompt &&
      (directQuestion.test(lastMessage) ||
        /^(?:[●•]\s*)?(?:waiting|awaiting) (?:for )?(?:your|an?) (?:answer|response|input)[.!…]*$/i.test(
          lastMessage
        ))
    )
      return 'question';
    return activePrompt ? 'ready' : 'unknown';
  }
  return 'unknown';
};
