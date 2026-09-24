import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const script = resolve('scripts/release/changelog.mjs');
const notice =
  'Pending release notes live in [`.changes/`](.changes/README.md).\n' +
  'Add a separate fragment for each change; do not add entries here.';
const history = '## 0.1.22 — Previous release\n\n- Preserve this published note.\n';
const initial = `# Changelog\n\n## Unreleased\n\n${notice}\n\n${history}`;
const removeFixture = (base: string, root: string) => {
  if (!resolve(root).startsWith(base + sep)) throw new Error('Unsafe fixture cleanup');
  rmSync(root, { recursive: true, force: true });
};

const withFixture = (run: (root: string) => void) => {
  const base = realpathSync(tmpdir());
  const root = mkdtempSync(join(base, 'emdeck-changelog-'));
  if (!root.startsWith(base + sep)) throw new Error('Unexpected fixture directory');
  try {
    mkdirSync(join(root, '.changes'));
    writeFileSync(join(root, '.changes/README.md'), 'Contributor instructions.\n');
    writeFileSync(join(root, 'CHANGELOG.md'), initial);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.1.23' }));
    run(root);
  } finally {
    removeFixture(base, root);
  }
};
const run = (root: string, ...args: string[]) =>
  execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
    timeout: 10_000,
  });
const add = (root: string, name: string, content = '- Keep terminal input when resizing.\n') =>
  writeFileSync(join(root, '.changes', name), content);
const read = (root: string) => readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

it('combines independent PR notes deterministically without changing files during preview', () => {
  withFixture(root => {
    add(root, '42-terminal.md', '- Fix terminal scrolling.\r\n  Keep its history.\r\n');
    add(root, '37-workspaces.md', '- Arrange background workspaces.\n');
    expect(run(root, 'check')).toContain('2 pending fragment(s)');
    const notes = run(root, 'preview');
    expect(notes).toBe(
      '- Arrange background workspaces.\n\n- Fix terminal scrolling.\n  Keep its history.\n'
    );
    expect(run(root, 'release', '0.1.23')).toContain(`## 0.1.23\n\n${notes}`);
    expect(read(root)).toBe(initial);
    expect(readdirSync(join(root, '.changes')).sort()).toEqual([
      '37-workspaces.md',
      '42-terminal.md',
      'README.md',
    ]);
  });
});

it('writes a new release, preserves published history and consumes only included fragments', () => {
  withFixture(root => {
    add(root, '37-workspaces.md');
    add(root, '42-terminal.md', '- Fix terminal colors.\n');
    expect(run(root, 'release', '0.1.23', '--write')).toContain('consumed fragments removed');
    const released = read(root);
    expect(released).toContain(`## Unreleased\n\n${notice}\n\n## 0.1.23\n`);
    expect(released).toContain('- Keep terminal input when resizing.\n\n- Fix terminal colors.');
    expect(released.endsWith(history)).toBe(true);
    expect(readdirSync(join(root, '.changes'))).toEqual(['README.md']);
    expect(existsSync(join(root, 'CHANGELOG.md.tmp'))).toBe(false);
    expect(run(root, 'check')).toContain('0 pending fragment(s)');
    add(root, '43-next-change.md');
    expect(() => run(root, 'release', '0.1.23', '--write')).toThrow('already exists');
    expect(read(root)).toBe(released);
    expect(existsSync(join(root, '.changes/43-next-change.md'))).toBe(true);
  });
});

it.each([
  ['empty.md', '', 'nonempty Markdown bullets'],
  ['heading.md', '## 0.1.24\n\n- Note.\n', 'nonempty Markdown bullets'],
  ['malformed.md', '- Note.\nUnindented continuation.\n', 'indented continuation'],
  ['UPPERCASE.md', '- Note.\n', 'Invalid release-note filename'],
  ['note.txt', '- Note.\n', 'Invalid release-note filename'],
])(
  'rejects invalid fragment %s before mutating the changelog or any notes',
  (name, content, error) => {
    withFixture(root => {
      add(root, 'valid.md');
      add(root, name, content);
      expect(() => run(root, 'check')).toThrow(error);
      expect(() => run(root, 'release', '0.1.23', '--write')).toThrow(error);
      expect(read(root)).toBe(initial);
      expect(readFileSync(join(root, '.changes', name), 'utf8')).toBe(content);
      expect(existsSync(join(root, '.changes/valid.md'))).toBe(true);
    });
  }
);

it('rejects inline Unreleased entries to prevent reintroducing the shared edit hotspot', () => {
  withFixture(root => {
    writeFileSync(
      join(root, 'CHANGELOG.md'),
      initial.replace(notice, notice.replaceAll('\n', ' '))
    );
    expect(run(root, 'check')).toContain('0 pending fragment(s)');
    writeFileSync(join(root, 'CHANGELOG.md'), initial.replace(notice, '- Shared entry.'));
    expect(() => run(root, 'check')).toThrow('add release notes in .changes');
  });
});

