// Build with window-test.conf.json first; never attach to a user's running IDE.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { root } from './tools.mjs';

if (process.platform !== 'win32') throw new Error('Windows acceptance only.');
const executable = resolve(process.argv[2] ?? '');
const product = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '(Get-Item -LiteralPath $env:EMDECK_TEST_EXE).VersionInfo.ProductName',
  ],
  { env: { ...process.env, EMDECK_TEST_EXE: executable }, windowsHide: true, encoding: 'utf8' }
).trim();
if (product !== 'Emdeck Window Test') throw new Error('Use the isolated window-test build.');
const directory = mkdtempSync(join(root, '.tmp/project-windows-'));
const first = join(directory, 'First project');
const second = join(directory, 'Second project');
const third = join(directory, 'Third project');
for (const folder of [first, second, third]) {
  mkdirSync(folder);
  writeFileSync(join(folder, 'notes.ts'), 'const original = true;\n');
}
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const env = {
  ...process.env,
  EMDECK_SESSION_HOME: join(directory, 'server'),
  WEBVIEW2_USER_DATA_FOLDER: join(directory, 'profile'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`,
};
const app = spawn(executable, ['--project', first], { env, windowsHide: true, stdio: 'ignore' });
let browser;
const errors = [];
const invoke = (page, command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  });
const pages = () => browser.contexts().flatMap(context => context.pages());
const labels = async () =>
  Promise.all(
    pages().map(page =>
      page
        .evaluate(() => window.__TAURI_INTERNALS__?.metadata.currentWindow.label)
        .catch(() => null)
    )
  );
const findWindow = async label => {
  await expect.poll(labels, { timeout: 20000 }).toContain(label);
  const current = await labels();
  const page = pages()[current.indexOf(label)];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const launchAgain = async args => {
  const child = spawn(executable, args, {
    env,
    cwd: directory,
    windowsHide: true,
    stdio: 'ignore',
  });
  try {
    await expect.poll(() => child.exitCode, { timeout: 15000 }).toBe(0);
  } finally {
    if (child.exitCode === null) child.kill();
  }
};
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      break;
    } catch {
      if (app.exitCode !== null) throw new Error(`Test IDE exited: ${app.exitCode}`);
      await delay(500);
    }
  }
  if (!browser) throw new Error('Could not connect to the isolated WebView.');
  const main = await findWindow('main');
  expect(await invoke(main, 'plugin:app|identifier')).toBe('dev.relay.ide.window-tests');
  await expect(main.locator('.project-switch')).toContainText('First project');
  await main.getByRole('treeitem', { name: /notes.ts/ }).click();
  await main.getByTestId('code-editor').locator('.cm-content').click();
  await main.keyboard.type('// unsaved native draft');
  await main.getByRole('button', { name: 'Start a terminal', exact: true }).click();
  // Shell OSC titles can rename the pane as soon as its process starts.
  const terminal = main.locator('.terminal-pane');
  await expect(terminal).toContainText('Connected');
  await terminal.locator('.xterm').evaluate(el => el.setAttribute('data-session', 'preserved'));
  await terminal.locator('.xterm-helper-textarea').focus();
  await main.keyboard.type('Write-Output PROJECT_WINDOW_RETAINED');
  await main.keyboard.press('Enter');
  await expect(terminal).toContainText('PROJECT_WINDOW_RETAINED');

  for (const path of [first, first.toUpperCase(), join(first, '.'), `\\\\?\\${first}`]) {
    expect(await invoke(main, 'open_project_window', { path })).toEqual({
      label: 'main',
      reused: true,
    });
  }
  expect(await labels()).toEqual(['main']);
  const created = await invoke(main, 'open_project_window', { path: second });
  expect(created.reused).toBe(false);
  const other = await findWindow(created.label);
  await expect(other.locator('.project-switch')).toContainText('Second project');
  // Native replacement also refuses to claim a folder owned by another window.
  expect(await invoke(other, 'open_project', { path: first })).toEqual({
    kind: 'focused',
    window: 'main',
  });
  await expect(other.locator('.project-switch')).toContainText('Second project');
  await invoke(main, 'plugin:window|minimize', { label: 'main' });
  await expect.poll(() => invoke(main, 'plugin:window|is_minimized', { label: 'main' })).toBe(true);
  await launchAgain(['--project', 'First project']);
  await expect
    .poll(() => invoke(main, 'plugin:window|is_minimized', { label: 'main' }))
    .toBe(false);
  await expect.poll(() => invoke(main, 'plugin:window|is_focused', { label: 'main' })).toBe(true);
  expect((await labels()).length).toBe(2);
  await expect(main.getByLabel('Unsaved', { exact: true })).toBeVisible();
  await expect(main.getByTestId('code-editor')).toContainText('// unsaved native draft');
  await expect(terminal.locator('.xterm')).toHaveAttribute('data-session', 'preserved');
  await terminal.locator('.xterm-helper-textarea').focus();
  await main.keyboard.type('Write-Output STILL_CONNECTED');
  await main.keyboard.press('Enter');
  await expect
    .poll(async () => ((await terminal.textContent())?.match(/STILL_CONNECTED/g) ?? []).length)
    .toBeGreaterThanOrEqual(2);
  await launchAgain([]);
  await expect.poll(() => invoke(main, 'plugin:window|is_focused', { label: 'main' })).toBe(true);
  expect((await labels()).length).toBe(2);

  const results = await Promise.all(
    Array.from({ length: 4 }, () => invoke(main, 'open_project_window', { path: third }))
  );
  expect(new Set(results.map(result => result.label)).size).toBe(1);
  expect(results.filter(result => !result.reused)).toHaveLength(1);
  const extra = await findWindow(results[0].label);
  await expect(extra.locator('.project-switch')).toContainText('Third project');
  expect((await labels()).length).toBe(3);
  await invoke(extra, 'plugin:window|destroy', { label: results[0].label }).catch(() => {});
  await expect.poll(labels).not.toContain(results[0].label);
  await launchAgain(['Third project']);
  await expect.poll(async () => (await labels()).length).toBe(3);
  const newLabels = await labels();
  expect(newLabels).not.toContain(results[0].label);
  await main.screenshot({ path: join(directory, 'retained-workspace.png') });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    `Native project windows passed: aliases, concurrent opens, second process, focus/unminimize, edits, live PTY, close/reopen. Evidence: ${directory}`
  );
} finally {
  if (browser) {
    for (const page of pages()) {
      const label = await page
        .evaluate(() => window.__TAURI_INTERNALS__?.metadata.currentWindow.label)
        .catch(() => null);
      if (label) await invoke(page, 'plugin:window|destroy', { label }).catch(() => {});
    }
    await browser.close().catch(() => {});
  }
  for (let attempt = 0; app.exitCode === null && attempt < 30; attempt++) await delay(100);
  if (app.exitCode === null) app.kill();
}
