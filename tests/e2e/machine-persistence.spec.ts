import { test, expect } from './fixtures/desktop';

const recovered = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '100.80.1.1:48192',
  target: { kind: 'direct', credential: '00000000-0000-4000-8000-000000000001' },
  enabled: false,
};

test('recovers, renames and retains a pairing when browser preferences disappear', async ({
  page,
}) => {
  await page.evaluate(
    profile => localStorage.setItem('test:machines', JSON.stringify([profile])),
    recovered
  );
  await page.getByLabel('Terminal view').selectOption('server');
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  const machine = rail.locator('.session-machine').filter({ hasText: recovered.name });
  await expect(machine.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
        call => call.command === 'session_connect'
      )
    )
  ).toHaveLength(0);
  await machine.getByText('Machine settings', { exact: true }).click();
  await machine.getByLabel('Saved machine name').fill('Mac mini');
  await machine.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(rail.getByRole('button', { name: 'Collapse Mac mini', exact: true })).toBeVisible();
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('relay:')) localStorage.removeItem(key);
  });
  await page.reload();
  await page.getByLabel('Terminal view').selectOption('server');
  await expect(rail.getByRole('button', { name: 'Collapse Mac mini', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
        call => call.command === 'session_connect'
      )
    )
  ).toHaveLength(0);
  const saved = rail.locator('.session-machine').filter({ hasText: 'Mac mini' });
  await saved.getByText('Machine settings', { exact: true }).click();
  await saved.getByRole('button', { name: 'Forget', exact: true }).click();
  await expect(saved).toHaveCount(0);
  await page.reload();
  await expect(rail.locator('.session-machine')).toHaveCount(1);
});

test('migrates existing SSH names and keeps them after a new profile', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'relay:session-machines',
      JSON.stringify([
        {
          id: 'ssh',
          name: 'Build server',
          enabled: false,
          target: { kind: 'ssh', host: 'synthetic.test', port: null, binary: 'emdeck-session' },
        },
      ])
    )
  );
  await page.getByLabel('Terminal view').selectOption('server');
  await expect(
    page.getByRole('button', { name: 'Collapse Build server', exact: true })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('test:machines')))
    .toContain('Build server');
  await page.evaluate(() => localStorage.removeItem('relay:session-machines'));
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Collapse Build server', exact: true })
  ).toBeVisible();
});

test('reports registry failures without erasing browser settings', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'relay:session-machines',
      JSON.stringify([
        {
          id: 'ssh',
          name: 'Build server',
          enabled: false,
          target: { kind: 'ssh', host: 'synthetic.test', port: null, binary: 'emdeck-session' },
        },
      ])
    );
    const state = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const original = state.__TAURI_INTERNALS__.invoke;
    state.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'session_machines_load')
        throw new Error('Saved machine settings cannot be read; the file was left untouched.');
      return original(command, args);
    };
  });
  await page.getByLabel('Terminal view').selectOption('server');
  await expect(page.getByText('Could not restore saved machines:', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('relay:session-machines'))).toContain(
    'Build server'
  );
});

test('a delayed restore cannot overwrite a machine saved while it was loading', async ({
  page,
}) => {
  await page.evaluate(() => {
    const state = window as unknown as {
      __releaseMachineLoad: () => void;
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const original = state.__TAURI_INTERNALS__.invoke;
    state.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'session_machines_load') {
        await new Promise<void>(resolve => {
          state.__releaseMachineLoad = resolve;
        });
        return [];
      }
      return original(command, args);
    };
  });
  await page.getByLabel('Terminal view').selectOption('server');
  await page.getByText('Add an SSH machine', { exact: true }).click();
  await page.getByLabel('SSH alias or user@host').fill('new.synthetic.test');
  await page.getByRole('button', { name: 'Save machine', exact: true }).click();
  const machine = page.getByRole('button', { name: 'Collapse new.synthetic.test', exact: true });
  await expect(machine).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __releaseMachineLoad: () => void }).__releaseMachineLoad()
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('relay:session-machines')))
    .toContain('new.synthetic.test');
  await expect(machine).toBeVisible();
});
