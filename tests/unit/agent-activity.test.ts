import { describe, expect, it } from 'vitest';
import { detectAgentActivity } from '../../src/features/agents/services/agent-activity';
import { inspectAgentScreen, agentStatus } from '../../src/features/agents/lib/agents';
import { sessionStatus } from '../../src/features/agents/lib/session-status';

describe('questions that need an answer', () => {
  it.each(['claude', 'codex', 'gemini'] as const)(
    'detects a current %s question before an empty prompt',
    kind => {
      expect(
        detectAgentActivity(kind, [
          'Which approach should we use?',
          '',
          '─────',
          '❯',
          '─────',
          '? for shortcuts',
        ])
      ).toBe('question');
      expect(detectAgentActivity(kind, ['Waiting for your response.', '›'])).toBe('question');
    }
  );

  it.each([
    [
      'Which database should we use?',
      '❯ 1. SQLite',
      '  2. PostgreSQL',
      'Enter to select · Esc to cancel',
    ],
    ['What should I work on first?', '1. UI', '2. API', 'Press Enter to confirm'],
  ])('detects an interactive question picker: %s', (...lines) => {
    expect(detectAgentActivity('claude', lines)).toBe('question');
  });

  it('keeps permission prompts distinct from questions and gives work priority', () => {
    const approval = ['Would you like to run the following command?', '❯ 1. Yes', '2. No'];
    expect(detectAgentActivity('codex', approval)).toBe('attention');
    expect(detectAgentActivity('codex', [...approval, 'Esc to interrupt'])).toBe('working');
    expect(detectAgentActivity('claude', ['Which option?', '❯ 1. A', '2. B', 'Working...'])).toBe(
      'working'
    );
  });

  it.each([
    ['What should we do?', 'I used the defaults and finished.', '›'],
    ['What should we do?', ...Array<string>(28).fill(''), '›'],
    ['Error: what is this?', '›'],
    ['const query = "what?";', '›'],
    ['Which tool is best?', '1. A', '2. B', 'Comparison complete.', '›'],
    ['Which tool is best?', '❯ 1. A', '2. B', 'I chose A and finished.', '›'],
    ['Which tool is best?', '❯ 1. A', '2. B', '› Use A.'],
    ['Which tool?', '›', 'The answer was already received.'],
    ['Which tool?', '›', '› Use the first one.'],
    ['Which tool is best?'],
  ])(
    'does not flag old questions, logs, typed responses or output without a prompt: %s',
    (...lines) => {
      expect(detectAgentActivity('claude', lines)).not.toBe('question');
    }
  );

  it('leaves arbitrary commands and shells unclassified', () => {
    for (const kind of ['shell', 'custom'] as const)
      expect(detectAgentActivity(kind, ['Which approach?', '›'])).toBe('unknown');
  });
});

describe('workspace status presentation', () => {
  const question = inspectAgentScreen('claude', ['Which approach?', '›']);
  it('includes questions in attention while retaining terminal lifecycle priority', () => {
    expect(agentStatus('running', question).tone).toBe('attention');
    expect(sessionStatus('running', question)).toMatchObject({
      kind: 'question',
      label: 'Waiting for answer',
      needsAttention: true,
    });
    for (const state of ['exited', 'error', 'starting', 'preview'] as const)
      expect(sessionStatus(state, question)).toMatchObject({ kind: state, needsAttention: false });
  });
  it('does not imply that an SSH connection or recent output is agent activity', () => {
    expect(sessionStatus('output', undefined)).toMatchObject({ kind: 'output', label: 'Output' });
    expect(sessionStatus('running', undefined)).toMatchObject({
      kind: 'connected',
      label: 'Connected',
    });
    expect(sessionStatus('output', question, true)).toMatchObject({
      kind: 'connected',
      label: 'SSH client running',
      needsAttention: false,
    });
    expect(sessionStatus('exited', question, true)).toMatchObject({
      label: 'Disconnected',
      needsAttention: false,
    });
  });
});
