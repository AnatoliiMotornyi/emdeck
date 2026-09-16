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
export function useProjectConfig(project: Project | null, fail: (error: unknown) => void) {
  const root = project?.root ?? '';
  const [state, setState] = useState({
    root: '',
    config: emptyProjectConfig,
    ready: false,
  });
  // A corrupt or unwritable file is never rewritten, so a user can repair it by hand.
  const writable = useRef(true);
  const pending = useRef<{ root: string; config: ProjectConfig } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drain = useCallback(() => {
    const queued = pending.current;
    pending.current = null;
    if (!queued) return;
    void api.writeProjectConfig(queued.root, serialiseProjectConfig(queued.config)).catch(error => {
      writable.current = false;
      fail(error);
    });
  }, [fail]);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    drain();
  }, [drain]);
  useEffect(() => {
    flush();
    if (!root) {
      setState({ root: '', config: emptyProjectConfig, ready: true });
      return;
    }
    let cancelled = false;
    setState({ root, config: emptyProjectConfig, ready: false });
    void api
      .readProjectConfig(root)
      .then(raw => {
        if (cancelled) return;
        const parsed = parseProjectConfig(raw);
        writable.current = parsed !== null;
        if (!parsed)
          fail('This project has an unreadable .emdeck/settings.json. Using global settings.');
        setState({ root, config: parsed ?? emptyProjectConfig, ready: true });
      })
      .catch(error => {
        if (cancelled) return;
        writable.current = false;
        fail(error);
        setState({ root, config: emptyProjectConfig, ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, [root, flush, fail]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const queue = useCallback(
    (change: (previous: ProjectConfig) => ProjectConfig) => {
      setState(previous => {
        if (previous.root !== root || !root || !previous.ready) return previous;
        const config = change(previous.config);
        if (writable.current) {
          pending.current = { root, config };
          clearTimeout(timer.current);
          timer.current = setTimeout(drain, SAVE_DELAY);
        }
        return { ...previous, config };
      });
    },
    [root, drain]
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
  };
}
