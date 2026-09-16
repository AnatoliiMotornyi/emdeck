import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';

const preserveWork = async (page: Page) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  await page.getByTestId('code-editor').locator('.cm-content').click();
  await page.keyboard.type('// keep this draft');
  await page.getByRole('button', { name: 'Start a terminal', exact: true }).click();
  const terminal = page.getByRole('region', { name: 'Terminal terminal' });
  await expect(terminal).toContainText('Connected');
  await terminal.locator('.xterm').evaluate(el => el.setAttribute('data-session', 'retained'));
};

const expectPreserved = async (page: Page) => {
  await expect(page.getByRole('status')).toContainText('Showing the existing project window.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.project-switch')).toContainText('first');
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible();
  await expect(page.getByTestId('code-editor')).toContainText('// keep this draft');
  await expect(page.locator('.xterm')).toHaveAttribute('data-session', 'retained');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
        call => call.command === 'terminal_close'
      )
    )
  ).toEqual([]);
};

test('opening an existing project in a new window retains the source workspace', async ({
  page,
}) => {
  await preserveWork(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckWindowReused = true;
  });
  await page.keyboard.press('ControlOrMeta+Shift+o');
  await expectPreserved(page);
});

for (const owner of ['main', 'workspace-1']) {
  test(`replacing with a folder owned by ${owner} focuses it without a discard prompt`, async ({
    page,
  }) => {
    await preserveWork(page);
    await page.evaluate(label => {
      (window as unknown as Record<string, unknown>).__emdeckFocusExisting = label;
    }, owner);
    await page.getByTitle('Projects', { exact: true }).click();
    await page.getByRole('menuitem', { name: 'Replace project in this window…' }).click();
    await expectPreserved(page);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
            call => call.command === 'open_project'
          ).length
      )
    ).toBe(1);
  });
}

test('a folder claimed while the discard prompt is open leaves the source untouched', async ({
  page,
}) => {
  await preserveWork(page);
  await page.getByTitle('Projects', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Replace project in this window…' }).click();
  await expect(page.getByRole('dialog', { name: 'Switch workspace?' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckOpenFocused = 'workspace-2';
  });
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await expectPreserved(page);
});

test('a fresh renderer initializes its own reserved folder instead of only focusing itself', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__emdeckFocusExisting = 'main';
  });
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('first');
  await expect(page.getByRole('treeitem', { name: /notes.ts/ })).toBeVisible();
  await expect(page.getByText('Showing the existing project window.', { exact: true })).toHaveCount(
    0
  );
});
