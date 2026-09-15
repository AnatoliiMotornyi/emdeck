import { expect, test } from '@playwright/test';

const sample = '# Local settings\nexport APP_MODE=development\nLABEL="hello # world"\n';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(sample => {
    localStorage.setItem(
      'relay:demo-files',
      JSON.stringify({
        'src/app.ts': 'const original = true;\n',
        '.env': sample,
        '.env.local': sample,
        'staging.env': sample,
        'notes.txt': sample,
      })
    );
  }, sample);
  await page.goto('/');
});

test('environment file variants render distinct token colors in all themes', async ({
  page,
}, testInfo) => {
  const editor = page.getByTestId('code-editor');
  for (const theme of ['Dark', 'Light', 'Graphite']) {
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    for (const name of ['.env', '.env.local', 'staging.env']) {
      await page
        .getByRole('treeitem')
        .filter({ has: page.getByText(name, { exact: true }) })
        .click();
      const key = editor.locator('.cm-line span').filter({ hasText: /^APP_MODE$/ });
      const quoted = editor.locator('.cm-line span').filter({ hasText: /^"hello # world"$/ });
      await expect(key).toBeVisible();
      await expect(quoted).toBeVisible();
      await expect(page.locator('.statusbar')).toContainText('Dotenv');
      const palette =
        theme === 'Light'
          ? ['rgb(126, 139, 145)', 'rgb(70, 90, 113)', 'rgb(73, 115, 51)', 'rgb(134, 83, 168)']
          : [
              'rgb(110, 120, 134)',
              'rgb(189, 198, 214)',
              'rgb(184, 207, 139)',
              'rgb(197, 161, 233)',
            ];
      // A file/theme switch can replace the spans after locator visibility
      // checks. Read the current tokens together and retry until the expected
      // theme is painted, rather than sampling separate, potentially stale DOMs.
      await expect
        .poll(async () =>
          editor.evaluate(element => {
            const spans = Array.from(element.querySelectorAll('.cm-line span'));
            const colors = [
              '# Local settings',
              'APP_MODE',
              'development',
              'export',
              '"hello # world"',
            ].map(text => {
              const token = spans.find(span => span.textContent === text);
              return token ? getComputedStyle(token).color : null;
            });
            return { colors, valueDistinct: colors[2] !== getComputedStyle(element).color };
          })
        )
        .toEqual({ colors: [...palette, palette[2]], valueDistinct: true });
    }
    await page.screenshot({ path: testInfo.outputPath(`dotenv-${theme.toLowerCase()}.png`) });
  }
});

test('dotenv edits and undo survive theme and tab switches without coloring plain text', async ({
  page,
}) => {
  const editor = page.getByTestId('code-editor');
  const content = editor.locator('.cm-content');
  await page
    .getByRole('treeitem')
    .filter({ has: page.getByText('.env.local', { exact: true }) })
    .click();
  await expect(content).toContainText('APP_MODE');
  await content.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.insertText('EXTRA=changed\n');
  await expect(content).toContainText('EXTRA=changed');
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .getByRole('treeitem')
    .filter({ has: page.getByText('notes.txt', { exact: true }) })
    .click();
  await expect(content).not.toContainText('EXTRA');
  await expect(content.locator('.cm-line span')).toHaveCount(0);
  await expect(page.locator('.statusbar')).toContainText('Plain text');
  await page.getByRole('tab', { name: /.env.local/ }).click();
  await expect(content).toContainText('EXTRA=changed');
  await content.click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content).not.toContainText('EXTRA');
  await expect(content).toContainText('APP_MODE=development');
  await expect(content.locator('.cm-line span').filter({ hasText: /^APP_MODE$/ })).toBeVisible();
});
