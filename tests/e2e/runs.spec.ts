interface RunFixture {
  isTauri: boolean;
  __runCalls: { command: string; args: Record<string, unknown> }[];
  __runFiles: Record<string, string>;
  __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
  __TAURI_INTERNALS__: unknown;
}
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as RunFixture;
    state.isTauri = true;
    state.__runCalls = [];
    state.__runFiles = {
      'package.json': JSON.stringify({
        scripts: { dev: 'bun server.ts', build: 'bun build src/index.ts', 'test:unit': 'bun test' },
      }),
      'bun.lock': '',
    };
    let callback = 0;
    let terminal = 0;
    state.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    state.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => ++callback,
      unregisterCallback: () => {},
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        state.__runCalls.push({ command, args });
        switch (command) {
          case 'startup_project':
            return '/projects/bun-app';
          case 'open_project':
            return {
              kind: 'opened',
              project: { root: args.path, name: String(args.path).split('/').pop() },
            };
          case 'plugin:dialog|open':
            return '/projects/second';
          case 'read_directory':
            return Object.keys(state.__runFiles).map(name => ({
              name,
              path: name,
              isDir: false,
              isSymlink: false,
            }));
          case 'read_file':
            if (!(String(args.path) in state.__runFiles)) throw 'File not found';
            return { content: state.__runFiles[String(args.path)], revision: '1' };
          case 'git_snapshot':
            return {
              available: false,
              message: 'No repository',
              branch: '',
              localBranches: [],
              remoteBranches: [],
              changes: [],
              commits: [],
            };
          case 'terminal_spawn':
            return `pty-${++terminal}`;
          default:
            return null;
        }
      },
    };
  });
  await page.goto('/');
  await expect(page.locator('.run-config')).toContainText('bun dev');
});

async function openRuns(page: Page) {
  await page.getByTitle('Manage run configurations', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Run configurations', exact: true })).toBeVisible();
  await expect(page.getByText('Checking project scripts…', { exact: true })).toHaveCount(0);
}
async function addCustom(page: Page) {
  await page.getByRole('button', { name: 'Add configuration', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('API checks');
  await page.getByLabel('Command', { exact: true }).fill('bun run check --verbose');
  await page.getByLabel('Working directory', { exact: true }).fill('apps/api');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'My commands', exact: true })).toContainText(
    'API checks'
  );
}
async function launches(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as { __runCalls: { command: string; args: Record<string, unknown> }[] }
    ).__runCalls
      .filter(call => call.command === 'terminal_spawn')
      .map(call => call.args)
  );
}

test('Bun scripts run from the picker and F5, with recent history but no automatic execution', async ({
  page,
}) => {
  expect(await launches(page)).toEqual([]);
  await openRuns(page);
  const detected = page.getByRole('region', { name: 'Detected scripts', exact: true });
  await expect(detected).toContainText('bun.lock');
  await expect(detected).toContainText('bun run dev');
  await expect(page.getByRole('region', { name: 'My commands', exact: true })).not.toContainText(
    'bun dev'
  );
  await detected.getByTitle('Run bun dev', { exact: true }).click();
  await expect
    .poll(() => launches(page))
    .toEqual([expect.objectContaining({ command: 'bun run dev', cwd: '' })]);
  await page.locator('.xterm-helper-textarea').first().focus();
  await page.keyboard.press('F5');
  await expect.poll(() => launches(page)).toHaveLength(2);
  await openRuns(page);
  const recent = page.getByRole('region', { name: 'Recently used', exact: true });
  await expect(recent.getByTitle('Run bun dev', { exact: true })).toHaveCount(1);
  await expect(recent).toContainText('Detected');
  await page.getByTitle('Clear run history', { exact: true }).click();
  await expect(recent).toContainText('Commands you launch appear here.');
  await expect(detected).toContainText('bun run dev');
});

