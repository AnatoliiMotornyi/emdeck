import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import type { Shelf } from '../../../shared/contracts/workspace';
import { Modal } from '../../../shared/ui/Dialog';
import { shelfLabel, shelfSummary } from '../services/shelves';
interface Props {
  shelves: Shelf[];
  busy: boolean;
  onUnshelve: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}
export default function Shelves({ shelves, busy, onUnshelve, onDelete, onClose }: Props) {
  return (
    <Modal title='Shelved changes' onClose={onClose}>
      <p className='dialog-description'>
        Shelved changes live outside this project and are never pushed anywhere. Unshelving leaves a
        file alone if it changed after it was shelved.
      </p>
      {shelves.length === 0 ? (
        <div className='sidebar-empty'>
          <Archive size={28} />
          <h3>Nothing is shelved yet.</h3>
          <p>Select changes in Source Control and choose Shelve.</p>
        </div>
      ) : (
        shelves.map(shelf => {
          const label = shelfLabel(shelf);
          const handleUnshelveClick = () => onUnshelve(shelf.id);
          const handleDeleteClick = () => onDelete(shelf.id);
          return (
            <div className='shelf-row' key={shelf.id}>
              <div className='shelf-details'>
                <strong className='truncate'>{label}</strong>
                <small>{shelfSummary(shelf)}</small>
              </div>
              <button
                className='button secondary'
                disabled={busy}
                title={`Unshelve ${label}`}
                onClick={handleUnshelveClick}
              >
                <RotateCcw size={14} />
                Unshelve
              </button>
              <button
                className='icon-button'
                disabled={busy}
                aria-label={`Delete ${label}`}
                title={`Delete ${label}`}
                onClick={handleDeleteClick}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })
      )}
    </Modal>
  );
}
