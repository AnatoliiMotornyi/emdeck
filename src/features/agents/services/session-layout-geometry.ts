import type {
  PaneDropSide,
  PaneRect,
  SessionDivider,
  SessionLayoutNode,
} from '../../../shared/contracts/sessionLayout';

export const minimumSessionSize = (
  node: SessionLayoutNode | null
): { width: number; height: number } => {
  if (!node) return { width: 0, height: 0 };
  if (node.kind === 'pane') return { width: 230, height: 170 };
  const a = minimumSessionSize(node.first),
    b = minimumSessionSize(node.second);
  return node.axis === 'columns'
    ? { width: a.width + b.width, height: Math.max(a.height, b.height) }
    : { width: Math.max(a.width, b.width), height: a.height + b.height };
};

export const projectSessionLayout = (
  root: SessionLayoutNode | null,
  width: number,
  height: number
) => {
  const panes = new Map<string, PaneRect>();
  const dividers: SessionDivider[] = [];
  const visit = (node: SessionLayoutNode, rect: PaneRect) => {
    if (node.kind === 'pane') {
      panes.set(node.key, rect);
      return;
    }
    const a = minimumSessionSize(node.first),
      b = minimumSessionSize(node.second);
    const horizontal = node.axis === 'columns';
    const size = horizontal ? rect.width : rect.height;
    const minimum = (horizontal ? a.width : a.height) / size;
    const maximum = 1 - (horizontal ? b.width : b.height) / size;
    const ratio = Math.max(minimum, Math.min(maximum, node.ratio));
    dividers.push({ id: node.id, axis: node.axis, parent: rect, ratio, minimum, maximum });
    visit(
      node.first,
      horizontal ? { ...rect, width: size * ratio } : { ...rect, height: size * ratio }
    );
    visit(
      node.second,
      horizontal
        ? { ...rect, x: rect.x + size * ratio, width: size * (1 - ratio) }
        : { ...rect, y: rect.y + size * ratio, height: size * (1 - ratio) }
    );
  };
  const minimum = minimumSessionSize(root);
  if (root)
    visit(root, {
      x: 0,
      y: 0,
      width: Math.max(minimum.width, width),
      height: Math.max(minimum.height, height),
    });
  return { panes, dividers, minimum };
};

export const sessionDropSide = (x: number, y: number): PaneDropSide => {
  const edges: [PaneDropSide, number][] = [
    ['left', x],
    ['right', 1 - x],
    ['top', y],
    ['bottom', 1 - y],
  ];
  edges.sort((a, b) => a[1] - b[1]);
  return edges[0][1] < 0.28 ? edges[0][0] : 'swap';
};

export const sessionNeighbor = (
  panes: Map<string, PaneRect>,
  source: string,
  side: Exclude<PaneDropSide, 'swap'>
) => {
  const from = panes.get(source);
  if (!from) return undefined;
  const x = from.x + from.width / 2,
    y = from.y + from.height / 2;
  return [...panes.entries()]
    .filter(
      ([key, to]) =>
        key !== source &&
        (side === 'left'
          ? to.x + to.width / 2 < x
          : side === 'right'
            ? to.x + to.width / 2 > x
            : side === 'top'
              ? to.y + to.height / 2 < y
              : to.y + to.height / 2 > y)
    )
    .sort(
      ([, a], [, b]) =>
        Math.hypot(a.x + a.width / 2 - x, a.y + a.height / 2 - y) -
        Math.hypot(b.x + b.width / 2 - x, b.y + b.height / 2 - y)
    )[0]?.[0];
};
