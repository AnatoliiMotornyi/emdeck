import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import { openResolver, prepareConflicts } from './fixtures/conflicts';
import type { GitConflict } from '../../src/shared/contracts/gitConflicts';

const setSample = async (
  page: Page,
  base: string,
  ours: string,
  theirs: string,
  working: string
) => {
  await page.evaluate(
    sample => {
      const state = window as unknown as { __emdeckConflictFiles: Record<string, GitConflict> };
      const file = Object.values(state.__emdeckConflictFiles)[0];
      for (const side of ['base', 'ours', 'theirs', 'working'] as const)
        file[side].content = sample[side];
    },
    { base, ours, theirs, working }
  );
};
const block = (ours: string, theirs: string) =>
  `<<<<<<< HEAD\n${ours}=======\n${theirs}>>>>>>> incoming\n`;

for (const theme of ['Dark', 'Light', 'Graphite']) {
  test(`three merge panes have syntax colors and conflict highlights in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await prepareConflicts(page);
    const base = '// Shared configuration\nexport const mode = "base";\n';
    const ours = 'export const mode = "local";\n';
    const theirs = 'export const mode = "remote";\n';
    await setSample(
      page,
      base,
      '// Shared configuration\n' + ours,
      '// Shared configuration\n' + theirs,
      '// Shared configuration\n' + block(ours, theirs)
    );
    const dialog = await openResolver(page);
    await expect(dialog.locator('.merge-panes > section')).toHaveCount(3);
    await dialog.getByRole('button', { name: 'Merge manually', exact: true }).click();
    const panes = dialog.locator('.merge-panes .merge-code-host');
    for (let i = 0; i < 3; i++) {
      await expect(panes.nth(i).locator('.merge-line-conflict').first()).toBeVisible();
      await expect
        .poll(() =>
          panes.nth(i).evaluate(element => {
            return ['export', 'local', 'remote'].flatMap(word => {
              const line = Array.from(element.querySelectorAll('.cm-line')).find(el =>
                el.textContent?.includes(word)
              );
              if (!line) return [];
              const start = line.textContent!.indexOf(word);
              const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
              let offset = 0;
              while (walker.nextNode()) {
                const node = walker.currentNode;
                const end = offset + (node.textContent?.length ?? 0);
                if (end > start && node.parentElement)
                  return [getComputedStyle(node.parentElement).color];
                offset = end;
              }
              return [];
            });
          })
        )
        .toEqual(
          theme === 'Light'
            ? i === 1
              ? ['rgb(134, 83, 168)', 'rgb(73, 115, 51)', 'rgb(73, 115, 51)']
              : ['rgb(134, 83, 168)', 'rgb(73, 115, 51)']
            : i === 1
              ? ['rgb(197, 161, 233)', 'rgb(184, 207, 139)', 'rgb(184, 207, 139)']
              : ['rgb(197, 161, 233)', 'rgb(184, 207, 139)']
        );
    }
    await dialog.locator('.merge-base summary').click();
    await expect(dialog.getByRole('textbox', { name: 'Common ancestor code' })).toContainText(
      '"base"'
    );
    await page.screenshot({ path: testInfo.outputPath(`merge-${theme.toLowerCase()}.png`) });
    const oursPane = panes.nth(0).getByRole('textbox');
    await oursPane.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('should not replace a source version');
    await expect(oursPane).toContainText('"local"');
    await expect(oursPane).not.toContainText('should not replace');
  });
}

test('arrows resolve the chosen block, preserve ordinary changes and support undo', async ({
  page,
}) => {
  await prepareConflicts(page);
  const same = '// unchanged\n';
  const base =
    'const local = 0;\n' +
    same +
    'const first = 0;\n' +
    same +
    'const second = 0;\n' +
    same +
    'const remote = 0;\n';
  const ours = base
    .replace('local = 0', 'local = 1')
    .replace('first = 0', 'first = 1')
    .replace('second = 0', 'second = 1');
  const theirs = base
    .replace('remote = 0', 'remote = 2')
    .replace('first = 0', 'first = 2')
    .replace('second = 0', 'second = 2');
  const working =
    'const local = 1;\n' +
    same +
    block('const first = 1;\n', 'const first = 2;\n') +
    same +
    block('const second = 1;\n', 'const second = 2;\n') +
    same +
    'const remote = 2;\n';
  await setSample(page, base, ours, theirs, working);
  const dialog = await openResolver(page);
  const result = dialog.getByRole('region', { name: 'Merged result', exact: true });
  await expect(result.locator('.merge-line-changed').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Accept theirs for conflict 2', exact: true }).click();
  await expect(result.locator('.cm-content')).toContainText('const second = 2;');
  await expect(result.locator('.cm-content')).not.toContainText('const second = 1;');
  await expect(result.locator('.cm-content')).toContainText('<<<<<<< HEAD');
  const editor = result.getByRole('textbox');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    dialog.getByRole('button', { name: 'Accept theirs for conflict 2', exact: true })
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Next change', exact: true }).click();
  await expect(result.getByRole('group')).toContainText('Conflict 2:');
  await result.getByRole('button', { name: 'Use theirs', exact: true }).click();
  await dialog.getByRole('button', { name: 'Accept ours for conflict 1', exact: true }).click();
  await expect(editor).toContainText('const local = 1;');
  await expect(editor).toContainText('const remote = 2;');
  await expect(editor).not.toContainText('<<<<<<<');
  await dialog.getByRole('button', { name: 'All changes', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Next change', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save and mark resolved' }).click();
  const expected =
    'const local = 1;\n' +
    same +
    'const first = 1;\n' +
    same +
    'const second = 2;\n' +
    same +
    'const remote = 2;\n';
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __emdeckResolved: { content: string }[] }).__emdeckResolved[0]
          .content
    )
  ).toBe(expected);
});

for (const extension of ['js', 'json', 'py', 'env']) {
  test(`merge source previews use the ${extension} file language`, async ({ page }) => {
    await prepareConflicts(page, { extension });
    const sample =
      extension === 'json'
        ? '{ "mode": "local", "retries": 3 }\n'
        : extension === 'py'
          ? 'mode = "local" # configuration\n'
          : extension === 'env'
            ? 'MODE="local"\n# configuration\n'
            : 'export const mode = "local";\n';
    await setSample(page, '', sample, sample, block(sample, sample));
    const dialog = await openResolver(page);
    const ours = dialog.locator('.merge-version').first();
    await expect
      .poll(() =>
        ours.evaluate(element => {
          const token = Array.from(element.querySelectorAll('.cm-line span')).find(
            span => !span.children.length && span.textContent === '"local"'
          );
          return token ? getComputedStyle(token).color : null;
        })
      )
      .toBe('rgb(184, 207, 139)');
  });
}

test('conflict navigation reveals matching code in all three panes in a long file', async ({
  page,
}) => {
  await prepareConflicts(page);
  const context = Array.from({ length: 100 }, (_, i) => `const unchanged${i} = ${i};\n`).join('');
  const base = 'const first = 0;\n' + context + 'const last = 0;\n';
  const ours = base.replace('first = 0', 'first = 1').replace('last = 0', 'last = 1');
  const theirs = base.replace('first = 0', 'first = 2').replace('last = 0', 'last = 2');
  const working =
    block('const first = 1;\n', 'const first = 2;\n') +
    context +
    block('const last = 1;\n', 'const last = 2;\n');
  await setSample(page, base, ours, theirs, working);
  const dialog = await openResolver(page);
  await dialog.getByRole('button', { name: 'Next change', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Navigate merge changes' })).toContainText(
    '2 of 2'
  );
  const panes = dialog.locator('.merge-panes .merge-code-host');
  await expect(panes).toHaveCount(3);
  for (const pane of await panes.all()) {
    await expect
      .poll(() => pane.locator('.cm-scroller').evaluate(el => el.scrollTop))
      .toBeGreaterThan(1000);
    await expect(
      pane
        .locator('.merge-line-selected')
        .filter({ hasText: /const last/ })
        .first()
    ).toBeInViewport();
  }
  await dialog.getByRole('button', { name: 'Merge manually', exact: true }).click();
  await dialog
    .getByRole('region', { name: 'Merged result', exact: true })
    .getByRole('textbox')
    .click();
  await page.keyboard.press('Shift+F7');
  await expect(dialog.getByRole('group', { name: 'Navigate merge changes' })).toContainText(
    '1 of 2'
  );
  // Editing elsewhere after navigation must not replay the old scroll request.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.insertText('// manual note\n');
  await expect
    .poll(() =>
      dialog
        .getByRole('region', { name: 'Merged result', exact: true })
        .locator('.cm-scroller')
        .evaluate(el => el.scrollTop)
    )
    .toBeGreaterThan(1000);
});
