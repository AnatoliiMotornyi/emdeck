import { test, expect } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { TerminalEvent } from '../../src/shared/contracts/workspace';

const emit = async (page: Page, id: number, event: TerminalEvent) =>
  page.evaluate(
    ({ id, event }) => {
      (
        window as unknown as { __emdeckEmitTerminal: (id: string, event: TerminalEvent) => void }
      ).__emdeckEmitTerminal(`pty-${id}`, event);
    },
    { id, event }
  );

const screen = async (page: Page, id: number, text: string) =>
  emit(page, id, {
    type: 'data',
    data: [...new TextEncoder().encode(`\x1b[2J\x1b[H\x1b[999;1H${text}`)],
  });

const launch = async (page: Page, id: number, title: string) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code' }).click();
  await expect(page.locator('.terminal-pane')).toHaveCount(id + 1);
  await emit(page, id, {
    type: 'data',
    data: [...new TextEncoder().encode(`\x1b]2;${title}\x07`)],
  });
  await expect(page.getByRole('region', { name: `${title} terminal`, exact: true })).toBeVisible();
};

const setup = async (page: Page) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  for (const [id, title] of ['Architecture', 'Permissions', 'Building', 'Review'].entries())
    await launch(page, id, title);
  await screen(
    page,
    0,
    'Which database should we use?\r\n❯ 1. SQLite\r\n  2. PostgreSQL\r\nEnter to select · Esc to cancel'
  );
  await screen(page, 1, 'Would you like to run this command?\r\n❯ 1. Yes\r\n  2. No');
  await screen(page, 2, 'Working...\r\nEsc to interrupt');
  await screen(page, 3, 'All requested changes are complete.\r\n›');
  const rail = page.getByRole('complementary', { name: 'Terminal workspaces' });
  await expect(rail.getByTitle('Focus Architecture', { exact: true })).toContainText(
    'Waiting for answer'
  );
  await expect(rail.getByTitle('Focus Permissions', { exact: true })).toContainText(
    'Needs approval'
  );
  await expect(rail.getByTitle('Focus Building', { exact: true })).toContainText('Working');
  await expect(rail.getByTitle('Focus Review', { exact: true })).toContainText('Ready');
  return rail;
};

