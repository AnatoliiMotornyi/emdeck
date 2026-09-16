import { expect, test } from './fixtures/desktop';
import { openResolver, prepareConflicts } from './fixtures/conflicts';

test('conflict modal lists files and accepts complete versions one file at a time', async ({
  page,
}) => {
  await prepareConflicts(page);
  const dialog = await openResolver(page);
  await expect(
    dialog.getByRole('navigation', { name: 'Conflicted files' }).getByRole('button')
  ).toHaveCount(2);
  await expect(
    dialog.getByRole('region', { name: 'Ours — current branch', exact: true })
  ).toContainText('const first = 1;');
  await expect(
    dialog.getByRole('region', { name: 'Theirs — incoming changes', exact: true })
  ).toContainText('const first = 2;');
  await dialog.getByRole('button', { name: 'Accept Theirs', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('1 file remaining');
  await expect(dialog.locator('.merge-file-heading')).toContainText('notes.ts');
  await dialog.getByRole('button', { name: 'Accept Ours', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'All conflicts resolved' })).toBeVisible();
  const resolved = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__emdeckResolved
  );
  expect(resolved).toEqual([
    { path: 'src/config.ts', revision: 'revision-src/config.ts', choice: 'theirs' },
    { path: 'notes.ts', revision: 'revision-notes.ts', choice: 'ours' },
  ]);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue merge', exact: true })).toBeEnabled();
});

