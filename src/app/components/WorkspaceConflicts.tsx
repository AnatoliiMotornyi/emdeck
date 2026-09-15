import { lazy, Suspense } from 'react';
import type { MergeEditorProps } from '../../shared/contracts/gitConflicts';
import type { WorkspaceController } from '../hooks/useWorkspace';
const ConflictResolver = lazy(() => import('../../features/git/components/ConflictResolver'));
const MergeCodePane = lazy(() => import('../../features/editor/components/MergeCodePane'));

type Props = {
  model: Pick<
    WorkspaceController,
    | 'conflictRequest'
    | 'project'
    | 'git'
    | 'settings'
    | 'readConflict'
    | 'resolveGitConflict'
    | 'setConflictRequest'
    | 'setMergeDraftDirty'
  >;
};
export default function WorkspaceConflicts({ model }: Props) {
  const {
    conflictRequest,
    project,
    git,
    settings,
    readConflict,
    resolveGitConflict,
    setConflictRequest,
    setMergeDraftDirty,
  } = model;
  const handleClose = () => setConflictRequest(null);
  if (!conflictRequest || conflictRequest.root !== project?.root) return null;
  const root = conflictRequest.root;
  const paths = git?.changes.flatMap(change => (change.conflict ? [change.path] : [])) ?? [];
  const read = (path: string) => readConflict(root, path);
  const resolve: Parameters<typeof ConflictResolver>[0]['port']['resolve'] = request =>
    resolveGitConflict(root, request);
  const renderEditor = (props: MergeEditorProps) => (
    <Suspense fallback={<p className='loading'>Opening merge editor…</p>}>
      <MergeCodePane {...props} settings={settings} />
    </Suspense>
  );
  return (
    <Suspense fallback={null}>
      <ConflictResolver
        key={root}
        paths={paths}
        initialPath={conflictRequest.path}
        operation={git?.operation}
        port={{ read, resolve }}
        renderEditor={renderEditor}
        onDirtyChange={setMergeDraftDirty}
        onClose={handleClose}
      />
    </Suspense>
  );
}
