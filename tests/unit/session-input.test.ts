import { describe, expect, it, vi } from 'vitest';
import { createSessionInput } from '../../src/features/agents/services/session-input';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('background terminal input', () => {
  it('sends the first key immediately and coalesces typing during a slow round trip in order', async () => {
    const flight = deferred();
    const send = vi.fn().mockReturnValueOnce(flight.promise).mockResolvedValue(undefined);
    const errors = vi.fn();
    const input = createSessionInput(send, errors);
    input.push('a');
    for (const key of 'bcdef\r') input.push(key);
    expect(send.mock.calls).toEqual([['a']]);
    flight.resolve();
    await vi.waitFor(() => expect(send.mock.calls).toEqual([['a'], ['bcdef\r']]));
    expect(errors).not.toHaveBeenCalled();
  });

  it('chunks large bracketed pastes without breaking unicode or their ordering', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const errors = vi.fn();
    const input = createSessionInput(send, errors);
    const text = '\x1b[200~' + 'a'.repeat(16377) + '🌍漢字'.repeat(15000) + '\x1b[201~';
    input.push(text);
    await vi.waitFor(() => expect(send.mock.calls.flat().join('')).toBe(text));
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    for (const [chunk] of send.mock.calls) {
      const bytes = encoder.encode(chunk);
      expect(bytes.length).toBeLessThanOrEqual(64 * 1024);
      expect(decoder.decode(bytes)).toBe(chunk);
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it('never replays failed input or sends queued keys after an error', async () => {
    const flight = deferred();
    const send = vi.fn(() => flight.promise);
    const errors = vi.fn();
    const input = createSessionInput(send, errors);
    input.push('submit\r');
    input.push('queued');
    flight.reject(new Error('connection lost'));
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    input.push('later');
    expect(send).toHaveBeenCalledExactlyOnceWith('submit\r');
  });

  it('drops unsent input on detach and ignores completion of a disposed write', async () => {
    const flight = deferred();
    const send = vi.fn(() => flight.promise);
    const errors = vi.fn();
    const input = createSessionInput(send, errors);
    input.push('first');
    input.push('queued');
    input.stop();
    input.push('later');
    flight.reject(new Error('detached'));
    await Promise.resolve();
    expect(send).toHaveBeenCalledExactlyOnceWith('first');
    expect(errors).not.toHaveBeenCalled();
  });

  it('bounds unsent data and reports overflow instead of growing an endless promise queue', () => {
    const send = vi.fn(() => new Promise<void>(() => {}));
    const errors = vi.fn();
    const input = createSessionInput(send, errors);
    input.push('first');
    input.push('x'.repeat(256 * 1024));
    input.push('too much');
    expect(errors).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledExactlyOnceWith('first');
  });
});