test('manual merge edits live inside the modal and all blocks must be resolved before saving', async ({
  page,
}, testInfo) => {
  await prepareConflicts(page);
  const dialog = await openResolver(page);
  await dialog.getByRole('button', { name: 'Merge manually', exact: true }).click();
  const result = dialog.getByRole('region', { name: 'Merged result', exact: true });
  // The editor is lazy-loaded. Wait until it accepts input before checking its content.
  await result.getByRole('textbox').click();
  await expect(result.locator('.cm-content')).toContainText('<<<<<<< HEAD');
  await expect(dialog.getByRole('button', { name: 'Save and mark resolved' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('merge-three-pane.png') });
  await result.getByRole('button', { name: 'Use ours', exact: true }).click();
  await result.getByRole('button', { name: 'Use theirs', exact: true }).click();
  await expect(result.locator('.cm-content')).toHaveText('const first = 1;const second = 2;');
  await expect(dialog.getByRole('button', { name: 'Save and mark resolved' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save and mark resolved' }).click();
  await expect(dialog.getByRole('status')).toContainText('1 file remaining');
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__emdeckResolved)
  ).toEqual([
    {
      path: 'src/config.ts',
      revision: 'revision-src/config.ts',
      choice: 'manual',
      content: 'const first = 1;\nconst second = 2;\n',
    },
  ]);
});

test('merge choices made while the editor loads appear when it becomes ready', async ({ page }) => {
  const editorChunk = /\/assets\/MergeCodePane-[^/]+\.js$/;
  let releaseEditor = () => {};
  const editorGate = new Promise<void>(resolve => {
    releaseEditor = resolve;
  });
  await page.route(editorChunk, async route => {
    await editorGate;
    await route.continue();
  });
  try {
    await prepareConflicts(page);
    const requested = page.waitForRequest(editorChunk);
    const dialog = await openResolver(page);
    await dialog.getByRole('button', { name: 'Merge manually', exact: true }).click();
    await requested;
    const result = dialog.getByRole('region', { name: 'Merged result', exact: true });
    await expect(result.getByText('Opening merge editor…', { exact: true })).toBeVisible();
    await expect(result.getByRole('textbox')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Save and mark resolved' })).toBeDisabled();
    await result.getByRole('button', { name: 'Use ours', exact: true }).click();
    await result.getByRole('button', { name: 'Use theirs', exact: true }).click();

    releaseEditor();
    const editor = result.getByRole('textbox');
    await editor.click();
    await expect(editor).toHaveText('const first = 1;const second = 2;');
    await expect(dialog.getByRole('button', { name: 'Save and mark resolved' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Save and mark resolved' }).click();
    await expect(dialog.getByRole('status')).toContainText('1 file remaining');
    expect(
      await page.evaluate(() => (window as unknown as Record<string, unknown>).__emdeckResolved)
    ).toEqual([
      {
        path: 'src/config.ts',
        revision: 'revision-src/config.ts',
        choice: 'manual',
        content: 'const first = 1;\nconst second = 2;\n',
      },
    ]);
  } finally {
    releaseEditor();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('manual drafts survive file selection, failed saves, version reloads and cancelled closing', async ({
  page,
}) => {
  await prepareConflicts(page);
  const dialog = await openResolver(page);
  await dialog.getByRole('button', { name: 'Merge manually', exact: true }).click();
  const editor = dialog.getByRole('region', { name: 'Merged result' }).locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('const combined = true;\n');
  await dialog
    .getByRole('navigation')
    .getByRole('button', { name: 'notes.ts', exact: true })
    .click();
  await dialog
    .getByRole('navigation')
    .getByRole('button', { name: 'src/config.ts', exact: true })
    .click();
  await expect(editor).toContainText('const combined = true;');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckResolveError =
      'EXTERNAL_CHANGE: An agent edited this file. Reload it.';
  });
  await dialog.getByRole('button', { name: 'Save and mark resolved' }).click();
  await expect(dialog.getByRole('alert')).toContainText('EXTERNAL_CHANGE');
  await expect(editor).toContainText('const combined = true;');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckResolveError = null;
  });
  await dialog.getByRole('button', { name: 'Reload versions' }).click();
  await expect(dialog.getByRole('button', { name: 'Save and mark resolved' })).toBeEnabled();
  await expect(editor).toContainText('const combined = true;');
  await page.keyboard.press('Escape');
  await expect(dialog.getByText('Discard unsaved manual merge edits?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await dialog.getByRole('button', { name: 'Save and mark resolved' }).click();
  await expect(dialog.getByRole('status')).toContainText('1 file remaining');
});

test('binary and deletion conflicts offer explicit whole-file choices', async ({ page }) => {
  await prepareConflicts(page, { binary: true });
  await page.getByRole('button', { name: 'Resolve conflicts… (2)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Resolve merge conflicts' });
  await expect(dialog.getByRole('button', { name: 'Accept Theirs', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Merge manually', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Accept Theirs', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await prepareConflicts(page, { deleted: true });
  const deleted = await openResolver(page);
  await expect(
    deleted.getByRole('button', { name: 'Accept Ours (delete file)', exact: true })
  ).toBeEnabled();
  await deleted.getByRole('button', { name: 'Accept Ours (delete file)', exact: true }).click();
  await expect(deleted.getByRole('status')).toContainText('1 file remaining');
});

test('a failed merge opens the conflict modal automatically and the branch menu can reopen it', async ({
  page,
}) => {
  await prepareConflicts(page, { clean: true });
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page
    .getByRole('button', { name: 'Actions for local branch incoming', exact: true })
    .click();
  await page.getByRole('menuitem', { name: "Merge 'incoming' into 'main'", exact: true }).click();
  await page.getByRole('button', { name: 'Merge branch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Resolve merge conflicts' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page.getByRole('button', { name: 'Resolve conflicts…', exact: true }).click();
  await expect(dialog).toBeVisible();
});

test('unsaved editor tabs are protected and conflict rows open the modal', async ({ page }) => {
  await page.getByRole('treeitem', { name: /notes\.ts/ }).click();
  const editor = page.getByTestId('code-editor').locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('unsaved editor text');
  await prepareConflicts(page);
  await page.locator('.change-file[title="notes.ts"]').click();
  const dialog = page.getByRole('dialog', { name: 'Resolve merge conflicts' });
  await expect(dialog.getByRole('alert')).toContainText('unsaved editor tab');
  await expect(dialog.getByRole('button', { name: 'Accept Ours', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toContainText('unsaved editor text');
});

test('manual conflict controls remain reachable at the minimum window size and explain rebase sides', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await prepareConflicts(page, { rebase: true });
  const dialog = await openResolver(page);
  await expect(dialog.getByText(/During a rebase/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Merge manually', exact: true }).click();
  await dialog.getByRole('region', { name: 'Merged result' }).getByRole('textbox').click();
  await expect(
    dialog.getByRole('region', { name: 'Merged result' }).locator('.cm-content')
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save and mark resolved' })).toBeInViewport({
    ratio: 1,
  });
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({ path: testInfo.outputPath('merge-small-window.png') });
});

test('closing immediately after a merge edit protects the draft and Escape closes only the top dialog', async ({
  page,
}) => {
  await prepareConflicts(page);
  const dialog = await openResolver(page);
  await dialog.getByRole('button', { name: 'Merge manually', exact: true }).click();
  const editor = dialog.getByRole('region', { name: 'Merged result' }).locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as Record<string, unknown>).__emdeckCloseReady)
    )
    .toBe(true);
  await editor.evaluate(element => {
    const state = window as unknown as {
      __emdeckCloseTasks: Promise<void>[];
      __emdeckRequestClose: () => Promise<void>;
    };
    // Request close as soon as the editor changes, before React can defer draft propagation.
    const observer = new MutationObserver(() => {
      if (!element.textContent?.includes('keep this manual draft')) return;
      observer.disconnect();
      queueMicrotask(() => state.__emdeckCloseTasks.push(state.__emdeckRequestClose()));
    });
    observer.observe(element, { childList: true, characterData: true, subtree: true });
  });
  await page.keyboard.insertText('keep this manual draft\n');
  const closing = page.getByRole('dialog', { name: 'Close this Emdeck window?', exact: true });
  await expect(closing).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(closing).toHaveCount(0);
  await expect(dialog.getByText('Discard unsaved manual merge edits?')).toHaveCount(0);
  await expect(editor).toContainText('keep this manual draft');
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__emdeckDestroyed)
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard merge edits', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__emdeckResolved)
  ).toEqual([]);
  await page.evaluate(async () => {
    const state = window as unknown as {
      __emdeckCloseTasks: Promise<void>[];
      __emdeckRequestClose: () => Promise<void>;
    };
    await Promise.all(state.__emdeckCloseTasks);
    await state.__emdeckRequestClose();
  });
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__emdeckDestroyed)
  ).toEqual(['main']);
});