test('custom commands persist independently while discovery refreshes and history survives reload', async ({
  page,
}) => {
  await openRuns(page);
  await addCustom(page);
  await page
    .getByRole('region', { name: 'My commands', exact: true })
    .getByTitle('Run API checks', { exact: true })
    .click();
  await expect
    .poll(() => launches(page))
    .toEqual([expect.objectContaining({ command: 'bun run check --verbose', cwd: 'apps/api' })]);
  await page.reload();
  await expect(page.locator('.run-config')).toContainText('API checks');
  await openRuns(page);
  await expect(page.getByRole('region', { name: 'Recently used', exact: true })).toContainText(
    'API checks'
  );
  await page.evaluate(() => {
    (window as unknown as RunFixture).__runFiles['package.json'] = JSON.stringify({
      packageManager: 'bun@1.3.0',
      scripts: { dev: 'bun server.ts', lint: 'eslint .' },
    });
  });
  await page.getByTitle('Refresh detected scripts', { exact: true }).click();
  const detected = page.getByRole('region', { name: 'Detected scripts', exact: true });
  await expect(detected.getByTitle('Run bun lint', { exact: true })).toBeVisible();
  await expect(detected.getByTitle('Run bun build', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'My commands', exact: true })).toContainText(
    'apps/api'
  );
  await page.screenshot({ path: 'test-results/run-picker-dark.png' });
  await page.getByLabel('Search run commands').fill('API');
  await expect(detected).toContainText('No matching detected scripts.');
  await page.getByLabel('Search run commands').fill('');
  await page
    .getByRole('region', { name: 'My commands', exact: true })
    .getByTitle('Remove API checks', { exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Recently used', exact: true })).not.toContainText(
    'API checks'
  );
  await page.reload();
  await openRuns(page);
  await expect(page.getByRole('region', { name: 'My commands', exact: true })).not.toContainText(
    'API checks'
  );
});

test('discovery can be disabled without package reads or loss of custom commands', async ({
  page,
}) => {
  await openRuns(page);
  await addCustom(page);
  await page.getByRole('checkbox', { name: /Auto-detect project scripts/ }).uncheck();
  await expect(page.getByRole('region', { name: 'Detected scripts', exact: true })).toContainText(
    'Automatic detection is off'
  );
  await page.reload();
  await expect(page.locator('.run-config')).toContainText('API checks');
  await openRuns(page);
  await expect(
    page.getByRole('checkbox', { name: /Auto-detect project scripts/ })
  ).not.toBeChecked();
  expect(
    await page.evaluate(() =>
      (window as unknown as RunFixture).__runCalls.filter(
        call => call.command === 'read_file' && call.args.path === 'package.json'
      )
    )
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByTitle('Settings', { exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: /Auto-detect project scripts/ })
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: /Auto-detect project scripts/ }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await openRuns(page);
  await expect(page.getByRole('region', { name: 'Detected scripts', exact: true })).toContainText(
    'bun run dev'
  );
  await expect(page.getByRole('region', { name: 'My commands', exact: true })).toContainText(
    'API checks'
  );
});

test('ambiguous lockfiles offer a persistent runner override and detected scripts can be customized', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as RunFixture).__runFiles['package-lock.json'] = '{}';
  });
  await openRuns(page);
  await expect(page.getByRole('region', { name: 'Detected scripts', exact: true })).toContainText(
    'Multiple lockfiles'
  );
  await page.getByLabel('Script runner', { exact: true }).selectOption('bun');
  await expect(page.getByRole('region', { name: 'Detected scripts', exact: true })).toContainText(
    'Selected for this project'
  );
  await page.getByTitle('Customize bun dev', { exact: true }).click();
  await page.getByLabel('Command', { exact: true }).fill('bun run dev --port 4000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'My commands', exact: true })).toContainText(
    'bun run dev --port 4000'
  );
  await expect(
    page.getByRole('region', { name: 'Detected scripts', exact: true })
  ).not.toContainText('--port 4000');
  await page.reload();
  await openRuns(page);
  await expect(page.getByLabel('Script runner', { exact: true })).toHaveValue('bun');
  await page.setViewportSize({ width: 900, height: 640 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await page.screenshot({ path: 'test-results/run-picker-light-small.png' });
  const box = await page
    .getByRole('region', { name: 'Run configurations', exact: true })
    .boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(640);
});

test('invalid or missing package metadata is visible and project commands stay isolated', async ({
  page,
}) => {
  await openRuns(page);
  await addCustom(page);
  await page.evaluate(() => {
    (window as unknown as RunFixture).__runFiles['package.json'] = '{ invalid';
  });
  await page.getByTitle('Refresh detected scripts', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Detected scripts', exact: true })).toContainText(
    'Could not detect scripts'
  );
  await expect(page.getByRole('region', { name: 'My commands', exact: true })).toContainText(
    'API checks'
  );
  await page.evaluate(() => {
    delete (window as unknown as RunFixture).__runFiles['package.json'];
  });
  await page.getByTitle('Refresh detected scripts', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Detected scripts', exact: true })).toContainText(
    'No package.json in the project root'
  );
  await page.keyboard.press('Escape');
  await page.locator('.project-switch').click();
  await page
    .getByRole('menuitem', { name: 'Replace project in this window…', exact: true })
    .click();
  await expect(page.locator('.project-switch')).toContainText('second');
  await openRuns(page);
  await expect(page.getByRole('region', { name: 'My commands', exact: true })).not.toContainText(
    'API checks'
  );
  await expect(page.getByRole('region', { name: 'Recently used', exact: true })).not.toContainText(
    'API checks'
  );
});
