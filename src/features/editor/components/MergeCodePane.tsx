import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  isolateHistory,
} from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { drawSelection, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { MergeEditorProps } from '../../../shared/contracts/gitConflicts';
import type { Settings } from '../../../shared/contracts/workspace';
import { useLatest } from '../../../shared/hooks/useLatest';
import { loadLanguage } from '../lib/language';
import {
  mergeDecorations,
  mergeDecorationField,
  setMergeDecorations,
} from '../lib/mergeDecorations';
import { editorTheme } from '../lib/theme';
import { mergeBlocksField, mergeBlockHistory, setMergeBlocks } from '../lib/mergeBlockHistory';

type Props = MergeEditorProps & { settings: Settings };

export default function MergeCodePane(props: Props) {
  const { path, content, settings, readOnly, highlights, actions, resultBlocks, reveal, label } =
    props;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cache = useRef(new Map<string, EditorState>());
  const latest = useLatest(props);
  const compartments = useRef({
    theme: new Compartment(),
    language: new Compartment(),
    editable: new Compartment(),
  });
  const accept = useRef<NonNullable<MergeEditorProps['onResolve']>>((block, choice, mode) =>
    latest.current.onResolve?.(block, choice, mode)
  );
  useEffect(() => {
    if (!host.current) return;
    const input = latest.current;
    const states = cache.current;
    const { theme, language, editable } = compartments.current;
    const cached = states.get(path);
    const state =
      cached?.sliceDoc() === input.content
        ? cached
        : EditorState.create({
            doc: input.content,
            extensions: [
              EditorState.lineSeparator.of(input.content.includes('\r\n') ? '\r\n' : '\n'),
              lineNumbers(),
              drawSelection(),
              history(),
              mergeBlocksField.init(() => input.resultBlocks ?? []),
              mergeBlockHistory,
              bracketMatching(),
              search({ top: true }),
              theme.of(editorTheme(input.settings)),
              language.of([]),
              mergeDecorationField,
              editable.of(EditorState.readOnly.of(input.readOnly)),
              EditorView.contentAttributes.of({ 'aria-label': input.label }),
              keymap.of([
                {
                  key: 'Mod-s',
                  run: () => {
                    if (!latest.current.readOnly) latest.current.onSave();
                    return true;
                  },
                },
                ...defaultKeymap,
                ...historyKeymap,
                ...searchKeymap,
                indentWithTab,
              ]),
              EditorView.updateListener.of(update => {
                if (
                  (update.docChanged ||
                    update.transactions.some(t =>
                      t.effects.some(effect => effect.is(setMergeBlocks))
                    )) &&
                  !update.transactions.some(t => t.annotation(Transaction.remote))
                )
                  latest.current.onChange(
                    update.state.sliceDoc(),
                    update.state.field(mergeBlocksField)
                  );
              }),
            ],
          });
    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    let cancelled = false;
    loadLanguage(path)
      .then(extension => {
        if (!cancelled) editor.dispatch({ effects: language.reconfigure(extension) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      states.set(path, editor.state);
      editor.destroy();
      view.current = null;
    };
  }, [latest, path]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const contentChanged = editor.state.sliceDoc() !== content;
    if (contentChanged || (resultBlocks && resultBlocks !== editor.state.field(mergeBlocksField))) {
      // External block choices form individual undo steps, without echoing the change
      // into the draft or recreating the editor. Keep CRLF at the IO boundary.
      editor.dispatch({
        changes: contentChanged
          ? { from: 0, to: editor.state.doc.length, insert: content }
          : undefined,
        effects: resultBlocks ? setMergeBlocks.of(resultBlocks) : [],
        annotations: [
          Transaction.remote.of(true),
          isolateHistory.of('full'),
          Transaction.addToHistory.of(contentChanged),
        ],
      });
    }
    editor.dispatch({
      effects: setMergeDecorations.of(
        mergeDecorations(editor.state, highlights, actions ?? [], accept.current)
      ),
    });
  }, [content, highlights, actions, resultBlocks]);
  useEffect(() => {
    view.current?.dispatch({
      effects: [
        compartments.current.theme.reconfigure(editorTheme(settings)),
        compartments.current.editable.reconfigure(EditorState.readOnly.of(readOnly)),
      ],
    });
  }, [settings, readOnly, path]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || !reveal) return;
    editor.dispatch({
      effects: EditorView.scrollIntoView(Math.min(reveal.position, editor.state.doc.length), {
        y: 'center',
      }),
    });
  }, [reveal]);
  return <div className='editor-host merge-code-host' ref={host} aria-label={label} />;
}
