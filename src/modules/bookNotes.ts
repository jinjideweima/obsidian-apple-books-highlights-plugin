import type { IBookWithAnnotations } from '../types';
import { splitMarkdown, writeMarkdown, type Properties } from '../utils/markdown';
import { calculateAppleDate } from './templateProcessing';

const date = (value: number | null): string | undefined =>
  value && Number.isFinite(value) ? calculateAppleDate(value).format('YYYY-MM-DDTHH:mm:ssZ') : undefined;
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export const mergeBookNote = (existing: string, generated: string, book: IBookWithAnnotations, savedBaseline: Properties = {}, onBaseline?: (baseline: Properties) => void): string => {
  const old = splitMarkdown(existing);
  const fresh = splitMarkdown(generated);
  let baseline: Properties = savedBaseline;
  const stored = old.body.match(/<!-- abkc:metadata ([\s\S]*?) -->/)?.[1] || old.properties.abkc_imported;
  if (typeof stored === 'string') {
    try {
      baseline = JSON.parse(stored);
    } catch {
      /* Legacy note: preserve manual values. */
    }
  }
  const source: Properties = {
    ...fresh.properties,
    title: book.bookTitle,
    author: book.bookAuthor,
    authors: book.authors?.length ? book.authors : book.bookAuthor ? [book.bookAuthor] : [],
    source_genre: book.bookGenre || undefined,
    language: book.bookLanguage || undefined,
    publisher: book.publisher,
    translators: book.translators,
    published_date: book.publishedDate,
    isbn: book.isbn,
    last_opened: date(book.bookLastOpenedDate),
    finished_at: date(book.bookFinishedDate),
    status: book.bookFinishedDate ? '已读' : '未标记',
  };
  const properties: Properties = { ...old.properties };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    // First migration preserves existing values; later imports update only fields the user did not edit.
    if ((!(key in old.properties) && !(key in baseline)) || equal(old.properties[key], baseline[key])) properties[key] = value;
  }
  Object.assign(properties, { type: 'book', source: 'Apple Books', book_id: book.bookId, annotation_count: book.annotations.length });
  properties.tags = Array.from(
    new Set([
      ...(Array.isArray(old.properties.tags) ? old.properties.tags : []),
      ...(Array.isArray(fresh.properties.tags) ? fresh.properties.tags : []),
      'book',
    ]),
  );
  properties.imported_at = old.properties.imported_at || new Date().toISOString();
  const nextBaseline = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)),
  );
  // A missing source value never erases the last known cover or metadata.
  delete properties.abkc_imported;
  onBaseline?.({ ...baseline, ...nextBaseline });
  let body = (old.body || fresh.body).replace(/<!-- abkc:metadata [\s\S]*? -->/g, '');
  if (existing) {
    // Migrate legacy default notes without replacing prose or custom template sections.
    const board = fresh.body.match(/```apple-books-board\r?\n[\s\S]*?```/)?.[0];
    if (board) {
      if (/```apple-books-board\r?\n/.test(body)) body = body.replace(/```apple-books-board\r?\n[\s\S]*?```/g, () => board);
      else body = `${body.trimEnd()}\n\n## 同步摘录\n\n${board}\n`;
    }
    const toc = fresh.body.match(/<details class="abkc-note-toc-details">[\s\S]*?<\/details>/)?.[0];
    void toc; // The importer builds a stable file-link TOC after reconciling all cards.
  }
  body = `${body.trimEnd()}\n`;
  const candidate = writeMarkdown(properties, body);
  if (candidate !== existing) properties.synced_at = new Date().toISOString();
  return writeMarkdown(properties, body);
};
