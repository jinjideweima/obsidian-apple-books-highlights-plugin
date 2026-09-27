import type { App, TFile } from 'obsidian';
import type { IBookHighlightsPluginSettings, IBookNoteSummary, IHighlightCard } from '../types';
import { compareLocations } from '../utils/cardIdentity';
import { parseFrontmatter, patchProperties, extractSection, setSection, textValue } from '../utils/markdown';
import { readReview, reviewProperties, schedule, type Grade } from './review';

const getCardFile = (app: App, path: string): TFile => {
  const file = app.vault.getFileByPath(path);

  if (!file) {
    throw new Error(`找不到摘录文件：${path}`);
  }

  return file;
};

const cardCaches = new WeakMap<App, Map<string, { stamp: string; card: IHighlightCard }>>();
export const getHighlightCards = async (app: App, settings: IBookHighlightsPluginSettings): Promise<IHighlightCard[]> => {
  const cardsRoot = `${settings.highlightsFolder}/cards/`;
  const files = app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(cardsRoot));

  let cache = cardCaches.get(app);
  if (!cache) {
    cache = new Map();
    cardCaches.set(app, cache);
  }
  const paths = new Set(files.map((f) => f.path));
  for (const path of cache.keys()) if (!paths.has(path)) cache.delete(path);
  const cards = await Promise.all(
    files.map(async (file: TFile) => {
      const stamp = `${file.stat?.mtime}:${file.stat?.size}`;
      const cached = cache!.get(file.path);
      if (file.stat && cached?.stamp === stamp) return cached.card;
      const content = await app.vault.cachedRead(file);
      const frontmatter = parseFrontmatter(content);

      const card: IHighlightCard = {
        path: file.path,
        bookTitle: String(frontmatter.book_title || ''),
        bookAuthor: textValue(frontmatter.authors || frontmatter.book_author),
        bookId: String(frontmatter.book_id || ''),
        annotationId: String(frontmatter.card_id || frontmatter.annotation_id || ''),
        sourceKey: String(frontmatter.source_key || ''),
        highlightLocation: String(frontmatter.highlight_location || ''),
        highlightCreationDate: Number(frontmatter.highlight_creation_date || 0),
        highlightModificationDate: Number(frontmatter.highlight_modification_date || 0),
        highlightColor: String(frontmatter.highlight_color || 'plain'),
        chapter: String(frontmatter.chapter || ''),
        highlightIndex: Number(frontmatter.highlight_index || 0),
        favorite: frontmatter.favorite === true,
        reviewed: frontmatter.reviewed === true,
        linkedAtomicNote: String(frontmatter.linked_atomic_note || ''),
        highlight: extractSection(content, '划线').replace(/^> ?/gm, ''),
        appleNote: extractSection(content, '想法') || extractSection(content, '我的想法'),
        localNote: extractSection(content, '笔记'),
        archived: frontmatter.archived === true,
        sourceRemoved: frontmatter.source_removed === true,
        restored: frontmatter.restored === true,
        review: readReview(frontmatter),
      };
      cache!.set(file.path, { stamp, card });
      return card;
    }),
  );

  cards.sort(
    (a, b) =>
      a.bookId.localeCompare(b.bookId) ||
      compareLocations(a.highlightLocation, b.highlightLocation) ||
      a.annotationId.localeCompare(b.annotationId),
  );
  const counters = new Map<string, number>();
  return cards.map((card) => {
    const key = `${card.bookId}:${Boolean(card.archived)}`;
    const n = (counters.get(key) || 0) + 1;
    counters.set(key, n);
    return { ...card, highlightIndex: n };
  });
};

export const getBookSummaries = async (app: App, settings: IBookHighlightsPluginSettings): Promise<IBookNoteSummary[]> => {
  const bookFilesRoot = `${settings.highlightsFolder}/`;
  const cardsRoot = `${settings.highlightsFolder}/cards/`;
  const files = app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(bookFilesRoot) && !file.path.startsWith(cardsRoot));

  const books = await Promise.all(
    files.map(async (file: TFile) => {
      const content = await app.vault.cachedRead(file);
      const frontmatter = parseFrontmatter(content);
      if (frontmatter.type !== 'book' || frontmatter.source !== 'Apple Books' || /-bk-\d+/.test(file.path)) return null;

      return {
        path: file.path,
        title: String(frontmatter.title || file.basename),
        author: textValue(frontmatter.author ?? frontmatter.authors),
        bookId: String(frontmatter.book_id || ''),
        annotationCount: Number(frontmatter.annotation_count || 0),
        status: String(frontmatter.status || ''),
        cover: String(frontmatter.cover || ''),
        lastOpened: String(frontmatter.last_opened || ''),
      };
    }),
  );

  return books.filter((book): book is IBookNoteSummary => book !== null).sort((a, b) => b.annotationCount - a.annotationCount);
};

export const setHighlightFavorite = async (app: App, card: IHighlightCard, favorite: boolean): Promise<void> => {
  const file = getCardFile(app, card.path);
  cardCaches.get(app)?.delete(file.path);
  await app.vault.process(file, (content) => patchProperties(content, { favorite }));
};

export const setHighlightLocalNote = async (app: App, card: IHighlightCard, note: string, expected?: string): Promise<void> => {
  const file = getCardFile(app, card.path);
  cardCaches.get(app)?.delete(file.path);
  await app.vault.process(file, (content) => {
    if (expected !== undefined && extractSection(content, '笔记') !== expected)
      throw new Error('笔记在编辑期间已变化，请重新打开后合并内容。');
    return setSection(content, '笔记', note);
  });
};

export const setHighlightProperties = async (app: App, card: IHighlightCard, values: Record<string, unknown>): Promise<void> => {
  const file = getCardFile(app, card.path);
  cardCaches.get(app)?.delete(file.path);
  await app.vault.process(file, (content) => patchProperties(content, values));
};
export const deleteArchivedCard = async (app: App, card: IHighlightCard): Promise<void> => {
  const file = getCardFile(app, card.path);
  const fm = parseFrontmatter(await app.vault.read(file));
  if (fm.archived !== true || fm.source_removed !== true) throw new Error('只能清理已移除的摘录');
  await app.fileManager.trashFile(file);
};

export const recordReview = async (app: App, card: IHighlightCard, grade: Grade, today: string): Promise<void> => {
  await setHighlightProperties(app, card, reviewProperties(schedule(card.review ?? null, grade, today)));
};

// Suspended cards stay out of the daily review; resuming keeps their schedule.
export const setReviewSuspended = async (app: App, card: IHighlightCard, suspended: boolean): Promise<void> => {
  await setHighlightProperties(app, card, { review_suspended: suspended });
};
