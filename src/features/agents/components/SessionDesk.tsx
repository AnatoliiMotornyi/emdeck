import type { MachineConnection, SessionPane } from '../../../shared/contracts/sessions';
import type { SessionDeskController } from '../hooks/useSessionDesk';
import SessionSidebar from './SessionSidebar';

export default function SessionDesk({
  model,
  active,
  root,
  projectName,
  onAttach,
  onSpace,
}: {
  model: SessionDeskController;
  active: boolean;
  root?: string;
  projectName?: string;
  onSpace: (key: string) => void;
  onAttach: (machine: MachineConnection, pane: SessionPane) => void;
}) {
  const handleAll = () => onSpace('all');
  const handleLaunch: React.ComponentProps<typeof SessionSidebar>['onLaunch'] = async (
    machine,
    workspace,
    launch
  ) => {
    const pane = await model.launch(machine, workspace, launch);
    onAttach(machine, pane);
  };
  return (
    <div style={{ display: active ? 'contents' : 'none' }}>
      <SessionSidebar
        machines={model.machines}
        attached={model.attachedKeys}
        space={model.space}
        projectRoot={root}
        projectName={projectName}
        onAll={handleAll}
        onWorkspace={onSpace}
        onAttach={onAttach}
        onConnect={model.connect}
        onDisconnect={model.disconnect}
        onRemove={model.remove}
        onSave={model.save}
        onLaunch={handleLaunch}
        onError={model.setError}
      />
    </div>
  );
}
