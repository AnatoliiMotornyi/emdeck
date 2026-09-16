import { useState } from 'react';
import type { ChangeEventHandler, FormEventHandler, ToggleEventHandler } from 'react';
import { sessionCall } from '../../../platform/desktop/sessions';
import type {
  PairingCode,
  RemoteManagement,
  RemoteSharingStatus,
} from '../../../shared/contracts/sessions';

export default function SessionSharing({ connection }: { connection: string }) {
  const [status, setStatus] = useState<RemoteSharingStatus | null>(null);
  const [address, setAddress] = useState('');
  const [port, setPort] = useState('48192');
  const [invite, setInvite] = useState<PairingCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revoke, setRevoke] = useState<string | null>(null);
  const manage = async (action: RemoteManagement) => {
    setBusy(true);
    setError('');
    try {
      const response = await sessionCall(connection, 'remote.manage', action);
      if ('code' in response) setInvite(response);
      else {
        setStatus(response);
        if (response.address) setAddress(response.address);
        if (response.port) setPort(String(response.port));
        if (!response.enabled) setInvite(null);
      }
    } catch (failure) {
      const message = String(failure);
      setError(
        message.includes('unknown variant') && message.includes('remote.manage')
          ? 'This background server needs an update. Finish its active sessions, then restart the session server with this Emdeck version.'
          : message
      );
    } finally {
      setBusy(false);
    }
  };
  const handleToggle: ToggleEventHandler<HTMLDetailsElement> = event => {
    if (event.currentTarget.open) void manage({ operation: 'status' });
    else setInvite(null);
  };
  const handleAddress: ChangeEventHandler<HTMLInputElement> = event =>
    setAddress(event.target.value);
  const handlePort: ChangeEventHandler<HTMLInputElement> = event => setPort(event.target.value);
  const handleEnable: FormEventHandler = event => {
    event.preventDefault();
    if (!busy) void manage({ operation: 'enable', address: address.trim(), port: Number(port) });
  };
  const handleDisable = () => void manage({ operation: 'disable' });
  const handleInvite = () => void manage({ operation: 'invite' });
  const handleRefresh = () => void manage({ operation: 'status' });
  const handleCancelRevoke = () => setRevoke(null);
  const handleRevoke = () => {
    if (revoke) void manage({ operation: 'revoke', id: revoke });
    setRevoke(null);
  };
  const handleCopy = () => {
    if (invite)
      void navigator.clipboard
        .writeText(invite.code)
        .catch(() => setError('Select the pairing code and copy it manually.'));
  };
  return (
    <details className='session-remote-form' onToggle={handleToggle}>
      <summary>Share this computer over Tailscale</summary>
      <p>
        Paired devices can control background terminals and run commands as your user. Sharing stays
        on when you close the IDE.
      </p>
      {status && (
        <p role='status'>
          {status.enabled ? `Sharing at ${status.address}:${status.port}` : 'Sharing is off'}
        </p>
      )}
      {status?.error && <p role='alert'>{status.error}</p>}
      {status?.enabled ? (
        <div className='session-machine-actions'>
          <button disabled={busy} onClick={handleDisable}>
            Disable sharing
          </button>
          <button disabled={busy} onClick={handleInvite}>
            Create pairing code
          </button>
        </div>
      ) : (
        <form onSubmit={handleEnable}>
          <label>
            Tailscale IPv4 address
            <input required value={address} onChange={handleAddress} placeholder='100.x.x.x' />
          </label>
          <label>
            Sharing port
            <input required type='number' min={1} max={65535} value={port} onChange={handlePort} />
          </label>
          <button type='submit' disabled={busy || !status}>
            Enable sharing
          </button>
        </form>
      )}
      {invite && (
        <div>
          <label>
            One-use pairing code
            <textarea readOnly value={invite.code} rows={3} spellCheck={false} />
          </label>
          <p>
            Expires at {new Date(invite.expiresAt).toLocaleTimeString()}. Creating another code
            invalidates this one. Share it privately with your device.
          </p>
          <button onClick={handleCopy}>Copy pairing code</button>
        </div>
      )}
      {!!status?.devices.length && (
        <ul>
          {status.devices.map(device => {
            const handleSelectRevoke = () => setRevoke(device.id);
            return (
              <li key={device.id}>
                <span>{device.name}</span>{' '}
                <button disabled={busy} onClick={handleSelectRevoke}>
                  Revoke {device.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {revoke && (
        <div role='alert'>
          <p>Revoke this device’s access? Its running agents will keep working.</p>
          <button disabled={busy} onClick={handleRevoke}>
            Confirm revocation
          </button>
          <button onClick={handleCancelRevoke}>Cancel</button>
        </div>
      )}
      <button disabled={busy} onClick={handleRefresh}>
        Refresh paired devices
      </button>
      <p>
        Use your Tailscale address only. If a firewall rule is needed, restrict this port to your
        paired Tailscale devices.
      </p>
      {error && (
        <p className='session-error' role='alert'>
          {error}
        </p>
      )}
    </details>
  );
}
