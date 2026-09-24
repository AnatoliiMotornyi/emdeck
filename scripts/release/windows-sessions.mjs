// Real WebView2 + detached native server acceptance, isolated from user profiles.
import { spawn, execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { root } from './tools.mjs';

if (process.platform !== 'win32') throw new Error('Windows acceptance only.');
const executable = resolve(process.argv[2] ?? '');
const cli = resolve(process.argv[3] ?? '');
if (!executable.endsWith('emdeck-ide.exe') || !cli.endsWith('emdeck-session.exe'))
  throw new Error('Pass the IDE and standalone session executables.');
const directory = mkdtempSync(join(root, '.tmp/session-desktop-'));
const project = join(directory, 'project');
mkdirSync(project);
writeFileSync(join(project, 'README.md'), '# Isolated background session acceptance\n');
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
let app, browser, page;
const errors = [];
const launch = async () => {
  app = spawn(executable, [], { env, windowsHide: false, stdio: 'ignore' });
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      break;
    } catch {
      await delay(500);
    }
  }
  if (!browser) throw new Error('Could not connect to the native WebView.');
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
};
const close = async () => {
  await page
    .evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }))
    .catch(e => {
      if (!/closed|disconnected/i.test(e.message)) throw e;
    });
  for (let attempt = 0; app.exitCode === null && attempt < 60; attempt++) await delay(100);
  if (app.exitCode !== 0) throw new Error(`IDE did not close cleanly: ${app.exitCode}`);
  await browser.close().catch(() => {});
  browser = undefined;
};
const snapshot = () =>
  JSON.parse(execFileSync(cli, ['status'], { env, windowsHide: true, encoding: 'utf8' }));
try {
  await launch();
  await page.evaluate(
    root =>
      localStorage.setItem('relay:last-project', JSON.stringify({ root, name: 'Sessions test' })),
    project
  );
  await page.reload();
  await page.getByLabel('Terminal view').selectOption('server');
  await page.getByRole('button', { name: 'Connect local server', exact: true }).click();
  await expect(page.locator('.session-connection-state.connected')).toBeVisible();
  await page.getByText('New background terminal', { exact: true }).click();
  await page.getByLabel('Workspace name', { exact: true }).fill('Persistent fixture');
  await page.getByLabel('Folder on that machine', { exact: true }).fill(project);
  await page.getByLabel('Terminal name', { exact: true }).fill('Counter');
  await page
    .getByLabel('Agent command', { exact: true })
    .fill(
      "$i=0; while ($true) { Write-Output ('BACKGROUND-TICK-' + $i); $i++; Start-Sleep -Milliseconds 250 }"
    );
  await page.getByRole('button', { name: 'Start background terminal', exact: true }).click();
  let terminal = page.getByRole('region', { name: 'Counter persistent terminal' });
  await expect(terminal).toContainText('BACKGROUND-TICK-');
  const initial = snapshot();
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await page.screenshot({ path: join(directory, 'before-close.png') });
  await close();
  await delay(800);
  const detached = snapshot();
  // The detached server must not lock the IDE binary against update/rebuild.
  const sourceHandle = openSync(executable, 'r+');
  closeSync(sourceHandle);
  if (
    detached.serverId !== initial.serverId ||
    detached.panes[0].generation !== initial.panes[0].generation ||
    !detached.panes[0].running
  )
    throw new Error('Closing the IDE stopped or replaced the background process.');
  await launch();
  await expect(page.getByLabel('Terminal view')).toHaveValue('server');
  terminal = page.getByRole('region', { name: 'Counter persistent terminal' });
  // A killed/disconnected client lease can be explicitly taken over before its
  // short expiry; ownership must never be stolen silently from another window.
  await expect(terminal).toBeVisible();
  const takeover = terminal.getByRole('button', { name: 'Take control / retry' });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await takeover.isVisible()) {
      await takeover.click();
      break;
    }
    if ((await terminal.textContent()).includes('BACKGROUND-TICK-')) break;
    await delay(100);
  }
  await expect(terminal).toContainText('BACKGROUND-TICK-');
  await page.screenshot({ path: join(directory, 'reconnected.png') });
  await terminal.getByTitle('Detach view; keep process running').click();
  if (!snapshot().panes[0].running) throw new Error('Detaching stopped the process.');
  await page
    .getByRole('complementary', { name: 'Background machines and agents' })
    .getByRole('button', { name: /Counter/ })
    .click();
  await expect(terminal).toContainText('BACKGROUND-TICK-');
  await terminal.getByTitle('Stop process on its machine').click();
  await page.getByRole('button', { name: 'Stop process', exact: true }).click();
  await expect.poll(() => snapshot().panes[0].running).toBe(false);
  await close();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    `Native background sessions passed: close/relaunch, same server and process generation, replay, detach, explicit stop. Evidence: ${directory}`
  );
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app?.exitCode === null) app.kill();
  try {
    execFileSync(cli, ['stop'], { env, windowsHide: true, stdio: 'ignore' });
  } catch {
    /* Server may not have started. */
  }
}
