import { readStored } from '../../../platform/storage/preferences';
import { detectAgentActivity } from '../services/agent-activity';
import type {
  AgentKind,
  AgentObservation,
  AgentPreferences,
  PaneState,
} from '../../../shared/contracts/workspace';
export const agentMetrics = [
  ['activity', 'Activity'],
  ['model', 'Model'],
  ['context', 'Context window'],
  ['tokens', 'Input / output tokens'],
  ['cost', 'Estimated session cost'],
  ['limits', 'Account limits'],
  ['resets', 'Reset times with limits'],
  ['elapsed', 'Session duration'],
] as const;
export const agentDefaults: AgentPreferences = {
  visible: true,
  compact: false,
  showShells: true,
  claudeUsage: true,
  refreshSeconds: 0,
  metrics: agentMetrics.map(([id]) => id),
};
export function loadAgentPreferences(): AgentPreferences {
  const saved = readStored<Partial<AgentPreferences> | null>('relay:agents', {});
  const stored = saved && typeof saved === 'object' ? saved : {};
  return {
    ...agentDefaults,
    ...Object.fromEntries(
      ['visible', 'compact', 'showShells', 'claudeUsage']
        .filter(key => typeof stored[key as keyof AgentPreferences] === 'boolean')
        .map(key => [key, stored[key as keyof AgentPreferences]])
    ),
    metrics: Array.isArray(stored.metrics)
      ? [...new Set(stored.metrics.filter(id => agentMetrics.some(([key]) => key === id)))]
      : agentDefaults.metrics,
    refreshSeconds: [0, 60, 300].includes(stored.refreshSeconds ?? 0)
      ? (stored.refreshSeconds ?? 0)
      : 0,
  };
}
export function agentKind(command: string): AgentKind {
  if (!command.trim()) return 'shell';
  const first = command.trim().match(/^(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/);
  const name = (first?.[1] ?? first?.[2] ?? first?.[3] ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .at(-1)
    ?.replace(/\.(exe|cmd|ps1)$/i, '')
    .toLowerCase();
  return name === 'claude' || name === 'codex' || name === 'gemini' ? name : 'custom';
}
export function inspectAgentScreen(
  kind: AgentKind,
  lines: string[],
  now = Date.now()
): AgentObservation {
  // Only the live bottom rows are supplied; never inspect scrolled-back history.
  const screen = lines.slice(-28).join('\n');
  const activity = detectAgentActivity(kind, lines);
  const remaining = screen.match(/(\d+(?:\.\d+)?)%\s*(?:context\s*)?(?:left|remaining)/i);
  const used =
    screen.match(/(\d+(?:\.\d+)?)%\s*context(?:\s*used)?/i) ??
    screen.match(/context(?:\s*(?:used|window))?\s*[:·]?\s*(\d+(?:\.\d+)?)%/i);
  const percent = remaining ? 100 - Number(remaining[1]) : used ? Number(used[1]) : null;
  const model =
    screen.match(
      /\b(gpt-[a-z0-9][a-z0-9.-]*|(?:claude-)?(?:opus|sonnet|haiku)[ -][0-9][a-z0-9.()-]*|gemini-[0-9][a-z0-9.-]*)\b/i
    )?.[0] ?? null;
  return {
    activity,
    model,
    contextPercent: percent !== null && percent >= 0 && percent <= 100 ? percent : null,
    observedAt: now,
  };
}
export function agentStatus(state: PaneState | undefined, observation?: AgentObservation) {
  if (state === 'preview') return { label: 'Preview', tone: 'muted' };
  if (state === 'exited') return { label: 'Exited', tone: 'muted' };
  if (state === 'error') return { label: 'Error', tone: 'error' };
  if (!state || state === 'starting') return { label: 'Starting', tone: 'muted' };
  if (observation?.activity === 'attention') return { label: 'Needs attention', tone: 'attention' };
  if (observation?.activity === 'question')
    return { label: 'Waiting for answer · detected', tone: 'attention' };
  if (observation?.activity === 'working') return { label: 'Working · detected', tone: 'working' };
  if (observation?.activity === 'ready') return { label: 'Ready · detected', tone: 'ready' };
  if (observation?.activity === 'unknown') return { label: 'Activity unknown', tone: 'muted' };
  return state === 'output'
    ? { label: 'Output', tone: 'working' }
    : { label: 'Connected', tone: 'ready' };
}
export const metricNumber = (value: number | null | undefined) =>
  value == null
    ? 'Not reported'
    : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
        value
      );
