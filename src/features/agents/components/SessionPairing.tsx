import { useState } from 'react';
import type { FormEventHandler, ChangeEventHandler } from 'react';
import { call } from '../../../platform/desktop/api';
import type { MachineProfile } from '../../../shared/contracts/sessions';

export default function SessionPairing({
  onMachine,
}: {
  onMachine: (profile: MachineProfile) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const handleCode: ChangeEventHandler<HTMLTextAreaElement> = event => setCode(event.target.value);
  const handleName: ChangeEventHandler<HTMLInputElement> = event => setName(event.target.value);
  const handleLabel: ChangeEventHandler<HTMLInputElement> = event => setLabel(event.target.value);
  const handlePair: FormEventHandler = event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const invitation = code.trim();
    setCode('');
    void call('session_pair', { code: invitation, name: name.trim() })
      .then(paired => {
        onMachine({
          id: crypto.randomUUID(),
          name: label.trim() || paired.address,
          target: { kind: 'direct', credential: paired.credential },
          enabled: false,
        });
        setMessage('Paired. Select Connect on the new machine to view its sessions.');
      })
      .catch(error => setMessage(String(error)))
      .finally(() => setBusy(false));
  };
  return (
    <details className='session-remote-form'>
      <summary>Pair a machine over Tailscale</summary>
      <form onSubmit={handlePair}>
        <p>
          Connect both computers to Tailscale. On the other computer, enable sharing and create a
          pairing code.
        </p>
        <label>
          Machine label
          <input
            value={label}
            onChange={handleLabel}
            maxLength={120}
            placeholder='Office desktop'
          />
        </label>
        <label>
          This device’s name
          <input
            required
            value={name}
            onChange={handleName}
            maxLength={120}
            placeholder='Linux laptop'
          />
        </label>
        <label>
          Pairing code
          <textarea
            required
            value={code}
            onChange={handleCode}
            maxLength={12000}
            autoComplete='off'
            spellCheck={false}
            rows={3}
          />
        </label>
        <p>
          Pairing grants control of the host’s background sessions and permission to run commands as
          its user.
        </p>
        <button type='submit' disabled={busy || !code.trim() || !name.trim()}>
          {busy ? 'Pairing…' : 'Pair machine'}
        </button>
        {message && <p role='status'>{message}</p>}
      </form>
    </details>
  );
}
