import { expect, test } from './fixtures/desktop';
import { installTerminalClipboard } from './fixtures/terminal-clipboard';
import type { Page } from './fixtures/desktop';

const writes = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __emdeckCalls: { command: string; args: { data?: string } }[] }
    ).__emdeckCalls.flatMap(call => (call.command === 'terminal_write' ? [call.args.data] : []))
  );

test.beforeEach(async ({ page }) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Claude terminal' })).toBeVisible();
  await page.locator('.xterm-helper-textarea').focus();
});

test('paste keys reach native clipboard handling once, preserving multiline bracketed paste', async ({
  page,
}) => {
  await page.evaluate(() =>
    (
      window as unknown as { __emdeckEmitTerminal: (id: string, event: unknown) => void }
    ).__emdeckEmitTerminal('pty-0', {
      type: 'data',
      data: Array.from(new TextEncoder().encode('\x1b[?2004hREADY')),
    })
  );
  await expect(page.locator('.terminal-host')).toContainText('READY');
  const input = page.locator('.xterm-helper-textarea');
  await installTerminalClipboard(input);
  const expected: string[] = [];
  for (const shortcut of ['Control+v', 'Control+Shift+V', 'Meta+v', 'Shift+Insert']) {
    await page.keyboard.press(shortcut);
    await expect(input).toHaveAttribute('data-paste-allowed', 'true');
    expected.push('\x1b[200~first line\rsecond line\x1b[201~');
    await expect.poll(() => writes(page)).toEqual(expected);
  }
});

test('Shift+Enter and Ctrl+Enter break the line while submit, interrupt, Ctrl+J and Alt+Enter remain intact', async ({
  page,
}) => {
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+j');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.press('Control+c');
  await expect
    .poll(() => writes(page))
    .toEqual(['\x1b[13;2u', '\x1b[13;2u', '\r', '\n', '\x1b\r', '\x03']);
});

test('Ctrl+V retains image paste instead of falling back to text-only clipboard reads', async ({
  page,
}) => {
  await page.evaluate(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: { invoke: (command: string, args?: unknown) => Promise<unknown> };
    };
    const original = state.__TAURI_INTERNALS__.invoke;
    state.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const result = await original(command, args);
      return command === 'terminal_attachment' ? "'C:/fixture/fixture.png' " : result;
    };
  });
  await installTerminalClipboard(page.locator('.xterm-helper-textarea'), true);
  await page.keyboard.press('Control+v');
  await expect.poll(() => writes(page)).toEqual(["'C:/fixture/fixture.png' "]);
});
