import type { MachineProfile, SessionPane } from '../../../shared/contracts/sessions';
export const localMachine: MachineProfile = {
  id: 'local',
  name: 'This computer',
  target: { kind: 'local' },
  enabled: false,
};
export const restoreMachines = (value: unknown): MachineProfile[] => {
  if (!Array.isArray(value)) return [localMachine];
  const found: MachineProfile[] = [];
  for (const profile of value.slice(0, 65)) {
    if (
      !profile ||
      typeof profile !== 'object' ||
      typeof profile.id !== 'string' ||
      typeof profile.name !== 'string' ||
      !profile.target ||
      found.some(p => p.id === profile.id)
    )
      continue;
    const { kind, port, credential } = profile.target;
    if (profile.id === 'local' && kind !== 'local') continue;
    if (kind === 'local') {
      if (profile.id === 'local')
        found.push({ ...localMachine, enabled: profile.enabled === true });
    } else if (
      kind === 'ssh' &&
      typeof profile.target.host === 'string' &&
      typeof profile.target.binary === 'string' &&
      (port === null || Number.isInteger(port))
    )
      found.push({
        id: profile.id,
        name: profile.name.slice(0, 120),
        target: {
          kind: 'ssh',
          host: profile.target.host,
          port,
          binary: profile.target.binary,
        },
        enabled: profile.enabled === true,
      });
    else if (
      kind === 'direct' &&
      typeof credential === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credential)
    )
      found.push({
        id: profile.id,
        name: profile.name.slice(0, 120),
        target: { kind: 'direct', credential },
        enabled: profile.enabled === true,
      });
  }
  return found.some(p => p.id === 'local') ? found : [localMachine, ...found];
};
export const sessionKey = (machine: string, pane: string) => `${machine}/${pane}`;
export const stateLabel = (pane: SessionPane, connected: boolean) =>
  connected ? pane.agent.state : 'offline';
// The server answers terminal device queries even when detached. Do not forward
// xterm's duplicate CPR/DA/DSR replies as keyboard input to the agent.
export const terminalInput = (text: string) =>
  text
    .split('\u001b')
    .map((part, index) => {
      if (!index) return part;
      const reply = /^\[(?:\??\d+(?:;\d+)*R|\??\d+(?:;\d+)*n|[?>]?[\d;]*c|8;\d+;\d+t)/;
      return reply.test(part) ? part.replace(reply, '') : `\u001b${part}`;
    })
    .join('');
