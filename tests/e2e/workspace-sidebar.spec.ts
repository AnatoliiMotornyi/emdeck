import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { SessionSnapshot } from '../../src/shared/contracts/sessions';
import type { TerminalEvent } from '../../src/shared/contracts/workspace';
import {
  backgroundCalls,
  backgroundPane,
  connectBackgroundLayout,
  installBackgroundLayout,
} from './fixtures/background-layout';

const rail = (page: Page) => page.getByRole('complementary', { name: 'Terminal workspaces' });
const emit = async (page: Page, id: number, event: TerminalEvent) =>
  page.evaluate(
    ({ id, event }) => {
      (
        window as unknown as { __emdeckEmitTerminal: (id: string, event: TerminalEvent) => void }
      ).__emdeckEmitTerminal(`pty-${id}`, event);
    },
    { id, event }
  );
const text = (value: string): TerminalEvent => ({
  type: 'data',
  data: [...new TextEncoder().encode(value)],
});
const launch = async (page: Page, id: number, name: string) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code' }).click();
  await expect(page.locator('.terminal-pane')).toHaveCount(id + 1);
  await emit(page, id, text(`\x1b]2;${name}\x07`));
  await expect(rail(page).getByTitle(`Focus ${name}`, { exact: true })).toBeVisible();
};
const setup = async (page: Page) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  const rows = [
    [
      'Architecture',
      'question',
      'Which database?\r\n❯ 1. SQLite\r\n  2. PostgreSQL\r\nEnter to select · Esc to cancel',
    ],
    ['Permissions', 'approval', 'Would you like to run this command?\r\n❯ 1. Yes\r\n  2. No'],
    ['Building', 'working', 'Working...\r\nEsc to interrupt'],
    ['Review', 'ready', 'All changes are complete.\r\n›'],
  ];
  for (const [id, [name, status, screen]] of rows.entries()) {
    await launch(page, id, name);
    await emit(page, id, text(`\x1b[2J\x1b[H\x1b[999;1H${screen}`));
    await expect(rail(page).getByTitle(`Focus ${name}`, { exact: true })).toHaveAttribute(
      'data-status',
      status
    );
  }
  await page
    .locator('.xterm')
    .evaluateAll(elements => elements.forEach(el => el.setAttribute('data-stable', 'yes')));
};
const collapse = (page: Page) =>
  rail(page).getByRole('button', { name: 'Collapse workspace sidebar', exact: true }).click();
const expand = (page: Page) =>
  rail(page).getByRole('button', { name: 'Expand workspace sidebar', exact: true }).click();
const colors = (page: Page) =>
  rail(page)
    .locator('.rail-session')
    .evaluateAll(elements =>
      elements.map(el => ({
        status: el.getAttribute('data-status'),
        title: getComputedStyle(el.querySelector('strong')!).color,
        badge: getComputedStyle(el.querySelector('.rail-status')!).color,
        border: getComputedStyle(el).borderLeftColor,
        dot: getComputedStyle(el.querySelector('i')!).backgroundColor,
      }))
    );

for (const theme of ['Dark', 'Light', 'Graphite']) {
  test(`compact workspace jobs retain status colors and keyboard selection in ${theme}`, async ({
    page,
  }, testInfo) => {
    await setup(page);
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.keyboard.press('Escape');
    const original = await colors(page);
    const width = (await rail(page).boundingBox())!.width;
    await collapse(page);
    await expect(rail(page)).toHaveClass(/is-collapsed/);
    expect((await rail(page).boundingBox())!.width).toBeLessThan(width / 2);
    expect(await colors(page)).toEqual(original);
    expect(new Set(original.map(row => row.badge)).size).toBe(4);
    for (const row of original) {
      expect(row.title).toBe(row.badge);
      expect(row.border).toBe(row.badge);
      expect(row.dot).toBe(row.badge);
    }
    await expect(rail(page).getByLabel('Find terminal sessions')).toBeHidden();
    await expect(rail(page).locator('.rail-job-avatar')).toHaveCount(4);
    await expect(rail(page).locator('.rail-status svg')).toHaveCount(4);
    const question = rail(page).getByRole('button', { name: /^Architecture — Waiting for answer/ });
    await expect(question).toHaveAttribute(
      'title',
      /Architecture.*Waiting for answer.*claude.*first/
    );
    await rail(page).getByRole('button', { name: 'Needs attention', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(question).toBeFocused();
    expect(await question.evaluate(el => getComputedStyle(el).outlineColor)).toBe(
      original[0].badge
    );
    await page.keyboard.press('Enter');
    await expect(question).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page
        .getByRole('region', { name: 'Architecture terminal', exact: true })
        .getByRole('textbox', { name: 'Terminal input' })
    ).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`compact-workspaces-${theme.toLowerCase()}.png`),
    });
    await expand(page);
    expect(await colors(page)).toEqual(original);
    await expect(page.locator('.xterm[data-stable="yes"]')).toHaveCount(4);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
            call => call.command === 'terminal_close'
          ).length
      )
    ).toBe(0);
  });
}

