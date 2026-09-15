import { expect, test } from './fixtures/desktop';
import { discardCalls, prepareDiscard } from './fixtures/discard';

test('cancelling a window-close prompt during discard leaves Git usable and terminals running', async ({
  page,
}) => {
  await prepareDiscard(page);
  await page
    .locator('.terminal-empty')
    .getByRole('button', { name: 'Start a terminal', exact: true })
    .click();
  await expect(page.locator('.xterm')).toBeVisible();
  const all = page.getByRole('button', { name: 'Discard all changes…', exact: true });
  await all.click();
  await expect(
    page.getByRole('dialog', { name: 'Discard changes to 3 files?', exact: true })
  ).toBeVisible();
  await page.evaluate(() => {
    const state = window as unknown as {
      __emdeckRequestClose: () => unknown;
      __emdeckCloseTasks: unknown[];
    };
    state.__emdeckCloseTasks.push(state.__emdeckRequestClose());
  });
  const closing = page.getByRole('dialog', { name: 'Close this Emdeck window?', exact: true });
  await expect(closing).toBeVisible();
  await closing.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(all).toBeEnabled();
  await expect(page.locator('.xterm')).toBeVisible();
  expect(await discardCalls(page)).toHaveLength(0);
  await all.click();
  await expect(
    page.getByRole('dialog', { name: 'Discard changes to 3 files?', exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(all).toBeEnabled();
});

test('discard one file requires confirmation and refreshes both Git sections and the open editor', async ({
  page,
}, testInfo) => {
  await prepareDiscard(page);
  await page
    .locator('.change-row')
    .filter({ has: page.locator('.change-file[title="notes.ts"]') })
    .first()
    .getByTitle('Open file', { exact: true })
    .click();
  const editor = page.getByTestId('code-editor');
  await expect(editor.getByRole('textbox')).toContainText('const changed = true;');
  await editor.evaluate(node => node.setAttribute('data-editor-marker', 'kept'));
  const discard = page.getByTitle('Discard changes to notes.ts', { exact: true }).first();
  await discard.click();
  const dialog = page.getByRole('dialog', { name: 'Discard changes to this file?', exact: true });
  await expect(dialog).toContainText('staged and unstaged');
  await expect(dialog).toContainText('Restore: notes.ts');
  await expect(dialog).toContainText('Untracked files are kept');
  await expect(discard).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('discard-confirmation.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await discardCalls(page)).toHaveLength(0);
  await expect(editor.getByRole('textbox')).toContainText('const changed = true;');
  await discard.click();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.locator('.change-file[title="notes.ts"]')).toHaveCount(0);
  await expect(page.locator('.change-file[title="added.txt"]')).toHaveCount(1);
  await expect(editor).toHaveAttribute('data-editor-marker', 'kept');
  await expect(editor.getByRole('textbox')).toContainText('const original = true;');
  expect(await discardCalls(page)).toEqual([
    {
      command: 'git_discard_apply',
      args: {
        root: '/projects/first',
        request: { paths: ['notes.ts'], revision: 'reviewed-revision' },
      },
    },
  ]);
});

test('discard all lists tracked paths once, warns about added-file deletion, and keeps untracked files', async ({
  page,
}) => {
  await prepareDiscard(page);
  const all = page.getByRole('button', { name: 'Discard all changes…', exact: true });
  await all.click();
  const dialog = page.getByRole('dialog', { name: 'Discard changes to 3 files?', exact: true });
  await expect(dialog).toContainText('Restore: notes.ts');
  await expect(dialog).toContainText('Remove: added.txt');
  await expect(dialog).toContainText('Restore: deleted.txt');
  await expect(dialog).not.toContainText('untracked.txt');
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.locator('.git-content .change-file')).toHaveCount(1);
  await expect(page.locator('.change-file[title="untracked.txt"]')).toBeVisible();
  await expect(page.getByTitle('Discard changes to untracked.txt', { exact: true })).toHaveCount(0);
  await expect(all).toBeDisabled();
  expect((await discardCalls(page))[0].args.request).toEqual({
    paths: ['notes.ts', 'added.txt', 'deleted.txt'],
    revision: 'reviewed-revision',
  });
});

test('unsaved editor drafts block discard without changing any files', async ({ page }) => {
  await prepareDiscard(page);
  await page
    .locator('.change-row')
    .filter({ has: page.locator('.change-file[title="notes.ts"]') })
    .first()
    .getByTitle('Open file', { exact: true })
    .click();
  const editor = page.getByTestId('code-editor').getByRole('textbox');
  await editor.click();
  await page.keyboard.insertText('// unsaved draft\n');
  await page.getByRole('button', { name: 'Discard all changes…', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText('Save or close the unsaved editor tab for notes.ts before discarding changes.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(editor).toContainText('// unsaved draft');
  expect(await discardCalls(page)).toHaveLength(0);
});

test('edits arriving while confirmation is open are protected too', async ({ page }) => {
  await prepareDiscard(page);
  await page
    .locator('.change-row')
    .filter({ has: page.locator('.change-file[title="notes.ts"]') })
    .first()
    .getByTitle('Open file', { exact: true })
    .click();
  const editor = page.getByTestId('code-editor').getByRole('textbox');
  await expect(editor).toBeVisible();
  await page.getByTitle('Discard changes to notes.ts', { exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Discard changes to this file?', exact: true });
  await expect(dialog).toBeVisible();
  // Simulate an editor update completing after the confirmation was opened.
  await editor.evaluate(element => element.focus());
  await page.keyboard.insertText('// arrived after preview\n');
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(
    page.getByText('Save or close the unsaved editor tab for notes.ts before discarding changes.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(editor).toContainText('// arrived after preview');
  expect(await discardCalls(page)).toHaveLength(0);
});

test('a stale native preview reports an error and leaves controls available for a fresh review', async ({
  page,
}) => {
  await prepareDiscard(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckDiscardError =
      'Files or Git state changed while the confirmation was open. Review the changes and try again.';
  });
  await page.getByTitle('Discard changes to notes.ts', { exact: true }).first().click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(
    page.getByText(
      'Files or Git state changed while the confirmation was open. Review the changes and try again.',
      { exact: true }
    )
  ).toBeVisible();
  await expect(page.locator('.git-content .change-file')).toHaveCount(5);
  await expect(
    page.getByRole('button', { name: 'Discard all changes…', exact: true })
  ).toBeEnabled();
});

test('in-progress merges disable discard and keep the conflict workflow available', async ({
  page,
}) => {
  await prepareDiscard(page);
  await page.evaluate(() => {
    const state = window as unknown as { __emdeckGit: { operation: string } };
    state.__emdeckGit.operation = 'merge';
  });
  await page.getByTitle('Refresh Git', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Discard all changes…', exact: true })
  ).toBeDisabled();
  await expect(
    page.getByTitle('Discard changes to notes.ts', { exact: true }).first()
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Abort…', exact: true })).toBeEnabled();
  expect(await discardCalls(page)).toHaveLength(0);
});
