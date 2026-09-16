import { test, expect } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { TerminalEvent } from '../../src/shared/contracts/workspace';

const calls = async (page: Page, name: string) =>
  page.evaluate(
    name =>
      (
        window as unknown as { __emdeckCalls: { command: string; args: Record<string, unknown> }[] }
      ).__emdeckCalls
        .filter(c => c.command === name)
        .map(c => c.args),
    name
  );
const emit = async (page: Page, id: string, event: TerminalEvent) =>
  page.evaluate(
    ({ id, event }) =>
      (
        window as unknown as { __emdeckEmitTerminal: (id: string, event: TerminalEvent) => void }
      ).__emdeckEmitTerminal(id, event),
    { id, event }
  );
const openManager = async (page: Page) => {
  await page.getByTitle('Remote connections', { exact: true }).click();
  return page.getByRole('dialog', { name: 'Remote connections' });
};
const saveSsh = async (page: Page, mode = 'cmux', name = 'Build box') => {
  const dialog = await openManager(page);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await dialog.getByLabel('Connection name').fill(name);
  await dialog.getByLabel('Connection type').selectOption(mode);
  await dialog.getByLabel('SSH host').fill('dev@buildbox');
  if (mode !== 'shell') await dialog.getByLabel('Existing session').fill('agents');
  await dialog.getByRole('button', { name: 'Save connection' }).click();
  return dialog;
};
const launchLocal = async (page: Page) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code' }).click();
  await expect(page.getByRole('region', { name: 'Claude terminal' })).toBeVisible();
};

test('optional workspace view preserves terminals, editor state and attention navigation', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  const editor = page.getByTestId('code-editor').locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('// retained edit');
  await launchLocal(page);
  await emit(page, 'pty-0', {
    type: 'data',
    data: [
      ...new TextEncoder().encode('Would you like to run this command?\r\n1. Yes\r\n2. No\r\n'),
    ],
  });
  await page.locator('.xterm').evaluate(el => el.setAttribute('data-continuity', 'original'));
  await page.getByLabel('Terminal view').selectOption('workspaces');
  const rail = page.getByRole('complementary', { name: 'Terminal workspaces' });
  await expect(rail).toBeVisible();
  await expect(rail.getByTitle('Focus Claude', { exact: true })).toContainText('Needs approval');
  await rail.getByRole('button', { name: 'Needs attention', exact: true }).click();
  await rail.getByTitle('Focus Claude', { exact: true }).click();
  await expect(page.locator('.xterm[data-continuity="original"]')).toBeVisible();
  await page
    .getByRole('toolbar', { name: 'Session tabs' })
    .getByRole('button', { name: 'Split view' })
    .click();
  await page.getByTitle('Show agent overview', { exact: true }).click();
  await expect(page.getByLabel('Terminal view')).toHaveValue('panes');
  await expect(page.getByTitle('Toggle agent overview')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toContainText('retained edit');
  expect(await calls(page, 'terminal_spawn')).toHaveLength(1);
  expect(await calls(page, 'terminal_close')).toHaveLength(0);
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await page.screenshot({ path: 'test-results/terminal-workspaces-dark.png' });
  await page.reload();
  await expect(page.getByLabel('Terminal view')).toHaveValue('workspaces');
  expect(await calls(page, 'terminal_spawn')).toHaveLength(0);
});

