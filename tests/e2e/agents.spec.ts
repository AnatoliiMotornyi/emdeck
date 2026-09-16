import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TerminalEvent } from '../../src/shared/contracts/workspace';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as Record<string, unknown>;
    const calls: { command: string; args: Record<string, unknown> }[] = [];
    const channels = new Map<string, { onmessage: (event: unknown) => void }>();
    let serial = 0;
    state.isTauri = true;
    state.__calls = calls;
    state.__emit = (id: string, event: unknown) => channels.get(id)!.onmessage(event);
    state.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    state.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => ++serial,
      unregisterCallback: () => {},
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        calls.push({ command, args });
        switch (command) {
          case 'startup_project':
            return '/projects/agents';
          case 'open_project':
            return { kind: 'opened', project: { root: args.path, name: 'agents' } };
          case 'read_directory':
            return [];
          case 'read_file':
            throw 'No package.json';
          case 'git_snapshot':
            return {
              available: true,
              branch: 'main',
              localBranches: ['main'],
              remoteBranches: [],
              changes: [],
              commits: [],
            };
          case 'terminal_spawn': {
            const id = `pty-${channels.size}`;
            channels.set(id, args.onEvent as { onmessage: (event: unknown) => void });
            return id;
          }
          case 'codex_account_usage':
            if (state.__quotaError) throw 'CLI unavailable. Try again.';
            return {
              source: 'Codex CLI account',
              updatedAt: Date.now() / 1000,
              limits: [
                { label: 'Codex · 5h', usedPercent: 25, resetsAt: Date.now() / 1000 + 3600 },
                { label: 'Codex · 7d', usedPercent: 0, resetsAt: null },
                { label: 'Expired window', usedPercent: 80, resetsAt: 1 },
              ],
            };
          case 'plugin:event|listen':
            return args.handler;
          default:
            return null;
        }
      },
    };
  });
  await page.goto('/');
  await expect(page.locator('.project-switch')).toContainText('agents');
});
async function launch(page: Page, name: string) {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page
    .locator('.agent-option')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(page.getByRole('region', { name: `${name} terminal`, exact: true })).toBeVisible();
}
async function emit(page: Page, id: string, event: TerminalEvent) {
  await page.evaluate(
    ({ id, event }) =>
      (window as unknown as { __emit: (id: string, event: TerminalEvent) => void }).__emit(
        id,
        event
      ),
    { id, event }
  );
}
async function countCalls(page: Page, command: string) {
  return page.evaluate(
    command =>
      (window as unknown as { __calls: { command: string }[] }).__calls.filter(
        c => c.command === command
      ).length,
    command
  );
}

test('streaming panes follow output through resizing and preserve manual scrollback', async ({
  page,
}) => {
  const panes = page.locator('.terminal-pane');
  const output = async (index: number, start: number, end: number) => {
    const text = Array.from({ length: end - start }, (_, row) => `ROW ${start + row}\r\n`).join('');
    await emit(page, `pty-${index}`, { type: 'data', data: [...new TextEncoder().encode(text)] });
  };
  for (let index = 0; index < 6; index++) {
    await page.getByRole('button', { name: 'New terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Terminal Your default shell', exact: true }).click();
    await expect(panes).toHaveCount(index + 1);
    await output(index, 0, 200);
    await expect(panes.nth(index).locator('.xterm-rows')).toContainText('ROW 199');
  }
  await page.getByTitle('Expand terminals', { exact: true }).click();
  for (const [iteration, layout] of ['Stacked', 'Grid', 'Side by side', 'Grid'].entries()) {
    await page.getByTitle(layout, { exact: true }).click();
    // Let layout, FitAddon and the resulting scroll events settle before new output.
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    for (let index = 0; index < 6; index++) {
      const start = 200 + iteration * 20;
      await output(index, start, start + 20);
      await expect(panes.nth(index).locator('.xterm-rows')).toContainText(`ROW ${start + 19}`);
    }
  }
  const first = panes.first();
  const viewport = first.locator('.xterm-viewport');
  const inHistory = () =>
    viewport.evaluate(el => el.scrollTop + el.clientHeight < el.scrollHeight - 30);
  await first.locator('.xterm-screen').hover();
  await page.mouse.wheel(0, -100000);
  await expect.poll(inHistory).toBe(true);
  await page.getByTitle('Stacked', { exact: true }).click();
  await page.getByTitle('Grid', { exact: true }).click();
  await output(0, 280, 300);
  await expect.poll(inHistory).toBe(true);
  await expect(first.locator('.xterm-rows')).not.toContainText('ROW 299');
  await first.locator('.xterm-screen').hover();
  await page.mouse.wheel(0, 100000);
  await expect.poll(inHistory).toBe(false);
  await output(0, 300, 320);
  await expect(first.locator('.xterm-rows')).toContainText('ROW 319');
  expect(await countCalls(page, 'terminal_spawn')).toBe(6);
  expect(await countCalls(page, 'terminal_close')).toBe(0);
});
const usage = {
  source: 'Claude status line',
  updatedAt: 1700000000,
  model: 'Opus 4.6',
  sessionId: 'fixture',
  inputTokens: 12000,
  outputTokens: 600,
  contextSize: 200000,
  contextPercent: 6,
  costUsd: 0,
  limits: [{ label: '5-hour', usedPercent: 12, resetsAt: 9999999999 }],
};

