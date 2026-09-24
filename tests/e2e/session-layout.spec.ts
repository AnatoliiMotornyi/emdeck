import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { SessionSnapshot } from '../../src/shared/contracts/sessions';
import {
  backgroundCalls,
  backgroundPane,
  connectBackgroundLayout,
  installBackgroundLayout,
  openBackgroundPanes,
} from './fixtures/background-layout';

const keys = ['local/0', 'local/1', 'remote/0', 'remote/1'];
const boxes = async (page: Page) =>
  Promise.all(keys.map(key => backgroundPane(page, key).boundingBox()));
const markViews = async (page: Page) => {
  for (const key of keys)
    await backgroundPane(page, key)
      .locator('.xterm')
      .evaluate((el, key) => el.setAttribute('data-original-view', key), key);
};
const preserved = async (page: Page) => {
  for (const key of keys)
    await expect(backgroundPane(page, key).locator('.xterm')).toHaveAttribute(
      'data-original-view',
      key
    );
  const calls = await backgroundCalls(page);
  expect(
    calls.filter(({ action }) =>
      ['pane.create', 'pane.restart', 'pane.stop', 'pane.detach'].includes(action.method)
    )
  ).toHaveLength(0);
  expect(calls.filter(({ action }) => action.method === 'pane.attach')).toHaveLength(4);
};
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1650, height: 1050 });
  await openBackgroundPanes(page);
  await markViews(page);
});

test('background rows, columns and grid display all attached sessions without remounting', async ({
  page,
}) => {
  const toolbar = page.getByRole('toolbar', { name: 'Background terminal layout' });
  for (const mode of ['Side by side', 'Stacked', 'Grid']) {
    await toolbar.getByRole('button', { name: mode, exact: true }).click();
    await expect(toolbar.getByRole('button', { name: mode, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect
      .poll(async () => {
        const [a, b, c] = await boxes(page);
        if (!a || !b || !c) return false;
        return mode === 'Side by side'
          ? b.x > a.x && Math.abs(b.y - a.y) < 2
          : mode === 'Stacked'
            ? b.y > a.y && Math.abs(b.x - a.x) < 2
            : b.x > a.x && c.y > a.y && Math.abs(c.x - a.x) < 2;
      })
      .toBe(true);
    await preserved(page);
  }
  await backgroundPane(page, 'local/0').getByTitle('Maximize or restore session').click();
  await expect(page.locator('.session-terminal:visible')).toHaveCount(1);
  await toolbar.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('.session-terminal:visible')).toHaveCount(4);
  await preserved(page);
});

test('real drag and drop creates mixed splits, swaps positions and survives filtering and theme changes', async ({
  page,
}, testInfo) => {
  // Native Tauri file-drop handling prevents HTML5 drags on Windows.
  await page.evaluate(() => {
    document.addEventListener('dragstart', event => event.preventDefault());
  });
  const source = backgroundPane(page, 'remote/0');
  const target = backgroundPane(page, 'local/0');
  const bounds = (await target.boundingBox())!;
  await source
    .getByRole('button', { name: 'Move claude remote', exact: true })
    .dragTo(target, { targetPosition: { x: bounds.width / 2, y: bounds.height - 15 } });
  await expect(page.getByText('Custom layout', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const [a, , c] = await boxes(page);
      return !!a && !!c && c.y > a.y && Math.abs(a.x - c.x) < 2;
    })
    .toBe(true);
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  await rail.getByRole('button', { name: 'local project', exact: true }).click();
  await expect(page.locator('.session-terminal:visible')).toHaveCount(2);
  await rail.getByRole('button', { name: 'All panes', exact: true }).click();
  await page.getByLabel('Terminal view').selectOption('panes');
  await page.getByLabel('Terminal view').selectOption('server');
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await preserved(page);
  await page.screenshot({ path: testInfo.outputPath('background-mixed-layout.png') });
  const before = (await backgroundPane(page, 'local/1').boundingBox())!;
  const targetBounds = (await target.boundingBox())!;
  await backgroundPane(page, 'local/1')
    .getByRole('button', { name: 'Move codex local', exact: true })
    .dragTo(target, { targetPosition: { x: targetBounds.width / 2, y: targetBounds.height / 2 } });
  await expect
    .poll(async () => Math.round((await target.boundingBox())!.x))
    .toBe(Math.round(before.x));
  await preserved(page);
});

test('cancelled drags leave positions intact and reconnecting a machine restores its layout', async ({
  page,
}) => {
  const grip = backgroundPane(page, 'local/0').getByRole('button', {
    name: 'Move claude local',
    exact: true,
  });
  const bounds = (await grip.boundingBox())!;
  const target = (await backgroundPane(page, 'remote/1').boundingBox())!;
  await page
    .getByRole('toolbar', { name: 'Background terminal layout' })
    .getByRole('button', { name: 'Side by side', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('relay:session-layout')))
    .not.toBeNull();
  const saved = await page.evaluate(() => localStorage.getItem('relay:session-layout'));
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 20, { steps: 8 });
  await expect(page.getByText('Place above', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.session-drop-preview')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('relay:session-layout'))).toBe(saved);
  await preserved(page);

  const remote = page
    .locator('.session-machine')
    .filter({ has: page.getByText('Linux server', { exact: true }) });
  await remote.getByText('Machine settings', { exact: true }).click();
  await remote.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.locator('.session-disconnected')).toHaveCount(2);
  await expect(backgroundPane(page, 'local/0').locator('.xterm')).toHaveAttribute(
    'data-original-view',
    'local/0'
  );
  await remote.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.session-terminal:visible')).toHaveCount(4);
  // Metadata changes must not reorder or reattach the views.
  await page.evaluate(() => {
    const state = window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> };
    state.__layoutSnapshots.remote.panes[0].title = 'Renamed remote agent';
    state.__layoutSnapshots.remote.revision++;
  });
  await expect(
    backgroundPane(page, 'remote/0').getByRole('button', {
      name: 'Move Renamed remote agent',
      exact: true,
    })
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('relay:session-layout'))).toBe(saved);
  const calls = await backgroundCalls(page);
  expect(
    calls.filter(({ action }) =>
      ['pane.create', 'pane.restart', 'pane.stop'].includes(action.method)
    )
  ).toHaveLength(0);
  expect(calls.filter(({ action }) => action.method === 'pane.attach')).toHaveLength(6);
});

