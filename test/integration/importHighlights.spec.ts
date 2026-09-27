import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { IBook, IAnnotation } from '../../src/types';
import { importHighlights } from '../../src/importHighlights';
import * as source from '../../src/modules/dataFetching';
import * as epub from '../../src/modules/epubChapters';
import {
  getHighlightCards,
  setHighlightFavorite,
  setHighlightLocalNote,
  setHighlightProperties,
  deleteArchivedCard,
} from '../../src/modules/highlightRepository';
import { parseFrontmatter, patchProperties } from '../../src/utils/markdown';
import { memoryVault } from '../mocks/memoryVault';

vi.mock('../../src/modules/dataFetching');
vi.mock('../../src/modules/epubChapters', () => ({
  inferMissingChapters: vi.fn(),
  enrichBookMetadata: vi.fn(),
  extractBookCover: vi.fn(),
}));
const book: IBook = {
  bookId: '001234',
  bookTitle: '学会说 "不"',
  bookAuthor: '作者甲',
  bookGenre: '心理',
  bookLanguage: 'zh',
  bookLastOpenedDate: 700000000,
  bookFinishedDate: null,
  bookCoverUrl: '',
};
const annotation = (location: string): IAnnotation => ({
  assetId: book.bookId,
  chapter: '第一章',
  contextualText: '上下文',
  highlight: '划线' + location,
  note: 'Apple 想法',
  highlightLocation: location,
  highlightStyle: 3,
  highlightCreationDate: 1,
  highlightModificationDate: 1,
});
let env: ReturnType<typeof memoryVault>;
let books: IBook[];
let annotations: IAnnotation[];
let deleted: Array<{ assetId: string; highlightLocation: string }>;
const sync = () => importHighlights(env.vault, env.settings);
const cards = () => getHighlightCards(env.app, env.settings);
const mainPath = () => [...env.files.keys()].find((p) => p.endsWith('.md') && !p.includes('/cards/') && !p.includes('-bk-'))!;
beforeEach(() => {
  vi.resetAllMocks();
  env = memoryVault();
  books = [{ ...book }];
  annotations = [annotation('loc1'), annotation('loc2')];
  deleted = [];
  vi.mocked(source.getBooks).mockImplementation(async () => books);
  vi.mocked(source.getAnnotations).mockImplementation(async () => annotations);
  vi.mocked(source.getDeletedAnnotations).mockImplementation(async () => deleted);
  vi.mocked(epub.extractBookCover).mockResolvedValue(null);
});
describe('safe incremental import', () => {
  test('quoted title, leading-zero ID and actual source link round-trip', async () => {
    await sync();
    const [card] = await cards();
    expect(card.bookTitle).toBe(book.bookTitle);
    expect(card.bookId).toBe('001234');
    expect(env.files.get(card.path)).toContain(`[[${mainPath().slice(0, -3)}|`);
    expect(parseFrontmatter(env.files.get(mainPath()) as string).title).toBe(book.bookTitle);
  });
  test('unchanged second import writes no Markdown or covers', async () => {
    vi.mocked(epub.extractBookCover).mockResolvedValue({ data: new Uint8Array([1, 2]), extension: 'png' });
    await sync();
    env.api.modify.mockClear();
    env.api.process.mockClear();
    env.api.modifyBinary.mockClear();
    const result = await sync();
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(3);
    expect(env.api.modify).not.toHaveBeenCalled();
    expect(env.api.process).not.toHaveBeenCalled();
    expect(env.api.modifyBinary).not.toHaveBeenCalled();
  });
  test('backup copies cards without moving or resetting local notes/favorites', async () => {
    await sync();
    const [card] = await cards();
    await setHighlightFavorite(env.app, card, true);
    await setHighlightLocalNote(env.app, card, '我的独立思考');
    env.settings.backup = true;
    await sync();
    const [after] = await cards();
    expect(after.favorite).toBe(true);
    expect(after.localNote).toBe('我的独立思考');
    expect(env.api.adapter.rename).not.toHaveBeenCalled();
    expect([...env.files].some(([p, c]) => p.includes('-bk-') && String(c).includes('我的独立思考'))).toBe(true);
  });
  test('backup retention trashes only the oldest plugin snapshots', async () => {
    await sync();
    env.settings.backup = true;
    env.settings.backupRetention = 2;
    const root = env.settings.highlightsFolder;
    // Older snapshots from earlier imports, plus folders that merely look similar.
    for (const folder of [`${root}-bk-100`, `${root}-bk-200`, `${root}-bk-300`, `${root}-bk-old`, `${root}-bk-50/nested`, `other-bk-1`]) {
      env.folders.add(folder);
      env.put(`${folder}/note.md`, 'snapshot');
    }
    let now = 1000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      await sync();
      expect(env.folders.has(`${root}-bk-1000`)).toBe(true);
      expect(env.folders.has(`${root}-bk-300`)).toBe(true);
      expect(env.folders.has(`${root}-bk-200`)).toBe(false);
      expect(env.files.has(`${root}-bk-100/note.md`)).toBe(false);
      for (const kept of [`${root}-bk-old`, `${root}-bk-50/nested`, `other-bk-1`]) expect(env.folders.has(kept)).toBe(true);
      now = 2000;
      env.settings.backupRetention = 0;
      await sync();
      expect(env.folders.has(`${root}-bk-300`)).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
  test('a failed backup cleanup is reported without blocking the import', async () => {
    await sync();
    env.settings.backup = true;
    env.settings.backupRetention = 1;
    env.folders.add(`${env.settings.highlightsFolder}-bk-1`);
    env.app.fileManager.trashFile.mockRejectedValueOnce(new Error('locked'));
    annotations.push(annotation('loc3'));
    const result = await sync();
    expect(result.warnings.join()).toContain('旧备份清理失败');
    expect(result.failures).toEqual([]);
    expect(result.created).toBe(1);
  });
  test('retains main-note prose, manual properties, lists and cleared values', async () => {
    await sync();
    const path = mainPath();
    env.put(
      path,
      patchProperties(env.files.get(path) as string, {
        rating: 5,
        category: ['工作', '生活'],
        title: '我的书名',
        status: '暂停',
        author: '',
      }) + '\n## 我的总结\n永远保留\n',
    );
    annotations.push(annotation('loc3'));
    await sync();
    const text = env.files.get(path) as string;
    expect(parseFrontmatter(text)).toMatchObject({
      rating: 5,
      category: ['工作', '生活'],
      title: '我的书名',
      status: '暂停',
      author: '',
      annotation_count: 3,
    });
    expect(text).toContain('永远保留');
  });
  test('same book ID keeps renamed file and moves existing cards without changing identity', async () => {
    await sync();
    const path = mainPath();
    const before = (await cards()).map((c) => c.path);
    const newPath = 'ibooks-highlights/我改过的文件名.md';
    env.put(newPath, env.files.get(path)!);
    env.files.delete(path);
    books[0].bookTitle = '来源改名';
    await sync();
    expect(mainPath()).toBe(newPath);
    expect((await cards()).map((c) => c.path.split('/').pop())).toEqual(before.map((p) => p.split('/').pop()));
    expect((await cards()).every((c) => c.path.includes('/cards/我改过的文件名/'))).toBe(true);
    expect(env.files.get((await cards())[0].path)).toContain('[[ibooks-highlights/我改过的文件名|');
  });
  test('different book IDs sharing a title do not overwrite one another', async () => {
    books.push({ ...book, bookId: 'different' });
    annotations.push({ ...annotation('loc1'), assetId: 'different' });
    const result = await sync();
    expect(result.failures).toEqual([]);
    expect(result.books).toBe(2);
    expect([...env.files.keys()].filter((p) => p.endsWith('.md') && !p.includes('/cards/'))).toHaveLength(2);
  });
  test('explicit single deletion archives ordinary card, keeps file', async () => {
    annotations.forEach((a) => {
      a.note = null;
    });
    await sync();
    const [card] = await cards();
    annotations = [annotation('loc2')];
    deleted = [{ assetId: book.bookId, highlightLocation: 'loc1' }];
    const result = await sync();
    expect(result.archived).toBe(1);
    expect(env.files.has(card.path)).toBe(true);
    expect((await cards()).find((c) => c.path === card.path)).toMatchObject({ archived: true, sourceRemoved: true });
  });
  test('local thought/favorite protects card from archive', async () => {
    await sync();
    const [card] = await cards();
    await setHighlightLocalNote(env.app, card, '独立思考');
    annotations = [annotation('loc2')];
    deleted = [{ assetId: book.bookId, highlightLocation: 'loc1' }];
    expect((await sync()).retained).toBe(1);
    expect((await cards()).find((c) => c.path === card.path)).toMatchObject({
      archived: false,
      sourceRemoved: true,
      localNote: '独立思考',
    });
  });
  test('restored card stays restored on later sync; explicit cleanup only trashes archive', async () => {
    annotations.forEach((a) => {
      a.note = null;
    });
    await sync();
    annotations = [annotation('loc2')];
    deleted = [{ assetId: book.bookId, highlightLocation: 'loc1' }];
    await sync();
    const card = (await cards()).find((c) => c.archived)!;
    await setHighlightProperties(env.app, card, { archived: false, restored: true });
    await sync();
    expect((await cards()).find((c) => c.path === card.path)?.archived).toBe(false);
    await expect(deleteArchivedCard(env.app, card)).rejects.toThrow();
    await setHighlightProperties(env.app, card, { archived: true });
    await deleteArchivedCard(env.app, card);
    expect(env.files.has(card.path)).toBe(false);
  });
  test('reappearing source restores archived card', async () => {
    await sync();
    annotations = [annotation('loc2')];
    deleted = [{ assetId: book.bookId, highlightLocation: 'loc1' }];
    await sync();
    annotations.push(annotation('loc1'));
    await sync();
    expect((await cards()).every((c) => !c.archived && !c.sourceRemoved)).toBe(true);
  });
  test('missing book and final-highlight ambiguity preserve all existing notes even with backup enabled', async () => {
    await sync();
    const before = new Map(env.files);
    env.settings.backup = true;
    books = [];
    annotations = [];
    await sync();
    expect(env.files).toEqual(before);
    books = [{ ...book }];
    deleted = [{ assetId: book.bookId, highlightLocation: 'loc1' }];
    expect((await sync()).warnings.length).toBeGreaterThan(0);
    expect(env.files).toEqual(before);
  });
  test('absence without explicit deletion never archives a card', async () => {
    await sync();
    annotations = [annotation('loc2')];
    await sync();
    expect((await cards()).every((c) => !c.archived)).toBe(true);
  });
  test('failed source read performs no backup or write', async () => {
    await sync();
    const before = new Map(env.files);
    env.settings.backup = true;
    vi.mocked(source.getDeletedAnnotations).mockRejectedValue(new Error('database locked'));
    await expect(sync()).rejects.toThrow('database locked');
    expect(env.files).toEqual(before);
    expect(env.api.adapter.copy).not.toHaveBeenCalled();
  });
  test('unreadable EPUB preserves old cover and completes highlights', async () => {
    vi.mocked(epub.extractBookCover).mockResolvedValue({ data: new Uint8Array([1]), extension: 'jpg' });
    await sync();
    const cover = parseFrontmatter(env.files.get(mainPath()) as string).cover;
    vi.mocked(epub.extractBookCover).mockRejectedValue(new Error('EPERM'));
    annotations.push(annotation('loc3'));
    const result = await sync();
    expect(result.failures).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(parseFrontmatter(env.files.get(mainPath()) as string).cover).toBe(cover);
    expect(await cards()).toHaveLength(3);
  });
  test('single import uses same cover and preservation pipeline and limits scope', async () => {
    books.push({ ...book, bookId: 'other' });
    annotations.push({ ...annotation('loc3'), assetId: 'other' });
    vi.mocked(epub.extractBookCover).mockResolvedValue({ data: new Uint8Array([1]), extension: 'jpg' });
    await importHighlights(env.vault, env.settings, 'modify', book.bookId);
    expect(await cards()).toHaveLength(2);
    expect(epub.extractBookCover).toHaveBeenCalledTimes(1);
    expect(parseFrontmatter(env.files.get(mainPath()) as string).cover).toBeTruthy();
  });
  test('malformed YAML is never overwritten or duplicated, and other books still import', async () => {
    await sync();
    const path = mainPath();
    const broken = `---\ntitle: [broken\nbook_id: "${book.bookId}"\n---\nmy text`;
    env.put(path, broken);
    books.push({ ...book, bookId: 'other', bookTitle: '另一本书' });
    annotations.push({ ...annotation('o1'), assetId: 'other' });
    const result = await sync();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain(path);
    expect(result.books).toBe(1);
    expect(env.files.get(path)).toBe(broken);
    const mains = [...env.files.keys()].filter((p) => p.endsWith('.md') && !p.includes('/cards/'));
    expect(mains).toHaveLength(2);
    expect(mains.some((p) => p.includes('另一本书'))).toBe(true);
  });
  test('a broken note without a readable book ID still blocks the book it would be written to', async () => {
    await sync();
    const path = mainPath();
    env.put(path, '---\ntitle: [broken\n---\nmy text');
    const result = await sync();
    expect(result.failures[0]).toContain(path);
    expect([...env.files.keys()].filter((p) => p.endsWith('.md') && !p.includes('/cards/'))).toEqual([path]);
  });
  test('a 1.8 note with unescaped quotes imports normally and is rewritten as valid YAML', async () => {
    await sync();
    const path = mainPath();
    const legacy = (env.files.get(path) as string).replace(/^title:.*$/m, 'title: "学会说 "不""');
    env.put(path, legacy);
    const result = await sync();
    expect(result.failures).toEqual([]);
    expect(parseFrontmatter(env.files.get(path) as string).title).toBe('学会说 "不"');
    expect(env.files.get(path)).not.toContain('title: "学会说 "不""');
  });
  test('custom card fields and extra sections survive reimport', async () => {
    await sync();
    const [card] = await cards();
    env.put(card.path, patchProperties(env.files.get(card.path) as string, { custom: ['a', 'b'] }) + '\n## 我的扩展\n扩展内容\n');
    await sync();
    expect(parseFrontmatter(env.files.get(card.path) as string).custom).toEqual(['a', 'b']);
    expect(env.files.get(card.path)).toContain('扩展内容');
  });
  test('incremental repository caches unchanged reads and observes local edits', async () => {
    await sync();
    await cards();
    env.api.cachedRead.mockClear();
    await cards();
    expect(env.api.cachedRead).not.toHaveBeenCalled();
    const [card] = await cards();
    await setHighlightFavorite(env.app, card, true);
    expect((await cards())[0].favorite).toBe(true);
  });
});

test('nested local headings remain intact after reimport', async () => {
  await sync();
  const [card] = await cards();
  const note = '我想到：\n## 实践\n> 保留引用\n第一步\n## 复盘\n第二步';
  await setHighlightLocalNote(env.app, card, note);
  await sync();
  expect((await cards())[0].localNote).toBe(note);
});
test('a file edited during import is not overwritten', async () => {
  await sync();
  const path = mainPath();
  const before = env.files.get(path) as string;
  env.put(path, before + '\n刚刚输入的内容');
  await expect(env.vault.upsertFile(path, 'replacement', before)).rejects.toThrow('文件在导入期间被修改');
  expect(env.files.get(path)).toContain('刚刚输入的内容');
});
test('missing source chapter/context does not erase enriched content', async () => {
  await sync();
  annotations = annotations.map((a) => ({ ...a, chapter: '', contextualText: '' }));
  await sync();
  expect((await cards())[0].chapter).toBe('第一章');
  expect(env.files.get((await cards())[0].path)).toContain('上下文');
});
test('an unreadable book does not prevent other books from importing', async () => {
  books.push({ ...book, bookId: 'other' });
  annotations.push({ ...annotation('loc3'), assetId: 'other' });
  env.api.create.mockImplementationOnce(async () => {
    throw new Error('disk failure');
  });
  const result = await sync();
  expect(result.failures).toHaveLength(1);
  expect(result.books).toBe(1);
});

test('source UUID keeps identity, notes and incoming links when range moves', async () => {
  annotations[0].sourceAnnotationId = 'uuid-a';
  await sync();
  const original = (await cards())[0];
  await setHighlightLocalNote(env.app, original, '## 独立思考\n> 必须保留');
  env.put('引用.md', `[[${original.path.slice(0, -3)}|引用摘录]]`);
  annotations[0].highlightLocation = 'loc50';
  annotations[0].highlight = '扩大的划线';
  expect((await sync()).failures).toEqual([]);
  const updated = (await cards()).find((c) => c.annotationId === original.annotationId)!;
  expect(updated.path).toBe(original.path);
  expect(updated.highlightLocation).toBe('loc50');
  expect(updated.localNote).toContain('必须保留');
  expect(updated.sourceKey).toContain('#loc50');
  expect(await cards()).toHaveLength(2);
});

test('source thought alone retains a removed card in the normal list', async () => {
  await sync();
  annotations = [annotations[1]];
  deleted = [{ assetId: book.bookId, highlightLocation: 'loc1' }];
  expect((await sync()).retained).toBe(1);
  expect((await cards())[0]).toMatchObject({ archived: false, sourceRemoved: true, appleNote: 'Apple 想法' });
});

test('renumber in book order includes retained cards and is stable across unchanged imports', async () => {
  annotations = [annotation('loc10'), annotation('loc2')];
  await sync();
  const original = (await cards()).find((c) => c.highlightLocation === 'loc10')!;
  annotations.push(annotation('loc1'));
  await sync();
  expect((await cards()).map((c) => [c.highlightLocation, c.highlightIndex])).toEqual([
    ['loc1', 1],
    ['loc2', 2],
    ['loc10', 3],
  ]);
  expect((await cards()).find((c) => c.highlightLocation === 'loc10')!.path).toBe(original.path);
  env.api.modify.mockClear();
  const result = await sync();
  expect(result.updated).toBe(0);
  expect(env.api.modify).not.toHaveBeenCalled();
});

test('metadata migrates out of prose without joining heading and body; custom properties stay', async () => {
  await sync();
  const p = mainPath();
  const old = env.files.get(p) as string;
  env.put(p, old + '\n## 我的读书笔记\n\n<!-- abkc:metadata {} -->\n这是我的正文。\n');
  await sync();
  expect(env.files.get(p)).toContain('## 我的读书笔记\n\n\n这是我的正文。');
  expect(env.files.get(p)).not.toContain('<!-- abkc:metadata');
  expect([...env.files.keys()].some((entry) => entry.includes('/.abkc-state/'))).toBe(true);
});

test('damaged legacy metadata comments do not fail the book import', async () => {
  await sync();
  const p = mainPath();
  const old = env.files.get(p) as string;
  for (const damaged of ['{not json', 'null']) {
    env.put(p, old + `\n## 我的读书笔记\n\n<!-- abkc:metadata ${damaged} -->\n这是我的正文。\n`);
    const result = await sync();
    expect(result.failures).toEqual([]);
    expect(env.files.get(p)).toContain('这是我的正文。');
    expect(env.files.get(p)).not.toContain('<!-- abkc:metadata');
  }
});

test('re-import keeps daily review progress on cards', async () => {
  const { recordReview } = await import('../../src/modules/highlightRepository');
  await sync();
  const [first] = await cards();
  await recordReview(env.app, first, 3, '2026-09-27');
  annotations[0].note = '来源想法更新';
  await sync();
  const [after] = await cards();
  expect(after.review).toMatchObject({ reps: 1, last: '2026-09-27', due: '2026-10-01' });
  expect(after.appleNote).toBe('来源想法更新');
});

test('source thought updates do not silently fill local notes', async () => {
  await sync();
  annotations[0].note = '新的想法';
  await sync();
  expect((await cards())[0]).toMatchObject({ appleNote: '新的想法', localNote: '' });
});

test('renaming consolidates covers and cards, updates incoming links, leaves backups alone', async () => {
  vi.mocked(epub.extractBookCover).mockResolvedValue({ data: new Uint8Array([1, 2]), extension: 'jpg' });
  await sync();
  const p = mainPath();
  const c = (await cards())[0];
  env.put('引用.md', `[[${c.path.slice(0, -3)}|我的引用]]`);
  env.put('ibooks-highlights-bk-123/旧引用.md', `[[${c.path.slice(0, -3)}]]`);
  env.put('ibooks-highlights/教父.md', env.files.get(p)!);
  env.files.delete(p);
  expect((await sync()).failures).toEqual([]);
  expect([...env.files.keys()].filter((entry) => entry.endsWith('.jpg'))).toEqual(['ibooks-highlights/covers/教父.jpg']);
  expect(env.files.get('引用.md')).toContain('cards/教父/');
  expect(env.files.get('ibooks-highlights-bk-123/旧引用.md')).toContain(c.path.slice(0, -3));
});

test('backup main links point into snapshot and state is copied', async () => {
  await sync();
  env.settings.backup = true;
  await sync();
  const backup = [...env.files.keys()].find((p) => /-bk-\d+\//.test(p) && p.endsWith('.md') && !p.includes('/cards/'))!;
  const root = backup.split('/').slice(0, -1).join('/');
  expect(env.files.get(backup)).toContain(`[[${root}/cards/`);
  expect([...env.files.keys()].some((p) => p.startsWith(root + '/.abkc-state/'))).toBe(true);
});

test('new source UUID at old location does not inherit another annotation local work', async () => {
  annotations[0].sourceAnnotationId = 'uuid-old';
  await sync();
  const c = (await cards())[0];
  await setHighlightLocalNote(env.app, c, '属于旧批注');
  annotations[0].sourceAnnotationId = 'uuid-new';
  await sync();
  const list = await cards();
  expect(list).toHaveLength(3);
  expect(list.find((v) => v.path === c.path)!.localNote).toBe('属于旧批注');
  expect(list.filter((v) => v.path !== c.path).every((v) => !v.localNote)).toBe(true);
});