test('live usage, approval focus and rename preserve both terminal sessions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await launch(page, 'Claude');
  await launch(page, 'Codex');
  const claude = page.getByRole('article', { name: 'Claude agent', exact: true });
  await emit(page, 'pty-0', { type: 'usage', usage });
  await expect(claude).toContainText('12K / 600');
  await expect(claude).toContainText('$0.000');
  await expect(claude).toContainText('88% left');
  const terminal = page
    .getByRole('region', { name: 'Claude terminal', exact: true })
    .locator('.xterm');
  await terminal.evaluate(el => el.setAttribute('data-preserved', 'yes'));
  const prompt =
    '\x1b[2J\x1b[H\x1b[999;1HWould you like to run the following command?\r\n❯ 1. Yes\r\n  2. No';
  await emit(page, 'pty-1', { type: 'data', data: Array.from(new TextEncoder().encode(prompt)) });
  await expect(page.getByRole('article', { name: 'Codex agent', exact: true })).toContainText(
    'Needs attention'
  );
  await page.getByTitle('Focus only Codex', { exact: true }).click();
  await expect(terminal).toBeHidden();
  await page.getByTitle('Focus Claude', { exact: true }).click();
  await expect(terminal).toBeVisible();
  await page.getByTitle('Rename Claude', { exact: true }).click();
  await page.getByLabel('Session name').fill('UI builder');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByTitle('Hide agent overview').click();
  await page.getByTitle('Toggle agent overview').click();
  await expect(
    page.getByRole('region', { name: 'UI builder terminal' }).locator('.xterm')
  ).toHaveAttribute('data-preserved', 'yes');
  expect(await countCalls(page, 'terminal_spawn')).toBe(2);
  expect(await countCalls(page, 'terminal_close')).toBe(0);
  expect(await countCalls(page, 'codex_account_usage')).toBe(0);
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await page.screenshot({ path: 'test-results/agents-live-dark.png' });
  expect(errors).toEqual([]);
});

