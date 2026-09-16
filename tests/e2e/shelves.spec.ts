import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/desktop';

type Call = { command: string; args: Record<string, unknown> };

const seedChanges = async (page: Page) => {
  await page.evaluate(() => {
    const state = window as unknown as Record<string, unknown>;
    state.__emdeckGit = {
      available: true,
      message: '',
      branch: 'main',
      localBranches: ['main'],
      remoteBranches: [],
      commits: [],
      changes: [
        { path: 'notes.ts', originalPath: null, index: ' ', working: 'M', conflict: false },
        { path: 'other.ts', originalPath: null, index: ' ', working: 'M', conflict: false },
      ],
    };
  });
  await page.getByTitle('Source control', { exact: true }).click();
  await page.getByTitle('Refresh Git', { exact: true }).click();
};

const calls = (page: Page, command: string) =>
  page.evaluate(
    name =>
      (window as unknown as { __emdeckCalls: Call[] }).__emdeckCalls
        .filter(call => call.command === name)
        .map(call => call.args),
    command
  );

test('only the selected changes are shelved, and unshelving returns them', async ({ page }) => {
  await seedChanges(page);

  await page.getByLabel('Select notes.ts').check();
  await page.getByTitle('Shelve selected changes', { exact: true }).click();

  expect(await calls(page, 'shelf_create')).toEqual([
    { root: '/projects/first', name: '', paths: ['notes.ts'] },
  ]);
  await expect(
    page.getByLabel('Select notes.ts'),
    'the selection clears once the changes are shelved'
  ).not.toBeChecked();

  await page.getByTitle('Shelved changes', { exact: true }).click();
  await expect(page.getByText('1 file · 1 modified')).toBeVisible();

  await page.getByRole('button', { name: 'Unshelve', exact: true }).click();
  expect(await calls(page, 'shelf_apply')).toEqual([
    { root: '/projects/first', id: 'shelf-1', force: false },
  ]);
  await expect(page.getByText('Nothing is shelved yet.')).toBeVisible();
});

test('shelving is unavailable until a change is picked, and a shelf can be discarded', async ({
  page,
}) => {
  await seedChanges(page);

  const shelve = page.getByTitle('Shelve selected changes', { exact: true });
  await expect(shelve, 'nothing is selected yet').toBeDisabled();

  await page.getByLabel('Select other.ts').check();
  await expect(shelve).toBeEnabled();
  await shelve.click();

  await page.getByTitle('Shelved changes', { exact: true }).click();
  await page.getByLabel(/^Delete /).click();

  expect(await calls(page, 'shelf_delete')).toEqual([{ root: '/projects/first', id: 'shelf-1' }]);
  await expect(page.getByText('Nothing is shelved yet.')).toBeVisible();
});

test('a file changed since shelving is reported rather than overwritten', async ({ page }) => {
  await seedChanges(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckShelfConflicts = ['notes.ts'];
  });

  await page.getByLabel('Select notes.ts').check();
  await page.getByTitle('Shelve selected changes', { exact: true }).click();
  await page.getByTitle('Shelved changes', { exact: true }).click();
  await page.getByRole('button', { name: 'Unshelve', exact: true }).click();

  await expect(
    page.getByText('1 file changed since they were shelved and were left untouched: notes.ts')
  ).toBeVisible();
  await expect(page.getByText('1 file · 1 modified'), 'a conflicted shelf is kept').toBeVisible();
});
