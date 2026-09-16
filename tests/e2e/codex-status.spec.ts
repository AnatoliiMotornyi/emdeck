import { test, expect } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';

const output = async (page: Page, data: string) =>
  page.evaluate(data => {
    (
      window as unknown as {
        __emdeckEmitTerminal: (id: string, event: { type: string; data: number[] }) => void;
      }
    ).__emdeckEmitTerminal('pty-0', { type: 'data', data: [...new TextEncoder().encode(data)] });
  }, data);

const screen = (page: Page, text: string, title?: string) =>
  output(
    page,
    `${title === undefined ? '' : `\x1b]0;${title}\x07`}\x1b[2J\x1b[H\x1b[999;1H${text}`
  );
const composer =
  '\x1b[1m›\x1b[0m \x1b[2mAsk Codex to do anything\x1b[0m\r\n  gpt-5 default · /tmp/example';

const launch = async (page: Page) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Codex OpenAI coding agent' }).click();
  await expect(page.locator('.terminal-pane')).toHaveCount(1);
  const row = page
    .getByRole('complementary', { name: 'Terminal workspaces' })
    .locator('.rail-session');
  return row;
};

test('Codex stays Working through streamed answers and becomes Ready from its title signal', async ({
  page,
}) => {
  const row = await launch(page);
  await screen(page, composer, 'Implement feature | example');
  await expect(row).toContainText('Ready');
  await page.locator('.xterm').evaluate(element => element.setAttribute('data-preserved', 'yes'));
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('Implement the feature');
  await page.keyboard.press('Enter');
  await expect(row).toContainText('Working');
  await screen(
    page,
    `• Working (12s • esc to interrupt)\r\n${composer}`,
    '⠋ Implement feature | example'
  );
  await expect(row).toContainText('Working');
  // The old Worked-for divider precedes the final answer, which still streams.
  await screen(
    page,
    `── Worked for 12s ──\r\n• First paragraph\r\n${composer}`,
    '⠙ Implement feature | example'
  );
  await expect(row).toContainText('Working');
  await page.waitForTimeout(1700);
  await expect(row).toContainText('Working');
  await screen(page, `• Another paragraph\r\n${composer}`);
  await expect(row).toContainText('Working');
  // Exercise a title-only completion update, with no completion marker/repaint.
  await output(page, '\x1b]0;Implement feature | example\x07');
  await expect(row).toContainText('Ready');
  const colors = await row.evaluate(element => ({
    title: getComputedStyle(element.querySelector('strong')!).color,
    badge: getComputedStyle(element.querySelector('.rail-status')!).color,
  }));
  expect(colors.title).toBe(colors.badge);
  await expect(page.locator('.xterm[data-preserved="yes"]')).toHaveCount(1);
});

test('Codex approvals and question forms appear in attention, including freeform and multiple questions', async ({
  page,
}) => {
  const row = await launch(page);
  const rail = page.getByRole('complementary', { name: 'Terminal workspaces' });
  await screen(page, `• Working (1s • esc to interrupt)\r\n${composer}`, '⠋ example');
  await expect(row).toContainText('Working');
  await screen(
    page,
    'Would you like to make the following edits?\r\n› 1. Yes, proceed (y)\r\n  2. No (esc)\r\nPress enter to confirm or esc to cancel',
    '[ ! ] Action Required | example'
  );
  await expect(row).toContainText('Needs approval');
  await expect(rail.getByLabel('1 sessions need attention')).toBeVisible();
  await screen(
    page,
    'Question 1/2 (2 unanswered)\r\nChoose a storage engine.\r\n› 1. SQLite\r\n  2. PostgreSQL\r\ntab to add notes | enter to submit answer | esc to interrupt',
    '[ . ] Action Required | example'
  );
  await expect(row).toContainText('Waiting for answer');
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.press('Enter');
  await screen(
    page,
    'Question 2/2 (1 unanswered)\r\nShare details.\r\n› \x1b[2mType your answer (optional)\x1b[0m\r\nenter to submit all | esc to interrupt'
  );
  await expect(row).toContainText('Waiting for answer');
  await page.keyboard.type('Keep it local');
  await page.keyboard.press('Enter');
  await screen(page, `• Working (2s • esc to interrupt)\r\n${composer}`, '⠹ example');
  await expect(row).toContainText('Working');
  await expect(rail.getByLabel('0 sessions need attention')).toBeVisible();
  await page.keyboard.press('Escape');
  await screen(page, `Turn interrupted.\r\n${composer}`, 'example');
  await expect(row).toContainText('Ready');
  const calls = await page.evaluate(
    () => (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls
  );
  expect(calls.filter(call => call.command === 'terminal_spawn')).toHaveLength(1);
  expect(calls.filter(call => call.command === 'terminal_close')).toHaveLength(0);
});

test('Codex question footer survives a narrow terminal and hidden activity titles use conservative fallback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 850, height: 700 });
  const row = await launch(page);
  await screen(
    page,
    'Question 1/1 (1 unanswered)\r\nChoose a storage engine.\r\n› 1. SQLite\r\n  2. PostgreSQL\r\ntab to add notes | enter to submit answer | esc to interrupt'
  );
  await expect(row).toContainText('Waiting for answer');
  await screen(page, `• Working (2s • esc to interrupt)\r\n${composer}`);
  await expect(row).toContainText('Working');
  await screen(page, `── Worked for 12s ──\r\nStill streaming\r\n${composer}`);
  await expect(row).toContainText('Working');
  await screen(page, `Final answer\r\nWorked for 12s · done 10:42\r\n${composer}`);
  await expect(row).toContainText('Ready');
});
