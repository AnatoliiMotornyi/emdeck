interface BufferPosition {
  readonly viewportY: number;
  readonly baseY: number;
  readonly cursorY: number;
}
interface LineMarker {
  readonly line: number;
  readonly isDisposed: boolean;
  dispose: () => void;
}
interface Viewport {
  buffer: { readonly active: BufferPosition };
  scrollToBottom: () => void;
  scrollToLine: (line: number) => void;
  registerMarker: (offset: number) => LineMarker | undefined;
}
interface Frames {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
}

export const createTerminalFitter = (terminal: Viewport, fit: () => void, frames: Frames) => {
  let pending: number | null = null;
  let position: { buffer: BufferPosition; marker: LineMarker | undefined; bottom: boolean } | null =
    null;
  let disposed = false;
  const cancel = () => {
    if (pending !== null) frames.cancel(pending);
    pending = null;
    position?.marker?.dispose();
    position = null;
  };
  return {
    fit: () => {
      if (disposed) return;
      const buffer = terminal.buffer.active;
      if (position?.buffer !== buffer) cancel();
      if (!position) {
        const bottom = buffer.viewportY === buffer.baseY;
        position = {
          buffer,
          bottom,
          // xterm changes viewportY when rows shrink, even in scrollback.
          // A marker follows the line through reflow and buffer trimming.
          marker: bottom
            ? undefined
            : terminal.registerMarker(buffer.viewportY - buffer.baseY - buffer.cursorY),
        };
      }
      if (pending !== null) frames.cancel(pending);
      fit();
      // The viewport must follow xterm's screen height (not the host's height)
      // so browser clamping cannot happen before this snapshot. Restore after
      // xterm synchronizes its DOM scroll area on the next frame.
      pending = frames.request(() => {
        pending = null;
        const saved = position;
        position = null;
        if (!saved) return;
        if (!disposed && terminal.buffer.active === saved.buffer) {
          if (saved.bottom) terminal.scrollToBottom();
          else if (saved.marker && !saved.marker.isDisposed)
            terminal.scrollToLine(saved.marker.line);
        }
        saved.marker?.dispose();
      });
    },
    cancel,
    dispose: () => {
      disposed = true;
      cancel();
    },
  };
};
