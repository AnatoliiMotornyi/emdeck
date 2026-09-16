import { describe, expect, it, vi } from 'vitest';
import { createTerminalFitter } from '../../src/features/agents/services/terminal-fit';

const fixture = (position = 100) => {
  const active = { baseY: 100, viewportY: position, cursorY: 24 };
  const marker = {
    line: position,
    isDisposed: false,
    dispose: vi.fn(() => {
      marker.isDisposed = true;
    }),
  };
  const terminal = {
    buffer: { active },
    registerMarker: vi.fn(() => marker),
    scrollToLine: vi.fn((line: number) => {
      active.viewportY = line;
    }),
    scrollToBottom: vi.fn(() => {
      active.viewportY = active.baseY;
    }),
  };
  const callbacks = new Map<number, () => void>();
  let next = 0;
  const fit = vi.fn(() => {
    active.viewportY = 0;
  });
  const fitter = createTerminalFitter(terminal, fit, {
    request: callback => {
      callbacks.set(++next, callback);
      return next;
    },
    cancel: id => {
      callbacks.delete(id);
    },
  });
  const flush = () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback());
  };
  return { active, terminal, marker, fitter, callbacks, flush, fit };
};

describe('terminal fitting', () => {
  it('keeps following output after the resized DOM clamps the viewport', () => {
    const state = fixture();
    state.fitter.fit();
    state.active.baseY = 110;
    state.flush();
    expect(state.active.viewportY).toBe(110);
  });
  it('does not jump from scrollback to the latest output', () => {
    const state = fixture(20);
    state.fitter.fit();
    state.flush();
    expect(state.terminal.scrollToBottom).not.toHaveBeenCalled();
    expect(state.active.viewportY).toBe(20);
    expect(state.terminal.registerMarker).toHaveBeenCalledWith(-104);
    expect(state.marker.dispose).toHaveBeenCalledTimes(1);
  });
  it('retains the historical line across rapid resizes and reflow', () => {
    const state = fixture(20);
    state.fitter.fit();
    state.marker.line = 35;
    state.active.viewportY = state.active.baseY;
    state.fitter.fit();
    state.flush();
    expect(state.active.viewportY).toBe(35);
    expect(state.terminal.registerMarker).toHaveBeenCalledTimes(1);
    expect(state.terminal.scrollToBottom).not.toHaveBeenCalled();
    expect(state.marker.dispose).toHaveBeenCalledTimes(1);
  });
  it('does not restore a historical line that has been trimmed from the buffer', () => {
    const state = fixture(20);
    state.fitter.fit();
    state.marker.isDisposed = true;
    state.flush();
    expect(state.terminal.scrollToLine).not.toHaveBeenCalled();
  });
  it('does not restore the normal buffer position into an alternate screen', () => {
    const state = fixture(20);
    state.fitter.fit();
    state.terminal.buffer.active = { baseY: 0, viewportY: 0, cursorY: 0 };
    state.flush();
    expect(state.terminal.scrollToLine).not.toHaveBeenCalled();
    expect(state.marker.dispose).toHaveBeenCalledTimes(1);
  });
  it('releases a historical marker when a user gesture cancels or the view closes', () => {
    for (const action of ['cancel', 'dispose'] as const) {
      const state = fixture(20);
      state.fitter.fit();
      state.fitter[action]();
      state.flush();
      expect(state.terminal.scrollToLine).not.toHaveBeenCalled();
      expect(state.marker.dispose).toHaveBeenCalledTimes(1);
      expect(state.callbacks.size).toBe(0);
    }
  });
  it('coalesces rapid resizes without losing the original follow position', () => {
    const state = fixture();
    state.fitter.fit();
    state.fitter.fit();
    expect(state.callbacks.size).toBe(1);
    state.flush();
    expect(state.terminal.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(state.active.viewportY).toBe(100);
  });
  it('lets user scrolling cancel a pending restore and stops after disposal', () => {
    const state = fixture();
    state.fitter.fit();
    state.fitter.cancel();
    state.flush();
    expect(state.terminal.scrollToBottom).not.toHaveBeenCalled();
    state.fitter.dispose();
    state.fitter.fit();
    expect(state.fit).toHaveBeenCalledTimes(1);
    expect(state.callbacks.size).toBe(0);
  });
});
