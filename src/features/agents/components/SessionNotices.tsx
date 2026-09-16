import type { SessionDeskController } from '../hooks/useSessionDesk';
import { sessionName } from '../services/terminal-title';

export default function SessionNotices({ model }: { model: SessionDeskController }) {
  const handleCancel = () => model.setStop(null);
  return (
    <>
      {model.error && (
        <p className='session-error' role='alert'>
          {model.error}
        </p>
      )}
      {model.stop && (
        <div className='session-stop-confirm' role='alert'>
          <span>
            Stop {sessionName(model.stop.pane)} on {model.stop.machine.profile.name}? Its running
            process will end.
          </span>
          <button onClick={model.confirmStop}>Stop process</button>
          <button onClick={handleCancel}>Keep running</button>
        </div>
      )}
    </>
  );
}