it('refuses empty releases, mismatched versions and unrecognized options without side effects', () => {
  withFixture(root => {
    expect(() => run(root, 'release', '0.1.23', '--write')).toThrow('No pending release notes');
    add(root, 'valid.md');
    expect(() => run(root, 'release', '../bad', '--write')).toThrow('Provide a version');
    expect(() => run(root, 'release', '0.1.24', '--write')).toThrow('Update package.json');
    expect(() => run(root, 'release', '0.1.23', '--overwrite')).toThrow('Usage:');
    expect(read(root)).toBe(initial);
    expect(existsSync(join(root, '.changes/valid.md'))).toBe(true);
  });
});

it('does not overwrite an existing temporary file or consume notes when writing fails', () => {
  withFixture(root => {
    add(root, 'valid.md');
    writeFileSync(join(root, 'CHANGELOG.md.tmp'), 'Existing file.');
    expect(() => run(root, 'release', '0.1.23', '--write')).toThrow('EEXIST');
    expect(read(root)).toBe(initial);
    expect(readFileSync(join(root, 'CHANGELOG.md.tmp'), 'utf8')).toBe('Existing file.');
    expect(existsSync(join(root, '.changes/valid.md'))).toBe(true);
  });
});

it('refuses linked fragment directories instead of reading or consuming another directory', () => {
  withFixture(root => {
    rmSync(join(root, '.changes/README.md'));
    rmdirSync(join(root, '.changes'));
    const outside = join(root, 'elsewhere');
    mkdirSync(outside);
    writeFileSync(join(outside, 'private.md'), '- Synthetic private note.\n');
    symlinkSync(outside, join(root, '.changes'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => run(root, 'release', '0.1.23', '--write')).toThrow('regular directory');
    expect(read(root)).toBe(initial);
    expect(existsSync(join(outside, 'private.md'))).toBe(true);
  });
});

it('extracts exact release versions for draft notes and rejects duplicate or empty sections', () => {
  withFixture(root => {
    const extract = (changelog: string, version: string) =>
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          'const { releaseNotes } = await import(process.env.EMDECK_CHANGELOG_MODULE); console.log(releaseNotes(process.env.EMDECK_TEST_HISTORY, process.env.EMDECK_TEST_VERSION));',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          windowsHide: true,
          stdio: 'pipe',
          env: {
            ...process.env,
            EMDECK_CHANGELOG_MODULE: pathToFileURL(script).href,
            EMDECK_TEST_HISTORY: changelog,
            EMDECK_TEST_VERSION: version,
          },
        }
      );
    expect(extract(history.replaceAll('\n', '\r\n'), '0.1.22')).toBe(
      '- Preserve this published note.\n'
    );
    expect(() => extract(history, '0.1.2')).toThrow('exactly one changelog section');
    expect(() => extract(history + history, '0.1.22')).toThrow('exactly one changelog section');
    expect(() => extract('## 0.1.23\n\n', '0.1.23')).toThrow('Empty changelog section');
  });
});

it('allows pending notes in development but requires consuming them before draft publication', () => {
  withFixture(root => {
    const scripts = join(root, 'scripts/release');
    mkdirSync(scripts, { recursive: true });
    for (const name of ['changelog.mjs', 'metadata.mjs', 'tools.mjs'])
      copyFileSync(resolve('scripts/release', name), join(scripts, name));
    mkdirSync(join(root, 'src-tauri'));
    mkdirSync(join(root, 'docs/licenses'), { recursive: true });
    for (const name of [
      'LICENSE',
      'SECURITY.md',
      'CONTRIBUTING.md',
      'THIRD_PARTY_NOTICES.md',
      'docs/licenses/JAVASCRIPT.md',
      'docs/licenses/RUST.md',
    ])
      writeFileSync(join(root, name), 'Synthetic release fixture.\n');
    const setVersion = (version: string) => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ version, license: 'Apache-2.0' }));
      writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version }));
      writeFileSync(
        join(root, 'src-tauri/Cargo.toml'),
        `version = "${version}"\nlicense = "Apache-2.0"\n`
      );
    };
    const metadata = (tag = '') =>
      execFileSync(process.execPath, [join(scripts, 'metadata.mjs')], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        stdio: 'pipe',
        env: { ...process.env, EMDECK_RELEASE_TAG: tag, GITHUB_OUTPUT: '' },
      });
    setVersion('0.1.22');
    add(root, 'valid.md');
    expect(metadata()).toContain('Release metadata verified: v0.1.22');
    expect(() => metadata('v0.1.22')).toThrow('consume pending notes');
    setVersion('0.1.23');
    run(root, 'release', '0.1.23', '--write');
    expect(metadata('v0.1.23')).toContain('Release metadata verified: v0.1.23');
  });
});
