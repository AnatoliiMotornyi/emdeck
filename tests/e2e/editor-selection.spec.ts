import { expect, test } from './fixtures/desktop';
import type { Locator, Page } from '@playwright/test';

// Read the pixels actually painted behind the text. A CSS-color assertion alone
// misses an opaque line covering CodeMirror's otherwise correct selection layer.
const dominantColor = async (page: Page, region: Locator) => {
  const bounds = await region.boundingBox();
  if (!bounds) throw new Error('Selection has no painted rectangle');
  const screenshot = await page.screenshot({
    clip: {
      x: bounds.x + 2,
      y: bounds.y,
      width: Math.max(1, bounds.width - 4),
      height: bounds.height,
    },
    scale: 'css',
    caret: 'hide',
  });
  return page.evaluate(async png => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const counts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      const color = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1])[0][0]
      .split(',')
      .map(Number);
  }, screenshot.toString('base64'));
};

const expectPaintedSelection = async (page: Page, selection: Locator) => {
  await expect(selection).toBeVisible();
  const selected = await dominantColor(page, selection);
  // Compare the same pixels without moving the selected text or cursor.
  await selection.evaluate(node => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  const unselected = await dominantColor(page, selection);
  await selection.evaluate(node => {
    (node as HTMLElement).style.visibility = '';
  });
  expect(
    Math.max(...selected.map((channel, i) => Math.abs(channel - unselected[i])))
  ).toBeGreaterThan(15);
};

for (const theme of ['Dark', 'Light', 'Graphite']) {
  test(`selected editor text stays visibly highlighted in the ${theme} theme`, async ({
    page,
  }, testInfo) => {
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('treeitem', { name: /notes.ts/ }).click();
    const editor = page.getByTestId('code-editor');
    const content = editor.getByRole('textbox');
    await content.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('const');
    const selection = editor.locator('.cm-selectionBackground').first();
    await expectPaintedSelection(page, selection);
    await page.locator('.project-switch').focus();
    await expect(editor.locator('.cm-editor')).not.toHaveClass(/cm-focused/);
    await expectPaintedSelection(page, selection);
    await page.screenshot({ path: testInfo.outputPath(`selection-${theme.toLowerCase()}.png`) });
  });
}

test('mouse selection across lines survives theme switches and keeps editor undo history', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  const editor = page.getByTestId('code-editor');
  const content = editor.getByRole('textbox');
  await content.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.insertText('const second = false;\n');
  await editor.evaluate(node => node.setAttribute('data-editor-marker', 'kept'));
  const point = (line: Locator, offset: number) =>
    line.evaluate((node, offset) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let text: Node | null;
      while ((text = walker.nextNode())) {
        if (offset <= (text.textContent?.length ?? 0)) {
          const range = document.createRange();
          range.setStart(text, offset);
          range.collapse(true);
          const bounds = range.getBoundingClientRect();
          return { x: bounds.x, y: bounds.y + bounds.height / 2 };
        }
        offset -= text.textContent?.length ?? 0;
      }
      throw new Error('Missing selection position');
    }, offset);
  const start = await point(content.locator('.cm-line').nth(0), 6);
  const end = await point(content.locator('.cm-line').nth(1), 12);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected).toContain('original = true;\nconst second');
  for (const theme of ['Dark', 'Light', 'Graphite']) {
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await content.focus();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(selected);
    await expectPaintedSelection(page, editor.locator('.cm-selectionBackground').last());
    await expect(editor).toHaveAttribute('data-editor-marker', 'kept');
  }
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content).not.toContainText('const second');
  await expect(content).toContainText('const original = true;');
});
