import { describe, expect, it } from 'vitest';
import { detectAgentActivity } from '../../src/features/agents/services/agent-activity';
import { createAgentActivityTracker } from '../../src/features/agents/services/agent-activity-tracker';
import { createCodexTitleActivity } from '../../src/features/agents/services/codex-activity';
import { readAgentScreen } from '../../src/features/agents/services/agent-screen';

// Synthetic content using the controls rendered by openai/codex's composer,
// request_user_input and approval overlays. No real sessions or transcripts.
const prompt = ['›', '  gpt-5 default · /tmp/example'];
const working = ['• Working (12s • esc to interrupt)', ...prompt];
const question = [
  'Question 1/2 (2 unanswered)',
  'Choose a storage engine.',
  '› 1. SQLite  Local storage.',
  '  2. PostgreSQL  Shared storage.',
  'tab to add notes | enter to submit answer | esc to interrupt',
];

describe('Codex screen controls', () => {
  it.each([
    question,
    [
      'Question 1/1 (1 unanswered)',
      'Share details.',
      '› Type your answer (optional)',
      'enter to submit answer | esc to interrupt',
    ],
    ['Question 2/2', '› Notes here', 'enter to submit all | esc to interrupt'],
    ['Submit with unanswered questions?', '› 1. Go back', '2. Submit', 'enter to confirm'],
  ])(
    'recognizes questions even without a question mark or with interrupt hints: %s',
    (...lines) => {
      expect(detectAgentActivity('codex', lines)).toBe('question');
    }
  );

  it.each([
    'Would you like to run the following command?',
    'Would you like to make the following edits?',
    'Would you like to grant these permissions?',
    'Would you like to send input to terminal 42?',
    'Do you want to approve network access to "example.com"?',
    'Example tool needs your approval.',
  ])('recognizes approval: %s', heading => {
    expect(
      detectAgentActivity('codex', [
        ...working,
        heading,
        ...Array<string>(20).fill('  proposed change'),
        '› 1. Yes, proceed (y)',
        '  2. No, and tell Codex what to do differently (esc)',
        'Press enter to confirm or esc to cancel',
      ])
    ).toBe('attention');
  });

  it('rejects old overlays above a current composer', () => {
    expect(detectAgentActivity('codex', [...question, ...working])).toBe('working');
    expect(detectAgentActivity('codex', [...question, 'Done.', ...prompt])).toBe('ready');
  });

  it('recognizes the current model footer but not arbitrary output beneath a prompt', () => {
    expect(detectAgentActivity('codex', prompt)).toBe('ready');
    expect(detectAgentActivity('codex', ['›', 'Still streaming output'])).toBe('unknown');
    expect(detectAgentActivity('codex', ['› my draft', prompt[1]])).toBe('unknown');
  });

  it('uses cell attributes to identify placeholders without depending on their wording', () => {
    const read = (text: string, dim: (column: number) => number, codex = true) =>
      readAgentScreen(
        {
          baseY: 0,
          length: 1,
          getLine: () => ({
            isWrapped: false,
            translateToString: () => text,
            getCell: column => ({ isDim: () => dim(column) }),
          }),
        },
        1,
        codex
      );
    expect(read('› Suggest any task', col => Number(col >= 2))).toEqual(['›']);
    expect(read('› Suggest any task', () => 0)).toEqual(['› Suggest any task']);
    expect(read('› Input disabled.', () => 1)).toEqual(['› Input disabled.']);
    expect(read('› 1. SQLite', col => Number(col >= 2))).toEqual(['› 1. SQLite']);
    expect(read('› Suggest any task', col => Number(col >= 2), false)).toEqual([
      '› Suggest any task',
    ]);
  });
});

describe('Codex title activity signals', () => {
  it('requires an activity prefix and its matching title before reporting idle', () => {
    const title = createCodexTitleActivity();
    expect(title('Working')).toBeNull();
    expect(title('Ready | unrelated')).toBeNull();
    expect(title('⠋ Fix tests | example')).toBe('working');
    expect(title('⠙ Fix tests | example')).toBe('working');
    expect(title('Fix tests | example')).toBe('ready');
    expect(title('Fix tests | example')).toBeUndefined();
    expect(title('A different title')).toBeNull();
    expect(title('Fix tests | example')).toBeNull();
  });
  it('recognizes both attention blink phases and clears disabled titles', () => {
    const title = createCodexTitleActivity();
    expect(title('[ ! ] Action Required | example')).toBe('attention');
    expect(title('[ . ] Action Required | example')).toBe('attention');
    expect(title('example')).toBe('ready');
    expect(title('⠋ example')).toBe('working');
    expect(title('')).toBeNull();
    expect(title('example')).toBeNull();
  });
});

