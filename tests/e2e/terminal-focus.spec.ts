import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';

const launch = async (page: Page, name: string, detail: string) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: `${name} ${detail}`, exact: true }).click();
  await expect(page.getByRole('region', { name: `${name} terminal` })).toBeVisible();
};
const focusTerminal = (page: Page, name: string) =>
  page
    .getByRole('region', { name: `${name} terminal` })
    .locator('.xterm-helper-textarea')
    .focus();

test.beforeEach(async ({ page }) => {
  await launch(page, 'Claude', 'Claude Code');
  await launch(page, 'Codex', 'OpenAI coding agent');
  await page.getByLabel('Terminal view').selectOption('workspaces');
});

test('the focused terminal is marked in the session tabs without hiding the others', async ({
  page,
}) => {
  const tabs = page.getByRole('toolbar', { name: 'Session tabs' });
  await tabs.getByRole('button', { name: 'Split view', exact: true }).click();
  const claude = tabs.getByRole('button', { name: 'Claude', exact: true });
  const codex = tabs.getByRole('button', { name: 'Codex', exact: true });

  await focusTerminal(page, 'Claude');
  await expect(claude).toHaveAttribute('aria-current', 'true');
  await expect(codex).toHaveAttribute('aria-current', 'false');
  await expect(claude, 'focus must not maximize the pane').toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.getByRole('region', { name: 'Codex terminal' }),
    'split view keeps every terminal on screen'
  ).toBeVisible();

  await focusTerminal(page, 'Codex');
  await expect(codex).toHaveAttribute('aria-current', 'true');
  await expect(claude).toHaveAttribute('aria-current', 'false');
});

test('a maximized tab stays distinguishable from the focused one', async ({ page }) => {
  const tabs = page.getByRole('toolbar', { name: 'Session tabs' });
  const claude = tabs.getByRole('button', { name: 'Claude', exact: true });

  await claude.click();
  await expect(claude).toHaveAttribute('aria-pressed', 'true');
  await expect(claude).toHaveAttribute('aria-current', 'true');

  await tabs.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(claude, 'leaving solo view keeps the terminal focused').toHaveAttribute(
    'aria-current',
    'true'
  );
  await expect(claude).toHaveAttribute('aria-pressed', 'false');
});

test('the Spaces rail collapses to a strip, widens the terminals and is remembered', async ({
  page,
}) => {
  const rail = page.getByRole('complementary', { name: 'Terminal workspaces' });
  const canvas = page.locator('.terminal-canvas');
  await expect(rail.getByText('SPACES')).toBeVisible();
  const wideRail = (await rail.boundingBox())!.width;
  const narrowCanvas = (await canvas.boundingBox())!.width;

  await rail.getByLabel('Collapse spaces').click();

  await expect(rail.getByLabel('Expand spaces')).toBeVisible();
  await expect(rail.getByText('SPACES'), 'the labels do not survive a 42px column').toHaveCount(0);
  const narrowRail = (await rail.boundingBox())!.width;
  expect(narrowRail).toBeLessThan(wideRail / 2);
  expect(
    (await canvas.boundingBox())!.width - narrowCanvas,
    'the terminals take the width the rail gave up'
  ).toBeGreaterThan(wideRail - narrowRail - 1);
  await expect(
    rail.getByRole('button', { name: /All sessions/ }),
    'switching spaces stays reachable while collapsed'
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Expand spaces')).toBeVisible();
  await page.getByLabel('Expand spaces').click();
  await expect(rail.getByText('SPACES')).toBeVisible();
});
