export interface BranchNode {
  name: string;
  path: string;
  children: BranchNode[];
}
// Keep full Git names on every node; labels alone are not unique across folders.
export const branchTree = (
  branches: string[],
  query = '',
  scope: 'local' | 'remote' = 'local',
  currentBranch = ''
): BranchNode[] => {
  const root: BranchNode[] = [];
  let current: BranchNode | undefined;
  const nodes = new Map<string, BranchNode>();
  const filter = query.trim().toLowerCase();
  for (const branch of branches) {
    if (!branch.toLowerCase().includes(filter)) continue;
    if (scope === 'local' && branch === currentBranch) {
      current = { name: branch, path: branch, children: [] };
      continue;
    }
    let children = root;
    let path = '';
    for (const name of branch.split('/')) {
      path = path ? `${path}/${name}` : name;
      let node = nodes.get(path);
      if (!node) {
        node = { name, path, children: [] };
        nodes.set(path, node);
        children.push(node);
      }
      children = node.children;
    }
  }
  const isMain = (node: BranchNode) =>
    !node.children.length &&
    (scope === 'local' ? node.path === 'main' : /^[^/]+\/main$/.test(node.path));
  const sort = (children: BranchNode[]): BranchNode[] => {
    children.sort(
      (a, b) =>
        Number(isMain(b)) - Number(isMain(a)) ||
        Number(b.children.length > 0) - Number(a.children.length > 0) ||
        a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    children.forEach(node => sort(node.children));
    return children;
  };
  const sorted = sort(root);
  return current ? [current, ...sorted] : sorted;
};
