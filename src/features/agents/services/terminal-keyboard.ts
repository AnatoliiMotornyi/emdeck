interface TerminalKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}

export const terminalKeyAction = (event: TerminalKey) => {
  if (event.isComposing) return 'terminal';
  if (event.key === 'F5') return 'workspace';
  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  if (
    !event.altKey &&
    ((modifier && key === 'v') || (!modifier && event.shiftKey && key === 'insert'))
  )
    return 'paste';
  if (!event.altKey && modifier && event.shiftKey && key === 'c') return 'copy';
  // Shift+Enter and Ctrl/Cmd+Enter both mean "break the line, do not submit".
  // Alt+Enter keeps its own meta-return encoding and stays with the terminal.
  if (!event.altKey && key === 'enter' && (event.shiftKey || modifier)) return 'newline';
  return 'terminal';
};
