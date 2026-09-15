import { Check, Monitor, Moon, Sun } from 'lucide-react';
import type { Settings as SettingsType } from '../../../shared/contracts/workspace';
import { Modal } from '../../../shared/ui/Dialog';
import { accentPresets } from '../lib/accents';
import { defaults } from '../lib/defaults';
export default function Settings({
  settings,
  onChange,
  onClose,
}: {
  settings: SettingsType;
  onChange: (s: SettingsType) => void;
  onClose: () => void;
}) {
  const handleChange: React.ComponentProps<'input'>['onChange'] = e =>
    update({ reopenLastProject: e.target.checked });
  const handleCustomAccentColorChange: React.ComponentProps<'input'>['onChange'] = e =>
    update({ accent: e.target.value });
  const handleAccentPresetChange: React.ComponentProps<'select'>['onChange'] = e =>
    update({ accent: e.target.value });
  const handleChange2: React.ComponentProps<'input'>['onChange'] = e =>
    update({ fontSize: Math.max(10, Math.min(24, +e.target.value)) });
  const handleChange3: React.ComponentProps<'input'>['onChange'] = e =>
    update({ wordWrap: e.target.checked });
  const handleChange4: React.ComponentProps<'input'>['onChange'] = e =>
    update({ showHidden: e.target.checked });
  const handleChange5: React.ComponentProps<'input'>['onChange'] = e =>
    update({ shell: e.target.value });
  const handleChange6: React.ComponentProps<'input'>['onChange'] = e =>
    update({ terminalFontSize: Math.max(10, Math.min(24, +e.target.value)) });
  const handleChange7: React.ComponentProps<'select'>['onChange'] = e =>
    update({ scrollback: +e.target.value });
  const handleChange8: React.ComponentProps<'input'>['onChange'] = e =>
    update({ detectRunScripts: e.target.checked });
  const handleChangeClick = () => onChange(defaults);
  const update = (s: Partial<SettingsType>) => onChange({ ...settings, ...s });
  const activePreset = accentPresets.find(preset => preset.value === settings.accent)?.value ?? '';
  return (
    <Modal title='Make room for your workflow' onClose={onClose} wide>
      <p className='dialog-description'>
        A few thoughtful settings. Everything else stays out of your way.
      </p>
      <div className='settings-section'>
        <h3>Startup</h3>
        <div className='setting-row'>
          <label htmlFor='reopen-project'>
            Reopen last project on startup
            <small>
              Return to the project you last used. Turn off to start with an empty workspace.
            </small>
          </label>
          <input
            id='reopen-project'
            type='checkbox'
            checked={settings.reopenLastProject}
            onChange={handleChange}
          />
        </div>
      </div>
      <div className='settings-section'>
        <h3>Appearance</h3>
        <div className='theme-options'>
          {(['dark', 'light', 'graphite'] as const).map((theme, i) => {
            const handleClick = () => update({ theme });
            return (
              <button
                key={theme}
                className={`theme-option ${theme} ${settings.theme === theme ? 'chosen' : ''}`}
                onClick={handleClick}
              >
                <div className='theme-preview'>
                  <i />
                  <span />
                  <b />
                </div>
                <span>
                  {i === 0 ? (
                    <Moon size={14} />
                  ) : i === 1 ? (
                    <Sun size={14} />
                  ) : (
                    <Monitor size={14} />
                  )}
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  {settings.theme === theme && <Check size={13} />}
                </span>
              </button>
            );
          })}
        </div>
        <div className='setting-row'>
          <div>
            <strong>Accent color</strong>
            <small>A small touch of personality.</small>
          </div>
          <div className='swatches'>
            {['#b8ee86', '#8bbbf5', '#c4a0ed', '#f1b17f', '#f38ea2'].map(accent => {
              const handleClick = () => update({ accent });
              return (
                <button
                  key={accent}
                  aria-label={`Accent ${accent}`}
                  className={settings.accent === accent ? 'chosen' : ''}
                  style={{ background: accent }}
                  onClick={handleClick}
                />
              );
            })}
            <input
              type='color'
              title='Custom accent color'
              value={settings.accent}
              onChange={handleCustomAccentColorChange}
            />
            <select
              aria-label='More accent colors'
              title='More accent colors'
              value={activePreset}
              onChange={handleAccentPresetChange}
            >
              <option value='' disabled>
                More…
              </option>
              {accentPresets.map(preset => (
                <option key={preset.value} value={preset.value}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className='settings-section'>
        <h3>Workspace layout</h3>
        <div className='panel-layout-options' role='group' aria-label='Terminal panel placement'>
          {(['workspace', 'editor'] as const).map(placement => {
            const handleClick = () => update({ terminalPlacement: placement });
            return (
              <button
                key={placement}
                className={`panel-layout-option ${settings.terminalPlacement === placement ? 'chosen' : ''}`}
                aria-pressed={settings.terminalPlacement === placement}
                onClick={handleClick}
              >
                <span className={`panel-layout-preview placement-${placement}`} aria-hidden='true'>
                  <i />
                  <b />
                  <em />
                </span>
                <strong>{placement === 'workspace' ? 'Full bottom width' : 'Below editor'}</strong>
                <small>
                  {placement === 'workspace'
                    ? 'Files and editor sit above the terminal.'
                    : 'Keep the file tree full-height.'}
                </small>
              </button>
            );
          })}
        </div>
        <p className='layout-setting-note'>
          Drag panel dividers to resize. Use arrow keys on a focused divider, or double-click it to
          reset.
        </p>
      </div>
      <div className='settings-section'>
        <h3>Editor & explorer</h3>
        <div className='setting-row'>
          <label htmlFor='editor-size'>Editor font size</label>
          <input
            id='editor-size'
            type='number'
            min='10'
            max='24'
            value={settings.fontSize}
            onChange={handleChange2}
          />
        </div>
        <div className='setting-row'>
          <label htmlFor='wrap'>Wrap long lines</label>
          <input id='wrap' type='checkbox' checked={settings.wordWrap} onChange={handleChange3} />
        </div>
        <div className='setting-row'>
          <label htmlFor='hidden'>Show hidden files</label>
          <input
            id='hidden'
            type='checkbox'
            checked={settings.showHidden}
            onChange={handleChange4}
          />
        </div>
      </div>
      <div className='settings-section'>
        <h3>Terminals</h3>
        <label className='field'>
          Default shell
          <input
            placeholder='System default (PowerShell on Windows, $SHELL on Unix)'
            value={settings.shell}
            onChange={handleChange5}
          />
          <small>Executable name or full path. Applies to new panes.</small>
        </label>
        <div className='setting-row'>
          <label htmlFor='terminal-size'>Terminal font size</label>
          <input
            id='terminal-size'
            type='number'
            min='10'
            max='24'
            value={settings.terminalFontSize}
            onChange={handleChange6}
          />
        </div>
        <div className='setting-row'>
          <label htmlFor='scrollback'>Scrollback lines per pane</label>
          <select id='scrollback' value={settings.scrollback} onChange={handleChange7}>
            <option value='500'>500 · minimal</option>
            <option value='3000'>3,000 · balanced</option>
            <option value='10000'>10,000</option>
            <option value='20000'>20,000</option>
          </select>
        </div>
      </div>
      <div className='settings-section'>
        <h3>Run commands</h3>
        <div className='setting-row'>
          <label htmlFor='detect-scripts'>
            Auto-detect project scripts
            <small>
              Read scripts and package-manager hints in the project root. Applies to all projects.
            </small>
          </label>
          <input
            id='detect-scripts'
            type='checkbox'
            checked={settings.detectRunScripts}
            onChange={handleChange8}
          />
        </div>
      </div>
      <footer className='dialog-footer'>
        <button className='button secondary' onClick={handleChangeClick}>
          Reset defaults
        </button>
        <button className='button primary' onClick={onClose}>
          Done
        </button>
      </footer>
    </Modal>
  );
}
