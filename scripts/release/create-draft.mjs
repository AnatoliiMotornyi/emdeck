import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseNotes } from './changelog.mjs';
import { metadata } from './metadata.mjs';
import { root } from './tools.mjs';

const { version, tag } = metadata();
const directory = join(root, '.tmp/release-assets');
const labels = ['windows-x64', 'macos-arm64', 'macos-x64', 'linux-x64'];
const records = labels.map(label =>
  JSON.parse(readFileSync(join(directory, `${label}.json`), 'utf8'))
);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (records.some(record => record.version !== version || record.commit !== commit))
  throw new Error('Mixed artifact versions or commits');
const signed = records
  .filter(record => !record.target.includes('linux'))
  .every(record => record.signed);
if (process.env.EMDECK_SIGNED === 'true' && !signed)
  throw new Error('Unsigned artifacts in a signed release');
for (const [source, destination] of [
  ['LICENSE', 'LICENSE.txt'],
  ['NOTICE', 'NOTICE.txt'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ['docs/licenses/JAVASCRIPT.md', 'JAVASCRIPT-LICENSES.md'],
  ['docs/licenses/RUST.md', 'RUST-LICENSES.md'],
])
  copyFileSync(join(root, source), join(directory, destination));
const files = readdirSync(directory).sort();
const checksums = files.map(
  name =>
    `${createHash('sha256')
      .update(readFileSync(join(directory, name)))
      .digest('hex')}  ${name}`
);
writeFileSync(join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const notes = releaseNotes(changelog, version);
const body = [
  `Emdeck ${version} — public beta`,
  '',
  notes,
  '',
  signed
    ? 'Windows installers are signed; macOS applications are signed and notarized.'
    : '**Unsigned preview builds.** Windows/macOS downloads may be blocked or show operating-system warnings. These are not signed production installers.',
  '',
  'Choose the asset matching your operating system and processor. Linux downloads target x64. Installers include third-party notices; SHA256SUMS.txt covers the attached files.',
  '',
  'Auto-update is not enabled. Download and install a newer release to update. Review the repository installation guide and known limitations before use.',
  '',
];
const notesPath = join(root, '.tmp/release-notes.md');
writeFileSync(notesPath, body.join('\n'));
execFileSync(
  'gh',
  [
    'release',
    'create',
    tag,
    '--verify-tag',
    '--draft',
    '--prerelease',
    '--title',
    `Emdeck ${version} beta`,
    '--notes-file',
    notesPath,
    ...[...files, 'SHA256SUMS.txt'].map(name => join(directory, name)),
  ],
  { cwd: root, windowsHide: true, stdio: 'inherit' }
);
