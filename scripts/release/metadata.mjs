import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkChangelog, releaseNotes } from './changelog.mjs';
import { root } from './tools.mjs';

export const metadata = () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const tauri = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const version = cargo.match(/^version = "([^"]+)"/m)?.[1];
  if (
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(pkg.version) ||
    version !== pkg.version ||
    tauri.version !== pkg.version
  ) {
    throw new Error('Package, Cargo and Tauri release versions must agree.');
  }
  if (
    !['Apache-2.0', 'MIT'].includes(pkg.license) ||
    !cargo.includes(`license = "${pkg.license}"`)
  ) {
    throw new Error('Select and record the project license before preparing a release.');
  }
  for (const file of [
    'LICENSE',
    'CHANGELOG.md',
    'SECURITY.md',
    'CONTRIBUTING.md',
    'THIRD_PARTY_NOTICES.md',
    'docs/licenses/JAVASCRIPT.md',
    'docs/licenses/RUST.md',
  ]) {
    if (!existsSync(join(root, file))) throw new Error(`Required release file missing: ${file}`);
  }
  const tag = `v${pkg.version}`;
  const requested = process.env.EMDECK_RELEASE_TAG;
  if (requested && requested !== tag) throw new Error(`Tag ${requested} does not match ${tag}`);
  const { changelog, fragments } = checkChangelog(root);
  releaseNotes(changelog, pkg.version);
  if (requested && fragments.length)
    throw new Error(
      'Release tags must consume pending notes with changelog:release before tagging.'
    );
  return { version: pkg.version, tag, license: pkg.license };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = metadata();
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\ntag=${result.tag}\n`);
  console.log(`Release metadata verified: ${result.tag}`);
}
