import { expect, test } from './fixtures/desktop';
import { openResolver, prepareConflicts } from './fixtures/conflicts';
import type { GitConflict } from '../../src/shared/contracts/gitConflicts';

for (const first of ['ours', 'theirs'] as const) {
  for (const mode of ['replace', 'append'] as const) {
    test(`side arrows accept ${first} first and ${mode} the other side`, async ({
      page,
    }, testInfo) => {
      const other = first === 'ours' ? 'theirs' : 'ours';
      await prepareConflicts(page);
      const dialog = await openResolver(page);
      await dialog
        .getByRole('button', { name: `Accept ${first} for conflict 1`, exact: true })
        .click();
      const apply = dialog.getByRole('button', {
        name: `Apply ${other} to result for conflict 1`,
        exact: true,
      });
      const add = dialog.getByRole('button', {
        name: `Add ${other} below result for conflict 1`,
        exact: true,
      });
      await expect(apply).toBeVisible();
      await expect(add).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('second-side-options.png') });
      await (mode === 'replace' ? apply : add).click();
      const result = dialog
        .getByRole('region', { name: 'Merged result', exact: true })
        .getByRole('textbox');
      const firstText = `const first = ${first === 'ours' ? 1 : 2};`;
      const otherText = `const first = ${other === 'ours' ? 1 : 2};`;
      await expect(result).toContainText(mode === 'append' ? firstText + otherText : otherText);
      if (mode === 'replace') await expect(result).not.toContainText(firstText);
      await expect(result).toContainText('<<<<<<< HEAD');
      await expect(add).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Accept ours for conflict 2', exact: true }).click();
      await dialog.getByRole('button', { name: 'Save and mark resolved' }).click();
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { __emdeckResolved: { content: string }[] }).__emdeckResolved[0]
              .content
        )
      ).toBe((mode === 'append' ? firstText + '\n' : '') + otherText + '\nconst second = 1;\n');
    });
  }
}

test('side choices and add-below anchors survive undo, edits and switching files', async ({
  page,
}) => {
  await prepareConflicts(page);
  const dialog = await openResolver(page);
  const editor = dialog
    .getByRole('region', { name: 'Merged result', exact: true })
    .getByRole('textbox');
  await dialog.getByRole('button', { name: 'Accept theirs for conflict 1', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Add ours below result for conflict 1', exact: true })
    .click();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    dialog.getByRole('button', { name: 'Add ours below result for conflict 1', exact: true })
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    dialog.getByRole('button', { name: 'Accept theirs for conflict 1', exact: true })
  ).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y');
  await expect(
    dialog.getByRole('button', { name: 'Add ours below result for conflict 1', exact: true })
  ).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
  await page.keyboard.insertText('// keep this header\n');
  await dialog
    .getByRole('navigation')
    .getByRole('button', { name: 'notes.ts', exact: true })
    .click();
  await dialog
    .getByRole('navigation')
    .getByRole('button', { name: 'src/config.ts', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Add ours below result for conflict 1', exact: true })
    .click();
  await expect(editor).toContainText('// keep this headerconst first = 2;const first = 1;');
  await expect(editor).toContainText('const second = 1;');
});

test('cross-block manual edits disable unsafe arrows and undo restores them', async ({ page }) => {
  await prepareConflicts(page);
  const dialog = await openResolver(page);
  await dialog.getByRole('button', { name: 'Accept ours for conflict 1', exact: true }).click();
  const editor = dialog
    .getByRole('region', { name: 'Merged result', exact: true })
    .getByRole('textbox');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('hand-written result\n');
  await expect(
    dialog.getByRole('button', { name: 'Apply theirs to result for conflict 1', exact: true })
  ).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    dialog.getByRole('button', { name: 'Add theirs below result for conflict 1', exact: true })
  ).toBeEnabled();
  await expect(editor).toContainText('const first = 1;');
});

test('undo cannot re-enable old source arrows after reloading changed Git versions', async ({
  page,
}) => {
  await prepareConflicts(page);
  const dialog = await openResolver(page);
  await dialog.getByRole('button', { name: 'Accept ours for conflict 1', exact: true }).click();
  await page.evaluate(() => {
    const files = (window as unknown as { __emdeckConflictFiles: Record<string, GitConflict> })
      .__emdeckConflictFiles;
    files['src/config.ts'].theirs.content = 'const first = 99;\nconst second = 2;\n';
  });
  await dialog.getByRole('button', { name: 'Reload versions', exact: true }).click();
  const oldArrow = dialog.getByRole('button', {
    name: 'Apply theirs to result for conflict 1',
    exact: true,
  });
  await expect(oldArrow).toBeDisabled();
  await dialog
    .getByRole('region', { name: 'Merged result', exact: true })
    .getByRole('textbox')
    .click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(dialog.locator('.merge-version').last().getByRole('button').first()).toBeDisabled();
});
