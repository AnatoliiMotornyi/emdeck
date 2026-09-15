import { StreamLanguage } from '@codemirror/language';
import type { StringStream } from '@codemirror/language';

interface DotenvState {
  quote: string | null;
  phase: 'key' | 'equals' | 'value' | 'tail';
}

const quotedValue = (stream: StringStream, state: DotenvState): string => {
  while (!stream.eol()) {
    const char = stream.next();
    if (char === state.quote) {
      state.quote = null;
      state.phase = 'tail';
      break;
    }
    if (char === '\\') stream.next();
  }
  return 'string';
};

// Tokenize only the opened buffer; values are never evaluated or expanded.
export const dotenv = StreamLanguage.define<DotenvState>({
  name: 'dotenv',
  startState: () => ({ quote: null, phase: 'key' }),
  token: (stream, state) => {
    if (state.quote) return quotedValue(stream, state);
    if (stream.sol()) state.phase = 'key';
    if (stream.eatSpace()) return null;
    if (stream.peek() === '#') {
      stream.skipToEnd();
      return 'comment';
    }
    if (state.phase === 'key') {
      if (stream.match(/^export(?=\s+[\w.-]+\s*=)/)) return 'keyword';
      if (stream.match(/^[\w.-]+(?=\s*=)/)) {
        state.phase = 'equals';
        return 'propertyName';
      }
    } else if (state.phase === 'equals' && stream.eat('=')) {
      state.phase = 'value';
      return 'operator';
    } else if (state.phase === 'value') {
      const char = stream.peek();
      if (char === '"' || char === "'" || char === '`') {
        state.quote = char;
        stream.next();
        return quotedValue(stream, state);
      }
      stream.eatWhile(char => char !== '#');
      state.phase = 'tail';
      return 'string';
    }
    stream.skipToEnd();
    return null;
  },
  languageData: { commentTokens: { line: '#' } },
});