test('compact attention updates live, preserves expanded search and remembers collapsed preference', async ({
  page,
}) => {
  await setup(page);
  await rail(page).getByLabel('Find terminal sessions').fill('Building');
  await expect(rail(page).locator('.rail-session')).toHaveCount(1);
  await collapse(page);
  await expect(rail(page).locator('.rail-session')).toHaveCount(4);
  await rail(page).getByRole('button', { name: 'Needs attention', exact: true }).click();
  await expect(rail(page).locator('.rail-session')).toHaveCount(2);
  await emit(page, 0, text('\x1b[2J\x1b[H\x1b[999;1HWorking...\r\nEsc to interrupt'));
  await expect(rail(page).locator('.rail-session')).toHaveCount(1);
  await expect(rail(page).getByLabel('1 sessions need attention')).toBeVisible();
  await expand(page);
  await expect(rail(page).getByLabel('Find terminal sessions')).toHaveValue('Building');
  await expect(
    rail(page).getByRole('button', { name: 'Needs attention', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await rail(page).getByRole('button', { name: 'Needs attention', exact: true }).click();
  await expect(rail(page).locator('.rail-session')).toHaveCount(1);
  await collapse(page);
  for (const view of ['panes', 'workspaces'])
    await page.getByLabel('Terminal view').selectOption(view);
  await expect(rail(page)).toHaveClass(/is-collapsed/);
  await expect(page.locator('.xterm[data-stable="yes"]')).toHaveCount(4);
  await page.reload();
  await expect(rail(page)).toHaveClass(/is-collapsed/);
  await expect(rail(page).getByText('Your agents will appear here.')).toBeVisible();
  await rail(page).getByRole('button', { name: 'Launch an agent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Claude Claude Code' })).toBeVisible();
});

test('compact jobs include remote background sessions, update their status and attach only on selection', async ({
  page,
}) => {
  await installBackgroundLayout(page);
  await connectBackgroundLayout(page);
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await launch(page, 0, 'Local job');
  await collapse(page);
  await expect(rail(page).locator('.rail-session')).toHaveCount(5);
  expect(
    (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.attach')
  ).toHaveLength(0);
  const remote = rail(page).getByRole('button', { name: /^codex remote —.*Linux server/ });
  await remote.click();
  const terminal = backgroundPane(page, 'remote/1');
  await expect(terminal.locator('.xterm-helper-textarea')).toBeFocused();
  await terminal.locator('.xterm').evaluate(el => el.setAttribute('data-stable', 'remote'));
  await page.evaluate(() => {
    const pane = (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
      .__layoutSnapshots.remote.panes[1];
    pane.agent.state = 'blocked';
    pane.agent.reason = 'Waiting for an answer';
  });
  await expect(remote).toHaveAttribute('data-status', 'question');
  await expect(remote).toHaveAttribute('aria-pressed', 'true');
  await expect(rail(page).getByLabel('1 sessions need attention')).toBeVisible();
  await page.keyboard.type('answer from compact rail');
  await expect
    .poll(async () =>
      (await backgroundCalls(page))
        .filter(({ action }) => action.method === 'pane.input')
        .map(({ action }) => (action.method === 'pane.input' ? action.params.text : ''))
        .join('')
    )
    .toContain('answer from compact rail');
  await rail(page).getByRole('button', { name: 'Background machines', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Background machines and agents' })
  ).toBeVisible();
  await page.getByRole('button', { name: /Back to sessions/ }).click();
  await expect(rail(page)).toHaveClass(/is-collapsed/);
  await expect(terminal.locator('.xterm')).toHaveAttribute('data-stable', 'remote');
  const calls = await backgroundCalls(page);
  expect(calls.filter(({ action }) => action.method === 'pane.attach')).toHaveLength(1);
  expect(
    calls.filter(({ action }) =>
      ['pane.detach', 'pane.stop', 'pane.restart', 'pane.create'].includes(action.method)
    )
  ).toHaveLength(0);
});

test('a short compact rail scrolls all jobs without clipping its controls or showing an idle scrollbar', async ({
  page,
}, testInfo) => {
  await installBackgroundLayout(page);
  await page.evaluate(() => {
    const snapshot = (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
      .__layoutSnapshots.local;
    snapshot.panes = Array.from({ length: 18 }, (_, id) => ({
      ...structuredClone(snapshot.panes[0]),
      id: String(id),
      title: `Job ${id + 1}`,
    }));
  });
  await connectBackgroundLayout(page);
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await collapse(page);
  await page.setViewportSize({ width: 950, height: 420 });
  const list = rail(page).locator('.rail-sessions');
  expect(await rail(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.mouse.move(940, 0);
  const idle = await list.evaluate(el => getComputedStyle(el).scrollbarColor);
  await list.hover();
  expect(await list.evaluate(el => getComputedStyle(el).scrollbarColor)).not.toBe(idle);
  const last = rail(page).locator('.rail-session').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await expect(
    rail(page).getByRole('button', { name: 'Expand workspace sidebar', exact: true })
  ).toBeInViewport();
  await rail(page).getByRole('button', { name: 'Manage remote connections', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Remote connections', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await rail(page).locator('.rail-session').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('compact-workspaces-short.png') });
});
