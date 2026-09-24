import type { SettingsOverrides } from '../../../shared/contracts/projectConfig';
/** Which layer the settings panel is reading and writing. */
export type SettingsScope = 'project' | 'global';
export function ScopeSelector({
  scope,
  available,
  projectName,
  onChange,
}: {
  scope: SettingsScope;
  available: boolean;
  projectName: string;
  onChange: (scope: SettingsScope) => void;
}) {
  const handleProjectClick = () => onChange('project');
  const handleGlobalClick = () => onChange('global');
  return (
    <div className='settings-scope' role='group' aria-label='Settings scope'>
      <button
        type='button'
        disabled={!available}
        aria-pressed={scope === 'project'}
        className={scope === 'project' ? 'chosen' : ''}
        onClick={handleProjectClick}
      >
        This project
        <small>{available ? projectName : 'No project open'}</small>
      </button>
      <button
        type='button'
        aria-pressed={scope === 'global'}
        className={scope === 'global' ? 'chosen' : ''}
        onClick={handleGlobalClick}
      >
        All projects
        <small>Defaults for projects that have no override</small>
      </button>
    </div>
  );
}
/** Marks a field the open project overrides, and clears that one override. */
export function OverrideMarker({
  field,
  overrides,
  scope,
  onReset,
}: {
  field: keyof SettingsOverrides;
  overrides: SettingsOverrides;
  scope: SettingsScope;
  onReset: (field: keyof SettingsOverrides) => void;
}) {
  const handleResetClick = () => onReset(field);
  if (scope !== 'project' || !(field in overrides)) return null;
  return (
    <button
      type='button'
      className='override-marker'
      title='This project overrides the global value'
      onClick={handleResetClick}
    >
      Overridden · Reset to global
    </button>
  );
}
