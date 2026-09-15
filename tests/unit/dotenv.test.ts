import { ensureSyntaxTree, HighlightStyle } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { highlightTree, tags } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';
import { dotenv } from '../../src/features/editor/lib/dotenv';
import { loadLanguage } from '../../src/features/editor/lib/language';
import { fileKind, isDotenv } from '../../src/shared/lib/paths';

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, class: 'key' },
  { tag: tags.string, class: 'value' },
  { tag: tags.comment, class: 'comment' },
  { tag: tags.operator, class: 'operator' },
  { tag: tags.keyword, class: 'keyword' },
]);

const tokens = (state: EditorState) => {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  expect(tree).not.toBeNull();
  const result: { text: string; kind: string }[] = [];
  highlightTree(tree!, highlight, (from, to, kind) => {
    result.push({ text: state.sliceDoc(from, to), kind });
  });
  return result;
};
const parse = (doc: string) => tokens(EditorState.create({ doc, extensions: [dotenv] }));

describe('environment file highlighting', () => {
  it('recognizes dotenv names on every platform without matching parent directories', async () => {
    for (const path of [
      '.env',
      '.env.local',
      '.env.development.local',
      '/project/.env.example',
      'C:\\project\\.env.production',
      'config/staging.env',
      'config/.ENV',
      '.env.js',
    ]) {
      expect(isDotenv(path), path).toBe(true);
      expect(fileKind(path), path).toBe('Dotenv');
      expect(await loadLanguage(path), path).toBe(dotenv);
    }
    for (const path of ['.envrc', '.environment', 'env.json', '/project/.env/file.ts']) {
      expect(isDotenv(path), path).toBe(false);
      expect(fileKind(path), path).not.toBe('Dotenv');
    }
    expect(await loadLanguage('notes.txt')).toEqual([]);
  });

  it('colors keys, assignment, export, unquoted strings and comments', () => {
    expect(
      parse('# Settings\n export APP_MODE = development # inline\nPORT=3000\nEMPTY=\n')
    ).toEqual([
      { text: '# Settings', kind: 'comment' },
      { text: 'export', kind: 'keyword' },
      { text: 'APP_MODE', kind: 'key' },
      { text: '=', kind: 'operator' },
      { text: 'development ', kind: 'value' },
      { text: '# inline', kind: 'comment' },
      { text: 'PORT', kind: 'key' },
      { text: '=', kind: 'operator' },
      { text: '3000', kind: 'value' },
      { text: 'EMPTY', kind: 'key' },
      { text: '=', kind: 'operator' },
    ]);
  });

  it('keeps hashes, equals and escaped quotes inside quoted values', () => {
    const result = parse('A="a\\"#b=c" # comment\nB=\'one#two\'\nC=`three#four`\n');
    expect(result.filter(token => token.kind === 'value').map(token => token.text)).toEqual([
      '"a\\"#b=c"',
      "'one#two'",
      '`three#four`',
    ]);
    expect(result.filter(token => token.kind === 'comment')).toEqual([
      { text: '# comment', kind: 'comment' },
    ]);
  });

  it('preserves multiline quotes across blank lines and resumes keys after the closing quote', () => {
    const result = parse('MESSAGE="first\n\n# still a value\nlast"\nNEXT=yes\n');
    expect(result.filter(token => token.kind === 'key').map(token => token.text)).toEqual([
      'MESSAGE',
      'NEXT',
    ]);
    expect(result.some(token => token.kind === 'comment')).toBe(false);
    expect(result.some(token => token.kind === 'value' && token.text.includes('# still'))).toBe(
      true
    );
  });

  it('updates highlighting when an unfinished quote is closed while editing', () => {
    const doc = 'MESSAGE="first\nNEXT=yes';
    const state = EditorState.create({ doc, extensions: [dotenv] });
    expect(tokens(state).filter(token => token.kind === 'key')).toHaveLength(1);
    const edited = state.update({ changes: { from: doc.indexOf('\n'), insert: '"' } }).state;
    expect(
      tokens(edited)
        .filter(token => token.kind === 'key')
        .map(token => token.text)
    ).toEqual(['MESSAGE', 'NEXT']);
  });

  it('keeps quote characters in unquoted values literal and resets at the next line', () => {
    const result = parse("LABEL=it's local\r\nNEXT=true\r\nexport=plain\r\n");
    expect(result.filter(token => token.kind === 'value').map(token => token.text)).toEqual([
      "it's local",
      'true',
      'plain',
    ]);
    expect(result.filter(token => token.kind === 'key').map(token => token.text)).toEqual([
      'LABEL',
      'NEXT',
      'export',
    ]);
  });
});
