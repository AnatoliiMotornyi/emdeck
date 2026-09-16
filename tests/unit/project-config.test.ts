import { describe, expect, it } from 'vitest';
import {
  mergeSettings,
  parseProjectConfig,
  serialiseProjectConfig,
  withGlobalChange,
  withOverride,
  withoutOverride,
} from '../../src/features/settings/services/projectConfig';
import { defaults } from '../../src/features/settings/lib/defaults';
import { emptyProjectConfig } from '../../src/shared/contracts/projectConfig';

describe('merging project overrides over global settings', () => {
  it('returns global settings unchanged when nothing is overridden', () => {
    expect(mergeSettings(defaults, {})).toEqual(defaults);
  });
  it('lets a project override a single value without touching the rest', () => {
    const merged = mergeSettings(defaults, { accent: '#e8dd7a' });
    expect(merged.accent).toBe('#e8dd7a');
    expect(merged.fontSize).toBe(defaults.fontSize);
  });
  it('distinguishes an explicit false from an absent key', () => {
    const global = { ...defaults, wordWrap: true };
    expect(mergeSettings(global, { wordWrap: false }).wordWrap).toBe(false);
    expect(mergeSettings(global, {}).wordWrap).toBe(true);
  });
  it('never lets an override introduce reopenLastProject', () => {
    const merged = mergeSettings(defaults, { accent: '#e8dd7a' });
    expect(merged.reopenLastProject).toBe(defaults.reopenLastProject);
  });
});

describe('editing the override set', () => {
  it('adds a key without disturbing existing overrides', () => {
    expect(withOverride({ accent: '#e8dd7a' }, { fontSize: 15 })).toEqual({
      accent: '#e8dd7a',
      fontSize: 15,
    });
  });
  it('removes a key so the global value is inherited again', () => {
    expect(withoutOverride({ accent: '#e8dd7a', fontSize: 15 }, 'accent')).toEqual({
      fontSize: 15,
    });
  });
  it('drops undefined rather than storing it, so absence stays meaningful', () => {
    expect(withOverride({ accent: '#e8dd7a' }, { accent: undefined })).toEqual({});
  });
});

describe('editing the global layer', () => {
  it('applies a change over the previous global settings', () => {
    expect(withGlobalChange(defaults, { accent: '#e8dd7a' })).toEqual({
      ...defaults,
      accent: '#e8dd7a',
    });
  });
  it('never stores undefined, so the global layer stays complete', () => {
    const next = withGlobalChange(defaults, { accent: undefined });
    expect(next).toEqual(defaults);
    expect('accent' in next && next.accent).toBe(defaults.accent);
  });
  it('keeps a change to reopenLastProject, which no project may override', () => {
    expect(withGlobalChange(defaults, { reopenLastProject: false }).reopenLastProject).toBe(false);
  });
});

describe('reading a configuration file', () => {
  it('reads a sparse file', () => {
    const parsed = parseProjectConfig('{"version":1,"settings":{"accent":"#e8dd7a"}}');
    expect(parsed?.settings).toEqual({ accent: '#e8dd7a' });
    expect(parsed?.workspace).toEqual({});
  });
  it('rejects malformed JSON so the caller can fall back to global settings', () => {
    expect(parseProjectConfig('{ not json')).toBeNull();
  });
  it('rejects a version it does not understand', () => {
    expect(parseProjectConfig('{"version":99,"settings":{"accent":"#e8dd7a"}}')).toBeNull();
  });
  it('treats a missing file as no overrides rather than an error', () => {
    expect(parseProjectConfig(null)).toEqual(emptyProjectConfig);
  });
  it('drops values that fail validation instead of failing the whole file', () => {
    const parsed = parseProjectConfig(
      '{"version":1,"settings":{"accent":"banana","fontSize":13,"theme":"neon"}}'
    );
    expect(parsed?.settings).toEqual({ fontSize: 13 });
  });
  it('clamps a numeric override into the supported range', () => {
    expect(parseProjectConfig('{"version":1,"settings":{"fontSize":900}}')?.settings).toEqual({
      fontSize: 24,
    });
  });
});

describe('writing a configuration file', () => {
  it('serialises sparse overrides and ends with a newline', () => {
    const text = serialiseProjectConfig({
      version: 1,
      settings: { accent: '#e8dd7a' },
      workspace: {},
    });
    expect(text).toBe('{\n  "version": 1,\n  "settings": {\n    "accent": "#e8dd7a"\n  }\n}\n');
  });
  it('omits empty sections so an untouched project stays minimal', () => {
    expect(serialiseProjectConfig(emptyProjectConfig)).toBe('{\n  "version": 1\n}\n');
  });
  it('round-trips through parse', () => {
    const config = {
      version: 1,
      settings: { accent: '#e8dd7a', wordWrap: false },
      workspace: { sidebarWidth: 320 },
    };
    expect(parseProjectConfig(serialiseProjectConfig(config))).toEqual(config);
  });
});
