import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ConflictChoice,
  ConflictPort,
  GitConflict,
  MergeBlockChoice,
  MergeBlockMode,
  MergeResultBlock,
} from '../../../shared/contracts/gitConflicts';
import { useLatest } from '../../../shared/hooks/useLatest';
import { hasConflictMarkers } from '../services/conflicts';
import { applyMergeBlock, initializeMergeBlocks, sameMergeSides } from '../services/mergeBlocks';

interface Draft {
  source: GitConflict;
  content: string;
  manual: boolean;
  blocks: MergeResultBlock[];
  blockSource: Pick<GitConflict, 'ours' | 'theirs'>;
}
const hasDirtyDrafts = (drafts: Record<string, Draft>) =>
  Object.values(drafts).some(
    draft => draft.manual && draft.content !== (draft.source.working.content ?? '')
  );
interface Options {
  paths: string[];
  initialPath?: string;
  port: ConflictPort;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
}

export function useConflictResolution({
  paths,
  initialPath,
  port,
  onDirtyChange,
  onClose,
}: Options) {
  const [selected, setSelected] = useState(
    initialPath && paths.includes(initialPath) ? initialPath : (paths[0] ?? '')
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const currentDrafts = useRef(drafts);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const savingRef = useRef(false);
  const callbacks = useLatest({ port, onDirtyChange, onClose });
  const updateDrafts = useCallback(
    (update: (previous: Record<string, Draft>) => Record<string, Draft>) => {
      const next = update(currentDrafts.current);
      currentDrafts.current = next;
      // Native close events can arrive before React commits the editor's next render.
      callbacks.current.onDirtyChange(hasDirtyDrafts(next));
      setDrafts(next);
    },
    [callbacks]
  );
  const remaining = paths;
  const draft = drafts[selected];
  const dirty = hasDirtyDrafts(drafts);
  useEffect(() => {
    if (!saving && !dirty && !paths.includes(selected)) setSelected(paths[0] ?? '');
  }, [paths, selected, saving, dirty]);
  useLayoutEffect(() => () => callbacks.current.onDirtyChange(false), [callbacks]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void callbacks.current.port
      .read(selected)
      .then(source => {
        if (cancelled) return;
        updateDrafts(previous => {
          const existing = previous[selected];
          return {
            ...previous,
            [selected]: {
              source,
              content: existing?.manual ? existing.content : (source.working.content ?? ''),
              manual: existing?.manual ?? false,
              blockSource: existing?.manual
                ? existing.blockSource
                : { ours: source.ours, theirs: source.theirs },
              blocks: existing?.manual
                ? sameMergeSides(existing.blockSource, source)
                  ? existing.blocks
                  : existing.blocks.map(block => ({ ...block, valid: false }))
                : initializeMergeBlocks(source),
            },
          };
        });
      })
      .catch(error => {
        if (!cancelled) setError(String(error).replace(/^Error: /, ''));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, reload, callbacks, updateDrafts]);
  const select = (path: string) => {
    if (!savingRef.current) {
      setSelected(path);
      setDiscarding(false);
    }
  };
  const change = (content: string, blocks?: MergeResultBlock[]) => {
    if (savingRef.current) return;
    updateDrafts(previous =>
      previous[selected]
        ? {
            ...previous,
            [selected]: {
              ...previous[selected],
              content,
              manual: true,
              blocks:
                blocks && sameMergeSides(previous[selected].blockSource, previous[selected].source)
                  ? blocks
                  : (blocks ?? previous[selected].blocks).map(block => ({
                      ...block,
                      valid: false,
                    })),
            },
          }
        : previous
    );
  };
  const applyBlock = (id: number, choice: MergeBlockChoice, mode: MergeBlockMode = 'replace') => {
    if (loading || savingRef.current) return;
    updateDrafts(previous => {
      const current = previous[selected];
      if (!current?.source.manualAllowed || !sameMergeSides(current.source, current.blockSource))
        return previous;
      const result = applyMergeBlock(current.content, current.blocks, id, choice, mode);
      return result
        ? { ...previous, [selected]: { ...current, ...result, manual: true } }
        : previous;
    });
  };
  const startManual = () => {
    if (draft && !savingRef.current)
      updateDrafts(previous => ({
        ...previous,
        [selected]: { ...previous[selected], manual: true },
      }));
  };
  const resolve = async (choice: ConflictChoice) => {
    if (!draft || loading || savingRef.current) return;
    if (choice === 'manual' && hasConflictMarkers(draft.content)) {
      setError('Resolve all conflict markers before saving the result.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await callbacks.current.port.resolve({
        path: selected,
        revision: draft.source.revision,
        choice,
        ...(choice === 'manual' ? { content: draft.content } : {}),
      });
      updateDrafts(previous =>
        Object.fromEntries(Object.entries(previous).filter(([path]) => path !== selected))
      );
      setSelected(remaining.find(path => path !== selected) ?? '');
    } catch (error) {
      setError(String(error).replace(/^Error: /, ''));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const close = () => {
    if (savingRef.current) return;
    if (hasDirtyDrafts(currentDrafts.current)) setDiscarding(true);
    else callbacks.current.onClose();
  };
  const discard = () => callbacks.current.onClose();
  const keepEditing = () => setDiscarding(false);
  const reloadVersions = () => {
    if (!savingRef.current) setReload(value => value + 1);
  };
  return {
    selected,
    remaining,
    draft,
    loading,
    saving,
    error,
    discarding,
    select,
    change,
    applyBlock,
    startManual,
    resolve,
    close,
    discard,
    keepEditing,
    reloadVersions,
  };
}
