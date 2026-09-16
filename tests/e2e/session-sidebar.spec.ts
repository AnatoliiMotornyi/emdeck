import { expect, test } from './fixtures/desktop';
import type { SessionSnapshot } from '../../src/shared/contracts/sessions';
import {
  backgroundCalls,
  backgroundPane,
  connectBackgroundLayout,
  installBackgroundLayout,
  openBackgroundPanes,
} from './fixtures/background-layout';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openBackgroundPanes(page);
  await page.locator('.session-terminal .xterm').evaluateAll(elements => {
    elements.forEach(element => element.setAttribute('data-original-session', 'true'));
  });
});

test('collapsing the sidebar gives space to terminals and preserves views, input and form drafts', async ({
  page,
}) => {
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  await rail.getByText('New background terminal', { exact: true }).click();
  await rail.getByLabel('Terminal name', { exact: true }).fill('Unsaved terminal setup');
  const viewport = page.getByRole('region', { name: 'Background terminal panes', exact: true });
  const width = await viewport.evaluate(element => element.clientWidth);
  const terminal = backgroundPane(page, 'local/0');
  await rail.getByRole('button', { name: 'Collapse sessions sidebar', exact: true }).click();
  const restore = rail.getByRole('button', { name: 'Show sessions sidebar', exact: true });
  await expect(restore).toBeFocused();
  await expect(restore).toHaveAttribute('aria-expanded', 'false');
  await expect(rail.getByLabel('Terminal name', { exact: true })).toBeHidden();
  await expect
    .poll(() => viewport.evaluate(element => element.clientWidth))
    .toBeGreaterThan(width + 200);
  await expect(page.locator('.session-terminal .xterm[data-original-session="true"]')).toHaveCount(
    4
  );
  await terminal.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('sidebar remains optional');
  await expect
    .poll(async () =>
      (await backgroundCalls(page))
        .flatMap(({ action }) => (action.method === 'pane.input' ? [action.params.text] : []))
        .join('')
    )
    .toBe('sidebar remains optional');
  await restore.focus();
  await page.keyboard.press('Enter');
  await expect(rail.getByLabel('Terminal name', { exact: true })).toHaveValue(
    'Unsaved terminal setup'
  );
  expect(
    (await backgroundCalls(page)).filter(({ action }) =>
      ['pane.detach', 'pane.stop', 'pane.restart'].includes(action.method)
    )
  ).toHaveLength(0);
});

test('machines fold independently, connection settings are grouped, and attention stays reachable while collapsed', async ({
  page,
}) => {
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  const local = rail
    .locator('.session-machine')
    .filter({ has: page.getByText('This computer', { exact: true }) });
  await expect(local.getByRole('button', { name: 'Disconnect', exact: true })).toBeHidden();
  await local.getByText('Machine settings', { exact: true }).click();
  await expect(local.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible();
  await local.getByRole('button', { name: 'Collapse This computer', exact: true }).click();
  await expect(local.getByRole('button', { name: /^claude local/ })).toBeHidden();
  await expect(rail.getByRole('button', { name: /^codex remote/ })).toBeVisible();
  await expect(page.locator('.session-terminal:visible')).toHaveCount(4);
  await page.evaluate(() => {
    const state = window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> };
    state.__layoutSnapshots.remote.panes[0].agent.state = 'blocked';
    state.__layoutSnapshots.remote.panes[0].agent.reason = 'Waiting for an answer';
    state.__layoutSnapshots.remote.revision++;
  });
  await rail.getByRole('button', { name: 'Collapse sessions sidebar', exact: true }).click();
  await rail.getByRole('button', { name: '1 session needs attention', exact: true }).click();
  await expect(rail.getByRole('checkbox', { name: 'Needs attention' })).toBeChecked();
  await expect(rail.getByRole('button', { name: /^claude remote/ })).toBeVisible();
  await expect(rail.getByRole('button', { name: /^codex remote/ })).toHaveCount(0);
  await expect(page.locator('.session-terminal .xterm[data-original-session="true"]')).toHaveCount(
    4
  );
});

test('sidebar collapse is remembered when reopening without changing saved pane layouts', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Collapse sessions sidebar', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('relay:session-sidebar-collapsed')))
    .toBe('true');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('relay:session-layout')))
    .not.toBeNull();
  const layout = await page.evaluate(() => localStorage.getItem('relay:session-layout'));
  await page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('relay:session-machines')!);
    localStorage.setItem(
      'relay:session-machines',
      JSON.stringify(profiles.map((profile: object) => ({ ...profile, enabled: false })))
    );
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Show sessions sidebar', exact: true })
  ).toBeVisible();
  await installBackgroundLayout(page);
  await page.getByRole('button', { name: 'Show sessions sidebar', exact: true }).click();
  await connectBackgroundLayout(page);
  await expect(page.locator('.session-terminal:visible')).toHaveCount(4);
  expect(await page.evaluate(() => localStorage.getItem('relay:session-layout'))).toBe(layout);
});

test('sidebar controls remain reachable in a short window and both themes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1000, height: 640 });
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  const body = rail.locator('.session-sidebar-body');
  for (const theme of ['Dark', 'Light']) {
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await rail.getByText('Pair a machine over Tailscale', { exact: true }).scrollIntoViewIfNeeded();
    await expect(
      rail.getByRole('button', { name: 'Collapse sessions sidebar', exact: true })
    ).toBeInViewport();
    await expect
      .poll(() => body.evaluate(element => element.scrollHeight > element.clientHeight))
      .toBe(true);
    await body.evaluate(element => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: testInfo.outputPath(`sidebar-${theme.toLowerCase()}.png`) });
  }
  await rail.getByRole('button', { name: 'Collapse sessions sidebar', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('sidebar-collapsed.png') });
  await expect(page.locator('.session-terminal .xterm[data-original-session="true"]')).toHaveCount(
    4
  );
});