test('dividers resize by dragging and keyboard, preserve input and scrollback, and restore saved layouts', async ({
  page,
}) => {
  const toolbar = page.getByRole('toolbar', { name: 'Background terminal layout' });
  await toolbar.getByRole('button', { name: 'Grid', exact: true }).click();
  const terminal = backgroundPane(page, 'local/0');
  const viewport = terminal.locator('.xterm-viewport');
  await expect
    .poll(() => viewport.evaluate(el => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(100);
  const firstLine = terminal.locator('.xterm-rows > div').first();
  await expect(terminal.locator('.xterm-rows')).toContainText('READY>');
  await terminal.locator('.xterm-screen').hover();
  await page.mouse.wheel(0, -100000);
  await expect(firstLine).toHaveText('local output 0');
  const divider = page
    .getByRole('separator', { name: 'Resize background columns', exact: true })
    .first();
  const bounds = (await divider.boundingBox())!;
  const before = (await terminal.boundingBox())!.width;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 90, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await terminal.boundingBox())!.width).toBeGreaterThan(before + 40);
  await divider.focus();
  const dragged = (await terminal.boundingBox())!.width;
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await terminal.boundingBox())!.width).toBeLessThan(dragged);
  await expect(firstLine).toHaveText('local output 0');
  await terminal.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('still attached');
  await expect
    .poll(async () =>
      (await backgroundCalls(page))
        .flatMap(({ action }) => (action.method === 'pane.input' ? [action.params.text] : []))
        .join('')
    )
    .toBe('still attached');
  await preserved(page);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('relay:session-layout') ?? '{}').mode)
    )
    .toBe('custom');
  const saved = await page.evaluate(() => localStorage.getItem('relay:session-layout'));
  await page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('relay:session-machines')!);
    localStorage.setItem(
      'relay:session-machines',
      JSON.stringify(profiles.map((profile: object) => ({ ...profile, enabled: false })))
    );
  });
  await page.reload();
  await installBackgroundLayout(page);
  await connectBackgroundLayout(page);
  await expect(page.locator('.session-terminal:visible')).toHaveCount(4);
  expect(await page.evaluate(() => localStorage.getItem('relay:session-layout'))).toBe(saved);
});

test('row resizing keeps the historical line being read and still follows output at the bottom', async ({
  page,
}) => {
  await page
    .getByRole('toolbar', { name: 'Background terminal layout' })
    .getByRole('button', { name: 'Grid', exact: true })
    .click();
  const terminal = backgroundPane(page, 'local/0');
  const firstLine = terminal.locator('.xterm-rows > div').first();
  await expect(terminal.locator('.xterm-rows')).toContainText('READY>');
  await terminal.locator('.xterm-screen').hover();
  await page.mouse.wheel(0, -100000);
  await expect(firstLine).toHaveText('local output 0');
  const rows = page.getByRole('separator', { name: 'Resize background rows', exact: true });
  const before = (await terminal.boundingBox())!.height;
  const renderedRows = terminal.locator('.xterm-rows > div');
  const rowCount = await renderedRows.count();
  await rows.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await terminal.boundingBox())!.height).toBeLessThan(before - 40);
  await expect.poll(() => renderedRows.count()).toBeLessThan(rowCount);
  await expect(firstLine).toHaveText('local output 0');
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await terminal.boundingBox())!.height).toBeGreaterThan(before - 2);
  await expect(renderedRows).toHaveCount(rowCount);
  await expect(firstLine).toHaveText('local output 0');
  await terminal.locator('.xterm-screen').hover();
  await page.mouse.wheel(0, 100000);
  await expect(terminal.locator('.xterm-rows')).toContainText('READY>');
  await rows.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await terminal.boundingBox())!.height).toBeLessThan(before - 40);
  await expect.poll(() => renderedRows.count()).toBeLessThan(rowCount);
  await expect(terminal.locator('.xterm-rows')).toContainText('READY>');
  await preserved(page);
});

test('keyboard positioning and small windows remain usable; detach closes only its view', async ({
  page,
}) => {
  const grip = backgroundPane(page, 'local/0').getByRole('button', {
    name: 'Move claude local',
    exact: true,
  });
  await grip.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect
    .poll(async () => {
      const [a, b] = await boxes(page);
      return a!.x > b!.x;
    })
    .toBe(true);
  await preserved(page);
  await page.setViewportSize({ width: 900, height: 640 });
  const viewport = page.getByRole('region', { name: 'Background terminal panes', exact: true });
  await expect.poll(() => viewport.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await backgroundPane(page, 'remote/1').getByTitle('Detach view; keep process running').click();
  await expect(page.locator('.session-terminal')).toHaveCount(3);
  await expect
    .poll(
      async () =>
        (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.detach').length
    )
    .toBe(1);
  expect(
    (await backgroundCalls(page)).filter(({ action }) =>
      ['pane.stop', 'pane.restart'].includes(action.method)
    )
  ).toHaveLength(0);
});
