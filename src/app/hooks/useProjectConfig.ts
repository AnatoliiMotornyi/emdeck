import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseProjectConfig,
  serialiseProjectConfig,
} from '../../features/settings/services/projectConfig';
import { api } from '../../platform/desktop/api';
import type { ProjectConfig, SettingsOverrides } from '../../shared/contracts/projectConfig';
import { emptyProjectConfig } from '../../shared/contracts/projectConfig';
import type { Project } from '../../shared/contracts/workspace';
const SAVE_DELAY = 300;
interface ConfigState {
  root: string;
  config: ProjectConfig;
  ready: boolean;
}
const initial: ConfigState = { root: '', config: emptyProjectConfig, ready: false };
export function useProjectConfig(project: Project | null, fail: (error: unknown) => void) {
  const root = project?.root ?? '';
  const [state, setState] = useState(initial);
  // Mirrors `state` synchronously, so consecutive edits compose over each other
  // and the save is scheduled outside a state updater, which React may replay.
  const latest = useRef(initial);
  const commit = useCallback((next: ConfigState) => {
    latest.current = next;
    setState(next);
  }, []);
  // A corrupt or unwritable file is never rewritten, so a user can repair it by hand.
  const writable = useRef(true);
  const pending = useRef<{ root: string; config: ProjectConfig } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Settles once the write finishes and never rejects, so a closing window can
  // await it before destroying itself.
  const drain = useCallback(async () => {
    const queued = pending.current;
    pending.current = null;
    if (!queued) return;
    await api
      .writeProjectConfig(queued.root, serialiseProjectConfig(queued.config))
      .catch((error: unknown) => {
        writable.current = false;
        fail(error);
      });
  }, [fail]);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    return drain();
  }, [drain]);
  useEffect(() => {
    void flush();
    if (!root) {
      commit({ root: '', config: emptyProjectConfig, ready: true });
      return;
    }
    let cancelled = false;
    commit({ root, config: emptyProjectConfig, ready: false });
    void api
      .readProjectConfig(root)
      .then(raw => {
        if (cancelled) return;
        const parsed = parseProjectConfig(raw);
        writable.current = parsed !== null;
        if (!parsed)
          fail('This project has an unreadable .emdeck/settings.json. Using global settings.');
        commit({ root, config: parsed ?? emptyProjectConfig, ready: true });
      })
      .catch(error => {
        if (cancelled) return;
        writable.current = false;
        fail(error);
        commit({ root, config: emptyProjectConfig, ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, [root, flush, fail, commit]);
  useEffect(() => {
    // A quit or a reload can land inside the debounce window. `pagehide` and the
    // hidden visibility state are the points a browser reliably still runs code
    // at; `beforeunload` is not. The desktop close path awaits `flush` itself
    // from the existing tauri://close-requested handler before destroying the
    // window.
    const leave = () => void flush();
    const hide = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
      // Drain rather than discard: cancelling the timer alone loses the edit.
      // Draining early if `flush` ever changes identity is harmless, because the
      // queued record carries the root it belongs to.
      leave();
    };
  }, [flush]);
  const queue = useCallback(
    (change: (previous: ProjectConfig) => ProjectConfig) => {
      const previous = latest.current;
      if (previous.root !== root || !root || !previous.ready) return;
      const config = change(previous.config);
      commit({ ...previous, config });
      if (!writable.current) return;
      pending.current = { root, config };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void drain(), SAVE_DELAY);
    },
    [root, drain, commit]
  );
  const setOverrides = useCallback(
    (change: (previous: SettingsOverrides) => SettingsOverrides) =>
      queue(config => ({ ...config, settings: change(config.settings) })),
    [queue]
  );
  const setRuns = useCallback(
    (value: unknown) => queue(config => ({ ...config, runs: value })),
    [queue]
  );
  // The empty fallbacks come from the shared constant rather than fresh literals,
  // so a consumer can memoise on the identity of what it reads here.
  const current = state.root === root;
  return {
    overrides: current ? state.config.settings : emptyProjectConfig.settings,
    workspaceOverrides: current ? state.config.workspace : emptyProjectConfig.workspace,
    runs: current ? state.config.runs : undefined,
    ready: state.ready && current,
    setOverrides,
    setRuns,
    flush,
  };
}
