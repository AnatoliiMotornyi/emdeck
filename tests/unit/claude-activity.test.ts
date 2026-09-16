import { describe, expect, it } from 'vitest';
import { createAgentActivityTracker } from '../../src/features/agents/services/agent-activity-tracker';
import { isAgentCompletion } from '../../src/features/agents/services/agent-completion';

const done = '※ Worked for 3m 12s · done 10:24 · 2 shells still running';
const footer = ['Emdeck · Example model · 52% context', 'auto mode on · 2 shells · 1 agent'];
const finished = ['Implemented the change.', done, '────', '❯', '────', ...footer];
const working = ['✻ Channelling… (2m 10s · ↓ 1.2k tokens)', '❯', ...footer];

describe('Claude foreground completion', () => {
  it('ends Working at the done footer even while background shells are running', () => {
    const tracker = createAgentActivityTracker('claude');
    expect(tracker.inspect(working)).toBe('working');
    expect(tracker.inspect(finished)).toBe('ready');
    expect(tracker.inspect([...finished, 'Custom footer: 2 jobs'])).toBe('ready');
  });

  it.each([
    { lines: [done] },
    { lines: [done, '────', '❯ A draft for later', '────', ...footer] },
    { lines: [done, '────', '❯', '────', 'Custom footer: 2 jobs'] },
  ])(
    'does not require a recognizable empty composer after explicit completion: $lines',
    ({ lines }) => {
      const tracker = createAgentActivityTracker('claude');
      tracker.inspect(working);
      expect(tracker.inspect(lines)).toBe('ready');
      expect(tracker.inspect(lines)).toBe('ready');
      expect(tracker.input('More draft text')).toBe('ready');
      expect(tracker.input('\r')).toBe('working');
      expect(tracker.inspect(lines)).toBe('working');
    }
  );

  it.each(['✳', '✴', '✼', '※', '✽', '✺', '✻', '*', ''])(
    'recognizes the modern done footer with decoration %j',
    glyph => {
      const tracker = createAgentActivityTracker('claude');
      tracker.inspect(working);
      expect(tracker.inspect([`${glyph} Worked for 3m 12s · done 10:24`, '❯'])).toBe('ready');
    }
  );

  it('keeps completion through a draft repaint, then accepts newer work and controls', () => {
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect(working);
    tracker.inspect(finished);
    expect(tracker.inspect(['❯ Draft', 'Custom footer'])).toBe('ready');
    expect(tracker.inspect([...finished, ...working])).toBe('working');
    expect(
      tracker.inspect([...finished, 'Which option?', '❯ 1. A', '2. B', 'Enter to select'])
    ).toBe('question');
    expect(
      tracker.inspect([...finished, 'Would you like to run this command?', '❯ 1. Yes', '2. No'])
    ).toBe('attention');
  });

  it('does not let retained completion or changing shell counts finish a newly submitted task', () => {
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect(finished);
    tracker.input('Next task');
    tracker.input('\r');
    expect(tracker.inspect(finished)).toBe('working');
    expect(tracker.inspect(['Preparing request', ...finished])).toBe('working');
    expect(tracker.inspect(finished.map(line => line.replace('2 shells', '1 shell')))).toBe(
      'working'
    );
    expect(tracker.inspect(finished.map(line => line.replace('※', '✳')))).toBe('working');
    expect(tracker.inspect([...finished, ...working])).toBe('working');
    expect(tracker.inspect(['Streaming final response'])).toBe('working');
    expect(tracker.inspect(['Incomplete response', '❯'])).toBe('unknown');
    expect(tracker.inspect([done.replace('10:24', '10:25'), '❯'])).toBe('ready');
  });

  it('does not confuse removing an old history row with finishing, but recognizes another equal-duration turn', () => {
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect([done, ...finished]);
    tracker.input('Next task');
    tracker.input('\r');
    expect(tracker.inspect(finished)).toBe('working');
    expect(tracker.inspect(working)).toBe('working');
    expect(tracker.inspect(finished)).toBe('ready');
    tracker.input('One more task');
    tracker.input('\r');
    expect(tracker.inspect([...finished, ...working])).toBe('working');
    expect(tracker.inspect([...finished, ...finished])).toBe('ready');
  });

  it('a newly visible old completion above current work cannot finish the current turn', () => {
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect(working);
    expect(tracker.inspect([done, ...working])).toBe('working');
    expect(tracker.inspect([done, 'Streaming response'])).toBe('working');
    expect(tracker.inspect([done, '❯'])).toBe('unknown');
  });

  it('does not treat an old footer restored after a partial repaint as a new completion', () => {
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect(finished);
    tracker.input('Next task');
    tracker.input('\r');
    expect(tracker.inspect(['Preparing request'])).toBe('working');
    expect(tracker.inspect(['Preparing request', ...finished])).toBe('working');
    expect(tracker.inspect([...finished, ...working])).toBe('working');
    expect(tracker.inspect(['Streaming response'])).toBe('working');
    expect(tracker.inspect(finished)).not.toBe('ready');
  });

  it.each([
    'Worked for the team and finished.',
    'I worked for 3m 12s · done 10:24',
    'const status = "Worked for 3m 12s · done 10:24";',
    '✻ Working… (3m 12s · 2 shells still running)',
    '2 shells still running',
    'All requested changes are complete.',
  ])('does not treat prose, ongoing work or shell counts as completion: %s', line => {
    expect(isAgentCompletion(line)).toBe(false);
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect(working);
    expect(tracker.inspect([line])).toBe('working');
  });
});
