import {
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pendingNotice =
  'Pending release notes live in [`.changes/`](.changes/README.md).\n' +
  'Add a separate fragment for each change; do not add entries here.';
const versionPattern = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;

const readRegularFile = path => {
  if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
};

const sections = changelog => [...changelog.matchAll(/^## (.+)$/gm)];
const sectionBody = (changelog, headings, index) =>
  changelog
    .slice(headings[index].index + headings[index][0].length, headings[index + 1]?.index)
    .trim();

export const releaseNotes = (changelog, version) => {
  const normalized = changelog.replaceAll('\r\n', '\n');
  const headings = sections(normalized);
  const matches = headings.flatMap((heading, index) =>
    heading[1].split(/\s/)[0] === version ? [index] : []
  );
  if (matches.length !== 1)
    throw new Error(`Expected exactly one changelog section for ${version}.`);
  const notes = sectionBody(normalized, headings, matches[0]);
  if (!notes) throw new Error(`Empty changelog section for ${version}.`);
  return notes;
};

export const checkChangelog = root => {
  const directory = join(root, '.changes');
  if (!lstatSync(directory).isDirectory())
    throw new Error('.changes must be a regular directory, not a link.');
  const fragments = readdirSync(directory)
    .filter(name => name !== 'README.md')
    .sort()
    .map(name => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(name))
        throw new Error(`Invalid release-note filename: ${name}. Use a unique lowercase slug.md.`);
      const path = join(directory, name);
      const content = readRegularFile(path).trim();
      if (
        !content.startsWith('- ') ||
        content.split('\n').some(line => line && !/^(?:- \S| {2,}\S| {2,}$)/.test(line))
      )
        throw new Error(`${name}: use nonempty Markdown bullets with indented continuation lines.`);
      return { name, path, content };
    });
  const changelog = readRegularFile(join(root, 'CHANGELOG.md'));
  const headings = sections(changelog);
  if (
    headings[0]?.[1] !== 'Unreleased' ||
    headings.filter(heading => heading[1] === 'Unreleased').length !== 1 ||
    sectionBody(changelog, headings, 0).replace(/\s+/g, ' ') !== pendingNotice.replace(/\s+/g, ' ')
  )
    throw new Error('Keep Unreleased unchanged; add release notes in .changes/<unique-slug>.md.');
  return { changelog, fragments, insertion: headings[1]?.index ?? changelog.length };
};

export const prepareRelease = (root, version, write = false) => {
  if (!versionPattern.test(version)) throw new Error('Provide a version such as 0.1.23.');
  const pkg = JSON.parse(readRegularFile(join(root, 'package.json')));
  if (pkg.version !== version) throw new Error('Update package.json to the release version first.');
  const { changelog, fragments, insertion } = checkChangelog(root);
  if (sections(changelog).some(heading => heading[1].split(/\s/)[0] === version))
    throw new Error(
      `Version ${version} already exists in CHANGELOG.md; it will not be overwritten.`
    );
  if (!fragments.length) throw new Error('No pending release notes.');
  const entry = `## ${version}\n\n${fragments.map(fragment => fragment.content).join('\n\n')}\n\n`;
  const output = `${changelog.slice(0, insertion).trimEnd()}\n\n${entry}${changelog.slice(insertion)}`;
  if (write) {
    const temporary = join(root, 'CHANGELOG.md.tmp');
    writeFileSync(temporary, output, { flag: 'wx' });
    try {
      renameSync(temporary, join(root, 'CHANGELOG.md'));
    } catch (error) {
      unlinkSync(temporary);
      throw error;
    }
    // Save the complete history before removing the exact files included in it.
    for (const fragment of fragments) unlinkSync(fragment.path);
  }
  return entry.trimEnd();
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const root = process.cwd();
    if (command === 'check' && !args.length) {
      const { fragments } = checkChangelog(root);
      console.log(`Release notes verified: ${fragments.length} pending fragment(s).`);
    } else if (command === 'preview' && !args.length) {
      const { fragments } = checkChangelog(root);
      console.log(
        fragments.map(fragment => fragment.content).join('\n\n') || 'No pending release notes.'
      );
    } else if (
      command === 'release' &&
      args.length >= 1 &&
      args.length <= 2 &&
      (args.length === 1 || args[1] === '--write')
    ) {
      console.log(prepareRelease(root, args[0], args[1] === '--write'));
      console.log(
        args[1] === '--write'
          ? '\nChangelog updated; consumed fragments removed.'
          : '\nPreview only. Repeat with --write to update the changelog and consume these fragments.'
      );
    } else {
      throw new Error('Usage: changelog.mjs check | preview | release <version> [--write]');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
