import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
async function openBranchFixture(page: Page, current = 'main') {
  await page.evaluate(branch => {
    (window as unknown as Record<string, unknown>).__emdeckGit = {
      available: true,
      message: '',
      branch,
      localBranches: [
        'main',
        'dima/bugfix/branch-name',
        'dima/feature/branch-name',
        'origin/shared',
      ],
      remoteBranches: [
        'origin/main',
        'origin/dima/bugfix/branch-name',
        'origin/shared',
        'upstream/main',
      ],
      changes: [],
      commits: [],
    };
  }, current);
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page.getByTitle('Refresh branches', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Local branches', exact: true })).toContainText(
    'dima'
  );
}
async function gitCalls(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        __emdeckCalls: { command: string; args: Record<string, unknown> }[];
      }
    ).__emdeckCalls
      .filter(call => call.command === 'git_branch_action')
      .map(call => call.args.request)
  );
}
async function enhancedBranchFixture(page: Page) {
  await openBranchFixture(page);
  await page.evaluate(() => {
    const state = window as unknown as Record<string, unknown>;
    const git = state.__emdeckGit as Record<string, unknown>;
    git.remotes = ['origin', 'upstream'];
    git.operation = null;
    git.branchDetails = (git.localBranches as string[]).map(name => ({
      reference: `refs/heads/${name}`,
      name,
      upstream: 'refs/remotes/origin/main',
      remote: 'origin',
      remoteRef: 'refs/heads/main',
      ahead: name === 'main' ? 2 : 0,
      behind: name === 'main' ? 3 : 1,
      gone: false,
      worktree: name === 'main' ? '/projects/first' : null,
    }));
  });
  await page.getByTitle('Refresh branches', { exact: true }).click();
}
test('Git dropdown shows incoming/outgoing counts and fetch runs only on request', async ({
  page,
}) => {
  await enhancedBranchFixture(page);
  const main = page.getByRole('button', { name: 'Actions for local branch main', exact: true });
  await expect(main.getByLabel('3 incoming commits')).toBeVisible();
  await expect(main.getByLabel('2 outgoing commits')).toBeVisible();
  expect(await gitCalls(page)).toEqual([]);
  await page.getByRole('button', { name: 'Fetch', exact: true }).click();
  await expect
    .poll(() => gitCalls(page))
    .toEqual([expect.objectContaining({ action: 'fetch', expectedCurrent: 'main' })]);
  await expect(page.getByRole('region', { name: 'Branches', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/git-branch-status-dark.png' });
  await main.click();
  await expect(page.getByRole('menuitem', { name: 'Checkout', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Update', exact: true }).click();
  await expect
    .poll(() => gitCalls(page))
    .toContainEqual(expect.objectContaining({ action: 'update', reference: 'refs/heads/main' }));
});
test('the toolbar sync button merges the integration branch into the current one', async ({
  page,
}) => {
  await openBranchFixture(page, 'dima/feature/branch-name');
  // The fixture leaves the picker open; its dismiss overlay covers the toolbar.
  await page.locator('.popover-dismiss').click();
  const sync = page.getByRole('button', { name: 'Update from main', exact: true });
  await expect(sync).toBeVisible();
  expect(await gitCalls(page)).toEqual([]);

  await sync.click();
  await expect
    .poll(() => gitCalls(page))
    .toEqual([
      expect.objectContaining({
        action: 'sync',
        reference: 'refs/heads/main',
        expectedCurrent: 'dima/feature/branch-name',
      }),
    ]);

  await openBranchFixture(page, 'main');
  await page.locator('.popover-dismiss').click();
  await expect(
    page.getByRole('button', { name: /^Update from/ }),
    'a branch cannot be brought up to date with itself'
  ).toHaveCount(0);
});
test('branch action menu supports keyboard, right click and fits a small light window', async ({
  page,
}) => {
  await enhancedBranchFixture(page);
  await page.getByRole('textbox', { name: 'Filter branches' }).fill('dima/bugfix');
  await page
    .getByRole('button', { name: 'Actions for local branch dima/bugfix/branch-name', exact: true })
    .click({ button: 'right' });
  const tree = page.getByRole('region', { name: 'Local branches', exact: true });
  const parentMenu = page.getByRole('region', { name: 'Branches', exact: true });
  const submenu = page.locator('.branch-submenu');
  await expect(tree).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Filter branches' })).toHaveValue('dima/bugfix');
  await expect(
    page.getByRole('button', {
      name: 'Actions for local branch dima/bugfix/branch-name',
      exact: true,
    })
  ).toHaveAttribute('aria-expanded', 'true');
  const parentBounds = await parentMenu.boundingBox();
  const actionBounds = await submenu.boundingBox();
  expect(actionBounds!.x).toBeGreaterThanOrEqual(parentBounds!.x + parentBounds!.width);
  for (const name of [
    'Checkout',
    "New Branch from 'dima/bugfix/branch-name'…",
    "Checkout and Rebase onto 'main'",
    'Checkout and Update',
    "Compare with 'main'",
    'Show Diff with Working Tree',
    "Rebase 'main' onto 'dima/bugfix/branch-name'",
    "Merge 'dima/bugfix/branch-name' into 'main'",
    "New Worktree from 'dima/bugfix/branch-name'…",
    'Update',
    'Push…',
    'Rename…',
    'Delete',
  ]) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/git-branch-actions-dark.png' });
  await page
    .getByRole('button', {
      name: 'Actions for remote branch origin/dima/bugfix/branch-name',
      exact: true,
    })
    .hover();
  await expect(
    page.getByRole('menu', {
      name: 'Branch actions for origin/dima/bugfix/branch-name',
      exact: true,
    })
  ).toBeVisible();
  await expect(tree).toBeVisible();
  expect(await gitCalls(page)).toEqual([]);
  await page
    .getByRole('button', { name: 'Actions for local branch dima/bugfix/branch-name', exact: true })
    .hover();
  await expect(
    page.getByRole('menu', { name: 'Branch actions for dima/bugfix/branch-name', exact: true })
  ).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(submenu).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Actions for local branch dima/bugfix/branch-name',
      exact: true,
    })
  ).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Filter branches' })).toHaveValue('dima/bugfix');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', { name: 'Checkout', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(submenu).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Actions for remote branch origin/dima/bugfix/branch-name',
      exact: true,
    })
    .click();
  await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 900, height: 640 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await page
    .getByRole('menuitem', {
      name: "New Worktree from 'origin/dima/bugfix/branch-name'…",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  const bounds = await page.getByRole('region', { name: 'Branches', exact: true }).boundingBox();
  const smallActions = await submenu.boundingBox();
  expect(smallActions!.x + smallActions!.width).toBeLessThanOrEqual(900);
  expect(smallActions!.y + smallActions!.height).toBeLessThanOrEqual(640);
  expect(smallActions!.x).toBeGreaterThanOrEqual(bounds!.x + bounds!.width);
  await expect(tree).toBeVisible();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(900);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  await page.screenshot({ path: 'test-results/git-branch-actions-small-light.png' });
  await page.getByRole('textbox', { name: 'Filter branches' }).fill('main');
  await expect(submenu).toHaveCount(0);
  await expect(parentMenu).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Actions for local branch main', exact: true })
  ).toBeVisible();
});
test('branch comparisons open in regular tabs and keep unsaved editors', async ({ page }) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  await page.getByTestId('code-editor').locator('.cm-content').click();
  await page.keyboard.type('// keep this edit');
  await enhancedBranchFixture(page);
  await page
    .getByRole('button', { name: 'Actions for remote branch origin/main', exact: true })
    .click();
  await page.getByRole('menuitem', { name: "Compare with 'main'", exact: true }).click();
  const tab = page.getByRole('tab', { name: 'origin/main → main Compare', exact: true });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByText('1 commits only in origin/main', { exact: true }).click();
  await expect(page.getByText('Branch-only commit', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Diff contents')).toContainText('+new');
  await page.screenshot({ path: 'test-results/git-branch-comparison.png' });
  await page.getByRole('tab', { name: /notes.ts/ }).click();
  await expect(page.getByTestId('code-editor')).toContainText('// keep this edit');
  expect(await gitCalls(page)).toEqual([]);
});
test('push dialog names the source and destination and allows cancel or failure retry', async ({
  page,
}) => {
  await enhancedBranchFixture(page);
  await page.getByRole('button', { name: 'Push…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: "Push 'main'", exact: true })).toBeVisible();
  await expect(page.getByLabel('Remote', { exact: true })).toHaveValue('origin');
  await expect(page.getByLabel('Remote branch', { exact: true })).toHaveValue('main');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await gitCalls(page)).toEqual([]);
  await page.getByRole('button', { name: 'Push…', exact: true }).click();
  await page.getByLabel('Remote', { exact: true }).selectOption('upstream');
  await page.getByLabel('Remote branch', { exact: true }).fill('review/main');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckBranchError =
      'Push rejected: remote has newer commits.';
  });
  await page.getByRole('button', { name: 'Push commits', exact: true }).click();
  await expect(
    page.getByText('Push rejected: remote has newer commits.', { exact: true })
  ).toBeVisible();
  expect(await gitCalls(page)).toEqual([
    expect.objectContaining({
      action: 'push',
      reference: 'refs/heads/main',
      remote: 'upstream',
      name: 'review/main',
    }),
  ]);
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Push…', exact: true })).toBeEnabled();
});
test('branch menus wire tracking rename new branch and a prefilled worktree form', async ({
  page,
}) => {
  await enhancedBranchFixture(page);
  await page.getByRole('button', { name: 'Actions for local branch main', exact: true }).click();
  await page.getByRole('menuitem', { name: "Tracked Branch 'origin/main'…", exact: true }).click();
  await page
    .getByLabel('Tracked branch', { exact: true })
    .selectOption('refs/remotes/upstream/main');
  await page.getByRole('button', { name: 'Save tracking', exact: true }).click();
  await expect
    .poll(() => gitCalls(page))
    .toContainEqual(
      expect.objectContaining({
        action: 'track',
        reference: 'refs/heads/main',
        name: 'refs/remotes/upstream/main',
      })
    );
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page.getByRole('button', { name: 'Actions for local branch main', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
  await page.getByLabel('Branch name', { exact: true }).fill('renamed/main');
  await page.getByRole('button', { name: 'Rename branch', exact: true }).click();
  await expect
    .poll(() => gitCalls(page))
    .toContainEqual(expect.objectContaining({ action: 'rename', name: 'renamed/main' }));
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page
    .getByRole('button', { name: 'Actions for remote branch origin/main', exact: true })
    .click();
  await page.getByRole('menuitem', { name: "New Branch from 'origin/main'…", exact: true }).click();
  await page.getByLabel('Branch name', { exact: true }).fill('agent/new');
  await page.getByRole('button', { name: 'Create branch', exact: true }).click();
  await expect
    .poll(() => gitCalls(page))
    .toContainEqual(
      expect.objectContaining({
        action: 'create-from',
        reference: 'refs/remotes/origin/main',
        name: 'agent/new',
      })
    );
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page
    .getByRole('button', { name: 'Actions for remote branch origin/main', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: "New Worktree from 'origin/main'…", exact: true })
    .click();
  await expect(page.getByRole('tab', { name: 'Worktrees', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByRole('heading', { name: 'Create a worktree', exact: true })).toBeVisible();
  await expect(page.getByLabel('Start from', { exact: true })).toHaveValue(
    'refs/remotes/origin/main'
  );
});
test('source control provides continue and abort when a rebase is in progress', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckGit = {
      available: true,
      branch: 'main',
      localBranches: ['main'],
      remoteBranches: [],
      changes: [{ path: 'notes.ts', originalPath: null, index: 'U', working: 'U', conflict: true }],
      commits: [],
      operation: 'rebase',
    };
  });
  await page.getByTitle('Source control', { exact: true }).click();
  await page.getByTitle('Refresh Git', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue rebase', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Abort…', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await gitCalls(page)).toEqual([]);
  await page.getByRole('button', { name: 'Abort…', exact: true }).click();
  await page.getByRole('button', { name: 'Abort operation', exact: true }).click();
  await expect
    .poll(() => gitCalls(page))
    .toEqual([expect.objectContaining({ action: 'abort', expectedCurrent: 'main' })]);
});
test('main stays first locally and inside each remote after filtering and refresh', async ({
  page,
}) => {
  await openBranchFixture(page, 'dima/feature/branch-name');
  await page.evaluate(() => {
    const state = window as unknown as {
      __emdeckGit: { localBranches: string[]; remoteBranches: string[] };
    };
    state.__emdeckGit.localBranches.push('aaa', 'dev');
    state.__emdeckGit.remoteBranches.push('upstream/aaa', 'upstream/feature/task', 'origin/aaa');
  });
  await page.getByTitle('Refresh branches', { exact: true }).click();
  const local = page.getByRole('region', { name: 'Local branches', exact: true });
  const remote = page.getByRole('region', { name: 'Remote branches', exact: true });
  const expectMainFirst = async () => {
    await expect(local.locator(':scope > div > ul > li > button').first()).toHaveAttribute(
      'aria-label',
      'Actions for local branch main'
    );
    for (const name of ['origin', 'upstream']) {
      const folder = remote
        .getByRole('button', { name: `Remote folder ${name}`, exact: true })
        .locator('..');
      await expect(folder.locator(':scope > ul > li > button').first()).toHaveAttribute(
        'aria-label',
        `Actions for remote branch ${name}/main`
      );
    }
  };
  await expectMainFirst();
  const filter = page.getByRole('textbox', { name: 'Filter branches' });
  await filter.fill('main');
  await expectMainFirst();
  await filter.fill('dima');
  await expect(
    local.getByRole('button', { name: 'Actions for local branch main', exact: true })
  ).toHaveCount(0);
  await filter.fill('');
  await page.getByTitle('Refresh branches', { exact: true }).click();
  await expectMainFirst();
  expect(await gitCalls(page)).toEqual([]);
});

test('branches have independent local/remote folders and reveal the current branch', async ({
  page,
}) => {
  await openBranchFixture(page, 'dima/feature/branch-name');
  const local = page.getByRole('region', { name: 'Local branches', exact: true });
  const remote = page.getByRole('region', { name: 'Remote branches', exact: true });
  await expect(
    local.getByRole('button', {
      name: 'Actions for local branch dima/feature/branch-name',
      exact: true,
    })
  ).toBeEnabled();
  const bugfix = local.getByRole('button', { name: 'Local folder dima/bugfix', exact: true });
  await expect(bugfix).toHaveAttribute('aria-expanded', 'false');
  await bugfix.click();
  await expect(
    local.getByRole('button', {
      name: 'Actions for local branch dima/bugfix/branch-name',
      exact: true,
    })
  ).toBeVisible();
  await remote.getByRole('button', { name: 'Remote folder origin/dima', exact: true }).click();
  await remote
    .getByRole('button', { name: 'Remote folder origin/dima/bugfix', exact: true })
    .click();
  await expect(
    remote.getByRole('button', {
      name: 'Actions for remote branch origin/dima/bugfix/branch-name',
      exact: true,
    })
  ).toBeVisible();
  await local.getByRole('button', { name: 'Local folder dima', exact: true }).click();
  await expect(
    local.getByRole('button', { name: 'Local folder dima/bugfix', exact: true })
  ).toBeHidden();
  await expect(
    remote.getByRole('button', { name: 'Remote folder origin/dima/bugfix', exact: true })
  ).toBeVisible();
  await expect(remote.getByRole('button', { name: /Delete/ })).toHaveCount(0);
  await local.getByRole('button', { name: 'Local branches', exact: true }).click();
  await expect(local.getByRole('button', { name: 'Local folder dima', exact: true })).toBeHidden();
  await expect(
    remote.getByRole('button', { name: 'Remote folder origin', exact: true })
  ).toBeVisible();
  await local.getByRole('button', { name: 'Local branches', exact: true }).press('Enter');
  await local.getByRole('button', { name: 'Local folder dima', exact: true }).click();
  await page.screenshot({ path: 'test-results/branch-folders-dark.png' });
  await local
    .getByRole('button', { name: 'Actions for local branch dima/bugfix/branch-name', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
  expect(await gitCalls(page)).toEqual([
    expect.objectContaining({
      action: 'checkout',
      reference: 'refs/heads/dima/bugfix/branch-name',
    }),
  ]);
});
test('branch search opens matching paths and remote actions preserve their namespace', async ({
  page,
}) => {
  await openBranchFixture(page);
  await page.getByRole('textbox', { name: 'Filter branches' }).fill('DIMA/BUGFIX');
  await expect(
    page.getByRole('button', {
      name: 'Actions for local branch dima/bugfix/branch-name',
      exact: true,
    })
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Actions for remote branch origin/dima/bugfix/branch-name',
      exact: true,
    })
    .click();
  await page.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
  expect(await gitCalls(page)).toEqual([
    expect.objectContaining({
      action: 'checkout',
      reference: 'refs/remotes/origin/dima/bugfix/branch-name',
    }),
  ]);
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page.getByRole('textbox', { name: 'Filter branches' }).fill('origin/shared');
  await page
    .getByRole('button', { name: 'Actions for remote branch origin/shared', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: "Merge 'origin/shared' into 'main'", exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: "Merge 'origin/shared' into 'main'?" })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Merge branch', exact: true }).click();
  expect(await gitCalls(page)).toEqual([
    expect.objectContaining({
      action: 'checkout',
      reference: 'refs/remotes/origin/dima/bugfix/branch-name',
    }),
    expect.objectContaining({ action: 'merge', reference: 'refs/remotes/origin/shared' }),
  ]);
});
test('remote checkout protects unsaved edits and search reports both empty sections', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  await page.getByTestId('code-editor').locator('.cm-content').click();
  await page.keyboard.type('// keep this edit');
  await openBranchFixture(page);
  await page.getByRole('textbox', { name: 'Filter branches' }).fill('origin/dima/bugfix');
  await page
    .getByRole('button', {
      name: 'Actions for remote branch origin/dima/bugfix/branch-name',
      exact: true,
    })
    .click();
  await page.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
  await expect(
    page.getByText('Save or close unsaved files before changing branches.', { exact: true })
  ).toBeVisible();
  expect(await gitCalls(page)).toEqual([]);
  await expect(page.getByTestId('code-editor')).toContainText('// keep this edit');
  await page.getByRole('button', { name: 'Close branch actions', exact: true }).click();
  await page.getByRole('textbox', { name: 'Filter branches' }).fill('missing-branch');
  await expect(page.getByText('No matching local branches.', { exact: true })).toBeVisible();
  await expect(page.getByText('No matching remote branches.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Filter branches' }).fill('');
  await expect(page.getByRole('button', { name: 'Local folder dima', exact: true })).toBeVisible();
});