describe('Codex turn lifecycle', () => {
  it('keeps streaming Working and completes from title even without a completion row', () => {
    const tracker = createAgentActivityTracker('codex');
    expect(tracker.inspect(prompt)).toBe('ready');
    tracker.input('Implement it');
    expect(tracker.input('\r')).toBe('working');
    expect(tracker.inspect(prompt)).toBe('working');
    tracker.title('⠋ Build | example');
    expect(tracker.inspect(working)).toBe('working');
    for (const text of ['First paragraph', 'Second paragraph', 'What about storage?'])
      expect(tracker.inspect(['── Worked for 12s ──', text, ...prompt])).toBe('working');
    tracker.title('Build | example');
    expect(tracker.inspect(['Finished.', ...prompt])).toBe('ready');
    // Same duration/output across two turns must not strand the second turn.
    tracker.input('Again');
    tracker.input('\r');
    tracker.title('⠙ Build | example');
    expect(tracker.inspect(working)).toBe('working');
    tracker.title('Build | example');
    expect(tracker.inspect(['Finished.', ...prompt])).toBe('ready');
  });

  it('keeps freeform and multi-step questions distinct from approvals and clears stale controls', () => {
    const tracker = createAgentActivityTracker('codex');
    tracker.title('⠋ example');
    tracker.inspect(working);
    tracker.title('[ ! ] Action Required | example');
    expect(tracker.inspect(question)).toBe('question');
    expect(tracker.input('\r')).toBe('working');
    expect(tracker.inspect(question)).toBe('working');
    expect(
      tracker.inspect(['Question 2/2', 'Share details.', 'enter to submit all | esc to interrupt'])
    ).toBe('question');
    tracker.input('Details');
    tracker.input('\r');
    tracker.title('⠙ example');
    expect(tracker.inspect(working)).toBe('working');
    tracker.title('[ . ] Action Required | example');
    const approval = [
      'Would you like to make the following edits?',
      '› 1. Yes',
      '2. No',
      'enter to confirm or esc to cancel',
    ];
    expect(tracker.inspect(approval)).toBe('attention');
    tracker.title('⠹ example');
    expect(tracker.inspect(approval)).toBe('working');
    expect(tracker.inspect(['Answer streaming', ...prompt])).toBe('working');
  });

  it('handles interrupted work and a direct question after confirmed completion', () => {
    const tracker = createAgentActivityTracker('codex');
    tracker.title('⠋ example');
    tracker.inspect(working);
    expect(tracker.input('\x1b')).toBe('working');
    tracker.title('example');
    expect(tracker.inspect(['Turn interrupted.', ...prompt])).toBe('ready');
    expect(tracker.inspect(['Which approach should I use?', ...prompt])).toBe('question');
  });

  it('falls back conservatively when titles are disabled; the pre-answer divider is not completion', () => {
    const tracker = createAgentActivityTracker('codex');
    tracker.inspect(working);
    expect(tracker.inspect(['── Worked for 12s ──', 'Still streaming.', ...prompt])).toBe(
      'working'
    );
    expect(tracker.inspect(['Final answer.', 'Worked for 12s · done 10:42', ...prompt])).toBe(
      'ready'
    );
    tracker.input('Next task');
    tracker.input('\r');
    expect(tracker.inspect(['Other output.', 'Worked for 12s · done 10:42', ...prompt])).toBe(
      'working'
    );
    expect(createAgentActivityTracker('codex').inspect(prompt)).toBe('ready');
  });

  it('supports Tab submission and preserves multiline editing', () => {
    const tracker = createAgentActivityTracker('codex');
    tracker.inspect(prompt);
    expect(tracker.input('\r')).toBe('ready');
    tracker.input('/model');
    expect(tracker.input('\t')).toBe('ready');
    expect(tracker.input('\r')).toBe('ready');
    tracker.input('\x15');
    tracker.input('\x1b[200~First\nsecond\x1b[201~');
    expect(tracker.input('\x1b[13;2u')).toBe('ready');
    expect(tracker.input('\t')).toBe('working');
    tracker.inspect(question);
    expect(tracker.input('\t')).toBe('question');
    tracker.input('Some notes');
    expect(tracker.input('\t')).toBe('question');
  });
});
