import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
async function requestClose(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as Record<string, unknown>).__emdeckCloseReady)
    )
    .toBe(true);
  await page.evaluate(() => {
    const state = window as unknown as {
      __emdeckCloseTasks: Promise<void>[];
      __emdeckRequestClose: () => Promise<void>;
    };
    state.__emdeckCloseTasks.push(state.__emdeckRequestClose());
  });
}
async function destroyedWindows(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      (window as unknown as { __emdeckCloseTasks: Promise<void>[] }).__emdeckCloseTasks
    );
  });
  return page.evaluate(
    () => (window as unknown as { __emdeckDestroyed: string[] }).__emdeckDestroyed
  );
}
test('startup reopens the last closed project without starting terminals or creating another window', async ({
  page,
}) => {
  // Another window may have opened more recently; closing this one should remember it.
  await page.evaluate(() =>
    localStorage.setItem(
      'relay:last-project',
      JSON.stringify({ root: '/projects/other', name: 'other' })
    )
  );
  await requestClose(page);
  expect(await destroyedWindows(page)).toEqual(['main']);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('relay:last-project')!).root)
  ).toBe('/projects/first');
  await page.evaluate(() => localStorage.setItem('test:startup', 'null'));
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('first');
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __emdeckCalls: { command: string; args: Record<string, unknown> }[] })
        .__emdeckCalls
  );
  expect(calls.filter(call => call.command === 'open_project').map(call => call.args.path)).toEqual(
    ['/projects/first']
  );
  expect(
    calls.filter(call => ['terminal_spawn', 'open_project_window'].includes(call.command))
  ).toEqual([]);
});
test('startup upgrades the recent-project list and remembers the last focused workspace', async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.removeItem('relay:last-project');
    localStorage.setItem('test:startup', 'null');
  });
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('first');
  await page.evaluate(() => {
    localStorage.setItem(
      'relay:last-project',
      JSON.stringify({ root: '/projects/other', name: 'other' })
    );
    window.dispatchEvent(new Event('focus'));
  });
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('relay:last-project')!).root)
  ).toBe('/projects/first');
});
test('startup restore can be disabled while explicit new-window projects still take priority', async ({
  page,
}) => {
  await page.getByTitle('Settings', { exact: true }).click();
  // Startup is a global-only section: reopenLastProject is read before any
  // project exists, so it cannot be scoped to one. With a project open the
  // panel starts in project scope, so the scope has to be switched first.
  await page
    .getByRole('group', { name: 'Settings scope' })
    .getByRole('button', { name: /All projects/ })
    .click();
  await expect(
    page.getByRole('checkbox', { name: /Reopen last project on startup/ })
  ).toBeChecked();
  await page.getByRole('checkbox', { name: /Reopen last project on startup/ }).uncheck();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('test:startup', 'null'));
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('Open workspace');
  await expect(page.getByRole('tree', { name: 'Project files' })).toHaveCount(0);
  await page.getByTitle('Settings', { exact: true }).click();
  // No project is open here, so the panel is already forced to global scope.
  await expect(
    page.getByRole('checkbox', { name: /Reopen last project on startup/ })
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.evaluate(() =>
    localStorage.setItem('test:startup', JSON.stringify('/projects/explicit'))
  );
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('explicit');
});
test('an unavailable remembered project leaves a usable welcome screen', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('test:startup', 'null');
    localStorage.setItem('test:missing-project', '/projects/missing');
    localStorage.setItem(
      'relay:last-project',
      JSON.stringify({ root: '/projects/missing', name: 'missing' })
    );
  });
  await page.reload();
  await expect(
    page.getByText('Project folder no longer exists. Open another folder.', { exact: true })
  ).toBeVisible();
  await expect(page.locator('.project-switch')).toContainText('Open workspace');
  await page.locator('.project-switch').click();
  await page.getByRole('menuitem', { name: 'Open project in this window…', exact: true }).click();
  await expect(page.locator('.project-switch')).toContainText('second');
});
test('a delayed startup restore never replaces a project opened by the user', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('test:startup', 'null');
    localStorage.setItem('test:delay-startup', 'true');
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof (window as unknown as Record<string, unknown>).__emdeckReleaseStartup
      )
    )
    .toBe('function');
  await page.locator('.project-switch').click();
  await page.getByRole('menuitem', { name: 'Open project in this window…', exact: true }).click();
  await expect(page.locator('.project-switch')).toContainText('second');
  await page.evaluate(() =>
    (window as unknown as { __emdeckReleaseStartup: () => void }).__emdeckReleaseStartup()
  );
  await expect(page.locator('.project-switch')).toContainText('second');
  const paths = await page.evaluate(() =>
    (
      window as unknown as { __emdeckCalls: { command: string; args: Record<string, unknown> }[] }
    ).__emdeckCalls
      .filter(call => call.command === 'open_project')
      .map(call => call.args.path)
  );
  expect(paths).toEqual(['/projects/second']);
});
test('a clean window closes immediately using the permitted native action', async ({ page }) => {
  // A project setting changed moments before the quit must reach the disk on
  // the way out. The write is debounced, so without a flush on the close
  // request it would be issued after the window is already gone, or never.
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByLabel('More accent colors').selectOption('#e8dd7a');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await requestClose(page);
  expect(await destroyedWindows(page)).toEqual(['main']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __emdeckCalls: { command: string; args: Record<string, unknown> }[] })
        .__emdeckCalls
  );
  const writes = calls.filter(call => call.command === 'write_project_config');
  expect(writes.map(call => call.args.root)).toContain('/projects/first');
  expect(String(writes.at(-1)!.args.content)).toContain('#e8dd7a');
  expect(calls.findIndex(call => call.command === 'write_project_config')).toBeLessThan(
    calls.findIndex(call => call.command === 'plugin:window|destroy')
  );
});
test('unsaved edits survive cancelling close and close after confirmation', async ({ page }) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  await page.getByTestId('code-editor').locator('.cm-content').click();
  await page.keyboard.type('// keep this edit');
  await requestClose(page);
  await expect(page.getByRole('dialog', { name: 'Close this Emdeck window?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await destroyedWindows(page)).toEqual([]);
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible();
  await expect(page.getByTestId('code-editor')).toContainText('// keep this edit');
  await requestClose(page);
  await page.getByRole('button', { name: 'Close window', exact: true }).click();
  expect(await destroyedWindows(page)).toEqual(['main']);
});
test('repeated close requests share one terminal confirmation and can be cancelled', async ({
  page,
}) => {
  await page
    .locator('.terminal-empty')
    .getByRole('button', { name: 'Start a terminal', exact: true })
    .click();
  await expect(page.locator('.xterm')).toBeVisible();
  await requestClose(page);
  await requestClose(page);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  expect(await destroyedWindows(page)).toEqual([]);
  await expect(page.locator('.xterm')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })
  ).toBe(false);
  await requestClose(page);
  await page.getByRole('button', { name: 'Close window', exact: true }).click();
  expect(await destroyedWindows(page)).toEqual(['main']);
});
test('a native close failure is visible and the user can retry', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckDestroyError = true;
  });
  await requestClose(page);
  expect(await destroyedWindows(page)).toEqual([]);
  await expect(page.getByRole('alert')).toContainText('Could not close the window');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckDestroyError = false;
  });
  await requestClose(page);
  expect(await destroyedWindows(page)).toEqual(['main']);
});
test('opening another project defaults to a new window and keeps edits and terminals', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  await page.getByTestId('code-editor').locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.type('// unsaved work');
  await page.getByRole('button', { name: 'Start a terminal', exact: true }).click();
  const terminal = page.getByRole('region', { name: 'Terminal terminal' });
  await expect(terminal).toContainText('Connected');
  await terminal
    .locator('.xterm')
    .evaluate(element => element.setAttribute('data-session', 'existing'));
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.getByRole('status')).toContainText('Project opened in a new Emdeck window.');
  await expect(page.locator('.project-switch')).toContainText('first');
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible();
  await expect(page.getByTestId('code-editor')).toContainText('// unsaved work');
  await expect(terminal.locator('.xterm')).toHaveAttribute('data-session', 'existing');
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __emdeckCalls: { command: string; args: unknown }[] }
      ).__emdeckCalls.filter(c => c.command === 'open_project_window')
    )
  ).toEqual([{ command: 'open_project_window', args: { path: '/projects/second' } }]);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
        c => c.command === 'terminal_close'
      )
    )
  ).toEqual([]);
});
test('project menu can explicitly replace this window and cancellation keeps it intact', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  await page.getByTestId('code-editor').locator('.cm-content').click();
  await page.keyboard.type('// changed');
  await page.getByTitle('Projects', { exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Open project in new window…' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Replace project in this window…' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.project-switch')).toContainText('first');
  await page.getByTitle('Projects', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Replace project in this window…' }).click();
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await expect(page.locator('.project-switch')).toContainText('second');
  await expect(page.getByRole('tab', { name: /notes.ts/ })).toHaveCount(0);
});
test('window creation failure and folder picker cancellation preserve the project', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckWindowError = true;
  });
  await page.getByTitle('Projects', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open project in new window…' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not create a new window');
  await expect(page.locator('.project-switch')).toContainText('first');
  await page.evaluate(() => {
    const state = window as unknown as Record<string, unknown>;
    state.__emdeckPicker = null;
  });
  await page.keyboard.press('ControlOrMeta+Shift+o');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
            c => c.command === 'plugin:dialog|open'
          ).length
      )
    )
    .toBe(2);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
          c => c.command === 'open_project_window'
        ).length
    )
  ).toBe(1);
  await expect(page.locator('.project-switch')).toContainText('first');
});
