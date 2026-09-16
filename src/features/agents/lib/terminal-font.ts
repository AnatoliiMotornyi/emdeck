export const DEFAULT_TERMINAL_FONT =
  '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace';

export const terminalFont = (family: string) => family.trim() || DEFAULT_TERMINAL_FONT;
