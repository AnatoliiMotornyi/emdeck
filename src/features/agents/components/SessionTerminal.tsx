import { sessionName } from '../services/terminal-title';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { sessionCall } from '../../../platform/desktop/sessions';
import type { SessionPane, SessionRead } from '../../../shared/contracts/sessions';
import type { Settings } from '../../../shared/contracts/workspace';
import { terminalInput } from '../services/session-model';
import { createTerminalFitter } from '../services/terminal-fit';
import { bindTerminalAttachments } from '../lib/terminalAttachments';
import { bindTerminalKeyboard } from '../lib/terminalKeyboard';

interface Props {
  connection: string;
  pane: SessionPane;
  settings: Settings;
  onDetach: () => void;
  onStop: () => void;
  onMaximize: () => void;
  arrangeControl?: ReactNode;
  onFocus?: () => void;
  focusRequest?: number;
}
export default function SessionTerminal({
  connection,
  pane,
  settings,
  onDetach,
  onStop,
  onMaximize,
  arrangeControl,
  onFocus,
  focusRequest = 0,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const resizeCurrent = useRef<(() => void) | null>(null);
  const [error, setError] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const [takeover, setTakeover] = useState(0);
  const appearance = useRef(settings);
  useEffect(() => {
    appearance.current = settings;
  }, [settings]);
  useEffect(() => {
    if (!host.current) return;
    let disposed = false,
      owned = false;
    const client = crypto.randomUUID();
    const term = new Terminal({
      fontSize: appearance.current.terminalFontSize,
      fontFamily: '"Cascadia Code", Consolas, monospace',
      scrollback: appearance.current.scrollback,
      theme: {
        background: appearance.current.theme === 'light' ? '#fafbfc' : '#111418',
        foreground: appearance.current.theme === 'light' ? '#343b48' : '#c5ccd6',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    terminal.current = term;
    const fitter = createTerminalFitter(term, () => fit.fit(), {
      request: callback => requestAnimationFrame(callback),
      cancel: id => cancelAnimationFrame(id),
    });
    const element = host.current;
    element.addEventListener('wheel', fitter.cancel, { capture: true, passive: true });
    element.addEventListener('pointerdown', fitter.cancel, true);
    element.addEventListener('keydown', fitter.cancel, true);
    element.addEventListener('touchstart', fitter.cancel, { capture: true, passive: true });
    const report = (error: unknown) => {
      if (!disposed) {
        setError(String(error));
        owned = false;
      }
    };
    const detachAttachments = bindTerminalAttachments(host.current, term, {
      id: () => null,
      unavailable:
        'Attachments in background sessions require a file path on the session machine. Paste that path as text; file uploads are not available in this view yet.',
      onError: error => {
        if (!disposed) setAttachmentError(String(error));
      },
    });
    bindTerminalKeyboard(term, error => {
      if (!disposed) setAttachmentError(String(error));
    });
    const resize = () => {
      if (disposed || !owned || !host.current?.clientWidth || !host.current.clientHeight) return;
      fitter.fit();
      void sessionCall(connection, 'pane.resize', {
        id: pane.id,
        client,
        cols: term.cols,
        rows: term.rows,
      }).catch(report);
    };
    const observer = new ResizeObserver(resize);
    resizeCurrent.current = resize;
    observer.observe(host.current);
    const heartbeat = setInterval(resize, 15000);
    let inputQueue = Promise.resolve();
    const input = term.onData(text => {
      text = terminalInput(text);
      if (owned && text) {
        inputQueue = inputQueue
          .then(async () => {
            if (!disposed && owned)
              await sessionCall(connection, 'pane.input', { id: pane.id, client, text });
          })
          .catch(report);
      }
    });
    const start = async () => {
      setError('');
      try {
        await sessionCall(connection, 'pane.attach', {
          id: pane.id,
          client,
          takeover: takeover > 0,
        });
        if (disposed) {
          await sessionCall(connection, 'pane.detach', { id: pane.id, client });
          return;
        }
        owned = true;
        resize();
        let after: number | null = null;
        while (!disposed) {
          const result: SessionRead = await sessionCall(connection, 'pane.read', {
            id: pane.id,
            after,
            wait_ms: 20000,
          });
          if (disposed) break;
          if (result.reset) term.reset();
          const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
          await new Promise<void>(resolve => term.write(bytes, resolve));
          after = result.sequence;
          if (!result.pane.running) {
            owned = false;
            break;
          }
        }
      } catch (error) {
        report(error);
      }
    };
    void start();
    return () => {
      disposed = true;
      owned = false;
      clearInterval(heartbeat);
      observer.disconnect();
      input.dispose();
      detachAttachments();
      element.removeEventListener('wheel', fitter.cancel, true);
      element.removeEventListener('pointerdown', fitter.cancel, true);
      element.removeEventListener('keydown', fitter.cancel, true);
      element.removeEventListener('touchstart', fitter.cancel, true);
      fitter.dispose();
      term.dispose();
      terminal.current = null;
      resizeCurrent.current = null;
      void sessionCall(connection, 'pane.detach', { id: pane.id, client }).catch(() => {});
    };
  }, [connection, pane.id, pane.generation, takeover]);
  useEffect(() => {
    const term = terminal.current;
    if (term) {
      term.options.fontSize = settings.terminalFontSize;
      term.options.scrollback = settings.scrollback;
      term.options.theme = {
        background: settings.theme === 'light' ? '#fafbfc' : '#111418',
        foreground: settings.theme === 'light' ? '#343b48' : '#c5ccd6',
      };
      resizeCurrent.current?.();
    }
  }, [settings.theme, settings.terminalFontSize, settings.scrollback]);
  useEffect(() => {
    if (focusRequest) terminal.current?.focus();
  }, [focusRequest]);
  const handleTakeover = () => setTakeover(value => value + 1);
  const handleDismissAttachment = () => setAttachmentError('');
  return (
    <section
      className='terminal-pane session-terminal'
      onFocusCapture={onFocus}
      aria-label={`${sessionName(pane)} persistent terminal`}
    >
      <header className='pane-header'>
        {arrangeControl}
        <strong title={sessionName(pane)}>{sessionName(pane)}</strong>
        <span
          className={`session-state ${pane.agent.state}`}
          title={`${pane.agent.source}: ${pane.agent.reason}`}
        >
          {pane.agent.state}
        </span>
        <span className='spacer' />
        <button title='Maximize or restore session' onClick={onMaximize}>
          Expand
        </button>
        <button title='Stop process on its machine' disabled={!pane.running} onClick={onStop}>
          Stop
        </button>
        <button title='Detach view; keep process running' onClick={onDetach}>
          Detach
        </button>
      </header>
      {error && (
        <div className='session-error' role='alert'>
          {error}
          <button onClick={handleTakeover}>Take control / retry</button>
        </div>
      )}
      {attachmentError && (
        <div className='session-error' role='alert'>
          {attachmentError}
          <button onClick={handleDismissAttachment}>Dismiss</button>
        </div>
      )}
      <div className='terminal-host' ref={host} />
      <footer className='pane-footer'>
        <span>{pane.launch.cwd}</span>
        <span>Background session · {pane.agent.kind}</span>
      </footer>
    </section>
  );
}
