import { useState } from 'react';
import type {
  MachineConnection,
  MachineProfile,
  SessionLaunch,
  SessionWorkspace,
} from '../../../shared/contracts/sessions';
interface Props {
  machines: MachineConnection[];
  projectRoot?: string;
  projectName?: string;
  onMachine: (profile: MachineProfile) => void;
  onLaunch: (
    machine: MachineConnection,
    workspace: { root: string; name: string },
    launch: Omit<SessionLaunch, 'workspaceId'>
  ) => Promise<void>;
}
export default function SessionForms({
  machines,
  projectRoot,
  projectName,
  onMachine,
  onLaunch,
}: Props) {
  const [host, setHost] = useState('');
  const [binary, setBinary] = useState('emdeck-session');
  const [port, setPort] = useState('');
  const [machineId, setMachineId] = useState('local');
  const [rootOverride, setRoot] = useState<string | null>(null);
  const [nameOverride, setWorkspaceName] = useState<string | null>(null);
  const root = rootOverride ?? projectRoot ?? '';
  const workspaceName = nameOverride ?? projectName ?? 'Workspace';
  const [name, setName] = useState('Terminal');
  const [command, setCommand] = useState('');
  const [shell, setShell] = useState('');
  const [resume, setResume] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const machine = machines.find(m => m.profile.id === machineId);
  const handleHost: React.ChangeEventHandler<HTMLInputElement> = e => setHost(e.target.value);
  const handleBinary: React.ChangeEventHandler<HTMLInputElement> = e => setBinary(e.target.value);
  const handlePort: React.ChangeEventHandler<HTMLInputElement> = e => setPort(e.target.value);
  const handleMachine: React.ChangeEventHandler<HTMLSelectElement> = e => {
    setMachineId(e.target.value);
    setRoot(e.target.value === 'local' ? (projectRoot ?? '') : '');
  };
  const handleRoot: React.ChangeEventHandler<HTMLInputElement> = e => setRoot(e.target.value);
  const handleWorkspaceName: React.ChangeEventHandler<HTMLInputElement> = e =>
    setWorkspaceName(e.target.value);
  const handleName: React.ChangeEventHandler<HTMLInputElement> = e => setName(e.target.value);
  const handleCommand: React.ChangeEventHandler<HTMLInputElement> = e => setCommand(e.target.value);
  const handleShell: React.ChangeEventHandler<HTMLInputElement> = e => setShell(e.target.value);
  const handleResume: React.ChangeEventHandler<HTMLInputElement> = e => setResume(e.target.checked);
  const handleExisting: React.ChangeEventHandler<HTMLSelectElement> = e => {
    const workspace: SessionWorkspace | undefined = machine?.snapshot?.workspaces.find(
      w => w.id === e.target.value
    );
    if (workspace) {
      setRoot(workspace.root);
      setWorkspaceName(workspace.name);
    }
  };
  const handleSave: React.FormEventHandler = e => {
    e.preventDefault();
    onMachine({
      id: crypto.randomUUID(),
      name: host,
      enabled: false,
      target: { kind: 'ssh', host, port: port ? Number(port) : null, binary },
    });
    setHost('');
  };
  const handleLaunch: React.FormEventHandler = e => {
    e.preventDefault();
    if (!machine?.connection || busy) return;
    setBusy(true);
    setError('');
    void onLaunch(
      machine,
      { root, name: workspaceName },
      { name, cwd: root, command, shell, resumeOnRestart: resume }
    )
      .catch(e => setError(String(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div className='session-forms'>
      <details>
        <summary>New background terminal</summary>
        <form onSubmit={handleLaunch}>
          <label>
            Machine
            <select value={machineId} onChange={handleMachine}>
              {machines.map(m => (
                <option key={m.profile.id} value={m.profile.id}>
                  {m.profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Existing workspace
            <select onChange={handleExisting} defaultValue=''>
              <option value=''>Choose or enter a new workspace</option>
              {machine?.snapshot?.workspaces.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Workspace name
            <input required value={workspaceName} onChange={handleWorkspaceName} />
          </label>
          <label>
            Folder on that machine
            <input
              required
              value={root}
              onChange={handleRoot}
              placeholder='Absolute project folder'
            />
          </label>
          <label>
            Terminal name
            <input required value={name} onChange={handleName} />
          </label>
          <label>
            Agent command
            <input
              value={command}
              onChange={handleCommand}
              placeholder='claude, codex, or leave blank for a shell'
            />
          </label>
          <label>
            Shell (optional)
            <input value={shell} onChange={handleShell} placeholder='System default' />
          </label>
          <label className='session-checkbox'>
            <input type='checkbox' checked={resume} onChange={handleResume} />
            Resume a registered Claude/Codex conversation when the server restarts
          </label>
          <p>
            Closing Emdeck detaches this terminal. Server restart restores its entry; native
            conversation resume requires a reported session ID.
          </p>
          {error && <p role='alert'>{error}</p>}
          <button className='button primary' type='submit' disabled={!machine?.connection || busy}>
            {busy ? 'Starting…' : 'Start background terminal'}
          </button>
        </form>
      </details>
      <details>
        <summary>Add an SSH machine</summary>
        <form onSubmit={handleSave}>
          <p>
            Install the standalone <code>emdeck-session</code> binary on that machine and run{' '}
            <code>emdeck-session start</code>. Configure SSH keys and verify its host key using your
            normal SSH client first.
          </p>
          <label>
            SSH alias or user@host
            <input required value={host} onChange={handleHost} />
          </label>
          <label>
            SSH port (optional)
            <input type='number' min='1' max='65535' value={port} onChange={handlePort} />
          </label>
          <label>
            Remote executable
            <input required value={binary} onChange={handleBinary} />
          </label>
          <button type='submit' className='button secondary'>
            Save machine
          </button>
        </form>
      </details>
    </div>
  );
}
