import type { Terminal } from '@xterm/xterm';
import { terminalKeyAction } from '../services/terminal-keyboard';

/** Install once per xterm instance; all input still uses its existing PTY/lease transport. */
export const bindTerminalKeyboard = (term: Terminal, onError: (error: unknown) => void) => {
  term.attachCustomKeyEventHandler(event => {
    const action = terminalKeyAction(event);
    if (action === 'terminal') return true;
    // Do not cancel browser paste: its ClipboardEvent carries both text and files.
    // In particular, xterm must not turn Ctrl+V into SYN and prevent that event.
    if (action === 'paste' || action === 'workspace') return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'keydown') {
      if (action === 'copy') void navigator.clipboard.writeText(term.getSelection()).catch(onError);
      // CSI-u encodes a line break without silently submitting a plain carriage
      // return. Ctrl+Enter has no terminal encoding of its own, so it reuses the
      // one agents already accept rather than inventing a sequence they ignore.
      else term.input('\x1b[13;2u', true);
    }
    return false;
  });
};
