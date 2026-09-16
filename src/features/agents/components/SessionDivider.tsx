import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { SessionDivider as Divider } from '../../../shared/contracts/sessionLayout';

interface Props {
  divider: Divider;
  canvas: RefObject<HTMLDivElement | null>;
  onResize: (id: string, ratio: number) => void;
}
export default function SessionDivider({ divider, canvas, onResize }: Props) {
  const drag = useRef<{ pointer: number; ratio: number } | null>(null);
  const horizontal = divider.axis === 'columns';
  const { parent, ratio } = divider;
  const change = (value: number) =>
    onResize(divider.id, Math.max(divider.minimum, Math.min(divider.maximum, value)));
  const handleDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, ratio };
  };
  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId || !canvas.current) return;
    const bounds = canvas.current.getBoundingClientRect();
    change(
      horizontal
        ? (event.clientX - bounds.left - parent.x) / parent.width
        : (event.clientY - bounds.top - parent.y) / parent.height
    );
  };
  const handleUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) change(drag.current.ratio);
    handleUp(event);
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (event.key === 'Escape' && drag.current) {
      event.preventDefault();
      change(drag.current.ratio);
      const pointer = drag.current.pointer;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(pointer))
        event.currentTarget.releasePointerCapture(pointer);
    } else if ([decrease, increase, 'Home', 'End', 'Enter'].includes(event.key)) {
      event.preventDefault();
      change(
        event.key === 'Home'
          ? divider.minimum
          : event.key === 'End'
            ? divider.maximum
            : event.key === 'Enter'
              ? 0.5
              : ratio + (event.key === decrease ? -1 : 1) * (event.shiftKey ? 0.1 : 0.025)
      );
    }
  };
  const handleReset = () => change(0.5);
  return (
    <div
      className={`session-divider session-divider-${divider.axis}`}
      role='separator'
      aria-label={horizontal ? 'Resize background columns' : 'Resize background rows'}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(divider.minimum * 100)}
      aria-valuemax={Math.round(divider.maximum * 100)}
      tabIndex={0}
      title='Drag or use arrow keys to resize. Double-click or Enter to balance.'
      style={
        horizontal
          ? {
              left: parent.x + parent.width * ratio - 3,
              top: parent.y + 3,
              width: 6,
              height: parent.height - 6,
            }
          : {
              left: parent.x + 3,
              top: parent.y + parent.height * ratio - 3,
              width: parent.width - 6,
              height: 6,
            }
      }
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleCancel}
      onLostPointerCapture={handleUp}
      onKeyDown={handleKey}
      onDoubleClick={handleReset}
    />
  );
}
