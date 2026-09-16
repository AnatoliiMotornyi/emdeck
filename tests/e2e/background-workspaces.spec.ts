import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { SessionSnapshot } from '../../src/shared/contracts/sessions';
import {
  backgroundCalls,
  backgroundPane,
  installBackgroundLayout,
} from './fixtures/background-layout';

const rail = (page: Page) => page.getByRole('complementary', { name: 'Terminal workspaces' });
const machines = (page: Page) =>
  page.getByRole('complementary', { name: 'Background machines and agents' });
const setup = async (page: Page) => {
  await installBackgroundLayout(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await rail(page).getByRole('button', { name: 'Background machines', exact: true }).click();
  await machines(page).getByRole('button', { name: 'Connect local server', exact: true }).click();
  await machines(page).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(machines(page).getByRole('button', { name: /^codex remote/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back to sessions', exact: false }).click();
};
const launchOrdinary = async (page: Page) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code' }).click();
  await expect(page.getByRole('region', { name: 'Claude terminal', exact: true })).toBeVisible();
};
const openMixed = async (page: Page) => {
  await setup(page);
  await launchOrdinary(page);
  await rail(page).getByTitle('Focus claude local on This computer', { exact: true }).click();
  await rail(page).getByTitle('Focus codex remote on Linux server', { exact: true }).click();
  await rail(page)
    .getByRole('button', { name: /^All sessions/ })
    .click();
  await expect(page.locator('.terminal-pane:visible')).toHaveCount(3);
};

test('local and remote background sessions share workspace layouts with ordinary terminals without reconnecting', async ({
  page,
}, testInfo) => {
  await openMixed(page);
  const local = backgroundPane(page, 'local/0');
  const remote = backgroundPane(page, 'remote/1');
  const ordinary = page.getByRole('region', {
    name: 'Claude terminal',
    exact: true,
    includeHidden: true,
  });
  for (const pane of [local, remote, ordinary])
    await pane.locator('.xterm').evaluate(el => el.setAttribute('data-stable-view', 'yes'));
  for (const mode of ['Side by side', 'Stacked', 'Grid']) {
    await page.getByTitle(mode, { exact: true }).click();
    await expect(page.locator('.terminal-pane:visible')).toHaveCount(3);
    const [a, b] = await Promise.all([ordinary.boundingBox(), local.boundingBox()]);
    expect(a && b && (mode === 'Stacked' ? b.y > a.y : b.x > a.x)).toBeTruthy();
  }
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('mixed-workspace-light.png') });
  for (const view of ['server', 'panes', 'workspaces']) {
    await page.getByLabel('Terminal view').selectOption(view);
    for (const pane of [local, remote, ordinary])
      await expect(pane.locator('.xterm')).toHaveAttribute('data-stable-view', 'yes');
    await expect(page.locator('.terminal-pane:visible')).toHaveCount(
      view === 'server' ? 2 : view === 'panes' ? 1 : 3
    );
  }
  const calls = await backgroundCalls(page);
  expect(calls.filter(({ action }) => action.method === 'pane.attach')).toHaveLength(2);
  expect(
    calls.filter(({ action }) =>
      ['pane.detach', 'pane.stop', 'pane.create', 'pane.restart'].includes(action.method)
    )
  ).toHaveLength(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __layoutConnections: string[] }).__layoutConnections
    )
  ).toEqual(['local', 'remote']);
});

