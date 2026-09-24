export const shortRef = (reference: string) => {
  return reference.replace(/^refs\/(heads|remotes)\//, '');
};

/**
 * The branch a feature branch is expected to be brought up to date with. Emdeck
 * does not read `origin/HEAD`, which is a local cache that is often stale or
 * missing, so the conventional names are tried in order and only local branches
 * count: merging a remote-tracking ref would leave the local one behind.
 */
export const integrationRef = (branch: string, local: string[]) => {
  const name = ['main', 'master', 'trunk'].find(
    candidate => candidate !== branch && local.includes(candidate)
  );
  return name ? `refs/heads/${name}` : null;
};

// A local branch may be named like a remote ('origin/shared'), so locals resolve first.
export const qualifyRef = (name: string, local: string[], remote: string[]) => {
  if (/^refs\/(heads|remotes)\//.test(name)) return name;
  if (local.includes(name)) return `refs/heads/${name}`;
  if (remote.includes(name)) return `refs/remotes/${name}`;
  return null;
};