test('saved connections remain disconnected on startup and validate before saving', async ({
  page,
}) => {
  const dialog = await openManager(page);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await dialog.getByLabel('Connection name').fill('Build box');
  await dialog.getByLabel('SSH host').fill('-oProxyCommand=bad');
  await dialog.getByRole('button', { name: 'Save connection' }).click();
  await expect(dialog.getByRole('alert')).toContainText('SSH host');
  expect(await calls(page, 'terminal_connect_remote')).toHaveLength(0);
  await dialog.getByLabel('SSH host').fill('dev@buildbox');
  await dialog.getByRole('button', { name: 'Save connection' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  expect(await calls(page, 'terminal_connect_remote')).toHaveLength(0);
  const restored = await openManager(page);
  await expect(restored).toContainText('dev@buildbox');
  await restored.getByTitle('Edit Build box').click();
  await expect(restored.getByLabel('SSH host')).toHaveValue('dev@buildbox');
  await restored.getByRole('button', { name: 'Cancel' }).click();
  await restored.getByTitle('Remove Build box').click();
  await expect(restored).not.toContainText('dev@buildbox');
});

test('cmux attaches once, receives output and input, reconnects and disconnects without closing local agents', async ({
  page,
}) => {
  await launchLocal(page);
  const dialog = await saveSsh(page);
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
  const remote = page.getByRole('region', { name: 'Build box terminal' });
  await expect(remote).toBeVisible();
  expect((await calls(page, 'terminal_connect_remote'))[0]).toMatchObject({
    root: '/projects/first',
    target: { backend: 'cmux', host: 'dev@buildbox', session: 'agents', binary: 'cmux' },
  });
  await emit(page, 'pty-1', {
    type: 'data',
    data: [...new TextEncoder().encode('REMOTE CLAUDE AND CODEX\r\n')],
  });
  await expect(remote).toContainText('REMOTE CLAUDE AND CODEX');
  await remote.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('status');
  expect((await calls(page, 'terminal_write')).some(args => args.id === 'pty-1')).toBe(true);
  await page.getByLabel('Terminal view').selectOption('workspaces');
  const again = await openManager(page);
  await again.getByRole('button', { name: 'Show terminal' }).click();
  expect(await calls(page, 'terminal_connect_remote')).toHaveLength(1);
  expect(await calls(page, 'codex_account_usage')).toHaveLength(0);
  await emit(page, 'pty-1', { type: 'exit', code: 255 });
  await expect(remote).toContainText('Disconnected');
  await remote.getByTitle('Reconnect remote session').click();
  await expect.poll(async () => (await calls(page, 'terminal_connect_remote')).length).toBe(2);
  await remote.getByTitle('Disconnect Build box', { exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Disconnect Build box?' });
  await expect(confirm).toContainText('keeps running');
  await confirm.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(remote).toHaveCount(0);
  expect(await calls(page, 'terminal_spawn')).toHaveLength(1);
  expect((await calls(page, 'terminal_close')).some(args => args.id === 'pty-0')).toBe(false);
  await expect(page.getByRole('region', { name: 'Claude terminal' })).toBeVisible();
});

test('launching a local agent from a remote space reveals it without disconnecting the remote', async ({
  page,
}) => {
  const dialog = await saveSsh(page);
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByLabel('Terminal view').selectOption('workspaces');
  const remote = page.getByRole('region', { name: 'Build box terminal' });
  await expect(remote).toBeVisible();
  await launchLocal(page);
  await expect(remote).toBeHidden();
  await page
    .getByRole('complementary', { name: 'Terminal workspaces' })
    .getByRole('button', { name: /All sessions/ })
    .click();
  await expect(remote).toBeVisible();
  await expect(page.getByRole('region', { name: 'Claude terminal' })).toBeVisible();
  expect(await calls(page, 'terminal_connect_remote')).toHaveLength(1);
  expect(await calls(page, 'terminal_spawn')).toHaveLength(1);
  expect(await calls(page, 'terminal_close')).toHaveLength(0);
});

test('tmux and custom SSH targets retain their distinct settings and failures remain retryable', async ({
  page,
}) => {
  let dialog = await saveSsh(page, 'tmux', 'Tmux box');
  await dialog.getByTitle('Edit Tmux box').click();
  await dialog.getByLabel('Port', { exact: true }).fill('2222');
  await dialog.getByLabel('Remote binary').fill('/usr/bin/tmux');
  await dialog.getByRole('button', { name: 'Save connection' }).click();
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckRemoteError = 'SSH executable missing';
  });
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
  const remote = page.getByRole('region', { name: 'Tmux box terminal' });
  await expect(remote).toContainText('SSH executable missing');
  expect((await calls(page, 'terminal_connect_remote'))[0]).toMatchObject({
    target: { backend: 'tmux', binary: '/usr/bin/tmux', port: 2222 },
  });
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckRemoteError = null;
  });
  await remote.getByTitle('Reconnect remote session').click();
  await expect(remote).toContainText('SSH client running');
  dialog = await saveSsh(page, 'shell', 'Custom box');
  await dialog.getByTitle('Edit Custom box').click();
  await dialog.getByLabel('Remote command (optional)').fill('cd /workspace && codex resume');
  await dialog.getByRole('button', { name: 'Save connection' }).click();
  await dialog
    .locator('.connection-row')
    .filter({ hasText: 'Custom box' })
    .getByRole('button', { name: 'Connect', exact: true })
    .click();
  expect((await calls(page, 'terminal_connect_remote')).at(-1)).toMatchObject({
    target: { backend: 'shell', command: 'cd /workspace && codex resume', binary: '', session: '' },
  });
});

test('Claude Remote Control uses the official browser and never launches a terminal', async ({
  page,
}) => {
  const dialog = await openManager(page);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await dialog.getByLabel('Connection name').fill('Claude on laptop');
  await dialog.getByLabel('Connection type').selectOption('claude');
  await expect(dialog).toContainText('/remote-control');
  await dialog.getByLabel('Session URL').fill('https://claude.ai.example/code/session_example');
  await dialog.getByRole('button', { name: 'Save connection' }).click();
  await expect(dialog.getByRole('alert')).toContainText('claude.ai/code');
  await dialog.getByLabel('Session URL').fill('https://claude.ai/code/session_example');
  await dialog.getByRole('button', { name: 'Save connection' }).click();
  expect(await calls(page, 'open_external_url')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Open in browser' }).click();
  expect(await calls(page, 'open_external_url')).toEqual([
    { url: 'https://claude.ai/code/session_example' },
  ]);
  expect(await calls(page, 'terminal_connect_remote')).toHaveLength(0);
  expect(await calls(page, 'terminal_spawn')).toHaveLength(0);
});
