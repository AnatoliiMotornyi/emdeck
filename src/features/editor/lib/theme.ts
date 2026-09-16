import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Settings } from '../../../shared/contracts/workspace';

const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#c5a1e9' },
  { tag: [tags.string, tags.special(tags.string)], color: '#b8cf8b' },
  { tag: [tags.number, tags.bool, tags.null], color: '#dfa879' },
  { tag: tags.comment, color: '#6e7886', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#8bbbd7' },
  { tag: [tags.typeName, tags.className], color: '#e4c289' },
  { tag: tags.propertyName, color: '#bdc6d6' },
  { tag: tags.operator, color: '#a4aebb' },
]);
const lightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#8653a8' },
  { tag: [tags.string, tags.special(tags.string)], color: '#497333' },
  { tag: [tags.number, tags.bool, tags.null], color: '#a26830' },
  { tag: tags.comment, color: '#7e8b91', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#2b7399' },
  { tag: [tags.typeName, tags.className], color: '#96712a' },
  { tag: tags.propertyName, color: '#465a71' },
  { tag: tags.operator, color: '#667484' },
]);
export const editorTheme = (settings: Settings) => [
  EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: `${settings.fontSize}px`,
        backgroundColor: 'var(--editor)',
        color: 'var(--text)',
      },
      '.cm-content': { fontFamily: 'var(--mono)', padding: '14px 0', caretColor: 'var(--accent)' },
      '.cm-line': { padding: '0 18px 0 8px' },
      '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.8', overflow: 'auto' },
      '.cm-gutters': {
        background: 'var(--editor)',
        color: 'var(--muted)',
        border: 'none',
        paddingLeft: '10px',
      },
      '.cm-activeLineGutter': { color: 'var(--text)', background: 'transparent' },
      '.cm-activeLine': { backgroundColor: 'var(--line)' },
      '.cm-foldGutter': { width: '18px' },
      '.cm-cursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        background: 'var(--selection) !important',
      },
      '.cm-panels': {
        background: 'var(--panel)',
        color: 'var(--text)',
        borderColor: 'var(--border)',
      },
      '.cm-search': { fontFamily: 'var(--sans)', fontSize: '12px' },
      '.cm-textfield, .cm-button': {
        background: 'var(--elevated)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
      },
    },
    { dark: settings.theme !== 'light' }
  ),
  syntaxHighlighting(settings.theme === 'light' ? lightHighlight : darkHighlight),
  settings.wordWrap ? EditorView.lineWrapping : [],
];
