import { test, expect } from './fixtures/desktop';
import type { SessionAction, RemoteSharingStatus } from '../../src/shared/contracts/sessions';

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      __remoteCalls: { command: string; args: Record<string, unknown> }[];
    };
    const original = state.__TAURI_INTERNALS__.invoke;
    const sharing: RemoteSharingStatus = {
      enabled: false,
      address: null,
      port: null,
      error: null,
      devices: [],
    };
    state.__remoteCalls = [];
    state.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (!command.startsWith('session_')) return original(command, args);
      state.__remoteCalls.push({ command, args });
      if (command === 'session_pair') {
        if (args.code === 'expired-fixture')
          throw new Error('Pairing code is invalid, expired or already used.');
        sharing.devices.push({ id: 'device', name: String(args.name), pairedAt: 1 });
        return { credential: '00000000-0000-4000-8000-000000000001', address: '100.80.1.1:48192' };
      }
      if (command === 'session_connect') return (args.target as { kind: string }).kind;
      if (command === 'session_disconnect' || command === 'session_forget') return null;
      const action = args.action as SessionAction;
      if (action.method === 'session.snapshot') {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { protocol: 1, serverId: args.connection, revision: 1, workspaces: [], panes: [] };
      }
      if (action.method === 'remote.manage') {
        const request = action.params;
        switch (request.operation) {
          case 'enable':
            if (request.address === '0.0.0.0') throw new Error('Enter a Tailscale IPv4 address.');
            sharing.enabled = true;
            sharing.address = request.address;
            sharing.port = request.port;
            break;
          case 'disable':
            sharing.enabled = false;
            break;
          case 'invite':
            return {
              code: 'emdeck-pair:synthetic-single-use-code',
              expiresAt: Date.now() + 600000,
            };
          case 'revoke':
            sharing.devices = sharing.devices.filter(device => device.id !== request.id);
            break;
        }
        return structuredClone(sharing);
      }
      return null;
    };
  });
  await page.getByLabel('Terminal view').selectOption('server');
});

test('sharing is explicit, pairing saves no secrets, and revocation leaves sessions running', async ({
  page,
}, testInfo) => {
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  const calls = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __remoteCalls: { command: string; args: Record<string, unknown> }[];
          }
        ).__remoteCalls
    );
  expect(await calls()).toHaveLength(0);
  await rail.getByRole('button', { name: 'Connect local server', exact: true }).click();
  await rail.getByText('Machine settings', { exact: true }).click();
  await rail.getByText('Share this computer over Tailscale', { exact: true }).click();
  await expect(rail.getByText('Sharing is off', { exact: true })).toBeVisible();
  await rail.getByLabel('Tailscale IPv4 address').fill('100.80.1.1');
  await rail.getByRole('button', { name: 'Enable sharing', exact: true }).click();
  await expect(rail.getByText('Sharing at 100.80.1.1:48192')).toBeVisible();
  await rail.getByRole('button', { name: 'Create pairing code' }).click();
  await expect(
    rail.getByRole('textbox', { name: 'One-use pairing code', exact: true })
  ).toHaveValue('emdeck-pair:synthetic-single-use-code');
  await rail.getByText('Pair a machine over Tailscale', { exact: true }).click();
  await rail.getByLabel('Machine label').fill('Office desktop');
  await rail.getByLabel('This device’s name').fill('Linux laptop');
  await rail
    .getByLabel('Pairing code', { exact: true })
    .fill('emdeck-pair:synthetic-single-use-code');
  await rail.getByRole('button', { name: 'Pair machine', exact: true }).click();
  await expect(rail.getByText('Paired. Select Connect', { exact: false })).toBeVisible();
  await expect(rail.getByLabel('Pairing code', { exact: true })).toHaveValue('');
  const preferences = await page.evaluate(
    () => localStorage.getItem('relay:session-machines') ?? ''
  );
  expect(preferences).toContain('00000000-0000-4000-8000-000000000001');
  expect(preferences).not.toContain('synthetic-single-use-code');
  const machine = rail.locator('.session-machine').filter({ hasText: 'Office desktop' });
  await machine.getByRole('button', { name: 'Connect', exact: true }).click();
  await machine.getByText('Machine settings', { exact: true }).click();
  await expect(machine.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible();
  await expect(machine.getByText('Share this computer over Tailscale')).toHaveCount(0);
  await rail.getByRole('button', { name: 'Refresh paired devices' }).click();
  await rail.getByRole('button', { name: 'Revoke Linux laptop' }).click();
  await expect(rail.getByText('Revoke this device’s access?', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('tailscale-sharing.png') });
  await rail.getByRole('button', { name: 'Confirm revocation' }).click();
  await expect(rail.getByRole('button', { name: 'Revoke Linux laptop' })).toHaveCount(0);
  await machine.getByRole('button', { name: 'Forget', exact: true }).click();
  await expect(machine).toHaveCount(0);
  expect((await calls()).some(call => call.command === 'session_forget')).toBe(true);
  await rail.getByRole('button', { name: 'Disable sharing' }).click();
  await expect(rail.getByText('Sharing is off', { exact: true })).toBeVisible();
  await expect(
    rail.getByRole('textbox', { name: 'One-use pairing code', exact: true })
  ).toHaveCount(0);
  expect((await calls()).some(call => JSON.stringify(call.args).includes('server.stop'))).toBe(
    false
  );
});

test('failed pairing clears the sensitive code and creates no saved machine', async ({ page }) => {
  await page.getByText('Pair a machine over Tailscale', { exact: true }).click();
  await page.getByLabel('This device’s name').fill('Linux laptop');
  await page.getByLabel('Pairing code', { exact: true }).fill('expired-fixture');
  await page.getByRole('button', { name: 'Pair machine', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'expired or already used' })
  ).toBeVisible();
  await expect(page.getByLabel('Pairing code', { exact: true })).toHaveValue('');
  const preferences = await page.evaluate(
    () => localStorage.getItem('relay:session-machines') ?? ''
  );
  expect(preferences).not.toContain('direct');
  expect(preferences).not.toContain('expired-fixture');
  await expect(page.getByRole('button', { name: 'Pair machine', exact: true })).toBeDisabled();
});
