import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Copy, Maximize2, Minimize2, RotateCcw, TerminalSquare, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { call, native, spawnTerminal } from '../../../platform/desktop/api';
import { findPaths, linkRange } from '../services/terminalLinks';
import type {
  AgentCommand,
  AgentObservation,
  AgentUsage,
  Pane,
  PaneState,
  Settings,
} from '../../../shared/contracts/workspace';
import { useLatest } from '../../../shared/hooks/useLatest';
import { agentKind, agentStatus, inspectAgentScreen } from '../lib/agents';
import { createTerminalFitter } from '../services/terminal-fit';
import { remoteStatus } from '../services/connections';
import { paneName } from '../services/terminal-title';
import { bindTerminalAttachments } from '../lib/terminalAttachments';
import { bindTerminalKeyboard } from '../lib/terminalKeyboard';
import { readAgentScreen } from '../services/agent-screen';
import { createAgentActivityTracker } from '../services/agent-activity-tracker';
interface Props {
  pane: Pane;
  root: string;
  settings: Settings;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
  onRestart: () => void;
  onState: (id: string, state: PaneState) => void;
  onTitle: (id: string, title: string) => void;
  onError: (error: unknown) => void;
  onObservation: (id: string, observation: AgentObservation | null) => void;
  onUsage: (id: string, usage: AgentUsage | null) => void;
  onCommand: (id: string, command: AgentCommand) => void;
  enhancedUsage: boolean;
  focusRequest: number;
  selected: boolean;
  onFocus: () => void;
}
export default function TerminalPane({
  pane,
  root,
  settings,
  maximized,
  onMaximize,
  onClose,
  onRestart,
  onState,
  onTitle,
  onError,
  onObservation,
  onUsage,
  onCommand,
  enhancedUsage,
  focusRequest,
  selected,
  onFocus,
}: Props) {
  const handleCopySelectedTerminalTextClick = () =>
    void navigator.clipboard.writeText(terminal.current?.getSelection() ?? '').catch(onError);
  const host = useRef<HTMLDivElement>(null),
    terminal = useRef<Terminal | null>(null),
    nativeId = useRef<string | null>(null),
    fitRef = useRef<ReturnType<typeof createTerminalFitter> | null>(null);
  const [state, setState] = useState<PaneState>(native ? 'starting' : 'preview');
  const [observation, setObservation] = useState<AgentObservation | undefined>();
  const callbacks = useLatest({ onState, onTitle, onError, onObservation, onUsage, onCommand });

  // Launch inputs are sampled only when the session identity changes. Appearance
  // updates and pane renames must never terminate a running agent.
  const launch = useLatest({ pane, settings, enhancedUsage });

  useEffect(() => {
    if (!host.current) return;
    const { pane, settings, enhancedUsage } = launch.current;
    let disposed = false;
    let activityTimer: ReturnType<typeof setTimeout> | undefined;
    let inspectionTimer: ReturnType<typeof setTimeout> | undefined;
    let observationKey = '';
    const kind = agentKind(pane.command);
    const activity = createAgentActivityTracker(kind);
    callbacks.current.onUsage(pane.id, null);
    callbacks.current.onObservation(pane.id, null);
    setObservation(undefined);
    const term = new Terminal({
      cursorBlink: false,
      fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: settings.terminalFontSize,
      lineHeight: 1.35,
      scrollback: settings.scrollback,
      allowProposedApi: false,
      theme: terminalTheme(settings.theme),
      convertEol: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    terminal.current = term;
    const detachAttachments = bindTerminalAttachments(host.current, term, {
      id: () => nativeId.current,
      unavailable: pane.remote
        ? 'Transfer the file to the remote machine, then paste its remote path. Emdeck does not upload dropped files over SSH yet.'
        : undefined,
      onError: error => callbacks.current.onError(error),
    });
    const title = term.onTitleChange(value => {
      if (!disposed) {
        if (!pane.remote) activity.title(value);
        callbacks.current.onTitle(pane.id, value);
      }
    });
    const fitter = createTerminalFitter(term, () => fit.fit(), {
      request: callback => requestAnimationFrame(callback),
      cancel: id => cancelAnimationFrame(id),
    });
    fitRef.current = fitter;
    // Remote output names remote files; a local search would open the wrong one.
    if (!pane.remote)
      term.registerLinkProvider({
        provideLinks(row, callback) {
          const buffer = term.buffer.active;
          let first = row;
          while (first > 1 && buffer.getLine(first - 1)?.isWrapped) first--;
          // Untrimmed rows keep every row exactly one width wide, so offsets stay divisible.
          let text = buffer.getLine(first - 1)?.translateToString(false) ?? '';
          for (let next = first + 1; buffer.getLine(next - 1)?.isWrapped; next++)
            text += buffer.getLine(next - 1)?.translateToString(false) ?? '';
          callback(
            findPaths(text).map(match => ({
              range: linkRange(match, first, term.cols),
              text: text.slice(match.start, match.end),
              activate: (event: MouseEvent) => {
                if (!event.ctrlKey && !event.metaKey) return;
                callbacks.current.onCommand(pane.id, {
                  op: 'openFile',
                  path: match.path,
                  line: match.line,
                  column: match.column,
                });
              },
            }))
          );
        },
      });
    const element = host.current;
    element.addEventListener('wheel', fitter.cancel, { capture: true, passive: true });
    element.addEventListener('pointerdown', fitter.cancel, true);
    element.addEventListener('keydown', fitter.cancel, true);
    const publishObservation = (next: AgentObservation) => {
      const key = JSON.stringify([next.activity, next.contextPercent, next.model]);
      if (key !== observationKey) {
        observationKey = key;
        setObservation(next);
        callbacks.current.onObservation(pane.id, next);
      }
    };
    const inspect = () => {
      if (inspectionTimer || disposed || kind === 'shell' || pane.remote) return;
      inspectionTimer = setTimeout(() => {
        inspectionTimer = undefined;
        if (disposed) return;
        const lines = readAgentScreen(term.buffer.active, term.rows, kind === 'codex');
        const next = inspectAgentScreen(kind, lines);
        publishObservation({ ...next, activity: activity.inspect(lines) });
      }, 350);
    };
    let lastState: PaneState | undefined;
    const update = (next: PaneState) => {
      if (!disposed && next !== lastState) {
        lastState = next;
        setState(next);
        callbacks.current.onState(pane.id, next);
      }
    };
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!disposed && host.current?.clientWidth && host.current?.clientHeight) {
          fitter.fit();
          if (nativeId.current)
            void call('terminal_resize', {
              id: nativeId.current,
              cols: term.cols,
              rows: term.rows,
            }).catch(() => {});
        }
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    let ended = false;
    let pendingInput = '';
    const start = async () => {
      if (!native) {
        update('preview');
        term.writeln(`\x1b[32m  ${pane.name}\x1b[0m  \x1b[90m/ browser preview\x1b[0m\r\n`);
        term.writeln(
          `  ${pane.command ? `Launch command: ${pane.command}` : 'Your system shell, in your project folder.'}\r\n`
        );
        term.writeln('  Open Emdeck desktop to start a real session.');
        term.writeln('  Installed CLIs run directly in this pane.\r\n');
        term.writeln('  \x1b[90mNo agent is running in this preview.\x1b[0m');
        return;
      }
      update('starting');
      fitter.fit();
      try {
        const id = await spawnTerminal(
          root,
          pane.cwd,
          pane.shell,
          pane.command,
          term.cols,
          term.rows,
          event => {
            if (disposed) return;
            if (event.type === 'data') {
              term.write(new Uint8Array(event.data), inspect);
              update('output');
              clearTimeout(activityTimer);
              activityTimer = setTimeout(() => {
                if (!ended) update('running');
              }, 1400);
            } else if (event.type === 'usage') {
              callbacks.current.onUsage(pane.id, event.usage);
            } else if (event.type === 'command') {
              callbacks.current.onCommand(pane.id, event.command);
            } else {
              ended = true;
              nativeId.current = null;
              clearTimeout(activityTimer);
              update('exited');
              term.writeln(
                `\r\n\x1b[90m[${pane.remote ? 'SSH disconnected' : 'Process exited'}${event.code === null ? '' : ` with code ${event.code}`} · ${pane.remote ? 'reconnect to attach again' : 'restart to run again'}]\x1b[0m`
              );
            }
          },
          enhancedUsage,
          pane.remote?.target
        );
        if (disposed) {
          await call('terminal_close', { id });
          return;
        }
        if (!ended) {
          nativeId.current = id;
          update('running');
          resize();
          if (pendingInput) {
            void call('terminal_write', { id, data: pendingInput }).catch(
              callbacks.current.onError
            );
            pendingInput = '';
          }
        }
      } catch (e) {
        if (!disposed) {
          update('error');
          term.writeln(
            `\r\n\x1b[31m${String(e)}\x1b[0m\r\n${pane.remote ? 'Check OpenSSH installation, the saved connection, and SSH configuration.' : 'Check the shell and agent command in Settings.'}`
          );
        }
      }
    };
    void start();
    const input = term.onData(data => {
      if (!ended && native && !pane.remote && kind !== 'shell') {
        const next = inspectAgentScreen(
          kind,
          readAgentScreen(term.buffer.active, term.rows, kind === 'codex')
        );
        publishObservation({ ...next, activity: activity.input(data) });
      }
      if (nativeId.current)
        void call('terminal_write', { id: nativeId.current, data }).catch(
          callbacks.current.onError
        );
      else if (!ended && native && pendingInput.length < 4096) pendingInput += data;
    });
    bindTerminalKeyboard(term, error => callbacks.current.onError(error));
    return () => {
      disposed = true;
      clearTimeout(activityTimer);
      clearTimeout(inspectionTimer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      fitter.dispose();
      fitRef.current = null;
      element.removeEventListener('wheel', fitter.cancel, true);
      element.removeEventListener('pointerdown', fitter.cancel, true);
      element.removeEventListener('keydown', fitter.cancel, true);
      input.dispose();
      detachAttachments();
      title.dispose();
      term.dispose();
      terminal.current = null;
      const id = nativeId.current;
      nativeId.current = null;
      if (id) void call('terminal_close', { id }).catch(() => {});
    };
  }, [callbacks, launch, pane.id, pane.restart, root]);
  useEffect(() => {
    if (focusRequest)
      requestAnimationFrame(() => {
        host.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        terminal.current?.focus();
      });
  }, [focusRequest]);
  useEffect(() => {
    if (terminal.current) {
      terminal.current.options.theme = terminalTheme(settings.theme);
      terminal.current.options.fontSize = settings.terminalFontSize;
      terminal.current.options.scrollback = settings.scrollback;
      if (host.current?.clientWidth) {
        fitRef.current?.fit();
        if (nativeId.current)
          void call('terminal_resize', {
            id: nativeId.current,
            cols: terminal.current.cols,
            rows: terminal.current.rows,
          }).catch(() => {});
      }
    }
  }, [settings.theme, settings.terminalFontSize, settings.scrollback]);
  return (
    <section
      className={`terminal-pane ${maximized ? 'maximized' : ''} ${selected ? 'selected-agent' : ''}`}
      aria-label={`${paneName(pane)} terminal`}
      onFocusCapture={onFocus}
    >
      <header className='pane-header'>
        <span className='pane-icon' style={{ color: pane.color }}>
          <TerminalSquare size={13} />
        </span>
        <strong title={paneName(pane)}>{paneName(pane)}</strong>
        <span
          className={`pane-state ${state}`}
          title='Agent activity is detected from the live terminal screen. Connected and Output describe the terminal connection only.'
        >
          <i />
          {pane.remote ? remoteStatus(state) : agentStatus(state, observation).label}
        </span>
        <span className='spacer' />
        <button
          className='icon-button'
          title='Copy selected terminal text'
          onClick={handleCopySelectedTerminalTextClick}
        >
          <Copy size={12} />
        </button>
        {(state === 'exited' || state === 'error') && (
          <button
            className='icon-button'
            title={pane.remote ? 'Reconnect remote session' : 'Restart terminal'}
            onClick={onRestart}
          >
            <RotateCcw size={12} />
          </button>
        )}
        <button
          className='icon-button'
          title={maximized ? 'Restore pane' : 'Maximize pane'}
          onClick={onMaximize}
        >
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          className='icon-button'
          title={`${pane.remote ? 'Disconnect' : 'Close'} ${paneName(pane)}`}
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </header>
      <div className='terminal-host' ref={host} />
      <footer className='pane-footer'>
        <span>{pane.remote?.target.host ?? (pane.cwd ? `./${pane.cwd}` : './')}</span>
        <span>
          {pane.remote
            ? `${pane.remote.target.backend} · ${pane.remote.target.session || 'remote shell'}`
            : pane.command || settings.shell || 'system shell'}
        </span>
      </footer>
    </section>
  );
}
function terminalTheme(theme: Settings['theme']) {
  return theme === 'light'
    ? {
        background: '#fafbfc',
        foreground: '#343b48',
        cursor: '#456924',
        selectionBackground: '#dbeac9',
        black: '#20252c',
        red: '#bc3948',
        green: '#387737',
        yellow: '#8a660d',
        blue: '#356eb4',
        magenta: '#8752b5',
        cyan: '#247988',
        white: '#dfe4eb',
        brightBlack: '#788293',
      }
    : {
        background: '#111418',
        foreground: '#c5ccd6',
        cursor: '#b8ee86',
        selectionBackground: '#303f32',
        black: '#252b33',
        red: '#e78787',
        green: '#b8cf8b',
        yellow: '#dec48b',
        blue: '#8bbbd7',
        magenta: '#c5a1e9',
        cyan: '#83c5bf',
        white: '#e0e4ea',
        brightBlack: '#697384',
      };
}
