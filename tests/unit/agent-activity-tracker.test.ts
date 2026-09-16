import { describe, expect, it } from 'vitest';
import { createAgentActivityTracker } from '../../src/features/agents/services/agent-activity-tracker';
import { detectAgentActivity } from '../../src/features/agents/services/agent-activity';
import { readAgentScreen } from '../../src/features/agents/services/agent-screen';

describe('live agent screen evidence', () => {
  it.each([
    '✻ Channelling… (2m 10s · ↓ 1.2k tokens)',
    '✢ Percolating...',
    '* Reticulating…',
    'Working (12s)',
    'Searching (12s · esc to stop)',
    'ctrl+c to interrupt',
  ])('recognizes work while the composer remains visible: %s', indicator => {
    expect(detectAgentActivity('claude', [indicator, '────', '❯', '? for shortcuts'])).toBe(
      'working'
    );
  });
  it('keeps status above a tall composer and ignores blank rows below the TUI', () => {
    expect(
      detectAgentActivity('claude', ['✻ Channelling…', ...Array<string>(20).fill(''), '❯'])
    ).toBe('working');
    expect(
      detectAgentActivity('claude', ['✻ Channelling…', '❯', ...Array<string>(70).fill('')])
    ).toBe('working');
  });
  it.each([
    ['? for shortcuts'],
    ['send a message'],
    ['type your message'],
    ['❯', 'Tool is still producing output'],
    ['❯', '✻ Channelling…'],
  ])('does not infer readiness from persistent hints or an old composer: %s', (...lines) => {
    expect(detectAgentActivity('claude', lines)).not.toBe('ready');
  });
  it('joins soft wraps without reading scrollback or losing spaces', () => {
    const values = ['OLD esc to interrupt', 'Working (1s · esc to ', 'interrupt)', '❯', '', ''];
    const read: number[] = [];
    const lines = readAgentScreen(
      {
        baseY: 1,
        length: values.length,
        getLine: index => {
          read.push(index);
          return { isWrapped: index === 2, translateToString: () => values[index] };
        },
      },
      5
    );
    expect(read).toEqual([1, 2, 3, 4, 5]);
    expect(lines).toEqual(['Working (1s · esc to interrupt)', '❯']);
    expect(detectAgentActivity('codex', lines)).toBe('working');
  });
});

describe('per-session activity transitions', () => {
  const ready = ['Previous result.', '✻ Cooked for 5s', '❯', '? for shortcuts'];
  it('invalidates readiness on submit before output and rejects an unchanged prompt and old completion', () => {
    const tracker = createAgentActivityTracker('claude');
    expect(tracker.inspect(ready)).toBe('ready');
    tracker.input('Fix the test');
    expect(tracker.input('\r')).toBe('working');
    expect(tracker.inspect(ready)).toBe('working');
    expect(tracker.inspect(['Preparing request', ...ready])).toBe('working');
    expect(tracker.inspect(['✻ Channelling…', '❯'])).toBe('working');
    expect(tracker.inspect(['Tool output in progress'])).toBe('working');
    expect(tracker.inspect(['Intermediate output', '❯'])).toBe('unknown');
    expect(tracker.inspect(['Implemented.', '✻ Cooked for 10s', '❯'])).toBe('ready');
  });
  it('a question or approval can stop work, then submission immediately resumes it', () => {
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect(['Working...']);
    const question = ['Which library?', '❯ 1. React', '2. Solid', 'Enter to select'];
    expect(tracker.inspect(question)).toBe('question');
    expect(tracker.input('\r')).toBe('working');
    expect(tracker.inspect(question)).toBe('working');
    expect(tracker.inspect(['Would you like to run this command?', '❯ 1. Yes', '2. No'])).toBe(
      'attention'
    );
    expect(tracker.input('\r')).toBe('working');
  });
  it('recognizes current controls and completion below old working output', () => {
    const working = 'Working (1s · esc to interrupt)';
    expect(
      detectAgentActivity('claude', [
        working,
        'Would you like to run this command?',
        '❯ 1. Yes',
        '2. No',
        'Esc to cancel',
      ])
    ).toBe('attention');
    expect(
      detectAgentActivity('claude', [
        working,
        'Which library?',
        '❯ 1. React',
        '2. Solid',
        'Enter to select',
      ])
    ).toBe('question');
    expect(detectAgentActivity('claude', [working, 'Implemented.', '✻ Cooked for 12s', '❯'])).toBe(
      'ready'
    );
  });
  it('scrolling an old completion out of the screen cannot complete a new task', () => {
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect(['✻ Cooked for 2s', ...ready]);
    tracker.input('next');
    tracker.input('\r');
    expect(tracker.inspect(ready)).toBe('working');
  });
  it('typing, multiline paste and modified Enter do not submit; interrupt clears stale evidence', () => {
    const tracker = createAgentActivityTracker('claude');
    tracker.inspect(ready);
    expect(tracker.input('\r')).toBe('ready');
    tracker.input('x');
    tracker.input('\x7f');
    expect(tracker.input('\r')).toBe('ready');
    expect(tracker.input('\x1b[200~hello\rworld\x1b[201~')).toBe('ready');
    expect(tracker.input('\x1b[13;2u')).toBe('ready');
    expect(tracker.input('\r')).toBe('working');
    expect(tracker.input('\x03')).toBe('unknown');
    expect(tracker.inspect(ready)).toBe('ready');
  });
  it('does not infer activity for shell/custom commands and cannot leak between sessions', () => {
    for (const kind of ['shell', 'custom'] as const) {
      const tracker = createAgentActivityTracker(kind);
      tracker.input('echo hello');
      expect(tracker.input('\r')).toBe('unknown');
      expect(tracker.inspect(ready)).toBe('unknown');
    }
    const first = createAgentActivityTracker('claude');
    first.inspect(['Working...']);
    expect(createAgentActivityTracker('claude').inspect(ready)).toBe('ready');
  });
});
