import type { Layout } from '../../../shared/contracts/workspace';
import type {
  PaneDropSide,
  SessionLayout,
  SessionLayoutNode,
} from '../../../shared/contracts/sessionLayout';

const presets = ['columns', 'rows', 'grid'];
const boundedKeys = (keys: string[]) =>
  [...new Set(keys.filter(key => key.length > 0 && key.length <= 400))].slice(0, 64);
export const layoutKeys = (node: SessionLayoutNode | null): string[] =>
  !node
    ? []
    : node.kind === 'pane'
      ? [node.key]
      : [...layoutKeys(node.first), ...layoutKeys(node.second)];

export const restoreSessionLayout = (value: unknown, fallback: Layout): SessionLayout => {
  const empty: SessionLayout = { version: 1, mode: fallback, root: null };
  if (!value || typeof value !== 'object') return empty;
  const saved = value as Record<string, unknown>;
  if (
    saved.version !== 1 ||
    typeof saved.mode !== 'string' ||
    ![...presets, 'custom'].includes(saved.mode)
  )
    return empty;
  let remaining = 127;
  const keys = new Set<string>();
  const ids = new Set<string>();
  const parse = (value: unknown, depth: number): SessionLayoutNode => {
    if (!value || typeof value !== 'object' || --remaining < 0 || depth > 64)
      throw new Error('Invalid layout');
    const node = value as Record<string, unknown>;
    if (node.kind === 'pane') {
      if (
        typeof node.key !== 'string' ||
        !node.key ||
        node.key.length > 400 ||
        keys.has(node.key) ||
        keys.size >= 64
      )
        throw new Error('Invalid pane');
      keys.add(node.key);
      return { kind: 'pane', key: node.key };
    }
    if (
      node.kind !== 'split' ||
      typeof node.id !== 'string' ||
      !node.id ||
      node.id.length > 128 ||
      ids.has(node.id) ||
      (node.axis !== 'columns' && node.axis !== 'rows') ||
      typeof node.ratio !== 'number' ||
      !Number.isFinite(node.ratio) ||
      node.ratio < 0.05 ||
      node.ratio > 0.95
    )
      throw new Error('Invalid split');
    ids.add(node.id);
    return {
      kind: 'split',
      id: node.id,
      axis: node.axis,
      ratio: node.ratio,
      first: parse(node.first, depth + 1),
      second: parse(node.second, depth + 1),
    };
  };
  try {
    return {
      version: 1,
      mode: saved.mode as SessionLayout['mode'],
      root: saved.root === null ? null : parse(saved.root, 0),
    };
  } catch {
    return empty;
  }
};

export const presetSessionLayout = (mode: Layout, keys: string[]): SessionLayout => {
  let split = 0;
  const join = (axis: 'columns' | 'rows', nodes: SessionLayoutNode[]): SessionLayoutNode => {
    if (nodes.length === 1) return nodes[0];
    const middle = Math.ceil(nodes.length / 2);
    return {
      kind: 'split',
      id: `preset-${mode}-${split++}`,
      axis,
      ratio: middle / nodes.length,
      first: join(axis, nodes.slice(0, middle)),
      second: join(axis, nodes.slice(middle)),
    };
  };
  const leaves: SessionLayoutNode[] = boundedKeys(keys).map(key => ({ kind: 'pane', key }));
  let root: SessionLayoutNode | null = null;
  if (leaves.length && mode === 'grid') {
    const columns = Math.ceil(Math.sqrt(leaves.length));
    const rows: SessionLayoutNode[] = [];
    for (let i = 0; i < leaves.length; i += columns)
      rows.push(join('columns', leaves.slice(i, i + columns)));
    root = join('rows', rows);
  } else if (leaves.length) root = join(mode === 'rows' ? 'rows' : 'columns', leaves);
  return { version: 1, mode, root };
};

export const visibleSessionLayout = (
  node: SessionLayoutNode | null,
  keys: Set<string>
): SessionLayoutNode | null => {
  if (!node) return null;
  if (node.kind === 'pane') return keys.has(node.key) ? node : null;
  const first = visibleSessionLayout(node.first, keys);
  const second = visibleSessionLayout(node.second, keys);
  if (!first || !second) return first ?? second;
  return first === node.first && second === node.second ? node : { ...node, first, second };
};

export const reconcileSessionLayout = (
  layout: SessionLayout,
  attached: string[]
): SessionLayout => {
  const keys = boundedKeys(attached);
  const previous = layoutKeys(layout.root);
  const keySet = new Set(keys);
  const previousSet = new Set(previous);
  const kept = previous.filter(key => keySet.has(key));
  const added = keys.filter(key => !previousSet.has(key));
  if (!added.length && kept.length === previous.length) return layout;
  if (layout.mode !== 'custom') return presetSessionLayout(layout.mode, [...kept, ...added]);
  let root = visibleSessionLayout(layout.root, keySet);
  const splitIds = (node: SessionLayoutNode | null): string[] =>
    !node || node.kind === 'pane'
      ? []
      : [node.id, ...splitIds(node.first), ...splitIds(node.second)];
  const used = new Set(splitIds(root));
  let next = 0;
  for (const key of added) {
    while (used.has(`added-${next}`)) next++;
    const id = `added-${next++}`;
    used.add(id);
    const pane: SessionLayoutNode = { kind: 'pane', key };
    root = root
      ? {
          kind: 'split',
          id,
          axis: 'columns',
          ratio: 0.5,
          first: root,
          second: pane,
        }
      : pane;
  }
  return { ...layout, root };
};

export const moveSessionPane = (
  layout: SessionLayout,
  source: string,
  target: string,
  side: PaneDropSide,
  id: string
): SessionLayout => {
  const keys = layoutKeys(layout.root);
  if (source === target || !keys.includes(source) || !keys.includes(target)) return layout;
  const root =
    side === 'swap'
      ? layout.root
      : visibleSessionLayout(layout.root, new Set(keys.filter(key => key !== source)));
  const move = (node: SessionLayoutNode): SessionLayoutNode => {
    if (node.kind === 'split')
      return { ...node, first: move(node.first), second: move(node.second) };
    if (side === 'swap')
      return {
        ...node,
        key: node.key === source ? target : node.key === target ? source : node.key,
      };
    if (node.key !== target) return node;
    const pane: SessionLayoutNode = { kind: 'pane', key: source };
    const before = side === 'left' || side === 'top';
    return {
      kind: 'split',
      id,
      axis: side === 'left' || side === 'right' ? 'columns' : 'rows',
      ratio: 0.5,
      first: before ? pane : node,
      second: before ? node : pane,
    };
  };
  return { ...layout, mode: 'custom', root: root ? move(root) : null };
};

export const resizeSessionSplit = (
  layout: SessionLayout,
  id: string,
  ratio: number
): SessionLayout => {
  if (!Number.isFinite(ratio)) return layout;
  const resize = (node: SessionLayoutNode): SessionLayoutNode => {
    if (node.kind === 'pane') return node;
    if (node.id === id) return { ...node, ratio: Math.max(0.05, Math.min(0.95, ratio)) };
    const first = resize(node.first),
      second = resize(node.second);
    return first === node.first && second === node.second ? node : { ...node, first, second };
  };
  const root = layout.root && resize(layout.root);
  return root === layout.root ? layout : { ...layout, mode: 'custom', root };
};
