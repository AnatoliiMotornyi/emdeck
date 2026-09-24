import { describe, expect, it } from 'vitest';
import { restoreMachines } from '../../src/features/agents/services/session-model';

describe('saved paired machines', () => {
  it('keeps only opaque credential references and public labels', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const profiles = restoreMachines([
      {
        id: 'desktop',
        name: 'Office',
        enabled: true,
        secret: 'do-not-save',
        target: { kind: 'direct', credential: id, token: 'do-not-save', code: 'do-not-save' },
      },
    ]);
    expect(profiles[1]).toEqual({
      id: 'desktop',
      name: 'Office',
      enabled: true,
      target: { kind: 'direct', credential: id },
    });
    expect(JSON.stringify(profiles)).not.toContain('do-not-save');
  });
  it('rejects paths and malformed credential identities and retains legacy SSH profiles', () => {
    expect(
      restoreMachines([
        { id: 'bad', name: 'Bad', target: { kind: 'direct', credential: '../secret' } },
      ])
    ).toHaveLength(1);
    expect(
      restoreMachines([
        {
          id: 'ssh',
          name: 'Host',
          target: {
            kind: 'ssh',
            host: 'host',
            port: null,
            binary: 'emdeck-session',
            token: 'private',
          },
        },
      ])[1].target
    ).toEqual({ kind: 'ssh', host: 'host', port: null, binary: 'emdeck-session' });
  });
});
