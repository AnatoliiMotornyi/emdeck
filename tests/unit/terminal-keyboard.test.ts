import { describe, expect, it } from 'vitest';
import { terminalKeyAction } from '../../src/features/agents/services/terminal-keyboard';

const key = {
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
};

describe('terminal keyboard ownership', () => {
  it('reserves paste for the webview, including shifted and macOS shortcuts', () => {
    expect(terminalKeyAction({ ...key, key: 'v', ctrlKey: true })).toBe('paste');
    expect(terminalKeyAction({ ...key, key: 'V', ctrlKey: true, shiftKey: true })).toBe('paste');
    expect(terminalKeyAction({ ...key, key: 'v', metaKey: true })).toBe('paste');
    expect(terminalKeyAction({ ...key, key: 'Insert', shiftKey: true })).toBe('paste');
  });

  it('distinguishes multiline input, submit, interrupt, literal typing and agent shortcuts', () => {
    for (const event of [
      { key: 'Enter', shiftKey: true },
      { key: 'Enter', ctrlKey: true },
      { key: 'Enter', metaKey: true },
      { key: 'Enter', ctrlKey: true, shiftKey: true },
    ])
      expect(terminalKeyAction({ ...key, ...event })).toBe('newline');
    for (const event of [
      { key: 'Enter' },
      { key: 'Enter', altKey: true },
      { key: 'Enter', ctrlKey: true, altKey: true },
      { key: 'j', ctrlKey: true },
      { key: 'c', ctrlKey: true },
      { key: 'v' },
      { key: 'v', altKey: true },
      { key: 'v', ctrlKey: true, altKey: true },
      { key: 'Tab', shiftKey: true },
    ])
      expect(terminalKeyAction({ ...key, ...event })).toBe('terminal');
  });

  it('preserves IME composition and keeps copy and Run separate from terminal input', () => {
    expect(terminalKeyAction({ ...key, key: 'Enter', shiftKey: true, isComposing: true })).toBe(
      'terminal'
    );
    expect(terminalKeyAction({ ...key, key: 'Enter', ctrlKey: true, isComposing: true })).toBe(
      'terminal'
    );
    expect(terminalKeyAction({ ...key, key: 'C', ctrlKey: true, shiftKey: true })).toBe('copy');
    expect(terminalKeyAction({ ...key, key: 'C', metaKey: true, shiftKey: true })).toBe('copy');
    expect(terminalKeyAction({ ...key, key: 'F5' })).toBe('workspace');
  });
});
