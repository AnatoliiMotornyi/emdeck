import { expect, test } from './fixtures/desktop';

test('pointer focus loss inside the menu does not cancel terminal creation', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'New terminal', exact: true });
  await trigger.click();
  const menu = page.getByRole('region', { name: 'New terminal options' });
  const option = menu.getByRole('button', { name: 'Terminal Your default shell', exact: true });
  // Reproduce WebKit's pointer-down blur with no replacement focus target in
  // Chromium too, so the normal suite guards the event-order regression.
  await option.evaluate(button => {
    button.addEventListener('mousedown', event => {
      event.preventDefault();
      (document.activeElement as HTMLElement).blur();
    });
  });
  await option.click();
  await expect(page.getByRole('region', { name: 'Terminal terminal', exact: true })).toBeVisible();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await menu.getByRole('button', { name: 'Custom command…', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
});

test('New terminal opens below the toolbar when terminals fill the workspace', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 640 });
  const trigger = page.getByRole('button', { name: 'New terminal', exact: true });
  await trigger.click();
  await page.getByRole('button', { name: 'Codex OpenAI coding agent', exact: true }).click();
  const terminal = page.getByRole('region', { name: 'Codex terminal' }).locator('.xterm');
  await terminal.evaluate(element => element.setAttribute('data-session-marker', 'retained'));
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await trigger.click();
  const menu = page.locator('.agent-popover');
  await expect(menu).toBeInViewport({ ratio: 1 });
  expect((await menu.boundingBox())!.y).toBeGreaterThanOrEqual(
    (await trigger.boundingBox())!.y + (await trigger.boundingBox())!.height
  );
  for (const name of [
    'Terminal Your default shell',
    'Codex OpenAI coding agent',
    'Claude Claude Code',
  ])
    await expect(menu.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('terminal-menu-below.png') });
  await menu.getByRole('button', { name: 'Claude Claude Code', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Claude terminal' })).toBeVisible();
  await expect(terminal).toHaveAttribute('data-session-marker', 'retained');
});

test('New terminal opens above a low toolbar and Escape returns focus to the trigger', async ({
  page,
}) => {
  const divider = page.getByRole('separator', { name: 'Resize terminal panel', exact: true });
  await divider.focus();
  await page.keyboard.press('Home');
  const trigger = page.getByRole('button', { name: 'New terminal', exact: true });
  await trigger.click();
  const menu = page.locator('.agent-popover');
  await expect(menu).toBeInViewport({ ratio: 1 });
  const bounds = (await menu.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual((await trigger.boundingBox())!.y);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.getByTitle('Source control', { exact: true }).click();
  await expect(menu).toHaveCount(0);
});

test('a short terminal menu scrolls every option into view and follows window resizing', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await page.getByTitle('Expand terminals', { exact: true }).click();
  const trigger = page.getByRole('button', { name: 'New terminal', exact: true });
  await trigger.click();
  const menu = page.locator('.agent-popover');
  await expect(menu).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 550, height: 300 });
  await expect(menu).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => menu.evaluate(element => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await page.keyboard.press('End');
  const custom = menu.getByRole('button', { name: 'Custom command…', exact: true });
  await expect(custom).toBeFocused();
  await expect(custom).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('terminal-menu-scroll.png') });
  await page.keyboard.press('Home');
  await expect(
    menu.getByRole('button', { name: 'Terminal Your default shell', exact: true })
  ).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 900, height: 640 });
  await expect(menu).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => menu.evaluate(element => element.scrollHeight > element.clientHeight))
    .toBe(false);
  await custom.click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'New terminal', exact: true })).toBeVisible();
});
