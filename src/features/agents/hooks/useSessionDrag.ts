import { useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';
import type { PaneDropSide } from '../../../shared/contracts/sessionLayout';
import { sessionDropSide } from '../services/session-layout-geometry';

interface Drop {
  key: string;
  side: PaneDropSide;
}
interface Gesture {
  source: string;
  pointer: number;
  x: number;
  y: number;
  active: boolean;
  handle: HTMLButtonElement;
}

// Pointer capture avoids WebView2's native file-drop interception of HTML drag events.
export const useSessionDrag = (
  canvas: RefObject<HTMLDivElement | null>,
  onMove: (source: string, target: string, side: PaneDropSide) => void
) => {
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState(false);
  const [drop, setDrop] = useState<Drop | null>(null);
  const targetAt = (x: number, y: number, source: string): Drop | null => {
    const pane = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-session-key]');
    const key = pane?.dataset.sessionKey;
    if (!pane || !key || key === source || !canvas.current?.contains(pane)) return null;
    const bounds = pane.getBoundingClientRect();
    return {
      key,
      side: sessionDropSide((x - bounds.left) / bounds.width, (y - bounds.top) / bounds.height),
    };
  };
  const cancel = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.handle.hasPointerCapture(current.pointer))
      current.handle.releasePointerCapture(current.pointer);
    setDragging(false);
    setDrop(null);
  };
  const handleDown = (event: PointerEvent<HTMLButtonElement>, source: string) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      source,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
      handle: event.currentTarget,
    };
  };
  const handleMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5)
      return;
    current.active = true;
    setDragging(true);
    const next = targetAt(event.clientX, event.clientY, current.source);
    setDrop(previous =>
      previous?.key === next?.key && previous?.side === next?.side ? previous : next
    );
  };
  const handleUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const target = current.active ? targetAt(event.clientX, event.clientY, current.source) : null;
    cancel();
    if (target) onMove(current.source, target.key, target.side);
  };
  return { dragging, drop, cancel, handleDown, handleMove, handleUp };
};
