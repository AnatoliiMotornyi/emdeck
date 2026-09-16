import type { Entry, FileData, GitSnapshot } from '../../shared/contracts/workspace';
import { readStored, store } from '../storage/preferences';
const initial: Record<string, string> = {
  'src/app.ts': `import { createWorkspace } from './workspace';\nimport { agents } from './agents';\n\n/**\n * A little less tooling. A lot more building.\n *\n * Keep your code close and your agents closer.\n */\nexport async function startWorkspace() {\n  const workspace = await createWorkspace({\n    name: 'my-next-idea',\n    theme: 'dark',\n    indexing: false,\n  });\n\n  // Give each agent a place to work.\n  for (const agent of agents) {\n    workspace.openTerminal({\n      name: agent.name,\n      command: agent.command,\n      cwd: workspace.root,\n    });\n  }\n\n  return workspace;\n}\n\nstartWorkspace();\n`,
  'src/agents.ts': `export const agents = [\n  { name: 'Codex', command: 'codex' },\n  { name: 'Claude', command: 'claude' },\n];\n`,
  'src/workspace.ts': `export async function createWorkspace(options: {\n  name: string; theme: string; indexing: boolean;\n}) {\n  return {\n    ...options,\n    root: '.',\n    openTerminal: (config: unknown) => console.log(config),\n  };\n}\n`,
  'src/styles/theme.css': `:root {\n  --background: #121418;\n  --foreground: #d4d7dc;\n  --accent: #b8ee86;\n}\n`,
  'public/README.md': '# Public assets\n\nStatic assets live here.\n',
  'tests/workspace.test.ts': `// This is a preview project, stored only in your browser.\n// Open the desktop app to work with real files and terminals.\n`,
  '.gitignore': 'node_modules\ndist\n.env\n',
  'package.json':
    JSON.stringify(
      {
        name: 'hello-emdeck',
        version: '0.1.0',
        scripts: { dev: 'vite', build: 'tsc && vite build', test: 'vitest' },
        private: true,
      },
      null,
      2
    ) + '\n',
  'README.md':
    '# Hello, Emdeck\n\nYour code. Your agents. One workspace.\n\nThis is an interactive browser preview. File edits are kept in local browser storage.\n\nThe desktop app opens real projects, runs your installed agents in native terminals,\nand provides local Git tools. Run `npm run desktop` from the source project.\n',
  'tsconfig.json':
    '{\n  "compilerOptions": {\n    "strict": true,\n    "target": "ES2022"\n  }\n}\n',
};
let files = readStored<Record<string, string>>('relay:demo-files', initial);
const dirs = new Set(['src', 'src/styles', 'public', 'tests']);
const persist = () => store('relay:demo-files', files);
export async function demoCall<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const path = String(args.path ?? '');
  let result: unknown;
  switch (command) {
    case 'open_project':
      result = { kind: 'opened', project: { root: '/preview/hello-relay', name: 'hello-emdeck' } };
      break;
    case 'read_directory': {
      const prefix = path ? `${path}/` : '';
      const found = new Map<string, Entry>();
      for (const key of [...dirs, ...Object.keys(files)]) {
        if (!key.startsWith(prefix) || key === path) continue;
        const rest = key.slice(prefix.length);
        const name = rest.split('/')[0];
        found.set(name, {
          name,
          path: prefix + name,
          isDir: rest.includes('/') || dirs.has(prefix + name),
          isSymlink: false,
        });
      }
      result = [...found.values()].sort(
        (a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)
      );
      break;
    }
    case 'find_file':
      result = Object.keys(files).filter(file => file.split('/').pop() === args.name);
      break;
    case 'read_file':
      if (!(path in files)) throw new Error('File not found');
      result = { content: files[path], revision: files[path] } satisfies FileData;
      break;
    case 'read_image':
      if (!(path in files) || !path.toLowerCase().endsWith('.svg'))
        throw new Error('Image unavailable in this preview project.');
      result = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(files[path])}`;
      break;
    case 'save_file':
      if (files[path] !== args.revision)
        throw new Error('EXTERNAL_CHANGE: File changed. Reload before saving.');
      files[path] = String(args.content);
      persist();
      result = { content: files[path], revision: files[path] };
      break;
    case 'create_entry':
      if (path in files || dirs.has(path)) throw new Error('Name already exists');
      if (args.directory) dirs.add(path);
      else files[path] = '';
      persist();
      break;
    case 'copy_entry':
    case 'rename_entry': {
      const from = String(args.from),
        to = String(args.to);
      if (to in files || dirs.has(to) || to.startsWith(from + '/'))
        throw new Error('Choose a new destination');
      for (const key of [...Object.keys(files)])
        if (key === from || key.startsWith(from + '/')) {
          files[to + key.slice(from.length)] = files[key];
          if (command === 'rename_entry') delete files[key];
        }
      for (const key of [...dirs])
        if (key === from || key.startsWith(from + '/')) {
          dirs.add(to + key.slice(from.length));
          if (command === 'rename_entry') dirs.delete(key);
        }
      persist();
      break;
    }
    case 'trash_entry':
      files = Object.fromEntries(
        Object.entries(files).filter(([k]) => k !== path && !k.startsWith(path + '/'))
      );
      for (const key of [...dirs]) if (key === path || key.startsWith(path + '/')) dirs.delete(key);
      persist();
      break;
    case 'git_snapshot':
      result = {
        available: false,
        message:
          'Git is available in the desktop app. Open a local repository to inspect changes, manage branches, and resolve conflicts.',
        branch: '',
        localBranches: [],
        remoteBranches: [],
        changes: [],
        commits: [],
      } satisfies GitSnapshot;
      break;
    default:
      throw new Error('This feature requires the Emdeck desktop app. Run npm run desktop.');
  }
  return result as T;
}
