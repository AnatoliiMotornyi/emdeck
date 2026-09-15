import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import type {
  MergeBlockAction,
  MergeBlockChoice,
  MergeBlockMode,
  MergeHighlight,
} from '../../../shared/contracts/gitConflicts';

export const setMergeDecorations = StateEffect.define<DecorationSet>();
export const mergeDecorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (value, transaction) => {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects)
      if (effect.is(setMergeDecorations)) next = effect.value;
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

class AcceptBlock extends WidgetType {
  constructor(
    readonly action: MergeBlockAction,
    readonly accept: (block: number, choice: MergeBlockChoice, mode?: MergeBlockMode) => void
  ) {
    super();
  }
  eq(other: AcceptBlock) {
    return (
      this.action.block === other.action.block &&
      this.action.choice === other.action.choice &&
      this.action.resolved === other.action.resolved &&
      this.action.applied === other.action.applied &&
      this.action.canAppend === other.action.canAppend &&
      this.action.disabled === other.action.disabled &&
      this.accept === other.accept
    );
  }
  toDOM() {
    const container = document.createElement('div');
    container.className = 'merge-inline-action';
    const button = document.createElement('button');
    const { block, choice, resolved, applied, canAppend, disabled } = this.action;
    const arrow = choice === 'ours' ? '→' : '←';
    button.type = 'button';
    button.textContent =
      choice === 'both' ? '⇆ Use both' : resolved ? `${arrow} Apply` : `${arrow} Accept ${choice}`;
    button.setAttribute(
      'aria-label',
      `${choice === 'both' ? 'Use both' : resolved ? `Apply ${choice} to result` : `Accept ${choice}`} for conflict ${block + 1}`
    );
    button.disabled = Boolean(disabled);
    button.title = disabled
      ? 'Block boundaries changed. Undo the edit or finish the result manually.'
      : `Replace only block ${block + 1} in the result with ${choice}.`;
    button.addEventListener('click', () => this.accept(block, choice, 'replace'));
    container.append(button);
    if (canAppend) {
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = '↓ Add below';
      add.disabled = Boolean(disabled);
      add.setAttribute('aria-label', `Add ${choice} below result for conflict ${block + 1}`);
      add.title = `Keep the current result for block ${block + 1} and append ${choice} immediately below it.`;
      add.addEventListener('click', () => this.accept(block, choice, 'append'));
      container.append(add);
    }
    if (applied && !disabled) {
      const status = document.createElement('span');
      status.textContent = '✓ Applied';
      container.append(status);
    }
    return container;
  }
  ignoreEvent() {
    return true;
  }
}

export const mergeDecorations = (
  state: EditorState,
  highlights: MergeHighlight[],
  actions: MergeBlockAction[],
  accept: (block: number, choice: MergeBlockChoice, mode?: MergeBlockMode) => void
) => {
  const decorations: Range<Decoration>[] = [];
  const lines = new Map<number, { kind: MergeHighlight['kind']; selected: boolean }>();
  const clamp = (position: number) => Math.min(Math.max(position, 0), state.doc.length);
  for (const range of highlights) {
    const from = clamp(range.from),
      to = clamp(range.to);
    const first = state.doc.lineAt(from),
      last = state.doc.lineAt(Math.max(from, to - 1));
    for (let n = first.number; n <= last.number; n++) {
      const position = state.doc.line(n).from;
      if (lines.get(position)?.kind !== 'conflict')
        lines.set(position, { kind: range.kind, selected: Boolean(range.selected) });
    }
    if (to > from && range.kind !== 'conflict')
      decorations.push(Decoration.mark({ class: 'merge-word-change' }).range(from, to));
  }
  for (const [at, { kind, selected }] of lines)
    decorations.push(
      Decoration.line({
        attributes: {
          class: `merge-line-${kind}${selected ? ' merge-line-selected' : ''}`,
          'data-merge-kind': kind,
        },
      }).range(at)
    );
  for (const action of actions)
    decorations.push(
      Decoration.widget({
        widget: new AcceptBlock(action, accept),
        block: true,
        side: -1,
      }).range(state.doc.lineAt(clamp(action.at)).from)
    );
  return Decoration.set(decorations, true);
};