test('customization persists; filtering and hiding details leave sessions alive', async ({
  page,
}) => {
  await launch(page, 'Claude');
  await launch(page, 'Terminal');
  await emit(page, 'pty-0', { type: 'usage', usage });
  await page.getByTitle('Customize agent overview').click();
  await page.getByLabel('Estimated session cost', { exact: true }).uncheck();
  await page.getByLabel('Include shell terminals', { exact: true }).uncheck();
  await page.getByLabel('Compact cards', { exact: true }).check();
  await page.getByLabel('Claude usage integration', { exact: true }).uncheck();
  await page.getByTitle('Move Model up', { exact: true }).click();
  await page.getByTitle('Customize agent overview').click();
  await expect(page.getByRole('article', { name: 'Terminal agent', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Terminal terminal' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Claude agent' })).not.toContainText(
    'Est. session cost'
  );
  await page.getByLabel('Find agents').fill('no match');
  await expect(page.getByText('No sessions match these filters.')).toBeVisible();
  await page.getByLabel('Find agents').clear();
  expect(await countCalls(page, 'terminal_close')).toBe(0);
  await page.reload();
  await page.getByTitle('Customize agent overview').click();
  await expect(page.getByLabel('Estimated session cost', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Compact cards', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Claude usage integration', { exact: true })).not.toBeChecked();
  await page.getByTitle('Customize agent overview').click();
  await launch(page, 'Claude');
  const enhanced = await page.evaluate(
    () =>
      (
        window as unknown as { __calls: { command: string; args: { enhancedUsage: boolean } }[] }
      ).__calls.find(c => c.command === 'terminal_spawn')!.args.enhancedUsage
  );
  expect(enhanced).toBe(false);
});

test('account refresh is explicit, supports zero and stale windows, and recovers from errors', async ({
  page,
}) => {
  await launch(page, 'Codex');
  const account = page.getByRole('region', { name: 'Codex account usage' });
  expect(await countCalls(page, 'codex_account_usage')).toBe(0);
  await page.getByTitle('Refresh Codex account usage').click();
  await expect(account).toContainText('75% left');
  await expect(account).toContainText('100% left');
  await expect(account).toContainText('Refresh needed');
  await expect(account).toContainText('Reset time not reported');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__quotaError = true;
  });
  await page.getByTitle('Refresh Codex account usage').click();
  await expect(account.getByRole('alert')).toContainText('CLI unavailable');
  await expect(account).toContainText('previous reading');
  await expect(account).toContainText('75% left');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__quotaError = false;
  });
  await page.getByTitle('Refresh Codex account usage').click();
  await expect(account.getByRole('alert')).toHaveCount(0);
});

test('restarting through the terminal header clears old usage and respawns only that session', async ({
  page,
}) => {
  await launch(page, 'Claude');
  await launch(page, 'Codex');
  await emit(page, 'pty-0', { type: 'usage', usage });
  await emit(page, 'pty-0', { type: 'exit', code: 0 });
  const card = page.getByRole('article', { name: 'Claude agent' });
  await expect(card).toContainText('Exited');
  await page
    .getByRole('region', { name: 'Claude terminal' })
    .getByTitle('Restart terminal')
    .click();
  await expect(card).not.toContainText('Opus 4.6');
  await expect(card).toContainText('Waiting for Claude usage');
  expect(await countCalls(page, 'terminal_spawn')).toBe(3);
  expect(await countCalls(page, 'terminal_close')).toBe(0);
});

test('optional quota polling pauses when the overview or terminal panel is hidden', async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();
  await launch(page, 'Codex');
  await page.getByTitle('Customize agent overview').click();
  await page.getByLabel('Codex quota refresh', { exact: true }).selectOption('60');
  await expect.poll(() => countCalls(page, 'codex_account_usage')).toBe(1);
  await page.getByTitle('Hide agent overview').click();
  await page.clock.fastForward(61000);
  expect(await countCalls(page, 'codex_account_usage')).toBe(1);
  await page.getByTitle('Toggle agent overview').click();
  await expect.poll(() => countCalls(page, 'codex_account_usage')).toBe(2);
  await page.getByTitle('Hide terminals (sessions keep running)').click();
  await page.clock.fastForward(61000);
  expect(await countCalls(page, 'codex_account_usage')).toBe(2);
  await page.getByTitle('Toggle terminal panel', { exact: true }).click();
  await expect.poll(() => countCalls(page, 'codex_account_usage')).toBe(3);
  await page.clock.fastForward(61000);
  await expect.poll(() => countCalls(page, 'codex_account_usage')).toBe(4);
  expect(await countCalls(page, 'terminal_spawn')).toBe(1);
});
