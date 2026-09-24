import { describe, expect, it } from 'vitest';
import type { SessionLayoutNode } from '../../src/shared/contracts/sessionLayout';
import {
  layoutKeys,
  moveSessionPane,
  presetSessionLayout,
  reconcileSessionLayout,
  resizeSessionSplit,
  restoreSessionLayout,
  visibleSessionLayout,
} from '../../src/features/agents/services/session-layout';
import {
  projectSessionLayout,
  sessionDropSide,
  sessionNeighbor,
} from '../../src/features/agents/services/session-layout-geometry';

describe('background pane layouts', () => {
  it('covers the canvas without overlap and keeps every pane usable for each preset', () => {
    for (const mode of ['columns', 'rows', 'grid'] as const) {
      for (const count of [1, 2, 3, 4, 9, 64]) {
        const keys = Array.from({ length: count }, (_, i) => `machine/${i}`);
        const layout = presetSessionLayout(mode, keys);
        const view = projectSessionLayout(layout.root, 1400, 800);
        expect(layoutKeys(layout.root)).toEqual(keys);
        expect(restoreSessionLayout(layout, 'rows')).toEqual(layout);
        const panes = [...view.panes.values()];
        for (let i = 0; i < panes.length; i++) {
          const a = panes[i];
          expect(a.width).toBeGreaterThanOrEqual(229.99);
          expect(a.height).toBeGreaterThanOrEqual(169.99);
          for (const b of panes.slice(i + 1)) {
            const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
            const vertical = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
            expect(overlap < 0.001 || vertical < 0.001).toBe(true);
          }
        }
        expect(panes.reduce((sum, pane) => sum + pane.width * pane.height, 0)).toBeCloseTo(
          Math.max(1400, view.minimum.width) * Math.max(800, view.minimum.height),
          3
        );
      }
    }
  });

  it('moves across machines into mixed splits and swaps without losing panes or mutating the input', () => {
    const original = presetSessionLayout('columns', ['local/a', 'remote/b', 'remote/c']);
    const mixed = moveSessionPane(original, 'remote/c', 'local/a', 'bottom', 'mixed');
    const boxes = projectSessionLayout(mixed.root, 1200, 800).panes;
    expect(boxes.get('local/a')!.x).toBe(boxes.get('remote/c')!.x);
    expect(boxes.get('remote/c')!.y).toBeGreaterThan(boxes.get('local/a')!.y);
    expect(boxes.get('remote/b')!.height).toBe(800);
    const swapped = moveSessionPane(mixed, 'local/a', 'remote/b', 'swap', 'unused');
    expect(projectSessionLayout(swapped.root, 1200, 800).panes.get('remote/b')).toEqual(
      boxes.get('local/a')
    );
    expect(layoutKeys(original.root)).toEqual(['local/a', 'remote/b', 'remote/c']);
    expect(moveSessionPane(mixed, 'missing', 'local/a', 'left', 'invalid')).toBe(mixed);
    expect(moveSessionPane(mixed, 'local/a', 'local/a', 'right', 'invalid')).toBe(mixed);
  });

  it('retains resized ratios and hidden panes through filtering, attaching, detaching and serialization', () => {
    let layout = presetSessionLayout('columns', ['a', 'b', 'c']);
    layout = moveSessionPane(layout, 'c', 'a', 'bottom', 'stack');
    layout = resizeSessionSplit(layout, 'stack', 0.7);
    const filtered = visibleSessionLayout(layout.root, new Set(['a', 'b']));
    expect(layoutKeys(filtered)).toEqual(['a', 'b']);
    expect(layoutKeys(layout.root)).toEqual(['a', 'c', 'b']);
    expect(projectSessionLayout(layout.root, 1200, 800).panes.get('a')!.height).toBeCloseTo(560);
    const withNew = reconcileSessionLayout(layout, ['a', 'b', 'c', 'd']);
    const closed = reconcileSessionLayout(withNew, ['a', 'c', 'd']);
    expect(layoutKeys(closed.root)).toEqual(['a', 'c', 'd']);
    expect(restoreSessionLayout(JSON.parse(JSON.stringify(closed)), 'grid')).toEqual(closed);
    expect(reconcileSessionLayout(layout, ['a', 'b', 'c'])).toBe(layout);
    expect(resizeSessionSplit(layout, 'stack', NaN)).toBe(layout);
  });

  it('clamps geometry on small screens and restores the preferred ratio when space returns', () => {
    let layout = presetSessionLayout('columns', ['a', 'b']);
    const id = layout.root!.kind === 'split' ? layout.root!.id : '';
    layout = resizeSessionSplit(layout, id, 0.8);
    expect(projectSessionLayout(layout.root, 300, 200).panes.get('a')!.width).toBe(230);
    expect(projectSessionLayout(layout.root, 1200, 800).panes.get('a')!.width).toBe(960);
  });

  it('rejects corrupt or excessive preferences and bounds the number of attached views', () => {
    const pane = { kind: 'pane', key: 'a' };
    const split = {
      kind: 'split',
      id: 'x',
      axis: 'columns',
      ratio: 0.5,
      first: pane,
      second: pane,
    };
    for (const root of [
      split,
      { ...pane, key: '' },
      { ...pane, key: 2 },
      { ...split, ratio: NaN },
      { ...split, ratio: 0 },
    ]) {
      expect(restoreSessionLayout({ version: 1, mode: 'custom', root }, 'rows').root).toBeNull();
    }
    expect(restoreSessionLayout({ version: 2, mode: 'rows', root: pane }, 'grid').mode).toBe(
      'grid'
    );
    let root: SessionLayoutNode = { kind: 'pane', key: 'start' };
    for (let i = 0; i < 65; i++)
      root = {
        kind: 'split',
        axis: 'rows',
        id: String(i),
        ratio: 0.5,
        first: root,
        second: { kind: 'pane', key: String(i) },
      };
    expect(restoreSessionLayout({ version: 1, mode: 'custom', root }, 'rows').root).toBeNull();
    const layout = presetSessionLayout(
      'grid',
      Array.from({ length: 100 }, (_, i) => String(i))
    );
    expect(layoutKeys(layout.root)).toHaveLength(64);
    const added = reconcileSessionLayout(
      { version: 1, mode: 'custom', root: pane as SessionLayoutNode },
      ['a', 'b'.repeat(400)]
    );
    expect(restoreSessionLayout(added, 'grid')).toEqual(added);
  });

  it('uses the closest edge for docking and directional neighbors for keyboard moves', () => {
    expect(sessionDropSide(0.05, 0.5)).toBe('left');
    expect(sessionDropSide(0.95, 0.5)).toBe('right');
    expect(sessionDropSide(0.5, 0.05)).toBe('top');
    expect(sessionDropSide(0.5, 0.95)).toBe('bottom');
    expect(sessionDropSide(0.5, 0.5)).toBe('swap');
    const { panes } = projectSessionLayout(
      presetSessionLayout('grid', ['a', 'b', 'c', 'd']).root,
      1200,
      800
    );
    expect(sessionNeighbor(panes, 'a', 'right')).toBe('b');
    expect(sessionNeighbor(panes, 'a', 'bottom')).toBe('c');
    expect(sessionNeighbor(panes, 'a', 'left')).toBeUndefined();
  });
});