test('workspace discovery, attention, focus, filtering and detach use server state and preserve running processes', async ({
  page,
}) => {
  await setup(page);
  expect(
    (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.attach')
  ).toHaveLength(0);
  await page.evaluate(() => {
    const snapshots = (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
      .__layoutSnapshots;
    snapshots.local.panes[0].agent.state = 'working';
    snapshots.remote.panes[1].agent.state = 'blocked';
    snapshots.remote.panes[1].agent.reason = 'Waiting for an answer';
  });
  const remote = rail(page).getByTitle('Focus codex remote on Linux server', { exact: true });
  await expect(remote).toHaveAttribute('data-needs-attention', 'true');
  await expect(rail(page).getByTitle('Focus claude local on This computer')).toContainText(
    'Working'
  );
  await rail(page).getByRole('button', { name: 'Needs attention', exact: true }).click();
  await expect(rail(page).locator('.rail-session')).toHaveCount(1);
  await remote.click();
  const terminal = backgroundPane(page, 'remote/1');
  await expect(terminal.locator('.xterm-helper-textarea')).toBeFocused();
  await page.keyboard.type('reply from workspace');
  await expect
    .poll(async () =>
      (await backgroundCalls(page))
        .filter(({ action }) => action.method === 'pane.input')
        .map(({ action }) => (action.method === 'pane.input' ? action.params.text : ''))
        .join('')
    )
    .toContain('reply from workspace');
  await rail(page).getByRole('button', { name: 'Needs attention', exact: true }).click();
  await launchOrdinary(page);
  await expect(page.getByRole('region', { name: 'Claude terminal', exact: true })).toBeVisible();
  await rail(page)
    .getByRole('button', { name: /^All sessions/ })
    .click();
  await expect(page.locator('.terminal-pane:visible')).toHaveCount(2);
  await terminal.getByTitle('Detach view; keep process running').click();
  await expect(terminal).toHaveCount(0);
  await expect(remote).not.toContainText('Open');
  expect(
    (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.stop')
  ).toHaveLength(0);
  await remote.click();
  await expect(terminal).toBeVisible();
  await page.getByLabel('Terminal view').selectOption('panes');
  await expect(page.getByRole('region', { name: 'Claude terminal', exact: true })).toBeVisible();
});

test('background management stays in Workspaces and disconnection never claims a stale working status', async ({
  page,
}) => {
  await setup(page);
  await rail(page).getByRole('button', { name: 'Background machines', exact: true }).click();
  await machines(page)
    .getByRole('button', { name: /^claude local/ })
    .click();
  await expect(backgroundPane(page, 'local/0')).toBeVisible();
  await machines(page)
    .getByRole('button', { name: 'Collapse sessions sidebar', exact: true })
    .click();
  await expect(backgroundPane(page, 'local/0')).toBeVisible();
  await page.getByRole('button', { name: 'Back to sessions', exact: false }).click();
  await expect(page.getByLabel('Terminal view')).toHaveValue('workspaces');
  await page.getByLabel('Terminal view').selectOption('server');
  await machines(page).getByRole('button', { name: 'Show sessions sidebar', exact: true }).click();
  await machines(page).getByText('Machine settings', { exact: true }).first().click();
  await machines(page).getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await expect(rail(page).getByTitle('Focus claude local on This computer')).toContainText(
    'Offline'
  );
  await expect(backgroundPane(page, 'local/0')).toContainText('Input is disabled');
});

test('creates a background terminal explicitly and restores its workspace view after reopening', async ({
  page,
}) => {
  await setup(page);
  await rail(page).getByRole('button', { name: 'Background machines', exact: true }).click();
  await machines(page).getByText('New background terminal', { exact: true }).click();
  await expect(machines(page).getByLabel('Folder on that machine')).toHaveValue('/projects/first');
  await expect(machines(page).getByLabel('Workspace name', { exact: true })).toHaveValue('first');
  await machines(page).getByLabel('Existing workspace').selectOption('local');
  await machines(page).getByLabel('Terminal name', { exact: true }).fill('Build service');
  await machines(page).getByLabel('Agent command', { exact: true }).fill('synthetic-command');
  expect(
    (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.create')
  ).toHaveLength(0);
  await machines(page)
    .getByRole('button', { name: 'Start background terminal', exact: true })
    .click();
  await expect(backgroundPane(page, 'local/2')).toBeVisible();
  await page.getByRole('button', { name: 'Back to sessions', exact: false }).click();
  await expect(rail(page).getByTitle('Focus Build service on This computer')).toContainText('Open');
  expect(
    (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.create')
  ).toHaveLength(1);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('relay:session-views')))
    .toContain('local/2');
  const snapshots = await page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('relay:session-machines')!);
    localStorage.setItem(
      'relay:session-machines',
      JSON.stringify(profiles.map((profile: object) => ({ ...profile, enabled: false })))
    );
    return (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
      .__layoutSnapshots;
  });
  await page.reload();
  await expect(page.getByLabel('Terminal view')).toHaveValue('workspaces');
  await installBackgroundLayout(page);
  await page.evaluate(snapshots => {
    Object.assign(
      (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
        .__layoutSnapshots,
      snapshots
    );
  }, snapshots);
  await rail(page).getByRole('button', { name: 'Background machines', exact: true }).click();
  await machines(page).getByRole('button', { name: 'Connect local server', exact: true }).click();
  await expect(backgroundPane(page, 'local/2')).toBeVisible();
  expect(
    (await backgroundCalls(page)).filter(({ action }) =>
      ['pane.create', 'pane.restart', 'pane.stop'].includes(action.method)
    )
  ).toHaveLength(0);
});
