import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { OpenFile, Settings } from '../../../shared/contracts/workspace';
import { useLatest } from '../../../shared/hooks/useLatest';
import { loadLanguage } from '../lib/language';
import { editorTheme } from '../lib/theme';
export interface EditorProps {
  file: OpenFile;
  settings: Settings;
  onChange: (path: string, text: string) => void;
  onCursor: (line: number, column: number) => void;
  onSave: () => void;
  openPaths: string[];
  reveal?: { line: number; column?: number; sequence: number } | null;
}
export default function Editor({
  file,
  settings,
  onChange,
  onCursor,
  onSave,
  openPaths,
  reveal,
}: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cache = useRef(new Map<string, EditorState>());
  const current = useRef('');
  const callbacks = useLatest({ onChange, onCursor, onSave });

  const documentInput = useLatest({ file, settings });

  const compartments = useRef({ theme: new Compartment(), language: new Compartment() });
  useEffect(() => {
    if (!host.current) return;
    const { file, settings } = documentInput.current;
    const { theme: tc, language: lc } = compartments.current;
    if (view.current && current.current) cache.current.set(current.current, view.current.state);
    current.current = file.path;
    let state = cache.current.get(file.path);
    if (!state || state.sliceDoc() !== file.content)
      state = EditorState.create({
        doc: file.content,
        extensions: [
          EditorState.lineSeparator.of(file.content.includes('\r\n') ? '\r\n' : '\n'),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          rectangularSelection(),
          history(),
          foldGutter(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          search({ top: true }),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacks.current.onSave();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          tc.of(editorTheme(settings)),
          lc.of([]),
          EditorView.updateListener.of(update => {
            if (update.docChanged)
              callbacks.current.onChange(current.current, update.state.sliceDoc());
            if (update.selectionSet || update.docChanged) {
              const pos = update.state.selection.main.head,
                line = update.state.doc.lineAt(pos);
              callbacks.current.onCursor(line.number, pos - line.from + 1);
            }
          }),
        ],
      });
    if (view.current) view.current.setState(state);
    else view.current = new EditorView({ state, parent: host.current });
    view.current.dispatch({ effects: tc.reconfigure(editorTheme(settings)) });
    let cancelled = false;
    loadLanguage(file.path)
      .then(ext => {
        if (!cancelled) view.current?.dispatch({ effects: lc.reconfigure(ext) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Each document retains its own undo history and selection.
  }, [callbacks, documentInput, file.path]);
  useEffect(() => {
    if (view.current && view.current.state.sliceDoc() !== file.content)
      view.current.dispatch({
        changes: { from: 0, to: view.current.state.doc.length, insert: file.content },
      });
  }, [file.content]);
  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.theme.reconfigure(editorTheme(settings)),
    });
  }, [settings]);
  // Keyed on sequence too, so asking for the same line twice still scrolls to it.
  const { line: revealLine, column: revealColumn, sequence: revealSequence } = reveal ?? {};
  const revealed = useRef(0);
  useEffect(() => {
    const editor = view.current;
    // Switching tabs re-supplies the same request; replaying it would move the cursor again.
    if (!revealLine || !editor || revealSequence === revealed.current) return;
    revealed.current = revealSequence ?? 0;
    const line = editor.state.doc.line(Math.min(revealLine, editor.state.doc.lines));
    const position = Math.min(line.from + Math.max((revealColumn ?? 1) - 1, 0), line.to);
    editor.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' }),
    });
    editor.focus();
  }, [revealLine, revealColumn, revealSequence]);
  useEffect(() => {
    for (const key of cache.current.keys()) if (!openPaths.includes(key)) cache.current.delete(key);
  }, [openPaths]);
  useEffect(
    () => () => {
      view.current?.destroy();
      view.current = null;
    },
    []
  );
  return <div className='editor-host' ref={host} data-testid='code-editor' />;
}
