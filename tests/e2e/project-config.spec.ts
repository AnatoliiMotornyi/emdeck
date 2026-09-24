import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// "Citron" from the extended accent list, deliberately not the global default.
const projectAccent = '#e8dd7a';
const globalAccent = '#b8ee86';

const accent = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
// The global layer. A project edit must never appear here.
const globalLayer = (page: Page) =>
  page.evaluate(() => localStorage.getItem('relay:settings') ?? '');
// The browser preview's stand-in for .emdeck/settings.json.
const projectLayer = (page: Page) =>
  page.evaluate(() => localStorage.getItem('relay:demo-project-config') ?? '');

const openSettings = (page: Page) => page.getByTitle('Settings', { exact: true }).click();
const closeSettings = (page: Page) =>
  page.getByRole('button', { name: 'Done', exact: true }).click();
const accentPicker = (page: Page) => page.getByLabel('More accent colors');
const accentMarker = (page: Page) =>
  page
    .locator('.setting-row')
    .filter({ hasText: 'Accent color' })
    .getByRole('button', { name: /Reset to global/ });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('code-editor')).toBeVisible();
});

test('the settings panel opens in project scope while a project is open', async ({ page }) => {
  await openSettings(page);
  const scope = page.getByRole('group', { name: 'Settings scope' });
  await expect(scope.getByRole('button', { name: /This project/ })).toBeEnabled();
  await expect(scope.getByRole('button', { name: /This project/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(scope.getByRole('button', { name: /All projects/ })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await expect(accentMarker(page)).toHaveCount(0);
});

test('a project accent persists, marks its override and never reaches the global layer', async ({
  page,
}) => {
  await openSettings(page);
  await accentPicker(page).selectOption(projectAccent);
  await expect.poll(() => accent(page)).toBe(projectAccent);
  await closeSettings(page);
  await openSettings(page);
  await expect(accentPicker(page)).toHaveValue(projectAccent);
  await expect(accentMarker(page)).toBeVisible();
  // Prove the edit reached the project layer first, so the guard below cannot
  // pass merely because the accent was never applied anywhere at all.
  await expect.poll(() => projectLayer(page)).toContain(projectAccent);
  expect(
    await globalLayer(page),
    `A project-scoped accent leaked into relay:settings. Every project would share one colour again: this is the original per-project settings bug returning, not a test problem. Only the global layer may write ${projectAccent} here.`
  ).not.toContain(projectAccent);
  expect(await globalLayer(page)).toContain(globalAccent);
});

test('Reset to global clears the override and restores the global accent', async ({ page }) => {
  await openSettings(page);
  await accentPicker(page).selectOption(projectAccent);
  await expect(accentMarker(page)).toBeVisible();
  await expect.poll(() => projectLayer(page)).toContain(projectAccent);
  await accentMarker(page).click();
  await expect(accentMarker(page)).toHaveCount(0);
  await expect(accentPicker(page)).toHaveValue('');
  await expect(
    page.getByRole('button', { name: `Accent ${globalAccent}`, exact: true })
  ).toHaveClass(/chosen/);
  await expect.poll(() => accent(page)).toBe(globalAccent);
  await expect.poll(() => projectLayer(page)).not.toContain(projectAccent);
});

test('a project override is restored from storage after a reload', async ({ page }) => {
  await openSettings(page);
  await accentPicker(page).selectOption(projectAccent);
  await closeSettings(page);
  await expect.poll(() => projectLayer(page)).toContain(projectAccent);
  await page.reload();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await expect.poll(() => accent(page)).toBe(projectAccent);
  await openSettings(page);
  await expect(accentPicker(page)).toHaveValue(projectAccent);
  await expect(accentMarker(page)).toBeVisible();
  expect(
    await globalLayer(page),
    `Loading the project override rewrote the global layer with ${projectAccent}. A load-merge-persist cycle that feeds merged settings back into relay:settings is exactly how the original bug spread one project's colour to all of them.`
  ).not.toContain(projectAccent);
});
