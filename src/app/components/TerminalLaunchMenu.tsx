import { Command, Plus, TerminalSquare } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { FocusEvent, KeyboardEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLatest } from '../../shared/hooks/useLatest';
import { positionPopover } from '../../shared/lib/popoverPosition';

const presets = [
  ['Terminal', '', 'Your default shell', '#b8ee86'],
  ['Codex', 'codex', 'OpenAI coding agent', '#c4a0ed'],
  ['Claude', 'claude', 'Claude Code', '#8bbbf5'],
  ['Gemini', 'gemini', 'Gemini CLI', '#f1b17f'],
];

type Props = {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onLaunch: (name: string, command: string) => void;
  onCustom: () => void;
};

export default function TerminalLaunchMenu({ id, anchor, onClose, onLaunch, onCustom }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useLatest({ onClose });
  useLayoutEffect(() => {
    const menu = root.current;
    const trigger = anchor.current;
    if (!menu || !trigger) return;
    const place = () => {
      const viewport = window.visualViewport;
      const bounds = trigger.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        callbacks.current.onClose();
        return;
      }
      const position = positionPopover(
        bounds,
        { width: 250, height: menu.scrollHeight + menu.offsetHeight - menu.clientHeight },
        {
          left: viewport?.offsetLeft ?? 0,
          top: viewport?.offsetTop ?? 0,
          width: viewport?.width ?? window.innerWidth,
          height: viewport?.height ?? window.innerHeight,
        }
      );
      // Keep positioning outside React state; resizing the menu never rerenders terminals.
      Object.assign(menu.style, {
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
        visibility: 'visible',
      });
    };
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.contains(event.target) &&
        !trigger.contains(event.target)
      )
        callbacks.current.onClose();
    };
    place();
    menu.querySelector('button')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    observer.observe(trigger);
    const panel = trigger.closest('.terminal-panel');
    if (panel) observer.observe(panel);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', dismissOutside, true);
    };
  }, [anchor, callbacks]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      requestAnimationFrame(() => {
        if (root.current && !root.current.contains(document.activeElement))
          callbacks.current.onClose();
      });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      anchor.current?.focus({ preventScroll: true });
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
    buttons[next]?.scrollIntoView({ block: 'nearest' });
  };
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    // WebKit blurs the focused option to the body on pointer-down without
    // focusing the clicked button. Keep it mounted until its click can run.
    // Pointer dismissal is handled by dismissOutside, not by a null focus target.
    if (
      event.relatedTarget !== null &&
      !event.currentTarget.contains(event.relatedTarget) &&
      event.relatedTarget !== anchor.current
    )
      onClose();
  };
  return createPortal(
    <div
      ref={root}
      id={id}
      role='region'
      aria-label='New terminal options'
      className='agent-popover popover'
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <div className='popover-title'>LAUNCH IN A NEW PANE</div>
      {presets.map(([name, command, detail, color]) => {
        const handleLaunch = () => onLaunch(name, command);
        return (
          <button className='agent-option' key={name} onClick={handleLaunch}>
            <TerminalSquare size={16} style={{ color }} />
            <span>
              <strong>{name}</strong>
              <small>{detail}</small>
            </span>
            <Plus size={13} />
          </button>
        );
      })}
      <button className='menu-item' onClick={onCustom}>
        <Command size={14} />
        Custom command…
      </button>
      <p className='popover-note'>Uses CLIs already installed on your computer.</p>
    </div>,
    document.body
  );
}
