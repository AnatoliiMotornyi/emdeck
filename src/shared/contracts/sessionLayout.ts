import type { Layout } from './workspace';

export type SessionLayoutNode =
  | { kind: 'pane'; key: string }
  | {
      kind: 'split';
      id: string;
      axis: 'columns' | 'rows';
      ratio: number;
      first: SessionLayoutNode;
      second: SessionLayoutNode;
    };
export interface SessionLayout {
  version: 1;
  mode: Layout | 'custom';
  root: SessionLayoutNode | null;
}
export type PaneDropSide = 'left' | 'right' | 'top' | 'bottom' | 'swap';
export interface PaneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SessionDivider {
  id: string;
  axis: 'columns' | 'rows';
  parent: PaneRect;
  ratio: number;
  minimum: number;
  maximum: number;
}
