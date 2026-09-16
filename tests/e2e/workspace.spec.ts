import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('code-editor')).toBeVisible();
});
test('workspace renders without runtime errors; preview is explicit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.reload();
  await expect(page.getByRole('tree', { name: 'Project files' })).toBeVisible();
  await expect(page.getByText('INTERACTIVE PREVIEW')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Codex terminal' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Claude terminal' })).toBeVisible();
  await page.screenshot({ path: 'test-results/workspace-dark.png' });
  expect(errors).toEqual([]);
});
test('edits, saves, and reopens a file with persisted content', async ({ page }) => {
  await page.getByTestId('code-editor').locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.type('\n// persisted from UI test');
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Saved app.ts', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Unsaved', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('code-editor')).toContainText('persisted from UI test');
});
test('file context menu creates, renames, copies, and trashes a file', async ({ page }) => {
  await page.getByTitle('New file', { exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('notes.md');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('tab', { name: /notes.md/ })).toBeVisible();
  await page.getByRole('treeitem', { name: /notes.md/ }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Rename…', exact: true }).click();
  await page.getByLabel('New name').fill('ideas.md');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('tab', { name: /ideas.md/ })).toBeVisible();
  await page.getByRole('treeitem', { name: /ideas.md/ }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Copy file or folder', exact: true }).click();
  await page.locator('.project-tree-heading').click({ button: 'right' });
  await page.getByRole('button', { name: 'Paste…', exact: true }).click();
  await page.getByLabel('Copy name').fill('ideas-copy.md');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: /ideas-copy.md/ })).toBeVisible();
  await page.getByRole('treeitem', { name: /ideas-copy.md/ }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Move to trash…', exact: true }).click();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: /ideas-copy.md/ })).toHaveCount(0);
});
test('terminal layout and hiding preserve mounted sessions', async ({ page }) => {
  const host = page.getByRole('region', { name: 'Codex terminal' }).locator('.xterm');
  await expect(host).toBeVisible();
  await host.evaluate(el => el.setAttribute('data-session-marker', 'preserved'));
  await page.getByTitle('Grid', { exact: true }).click();
  await expect(page.locator('.terminal-grid')).toHaveClass(/layout-grid/);
  await page.getByTitle('Hide terminals (sessions keep running)').click();
  await expect(host).toBeHidden();
  await page.getByTitle('Toggle terminal panel', { exact: true }).click();
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-session-marker', 'preserved');
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Gemini Gemini CLI' }).click();
  await expect(page.getByRole('region', { name: 'Gemini terminal' })).toBeVisible();
  await page.getByTitle('Close Gemini', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Gemini terminal' })).toHaveCount(0);
});

test('terminal placement spans below the file tree and switches without remounting the editor or agents', async ({
  page,
}) => {
  const terminal = page.locator('.terminal-panel');
  const sidebar = page.locator('.sidebar');
  const editor = page.getByTestId('code-editor');
  const host = page.getByRole('region', { name: 'Codex terminal' }).locator('.xterm');
  await host.evaluate(el => el.setAttribute('data-session-marker', 'same-terminal'));
  await editor.evaluate(el => el.setAttribute('data-editor-marker', 'same-editor'));
  const navBox = (await page.getByRole('navigation', { name: 'Workspace tools' }).boundingBox())!;
  let termBox = (await terminal.boundingBox())!;
  let sideBox = (await sidebar.boundingBox())!;
  expect(termBox.x).toBeCloseTo(navBox.x + navBox.width, 0);
  expect(sideBox.y + sideBox.height).toBeLessThanOrEqual(termBox.y);
  await page.screenshot({ path: 'test-results/full-bottom-terminal.png' });
  await page.getByTitle('Full-width terminal panel', { exact: true }).click();
  await expect(page.getByTitle('Full-width terminal panel', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  termBox = (await terminal.boundingBox())!;
  sideBox = (await sidebar.boundingBox())!;
  expect(termBox.x).toBeGreaterThan(sideBox.x + sideBox.width);
  expect(sideBox.y + sideBox.height).toBeCloseTo(termBox.y + termBox.height, 0);
  await expect(host).toHaveAttribute('data-session-marker', 'same-terminal');
  await expect(editor).toHaveAttribute('data-editor-marker', 'same-editor');
  await page.getByTitle('Full-width terminal panel', { exact: true }).click();
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await expect(sidebar).toBeHidden();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Workspace tools' })).toBeVisible();
  await page.getByTitle('Explorer', { exact: true }).click();
  await expect(sidebar).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(host).toHaveAttribute('data-session-marker', 'same-terminal');
  await page.getByTitle('Hide terminals (sessions keep running)', { exact: true }).click();
  const workspace = (await page.locator('.main-workspace').boundingBox())!;
  sideBox = (await sidebar.boundingBox())!;
  expect(sideBox.height).toBeCloseTo(workspace.height, 0);
  await page.getByTitle('Toggle terminal panel', { exact: true }).click();
  await expect(host).toHaveAttribute('data-session-marker', 'same-terminal');
});

test('panel sizes support dragging, keyboard, reset and responsive window resizing', async ({
  page,
}) => {
  const terminal = page.locator('.terminal-panel');
  const divider = page.getByRole('separator', { name: 'Resize terminal panel', exact: true });
  const initial = (await terminal.boundingBox())!.height;
  await divider.focus();
  await page.keyboard.press('ArrowUp');
  expect((await terminal.boundingBox())!.height).toBeCloseTo(initial + 20, 0);
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 100, { steps: 8 });
  await page.mouse.up();
  expect((await terminal.boundingBox())!.height).toBeGreaterThan(initial + 100);
  const resizedHeight = (await terminal.boundingBox())!.height;
  await page.reload();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  expect((await terminal.boundingBox())!.height).toBeCloseTo(resizedHeight, 0);
  await divider.dblclick();
  expect((await terminal.boundingBox())!.height).toBeCloseTo(310, 0);
  const sidebarDivider = page.getByRole('separator', { name: 'Resize sidebar', exact: true });
  await sidebarDivider.focus();
  await page.keyboard.press('End');
  expect((await page.locator('.sidebar').boundingBox())!.width).toBeCloseTo(440, 0);
  await page.getByTitle('Full-width terminal panel', { exact: true }).click();
  await page.setViewportSize({ width: 900, height: 640 });
  await expect(
    page.getByTitle('Hide terminals (sessions keep running)', { exact: true })
  ).toBeInViewport();
  const toolbar = (await page.locator('.terminal-toolbar').boundingBox())!;
  const hide = (await page
    .getByTitle('Hide terminals (sessions keep running)', { exact: true })
    .boundingBox())!;
  expect(hide.x + hide.width).toBeLessThanOrEqual(toolbar.x + toolbar.width);
  await divider.focus();
  await page.keyboard.press('End');
  await expect(page.locator('.editor-panel')).toBeVisible();
  expect((await page.locator('.editor-panel').boundingBox())!.height).toBeGreaterThanOrEqual(150);
  await page.screenshot({ path: 'test-results/editor-width-terminal-small.png' });
  await page.getByTitle('Full-width terminal panel', { exact: true }).click();
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.screenshot({ path: 'test-results/full-bottom-terminal-small-light.png' });
  const termBox = (await terminal.boundingBox())!;
  const status = (await page.locator('.statusbar').boundingBox())!;
  expect(termBox.y + termBox.height).toBeLessThanOrEqual(status.y + 1);
  await sidebarDivider.dblclick();
  expect((await page.locator('.sidebar').boundingBox())!.width).toBeCloseTo(240, 0);
});

test('terminal placement can be changed in Settings and persists after reload', async ({
  page,
}) => {
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: /Below editor Keep the file tree full-height/ }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expect(page.locator('.main-workspace')).toHaveClass(/terminal-placement-editor/);
  await page.getByTitle('Settings', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Below editor Keep the file tree full-height/ })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Full bottom width Files and editor/ }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.main-workspace')).toHaveClass(/terminal-placement-workspace/);
});
test('themes and run presets persist', async ({ page }) => {
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: 'test-results/workspace-light.png' });
  await page.getByTitle('Manage run configurations').click();
  await page.getByRole('button', { name: 'Add configuration', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Type check');
  await page.getByLabel('Command', { exact: true }).fill('npx tsc --noEmit');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.run-config')).toContainText('Type check');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTitle('Manage run configurations').click();
  await expect(page.getByRole('button', { name: /Type check npx tsc/ })).toBeVisible();
});
test('an accent preset can be chosen from the extended list and persists', async ({ page }) => {
  const accent = () =>
    page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByLabel('More accent colors').selectOption('#6fd8c8');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(accent).toBe('#6fd8c8');
  await page.reload();
  await expect.poll(accent).toBe('#6fd8c8');
  await page.getByTitle('Settings', { exact: true }).click();
  await expect(page.getByLabel('More accent colors')).toHaveValue('#6fd8c8');
  await page.getByRole('button', { name: 'Accent #b8ee86', exact: true }).click();
  await expect(page.getByLabel('More accent colors')).toHaveValue('');
  await expect.poll(accent).toBe('#b8ee86');
});
test('quick open and source control are reachable', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+p');
  await page.getByLabel('Search files and actions').fill('README');
  await page.getByRole('button', { name: /README.md/ }).click();
  await expect(page.getByRole('tab', { name: /README.md/ })).toBeVisible();
  await page.getByTitle('Source control', { exact: true }).click();
  await expect(
    page.getByText('Git is available in the desktop app.', { exact: false })
  ).toBeVisible();
});
