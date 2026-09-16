import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../platform/desktop/api';
import { readStored } from '../../../platform/storage/preferences';
import type { Project, RunConfig } from '../../../shared/contracts/workspace';
import { useLatest } from '../../../shared/hooks/useLatest';
import { discoverProjectRuns } from '../services/discoverProjectRuns';
import type { RunPreferences, RunnerPreference } from '../services/runDiscovery';
import {
  emptyDiscovery,
  emptyRuns,
  migrateStoredRuns,
  rememberRun,
} from '../services/runDiscovery';
export function useRunConfigurations(
  project: Project | null,
  enabled: boolean,
  runs: unknown,
  setRuns: (value: unknown) => void,
  ready: boolean
) {
  const root = project?.root ?? '';
  const [state, setState] = useState({ root: '', prefs: emptyRuns });
  const [found, setFound] = useState({ key: '', data: emptyDiscovery, loading: false });
  const [revision, setRevision] = useState(0);
  const active = root === state.root;
  const prefs = active ? state.prefs : emptyRuns;
  const key = `${root}\0${enabled}\0${prefs.runner}`;
  const currentKey = useLatest(key);
  // Read through a ref rather than depending on `runs` directly: the save effect
  // below writes `prefs` back into it on every change, and `migrateStoredRuns`
  // always returns a fresh object, so a value dependency here would ping-pong
  // the two effects forever instead of settling after the project loads.
  const latestRuns = useLatest(runs);
  useEffect(() => {
    if (!root || !ready) return;
    setState({
      root,
      prefs: migrateStoredRuns(
        latestRuns.current,
        readStored(`relay:run-preferences:${root}`, null),
        readStored(`relay:runs:${root}`, [])
      ),
    });
  }, [root, ready, latestRuns]);
  useEffect(() => {
    if (root && active && ready) setRuns(prefs);
  }, [root, active, ready, prefs, setRuns]);
  useEffect(() => {
    if (!root || !active || !enabled) return;
    let cancelled = false;
    setFound(previous => ({
      key,
      data: previous.key === key ? previous.data : emptyDiscovery,
      loading: true,
    }));
    const isCurrent = () => !cancelled && currentKey.current === key;
    void discoverProjectRuns(api, root, prefs.runner, isCurrent).then(data => {
      if (data && isCurrent()) setFound({ key, data, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [root, active, enabled, prefs.runner, key, revision, currentKey]);
  const update = (change: (previous: RunPreferences) => RunPreferences) => {
    setState(previous =>
      previous.root === root ? { root, prefs: change(previous.prefs) } : previous
    );
  };
  const discovery = enabled && found.key === key ? found.data : emptyDiscovery;
  const loading = enabled && Boolean(root) && (!active || found.key !== key || found.loading);
  const configs = [...prefs.custom, ...discovery.configs];
  const selected =
    configs.find(run => run.id === prefs.selected) ?? (loading ? undefined : configs[0]);
  const recent = prefs.recent.flatMap(entry => {
    const run = configs.find(run => run.id === entry.id);
    return run ? [{ ...run, lastUsed: entry.at }] : [];
  });
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return {
    custom: prefs.custom,
    discovery,
    recent,
    selected,
    runner: prefs.runner,
    loading,
    refresh,
    select: (id: string) => update(previous => ({ ...previous, selected: id })),
    setRunner: (runner: RunnerPreference) => update(previous => ({ ...previous, runner })),
    save: (run: RunConfig) =>
      update(previous => ({
        ...previous,
        selected: run.id,
        custom: [...previous.custom.filter(item => item.id !== run.id), run],
      })),
    remove: (id: string) =>
      update(previous => ({
        ...previous,
        custom: previous.custom.filter(run => run.id !== id),
        recent: previous.recent.filter(run => run.id !== id),
        selected: previous.selected === id ? '' : previous.selected,
      })),
    remember: (id: string) =>
      update(previous => ({
        ...previous,
        selected: id,
        recent: rememberRun(previous.recent, id),
      })),
    clearHistory: () => update(previous => ({ ...previous, recent: [] })),
  };
}
