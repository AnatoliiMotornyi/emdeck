import type { Extension } from '@codemirror/state';
import { isDotenv } from '../../../shared/lib/paths';

export const loadLanguage = async (path: string): Promise<Extension> => {
  if (isDotenv(path)) return (await import('./dotenv')).dotenv;
  const ext = path.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext ?? ''))
    return (await import('@codemirror/lang-javascript')).javascript({
      typescript: ext === 'ts' || ext === 'tsx',
      jsx: ext === 'jsx' || ext === 'tsx',
    });
  if (ext === 'json') return (await import('@codemirror/lang-json')).json();
  if (ext === 'css') return (await import('@codemirror/lang-css')).css();
  if (ext === 'html') return (await import('@codemirror/lang-html')).html();
  if (['md', 'markdown', 'mdown', 'mkd'].includes(ext ?? ''))
    return (await import('@codemirror/lang-markdown')).markdown();
  if (ext === 'py') return (await import('@codemirror/lang-python')).python();
  if (ext === 'rs') return (await import('@codemirror/lang-rust')).rust();
  return [];
};
