import type { App, TFile } from 'obsidian';
import { tryParseFrontmatter } from '../utils/markdown';

const parent = (path: string) => path.slice(0, path.lastIndexOf('/'));
export const isBackup = (path: string) => /-bk-\d+(?:\/|$)/.test(path);

// Only notes that can link to oldPath need reading. The link index covers body, embed, Markdown
// and property links; notes it has not indexed yet are still read, as is every note when the
// index is unavailable.
const linkSources = (app: App, oldPath: string): TFile[] => {
  const files = app.vault.getMarkdownFiles();
  const resolved = app.metadataCache?.resolvedLinks;
  if (!resolved) return files;
  return files.filter((file) => resolved[file.path]?.[oldPath] || !app.metadataCache.getFileCache(file));
};

// Use Obsidian's resolver, but deliberately exclude historical snapshots from link edits.
async function planLinks(app: App, oldPath: string, target: TFile): Promise<Array<{ source: TFile; original: string; next: string }>> {
  const edits: Array<{ source: TFile; original: string; next: string }> = [];
  for (const source of linkSources(app, oldPath)) {
    if (isBackup(source.path)) continue;
    const original = await app.vault.read(source);
    const transform = (text: string) =>
      text
        .replace(/(!?)\[\[([^\]\n]+)\]\]/g, (whole, embed, inner: string) => {
          const [dest, ...alias] = inner.split('|');
          const [link, ...sub] = dest.split('#');
          const resolved = app.metadataCache?.getFirstLinkpathDest(link, source.path);
          if (resolved?.path !== oldPath && link !== oldPath && link !== oldPath.replace(/\.md$/, '')) return whole;
          return `${embed}[[${target.path.replace(/\.md$/, '')}${sub.length ? '#' + sub.join('#') : ''}${alias.length ? '|' + alias.join('|') : ''}]]`;
        })
        .replace(/(!?\[[^\]\n]*\])\((<?)([^\s>]+)>?\)/g, (whole, label, _angle, url: string) => {
          let decoded: string;
          try {
            decoded = decodeURIComponent(url);
          } catch {
            return whole;
          }
          const [link, ...sub] = decoded.split('#');
          const resolved = app.metadataCache?.getFirstLinkpathDest(link, source.path);
          if (resolved?.path !== oldPath && link !== oldPath && link !== oldPath.replace(/\.md$/, '')) return whole;
          return `${label}(<${encodeURI(target.path).replace(/#/g, '%23')}${sub.length ? '#' + sub.join('#') : ''}>)`;
        });
    const next = transform(original);
    if (next !== original) edits.push({ source, original, next });
  }
  return edits;
}

async function applyLinks(app: App, edits: Awaited<ReturnType<typeof planLinks>>): Promise<void> {
  for (const edit of edits)
    await app.vault.process(edit.source, (current) => {
      if (current !== edit.original) throw new Error('链接迁移期间文件被修改，请重试：' + edit.source.path);
      return edit.next;
    });
}

export async function redirectLinks(app: App, oldPath: string, target: TFile): Promise<void> {
  await applyLinks(app, await planLinks(app, oldPath, target));
}

export async function relocateFile(app: App, file: TFile, destination: string): Promise<void> {
  if (file.path === destination) return;
  if (app.vault.getFileByPath(destination)) throw new Error('目标文件已存在，未覆盖：' + destination);
  const old = file.path;
  const edits = await planLinks(app, old, { ...file, path: destination } as TFile);
  await app.vault.rename(file, destination);
  try {
    await applyLinks(app, edits);
  } catch (error) {
    await app.vault.rename(file, old);
    for (const edit of edits) {
      if ((await app.vault.read(edit.source)) === edit.next)
        await app.vault.process(edit.source, (text) => (text === edit.next ? edit.original : text));
    }
    throw error;
  }
}

export async function consolidateCards(
  app: App,
  files: TFile[],
  bookId: string,
  folder: string,
  ensure: (p: string) => Promise<void>,
): Promise<string[]> {
  const matching: TFile[] = [];
  for (const f of files) {
    const fm = tryParseFrontmatter(await app.vault.read(f));
    if (fm && String(fm.book_id) === bookId && fm.type === 'ibooks_highlight') matching.push(f);
  }
  const oldFolders = [...new Set(matching.map((f) => parent(f.path)))];
  const destinations = new Set<string>();
  for (const f of matching) {
    const dest = `${folder}/${f.name}`;
    if (destinations.has(dest) || (dest !== f.path && app.vault.getFileByPath(dest)))
      throw new Error('卡片目录存在同名文件，未合并或覆盖：' + dest);
    destinations.add(dest);
  }
  await ensure(folder);
  for (const f of matching) await relocateFile(app, f, `${folder}/${f.name}`);
  for (const old of oldFolders) {
    if (old === folder) continue;
    const contents = await app.vault.adapter.list(old);
    if (!contents.files.length && !contents.folders.length) {
      await app.vault.adapter.rmdir(old, true);
    }
  }
  return oldFolders;
}
