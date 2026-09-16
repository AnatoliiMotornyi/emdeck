import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/desktop';

const emit = async (page: Page, text: string) => {
  await page.evaluate(text => {
    const state = window as unknown as {
      __emdeckEmitTerminal: (id: string, event: unknown) => void;
    };
    state.__emdeckEmitTerminal('pty-0', {
      type: 'data',
      data: Array.from(new TextEncoder().encode(text)),
    });
  }, text);
};

test('agent titles update headers, cards and workspace lists without restarting sessions', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code', exact: true }).click();
  const terminal = page.locator('.terminal-pane').first();
  await expect(terminal).toHaveAccessibleName('Claude terminal');
  await terminal
    .locator('.xterm')
    .evaluate(element => element.setAttribute('data-retained', 'true'));
  // OSC titles can be split across PTY reads, and can end with BEL or ST.
  await emit(page, '\x1b]2;Fix login');
  await emit(page, ' flow\x07');
  await expect(terminal).toHaveAccessibleName('Fix login flow terminal');
  await expect(terminal.locator('.pane-title')).toHaveText('Fix login flow');
  await expect(page.getByRole('article', { name: 'Fix login flow agent' })).toBeVisible();
  await page.getByLabel('Find agents').fill('login');
  await expect(page.getByRole('article', { name: 'Fix login flow agent' })).toBeVisible();
  await page.getByLabel('Find agents').clear();
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await expect(page.locator('.session-tabs')).toContainText('Fix login flow');
  await page.getByLabel('Find terminal sessions').fill('login');
  await expect(page.locator('.rail-sessions')).toContainText('Fix login flow');
  await page.getByLabel('Find terminal sessions').clear();
  await emit(page, '\x1b]0;Write regression tests\x1b\\');
  await expect(page.locator('.session-tabs')).toContainText('Write regression tests');
  await emit(page, '\x1b]1;Icon-only title\x07');
  await expect(terminal).toHaveAccessibleName('Write regression tests terminal');
  await page.getByLabel('Terminal view').selectOption('panes');
  await page
    .getByRole('article', { name: 'Write regression tests agent' })
    .getByTitle('Rename Write regression tests', { exact: true })
    .click();
  await page.getByLabel('Session name').fill('Pinned task');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await emit(page, '\x1b]2;Agent changed its title\x07');
  await expect(terminal).toHaveAccessibleName('Pinned task terminal');
  await page
    .getByRole('article', { name: 'Pinned task agent' })
    .getByTitle('Rename Pinned task', { exact: true })
    .click();
  await page.getByLabel('Session name').clear();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(terminal).toHaveAccessibleName('Agent changed its title terminal');
  await emit(page, '\x1b]2;\x07');
  await expect(terminal).toHaveAccessibleName('Claude terminal');
  await expect(terminal.locator('.xterm')).toHaveAttribute('data-retained', 'true');
  const calls = await page.evaluate(
    () => (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls
  );
  expect(calls.filter(call => call.command === 'terminal_spawn')).toHaveLength(1);
  expect(calls.filter(call => call.command === 'terminal_close')).toHaveLength(0);
});

test('each terminal can be named from its own header and from its session tab', async ({
  page,
}) => {
  const launch = async (name: string, detail: string) => {
    await page.getByRole('button', { name: 'New terminal', exact: true }).click();
    await page.getByRole('button', { name: `${name} ${detail}`, exact: true }).click();
    await expect(page.getByRole('region', { name: `${name} terminal` })).toBeVisible();
  };
  await launch('Claude', 'Claude Code');
  await launch('Codex', 'OpenAI coding agent');

  // Bind to the pane itself: its accessible name is what the rename changes.
  const claude = page.locator('.terminal-pane').first();
  await expect(claude).toHaveAccessibleName('Claude terminal');
  await claude.getByRole('button', { name: 'Rename Claude terminal', exact: true }).click();
  await page.getByLabel('Session name').fill('Billing bug');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(claude).toHaveAccessibleName('Billing bug terminal');
  await expect(
    page.getByRole('region', { name: 'Codex terminal' }),
    'naming one terminal leaves the others alone'
  ).toBeVisible();

  await page.getByLabel('Terminal view').selectOption('workspaces');
  const tabs = page.getByRole('toolbar', { name: 'Session tabs' });
  await expect(tabs).toContainText('Billing bug');
  await tabs.getByRole('button', { name: 'Codex', exact: true }).dblclick();
  await page.getByLabel('Session name').fill('Release notes');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(tabs).toContainText('Release notes');

  const calls = await page.evaluate(
    () => (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls
  );
  expect(
    calls.filter(call => call.command === 'terminal_close'),
    'renaming never restarts or closes a session'
  ).toHaveLength(0);
});

test('long terminal titles stay readable without hiding pane controls and clear on restart', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Terminal Your default shell', exact: true }).click();
  const terminal = page.locator('.terminal-pane').first();
  await expect(terminal).toBeVisible();
  await page.setViewportSize({ width: 800, height: 600 });
  const title = 'Task '.repeat(70);
  await emit(page, `\x1b]2;${title}\x07`);
  await expect(terminal.locator('.pane-title')).toHaveText(title.slice(0, 200).trim());
  await expect(terminal.getByTitle('Maximize pane', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(terminal.locator('.pane-header button').last()).toBeInViewport({ ratio: 1 });
  await page.evaluate(() =>
    (
      window as unknown as { __emdeckEmitTerminal: (id: string, event: unknown) => void }
    ).__emdeckEmitTerminal('pty-0', { type: 'exit', code: 0 })
  );
  await terminal.getByTitle('Restart terminal', { exact: true }).click();
  await expect(terminal).toHaveAccessibleName('Terminal terminal');
});
