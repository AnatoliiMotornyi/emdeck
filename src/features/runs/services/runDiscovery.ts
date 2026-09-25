import type { RunConfig } from '../../../shared/contracts/workspace';
export const runners = ['bun', 'npm', 'pnpm', 'yarn'] as const;
export type Runner = (typeof runners)[number];
export type RunnerPreference = Runner | 'auto';
export interface RunDiscovery {
  configs: RunConfig[];
  runner: Runner | null;
  reason: string;
  notice: string;
}
export interface RunPreferences {
  version: 1;
  custom: RunConfig[];
  selected: string;
  runner: RunnerPreference;
  recent: {
    id: string;
    at: number;
  }[];
}
export const emptyRuns: RunPreferences = {
  version: 1,
  custom: [],
  selected: '',
  runner: 'auto',
  recent: [],
};
export const emptyDiscovery: RunDiscovery = { configs: [], runner: null, reason: '', notice: '' };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isRunner = (value: unknown): value is Runner => runners.includes(value as Runner);
export const detectRuns = (
  pkg: unknown,
  files: string[],
  preference: RunnerPreference = 'auto'
): RunDiscovery => {
  if (!isRecord(pkg)) throw new Error('package.json must contain an object.');
  let runner: Runner | null = preference === 'auto' ? null : preference;
  let reason = runner ? 'Selected for this project' : '';
  let notice = '';
  const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : null;
  const development =
    isRecord(pkg.devEngines) && isRecord(pkg.devEngines.packageManager)
      ? pkg.devEngines.packageManager.name
      : null;
  if (!runner && declared) {
    if (!isRunner(declared))
      return {
        ...emptyDiscovery,
        notice: `Unsupported packageManager: ${declared}. Choose a script runner below.`,
      };
    runner = declared;
    reason = 'package.json · packageManager';
  }
  if (!runner && isRunner(development)) {
    runner = development;
    reason = 'package.json · devEngines.packageManager';
  }
  const lockfiles: [Runner, string[]][] = [
    ['bun', ['bun.lock', 'bun.lockb']],
    ['pnpm', ['pnpm-lock.yaml']],
    ['yarn', ['yarn.lock']],
    ['npm', ['package-lock.json', 'npm-shrinkwrap.json']],
  ];
  const matches = lockfiles
    .map(([manager, names]) => ({ manager, files: names.filter(name => files.includes(name)) }))
    .filter(match => match.files.length);
  if (!runner && matches.length > 1)
    return {
      ...emptyDiscovery,
      notice: `Multiple lockfiles (${matches.flatMap(match => match.files).join(', ')}). Choose a script runner below.`,
    };
  if (!runner && matches.length === 1) {
    runner = matches[0].manager;
    reason = matches[0].files.join(' + ');
  }
  if (
    !runner &&
    (files.includes('bunfig.toml') ||
      (isRecord(pkg.engines) && typeof pkg.engines.bun === 'string'))
  ) {
    runner = 'bun';
    reason = files.includes('bunfig.toml') ? 'bunfig.toml' : 'package.json · engines.bun';
  }
  if (!runner) {
    runner = 'npm';
    reason = 'Default · no package-manager declaration or lockfile';
  }
  if (preference === 'auto' && matches.some(match => match.manager !== runner)) {
    notice = `Using ${runner} from package.json; other lockfiles are also present.`;
  }
  if (pkg.scripts !== undefined && !isRecord(pkg.scripts))
    throw new Error('The scripts field in package.json must be an object.');
  const configs: RunConfig[] = [];
  let skipped = 0;
  for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
    // These names are safe as literal arguments in all supported shells. Unusual
    // names stay in package.json and can be run through an explicit custom command.
    if (
      !/^[a-zA-Z0-9_][a-zA-Z0-9_.:@/-]*$/.test(name) ||
      typeof script !== 'string' ||
      !script.trim()
    ) {
      skipped++;
      continue;
    }
    configs.push({
      id: `detected:${name}`,
      name: `${runner} ${name}`,
      command: `${runner} run ${name}`,
      cwd: '',
      source: 'detected',
      script,
    });
  }
  if (skipped)
    notice = [
      notice,
      `${skipped} script${skipped === 1 ? '' : 's'} could not be imported. Add a custom command for unusual script names.`,
    ]
      .filter(Boolean)
      .join(' ');
  return { configs, runner, reason, notice };
};
const validCustom = (value: unknown): value is RunConfig => {
  return (
    isRecord(value) &&
    ['id', 'name', 'command', 'cwd'].every(key => typeof value[key] === 'string') &&
    Boolean(value.id) &&
    Boolean(String(value.name).trim()) &&
    Boolean(String(value.command).trim())
  );
};
// Only the exact old generated npm presets are regenerated. Edited presets and
// all user-created commands survive migration, including their working directory.
export const restoreRuns = (saved: unknown, legacy: unknown): RunPreferences => {
  if (isRecord(saved) && saved.version === 1) {
    const custom = Array.isArray(saved.custom)
      ? saved.custom.filter(validCustom).map(run => ({ ...run, source: 'custom' as const }))
      : [];
    const recent = Array.isArray(saved.recent)
      ? saved.recent
          .filter(
            (
              item
            ): item is {
              id: string;
              at: number;
            } =>
              isRecord(item) &&
              typeof item.id === 'string' &&
              typeof item.at === 'number' &&
              Number.isFinite(item.at)
          )
          .slice(0, 8)
      : [];
    return {
      version: 1,
      custom,
      recent,
      selected: typeof saved.selected === 'string' ? saved.selected : '',
      runner: isRunner(saved.runner) ? saved.runner : 'auto',
    };
  }
  const custom = (Array.isArray(legacy) ? legacy : [])
    .filter(validCustom)
    .filter(run => {
      const script = run.id.startsWith('npm:') ? run.id.slice(4) : null;
      return !(
        script &&
        run.name === `npm ${script}` &&
        run.command === `npm run ${script}` &&
        !run.cwd
      );
    })
    .map(run => ({ ...run, source: 'custom' as const }));
  return { ...emptyRuns, custom };
};
/** The project folder wins once it has a runs section; the old keys seed the first write. */
export const migrateStoredRuns = (
  stored: unknown,
  savedPreferences: unknown,
  legacyRuns: unknown
): RunPreferences => restoreRuns(stored ?? savedPreferences, legacyRuns);
export const rememberRun = (
  recent: RunPreferences['recent'],
  id: string,
  at = Date.now()
): RunPreferences['recent'] => {
  return [{ id, at }, ...recent.filter(item => item.id !== id)].slice(0, 8);
};
