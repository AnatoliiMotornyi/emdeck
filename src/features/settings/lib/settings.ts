import { readStored } from '../../../platform/storage/preferences';
import type { Settings } from '../../../shared/contracts/workspace';
import { defaults } from './defaults';
export function loadSettings(): Settings {
  const s = { ...defaults, ...readStored<Partial<Settings>>('relay:settings', {}) };
  return {
    ...s,
    theme: ['dark', 'light', 'graphite'].includes(s.theme) ? s.theme : 'dark',
    accent: /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : defaults.accent,
    fontSize: Math.min(24, Math.max(10, Number(s.fontSize) || 13)),
    terminalFontSize: Math.min(24, Math.max(10, Number(s.terminalFontSize) || 12)),
    terminalFontFamily: typeof s.terminalFontFamily === 'string' ? s.terminalFontFamily : '',
    terminalLineHeight: Math.min(2, Math.max(1, Number(s.terminalLineHeight) || 1.35)),
    scrollback: Math.min(20000, Math.max(500, Number(s.scrollback) || 3000)),
    detectRunScripts: typeof s.detectRunScripts === 'boolean' ? s.detectRunScripts : true,
    reopenLastProject: typeof s.reopenLastProject === 'boolean' ? s.reopenLastProject : true,
    terminalPlacement: s.terminalPlacement === 'editor' ? 'editor' : 'workspace',
  };
}
