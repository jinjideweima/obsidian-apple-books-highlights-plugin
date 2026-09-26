import { vi } from 'vitest';
import { VaultManagement } from '../../src/modules/vaultManagement';
import { defaultPluginSettings } from '../../src/settings';

export const memoryVault = () => {
  const files = new Map<string, string | ArrayBuffer>();
  const folders = new Set<string>();
  const stamps = new Map<string, number>();
  let clock = 0;
  const file = (path: string) =>
    files.has(path)
      ? {
          path,
          name: path.split('/').pop(),
          basename: path.split('/').pop()!.replace(/\.md$/, ''),
          stat: { mtime: stamps.get(path) || 0, size: String(files.get(path)).length },
        }
      : null;
  const put = (path: string, value: string | ArrayBuffer) => {
    files.set(path, value);
    stamps.set(path, ++clock);
  };
  const events = new Map<string, Array<() => void>>();
  const api: any = {
    on: (name: string, cb: () => void) => {
      events.set(name, [...(events.get(name) || []), cb]);
      return {};
    },
    getFolderByPath: (path: string) => (folders.has(path) ? { path } : null),
    getFileByPath: file,
    getMarkdownFiles: () => [...files.keys()].filter((p) => p.endsWith('.md')).map(file),
    createFolder: vi.fn(async (p: string) => {
      folders.add(p);
    }),
    create: vi.fn(async (p: string, c: string) => {
      if (files.has(p)) throw new Error('exists');
      put(p, c);
    }),
    read: vi.fn(async (f: any) => files.get(f.path)),
    cachedRead: vi.fn(async (f: any) => files.get(f.path)),
    modify: vi.fn(async (f: any, c: string) => put(f.path, c)),
    process: vi.fn(async (f: any, fn: (s: string) => string) => {
      const before = files.get(f.path) as string;
      const after = fn(before);
      if (before !== after) {
        await api.modify(f, after);
      }
      return after;
    }),
    readBinary: vi.fn(async (f: any) => files.get(f.path)),
    createBinary: vi.fn(async (p: string, b: ArrayBuffer) => put(p, b)),
    modifyBinary: vi.fn(async (f: any, b: ArrayBuffer) => put(f.path, b)),
    delete: vi.fn(async (f: any) => { files.delete(f.path); folders.delete(f.path); }),
    rename: vi.fn(async (f: any, path: string) => { const value = files.get(f.path)!; files.delete(f.path); put(path, value); f.path = path; f.name = path.split('/').pop(); }),
    adapter: {
      rmdir: async (path: string) => { folders.delete(path); },
      exists: async (path: string) => files.has(path) || folders.has(path),
      read: async (path: string) => files.get(path),
      write: async (path: string, text: string) => put(path, text),
      mkdir: async (path: string) => { folders.add(path); },
      list: async (p: string) => ({
        files: [...files.keys()].filter((k) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')),
        folders: [...folders].filter((k) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')),
      }),
      copy: vi.fn(async (from: string, to: string) => put(to, files.get(from)!)),
      rename: vi.fn(),
    },
  };
  const app: any = {
    vault: api,
    fileManager: {
      trashFile: vi.fn(async (f: any) => {
        files.delete(f.path);
      }),
    },
    workspace: { openLinkText: vi.fn() },
  };
  const settings = { ...defaultPluginSettings, keepMeSectionData: {} };
  return { app, api, files, folders, put, settings, vault: new VaultManagement(app, settings) };
};
