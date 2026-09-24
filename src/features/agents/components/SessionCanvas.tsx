import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { Columns2, Grid2X2, GripVertical, Rows2 } from 'lucide-react';
import { readStored, store } from '../../../platform/storage/preferences';
import type { Layout } from '../../../shared/contracts/workspace';
import type { PaneDropSide } from '../../../shared/contracts/sessionLayout';
import {
  layoutKeys,
  moveSessionPane,
  presetSessionLayout,
  reconcileSessionLayout,
  resizeSessionSplit,
  restoreSessionLayout,
  visibleSessionLayout,
} from '../services/session-layout';
import { projectSessionLayout, sessionNeighbor } from '../services/session-layout-geometry';
import SessionDivider from './SessionDivider';
import { useSessionDrag } from '../hooks/useSessionDrag';

const directions: Partial<Record<string, Exclude<PaneDropSide, 'swap'>>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'top',
  ArrowDown: 'bottom',
};
export interface SessionCanvasTile {
  key: string;
  title: string;
  render: (grip?: ReactNode) => ReactNode;
}
interface Props {
  active: boolean;
  tiles: SessionCanvasTile[];
  attached: string[];
  visibleKeys: string[];
  initialLayout: Layout;
  gridLayout?: Layout;
  onArrange: () => void;
  empty?: ReactNode;
}
export default function SessionCanvas({
  active,
  tiles,
  attached,
  visibleKeys,
  initialLayout,
  gridLayout,
  empty,
  onArrange,
}: Props) {
  const [saved, setSaved] = useState(() =>
    restoreSessionLayout(readStored('relay:session-layout', null), initialLayout)
  );
  const layout = useMemo(() => reconcileSessionLayout(saved, attached), [saved, attached]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [message, setMessage] = useState('');
  const visibleSet = new Set(visibleKeys);
  const canvas = useRef<HTMLDivElement>(null);
  const instructions = useId();
  const visible = useMemo(
    () => visibleSessionLayout(layout.root, new Set(visibleKeys)),
    [layout.root, visibleKeys]
  );
  const geometry = useMemo(
    () => projectSessionLayout(visible, size.width, size.height),
    [visible, size.width, size.height]
  );
  useEffect(() => {
    const timer = setTimeout(() => store('relay:session-layout', layout), 150);
    return () => clearTimeout(timer);
  }, [layout]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setSize(previous =>
        previous.width === next.width && previous.height === next.height ? previous : next
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const move = (source: string, target: string, side: PaneDropSide) => {
    const splitId = crypto.randomUUID();
    setSaved(previous =>
      moveSessionPane(reconcileSessionLayout(previous, attached), source, target, side, splitId)
    );
    setMessage(
      side === 'swap'
        ? 'Terminal positions swapped.'
        : `Terminal moved ${side === 'top' ? 'above' : side === 'bottom' ? 'below' : side} of the target.`
    );
    onArrange();
  };
  const drag = useSessionDrag(canvas, move);
  const { drop } = drag;
  const handleResize = (id: string, ratio: number) =>
    setSaved(previous => resizeSessionSplit(reconcileSessionLayout(previous, attached), id, ratio));
  const handleCanvasKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') drag.cancel();
  };
  return (
    <>
      {active && (
        <div
          className='session-layout-toolbar'
          role='toolbar'
          aria-label='Background terminal layout'
        >
          {(
            [
              ['columns', Columns2, 'Side by side'],
              ['rows', Rows2, 'Stacked'],
              ['grid', Grid2X2, 'Grid'],
            ] as const
          ).map(([mode, Icon, title]) => {
            const handlePreset = () => {
              setSaved(presetSessionLayout(mode, layoutKeys(layout.root)));
              onArrange();
              drag.cancel();
            };
            return (
              <button
                key={mode}
                className={`icon-button ${layout.mode === mode ? 'selected' : ''}`}
                title={title}
                aria-label={title}
                aria-pressed={layout.mode === mode}
                onClick={handlePreset}
              >
                <Icon size={15} />
              </button>
            );
          })}
          <span>{layout.mode === 'custom' ? 'Custom layout' : 'Arrange terminals'}</span>
          <small>Drag a handle to an edge, or to the center to swap.</small>
        </div>
      )}
      <p id={instructions} className='session-layout-sr'>
        Drag to another pane’s edge to split or its center to swap. With a handle focused, arrow
        keys move beside the nearest pane; Shift and an arrow swap positions.
      </p>
      {active && (
        <span className='session-layout-sr' role='status' aria-live='polite'>
          {message}
        </span>
      )}
      <div
        className={`session-canvas-viewport ${gridLayout ? 'terminal-grid-viewport' : ''}`}
        role='region'
        aria-label={gridLayout ? 'Terminal panes' : 'Background terminal panes'}
      >
        <div
          ref={canvas}
          className={`session-canvas ${gridLayout ? `terminal-grid layout-${gridLayout} ${visibleKeys.length === 1 ? 'has-maximized' : ''}` : ''}`}
          data-dragging={drag.dragging}
          onKeyDown={handleCanvasKey}
          style={
            gridLayout
              ? ({ '--pane-count': visibleKeys.length } as React.CSSProperties)
              : { minWidth: geometry.minimum.width, minHeight: geometry.minimum.height }
          }
        >
          {tiles.map(({ key, title, render }) => {
            const rect = geometry.panes.get(key);
            const handleDragDown = (event: PointerEvent<HTMLButtonElement>) =>
              drag.handleDown(event, key);
            const handleMoveKey = (event: KeyboardEvent<HTMLButtonElement>) => {
              const side = directions[event.key];
              if (!side) return;
              event.preventDefault();
              const target = sessionNeighbor(geometry.panes, key, side);
              if (target) move(key, target, event.shiftKey ? 'swap' : side);
            };
            const grip = (
              <button
                className='session-drag-handle'
                draggable={false}
                aria-label={`Move ${title}`}
                aria-describedby={instructions}
                title='Drag to arrange; arrow keys move beside another pane'
                onPointerDown={handleDragDown}
                onPointerMove={drag.handleMove}
                onPointerUp={drag.handleUp}
                onPointerCancel={drag.cancel}
                onLostPointerCapture={drag.cancel}
                onKeyDown={handleMoveKey}
              >
                <GripVertical size={15} />
              </button>
            );
            return (
              <div
                key={key}
                className={`session-canvas-pane pane-container ${!(gridLayout ? visibleSet.has(key) : rect) ? 'pane-hidden' : ''}`}
                data-session-key={key}
                style={
                  gridLayout
                    ? { position: 'relative' }
                    : rect
                      ? {
                          left: rect.x + 3,
                          top: rect.y + 3,
                          width: rect.width - 6,
                          height: rect.height - 6,
                        }
                      : undefined
                }
              >
                {render(gridLayout ? undefined : grip)}
                {drop?.key === key && (
                  <div className={`session-drop-preview session-drop-${drop.side}`}>
                    <span>
                      {drop.side === 'swap'
                        ? 'Swap panes'
                        : `Place ${drop.side === 'top' ? 'above' : drop.side === 'bottom' ? 'below' : drop.side}`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {!gridLayout &&
            geometry.dividers.map(divider => (
              <SessionDivider
                key={divider.id}
                divider={divider}
                canvas={canvas}
                onResize={handleResize}
              />
            ))}
          {!visibleKeys.length &&
            (empty ?? (
              <div className='terminal-empty'>
                <div>
                  <h3>
                    {tiles.length
                      ? 'No attached panes in this workspace.'
                      : 'Your agents can keep working.'}
                  </h3>
                  <p>
                    Connect a machine, then open a background terminal. Saved workspaces and agent
                    states appear here even when no view is attached.
                  </p>
                  <p>Use Panes for terminals that end when Emdeck closes.</p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
