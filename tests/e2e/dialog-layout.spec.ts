import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/desktop';
import { openResolver, prepareConflicts } from './fixtures/conflicts';

const expectNoSidewaysScroll = async (dialog: Locator) => {
  await expect
    .poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
  await expect.poll(() => dialog.evaluate(element => element.scrollLeft)).toBe(0);
};

const closeLongTerminal = async (page: Page) => {
  const title = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Terminal Your default shell', exact: true }).click();
  const terminal = page.locator('.terminal-pane').first();
  await expect(terminal.locator('.xterm-screen')).toBeVisible();
  await expect(terminal.locator('.pane-state.running')).toBeVisible();
  await page.evaluate(title => {
    (
      window as unknown as { __emdeckEmitTerminal: (id: string, event: unknown) => void }
    ).__emdeckEmitTerminal('pty-0', {
      type: 'data',
      data: Array.from(new TextEncoder().encode(`\x1b]2;${title}\x07`)),
    });
  }, title);
  await expect(terminal.locator('.pane-title')).toHaveText(title);
  await terminal.locator('.pane-header button').last().click();
  return page.getByRole('dialog', { name: `Close ${title}?`, exact: true });
};

for (const theme of ['dark', 'light', 'graphite']) {
  test(`long modal titles wrap without hiding text or the close button in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const dialog = await closeLongTerminal(page);
    await expect(dialog).toBeVisible();
    await expectNoSidewaysScroll(dialog);
    await expect(dialog.getByRole('heading')).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await page.setViewportSize({ width: 360, height: 320 });
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expectNoSidewaysScroll(dialog);
    await page.screenshot({ path: testInfo.outputPath(`close-terminal-${theme}.png`) });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.terminal-pane')).toHaveCount(1);
  });
}

test('settings and connection forms fit narrow windows and can scroll to both ends', async ({
  page,
}, testInfo) => {
  await page.getByTitle('Settings', { exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Make room for your workflow', exact: true });
  await page.setViewportSize({ width: 360, height: 300 });
  await expect(settings).toBeInViewport({ ratio: 1 });
  await expectNoSidewaysScroll(settings);
  await settings.getByRole('button', { name: 'Done', exact: true }).scrollIntoViewIfNeeded();
  await expect(settings.getByRole('button', { name: 'Done', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await settings.evaluate(element => {
    element.scrollTop = 0;
  });
  await expect(settings.getByRole('heading', { level: 2 })).toBeInViewport({ ratio: 1 });
  await expectNoSidewaysScroll(settings);
  await page.screenshot({ path: testInfo.outputPath('settings-narrow.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 900, height: 640 });
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByRole('button', { name: 'Remote connections', exact: true }).click();
  const connections = page.getByRole('dialog', { name: 'Remote connections', exact: true });
  await connections.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 300 });
  await expect(connections).toBeInViewport({ ratio: 1 });
  await expectNoSidewaysScroll(connections);
  await connections
    .getByRole('button', { name: 'Save connection', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    connections.getByRole('button', { name: 'Save connection', exact: true })
  ).toBeInViewport({ ratio: 1 });
  await connections.evaluate(element => {
    element.scrollTop = 0;
  });
  await expect(connections.getByRole('heading')).toBeInViewport({ ratio: 1 });
  await expectNoSidewaysScroll(connections);
  await page.screenshot({ path: testInfo.outputPath('connections-narrow.png') });
});

test('merge dialogs keep the header and footer reachable in short and narrow windows', async ({
  page,
}, testInfo) => {
  await prepareConflicts(page);
  const dialog = await openResolver(page);
  await page.setViewportSize({ width: 900, height: 300 });
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await expectNoSidewaysScroll(dialog);
  const footer = dialog.getByRole('button', { name: 'Close', exact: true });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 360, height: 300 });
  await dialog.evaluate(element => {
    element.scrollTop = 0;
  });
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await expectNoSidewaysScroll(dialog);
  await expect(dialog.getByRole('heading', { level: 2 })).toBeInViewport({ ratio: 1 });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('merge-dialog-narrow.png') });
  await footer.click();
  await expect(dialog).toHaveCount(0);
});