for (const theme of ['Dark', 'Light', 'Graphite']) {
  test(`workspace statuses have distinct, readable badges in ${theme}`, async ({
    page,
  }, testInfo) => {
    const rail = await setup(page);
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.keyboard.press('Escape');
    const badges = rail.locator('.rail-status');
    const colors = await badges.evaluateAll(elements =>
      elements.map(element => {
        const style = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const luminance = (color: string) => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => {
            const normalized = value / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return {
          color: style.color,
          border: getComputedStyle(element.closest('button')!).borderLeftColor,
          title: getComputedStyle(element.closest('button')!.querySelector('strong')!).color,
          contrast:
            (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
          fits:
            element.scrollWidth <= element.clientWidth &&
            element.scrollHeight <= element.clientHeight,
        };
      })
    );
    expect(new Set(colors.map(color => color.color)).size).toBe(4);
    for (const color of colors) {
      expect(color.contrast).toBeGreaterThanOrEqual(4.5);
      expect(color.border).toBe(color.color);
      expect(color.title).toBe(color.color);
      expect(color.fits).toBe(true);
    }
    await expect(badges.locator('svg')).toHaveCount(4);
    await expect(rail.getByLabel('2 sessions need attention')).toBeVisible();
    for (const title of ['Architecture', 'Permissions', 'Review', 'Building']) {
      const row = rail.getByTitle(`Focus ${title}`, { exact: true });
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'true');
      // Selecting a session focuses its terminal on the next animation frame.
      // Wait for that handoff before testing keyboard navigation back to the rail.
      const terminal = page.getByRole('region', { name: `${title} terminal`, exact: true });
      await expect(terminal.getByRole('textbox', { name: 'Terminal input' })).toBeFocused();
      const tabOrder = ['Architecture', 'Permissions', 'Building', 'Review'];
      const index = tabOrder.indexOf(title);
      const previous = index
        ? rail.getByTitle(`Focus ${tabOrder[index - 1]}`, { exact: true })
        : rail.getByRole('button', { name: 'Needs attention', exact: true });
      await previous.focus();
      await page.keyboard.press('Tab');
      await expect(row).toBeFocused();
      // Selection and keyboard focus must not restore the global green accent.
      const selected = await row.evaluate(element => ({
        focused: element.matches(':focus-visible'),
        badge: getComputedStyle(element.querySelector('.rail-status')!).color,
        title: getComputedStyle(element.querySelector('strong')!).color,
        dot: getComputedStyle(element.querySelector('i')!).backgroundColor,
        border: getComputedStyle(element).borderLeftColor,
        outline: getComputedStyle(element).outlineColor,
      }));
      expect(selected.focused).toBe(true);
      expect(selected.title).toBe(selected.badge);
      expect(selected.dot).toBe(selected.badge);
      expect(selected.border).toBe(selected.badge);
      expect(selected.outline).toBe(selected.badge);
    }
    await page.mouse.move(0, 0);
    await rail.screenshot({
      path: testInfo.outputPath(`session-status-${theme.toLowerCase()}.png`),
    });
    await rail.getByTitle('Focus Building', { exact: true }).screenshot({
      path: testInfo.outputPath(`selected-working-${theme.toLowerCase()}.png`),
    });
  });
}

test('attention includes questions and approvals and clears when agents resume or exit without restarting terminals', async ({
  page,
}) => {
  const rail = await setup(page);
  await page
    .locator('.xterm')
    .evaluateAll(elements =>
      elements.forEach(element => element.setAttribute('data-preserved', 'yes'))
    );
  const attention = rail.getByRole('button', { name: 'Needs attention', exact: true });
  await attention.click();
  await expect(rail.locator('.rail-session')).toHaveCount(2);
  await rail.getByTitle('Focus Architecture', { exact: true }).click();
  const questionTerminal = page.getByRole('region', { name: 'Architecture terminal', exact: true });
  await expect(questionTerminal).toBeVisible();
  await expect(rail.getByTitle('Focus Architecture', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await screen(page, 0, 'Working...\r\nEsc to interrupt');
  await expect(rail.locator('.rail-session')).toHaveCount(1);
  await expect(questionTerminal).toBeVisible();
  await emit(page, 1, { type: 'exit', code: 0 });
  await expect(rail.locator('.rail-session')).toHaveCount(0);
  await expect(rail.getByLabel('0 sessions need attention')).toBeVisible();
  await attention.click();
  await screen(page, 0, 'What should I implement next?\r\n›');
  await expect(rail.getByTitle('Focus Architecture', { exact: true })).toContainText(
    'Waiting for answer'
  );
  await screen(page, 0, 'Implemented the changes.\r\n›');
  await expect(rail.getByTitle('Focus Architecture', { exact: true })).toContainText('Ready');
  await expect(rail.getByTitle('Focus Permissions', { exact: true })).toContainText('Exited');
  await expect(page.locator('.xterm[data-preserved="yes"]')).toHaveCount(4);
  const calls = await page.evaluate(
    () => (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls
  );
  expect(calls.filter(call => call.command === 'terminal_spawn')).toHaveLength(4);
  expect(calls.filter(call => call.command === 'terminal_close')).toHaveLength(0);
});

test('live work above the composer stays visible in status across tall screens, soft wraps and output pauses', async ({
  page,
}) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await launch(page, 0, 'Live work');
  const row = page
    .getByRole('complementary', { name: 'Terminal workspaces' })
    .getByTitle('Focus Live work', { exact: true });
  await screen(page, 0, '❯');
  await expect(row).toContainText('Ready');
  const cols = await page.evaluate(() => {
    const calls = (
      window as unknown as { __emdeckCalls: { command: string; args: { cols: number } }[] }
    ).__emdeckCalls;
    return calls.filter(call => call.command === 'terminal_resize').at(-1)!.args.cols;
  });
  // Split the interrupt label at a real xterm soft wrap, without a known verb.
  await screen(page, 0, `${' '.repeat(cols - 3)}esc to interrupt\r\n❯`);
  await expect(row).toContainText('Working');
  await screen(page, 0, '✻ Cooked for 2s\r\n❯');
  await expect(row).toContainText('Ready');
  await emit(page, 0, {
    type: 'data',
    data: [...new TextEncoder().encode('\x1b[2J\x1b[H✻ Channelling…\r\n❯\r\n? for shortcuts')],
  });
  await expect(row).toContainText('Working');
  await screen(page, 0, `✢ Percolating…${'\r\n'.repeat(19)}❯\r\n? for shortcuts`);
  await expect(row).toContainText('Working');
  // The connection's output timer expires, but that does not complete a task.
  await page.waitForTimeout(1700);
  await expect(row).toContainText('Working');
  await screen(page, 0, 'Tool output still streaming');
  await expect(row).toContainText('Working');
  await screen(page, 0, 'Intermediate response\r\n❯\r\n? for shortcuts');
  await expect(row).toContainText('Activity unknown');
  await screen(page, 0, 'Implemented the change.\r\n✻ Cooked for 12s\r\n❯');
  await expect(row).toContainText('Ready');
});

test('submitting a task clears Ready before the agent repaints without remounting the terminal', async ({
  page,
}) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await launch(page, 0, 'Submitting');
  const row = page
    .getByRole('complementary', { name: 'Terminal workspaces' })
    .getByTitle('Focus Submitting', { exact: true });
  await screen(page, 0, '✻ Cooked for 5s\r\n❯\r\n? for shortcuts');
  await expect(row).toContainText('Ready');
  await page.locator('.xterm').evaluate(element => element.setAttribute('data-preserved', 'yes'));
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('Implement the feature');
  await page.keyboard.press('Enter');
  await expect(row).toContainText('Working');
  await screen(page, 0, '✻ Cooked for 5s\r\n❯\r\n? for shortcuts');
  await expect(row).toContainText('Working');
  await screen(page, 0, '✻ Channelling…\r\n❯');
  await expect(row).toContainText('Working');
  await screen(page, 0, 'Done.\r\n✻ Cooked for 15s\r\n❯');
  await expect(row).toContainText('Ready');
  await expect(page.locator('.xterm[data-preserved="yes"]')).toHaveCount(1);
});

test('Claude completion clears Working with background shells and an unsent composer draft', async ({
  page,
}) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await launch(page, 0, 'Completed task');
  const row = page
    .getByRole('complementary', { name: 'Terminal workspaces' })
    .getByTitle('Focus Completed task', { exact: true });
  const terminal = page.getByRole('region', { name: 'Completed task terminal', exact: true });
  await screen(page, 0, '✻ Channelling… (3m · esc to interrupt)\r\n❯');
  await expect(row).toContainText('Working');
  await terminal
    .locator('.xterm')
    .evaluate(element => element.setAttribute('data-preserved', 'yes'));
  const done = '※ Worked for 3m 12s · done 10:24 · 2 shells still running';
  const completedScreen = [
    'Implemented the change and ran the tests.',
    done,
    '────',
    '❯',
    '────',
    'Emdeck · Example model · 52% context',
    'auto mode on · 2 shells · 1 agent',
  ];
  await screen(page, 0, completedScreen.join('\r\n'));
  await expect(row).toContainText('Ready');
  await expect(terminal.locator('.pane-state')).toContainText('Ready');
  await terminal.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('A draft for later');
  await screen(
    page,
    0,
    completedScreen.map(line => (line === '❯' ? '❯ A draft for later' : line)).join('\r\n')
  );
  await expect(row).toContainText('Ready');
  await page.keyboard.press('Enter');
  await expect(row).toContainText('Working');
  await screen(page, 0, completedScreen.join('\r\n').replaceAll('2 shells', '1 shell'));
  await expect(row).toContainText('Working');
  // The next final footer must finish the new task even with an unfamiliar footer.
  await screen(
    page,
    0,
    `Implemented the next change.\r\n${done.replace('10:24', '10:25')}\r\n❯\r\nCustom footer: 2 jobs`
  );
  await expect(row).toContainText('Ready');
  await expect(terminal.locator('.pane-state')).toContainText('Ready');
  await expect(terminal.locator('.xterm[data-preserved="yes"]')).toHaveCount(1);
});

test('a wrapped Claude done footer supersedes an old working row without a visible composer', async ({
  page,
}) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await launch(page, 0, 'Wrapped completion');
  const row = page
    .getByRole('complementary', { name: 'Terminal workspaces' })
    .getByTitle('Focus Wrapped completion', { exact: true });
  await screen(page, 0, '✻ Channelling…\r\n❯');
  await expect(row).toContainText('Working');
  const cols = await page.evaluate(() => {
    const calls = (
      window as unknown as { __emdeckCalls: { command: string; args: { cols: number } }[] }
    ).__emdeckCalls;
    return calls.filter(call => call.command === 'terminal_resize').at(-1)!.args.cols;
  });
  await screen(
    page,
    0,
    `✻ Channelling…\r\nImplemented the change.\r\n${' '.repeat(cols - 24)}✼ Worked for 3m 12s · done 10:24 · 2 shells still running`
  );
  await expect(row).toContainText('Ready');
  await expect(page.locator('.pane-state')).toContainText('Ready');
});
