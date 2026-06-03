import type { App, TFile } from 'obsidian';
import type { IBookHighlightsPluginSettings, IBookNoteSummary, IHighlightCard } from '../types';

const parseFrontmatter = (content: string): Record<string, string | boolean | number> => {
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return {};
  }

  const data: Record<string, string | boolean | number> = {};
  for (const line of match[1].split('\n')) {
    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1 || line.startsWith('  - ')) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const unquotedValue = rawValue.replace(/^"(.*)"$/, '$1');

    if (unquotedValue === 'true') {
      data[key] = true;
    } else if (unquotedValue === 'false') {
      data[key] = false;
    } else if (/^\d+$/.test(unquotedValue)) {
      data[key] = Number(unquotedValue);
    } else {
      data[key] = unquotedValue;
    }
  }

  return data;
};

const extractSection = (content: string, heading: string): string => {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^## ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));

  if (!match) {
    return '';
  }

  return match[1].replace(/^> ?/gm, '').trim();
};

const updateFrontmatterValue = (content: string, key: string, value: string): string => {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return content;
  }

  const frontmatter = frontmatterMatch[1];
  const keyRegex = new RegExp(`^${key}:.*$`, 'm');
  const updatedFrontmatter = keyRegex.test(frontmatter)
    ? frontmatter.replace(keyRegex, `${key}: ${value}`)
    : `${frontmatter}\n${key}: ${value}`;

  return content.replace(/^---\n[\s\S]*?\n---/, `---\n${updatedFrontmatter}\n---`);
};

const setSection = (content: string, heading: string, value: string): string => {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(`## ${escapedHeading}\\n\\n[\\s\\S]*?(?=\\n## |$)`);
  const normalizedValue = value.trim();
  const replacement = `## ${heading}\n\n${normalizedValue}`;

  if (sectionRegex.test(content)) {
    return content.replace(sectionRegex, replacement);
  }

  return `${content.trim()}\n\n${replacement}\n`;
};

const getCardFile = (app: App, path: string): TFile => {
  const file = app.vault.getFileByPath(path);

  if (!file) {
    throw new Error(`找不到摘录文件：${path}`);
  }

  return file;
};

export const getHighlightCards = async (app: App, settings: IBookHighlightsPluginSettings): Promise<IHighlightCard[]> => {
  const cardsRoot = `${settings.highlightsFolder}/cards/`;
  const files = app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(cardsRoot));

  const cards = await Promise.all(
    files.map(async (file: TFile) => {
      const content = await app.vault.cachedRead(file);
      const frontmatter = parseFrontmatter(content);

      return {
        path: file.path,
        bookTitle: String(frontmatter.book_title || ''),
        bookAuthor: String(frontmatter.book_author || ''),
        bookId: String(frontmatter.book_id || ''),
        annotationId: String(frontmatter.annotation_id || ''),
        sourceKey: String(frontmatter.source_key || ''),
        highlightLocation: String(frontmatter.highlight_location || ''),
        highlightCreationDate: Number(frontmatter.highlight_creation_date || 0),
        highlightModificationDate: Number(frontmatter.highlight_modification_date || 0),
        highlightColor: String(frontmatter.highlight_color || 'plain'),
        chapter: String(frontmatter.chapter || ''),
        highlightIndex: Number(frontmatter.highlight_index || 0),
        favorite: Boolean(frontmatter.favorite),
        reviewed: Boolean(frontmatter.reviewed),
        linkedAtomicNote: String(frontmatter.linked_atomic_note || ''),
        highlight: extractSection(content, '划线'),
        appleNote: extractSection(content, '想法') || extractSection(content, '我的想法'),
        localNote: extractSection(content, '笔记'),
      };
    }),
  );

  return cards.sort((a, b) => {
    const bookComparison = a.bookTitle.localeCompare(b.bookTitle);

    if (bookComparison !== 0) {
      return bookComparison;
    }

    return a.highlightIndex - b.highlightIndex;
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

      return {
        path: file.path,
        title: String(frontmatter.title || file.basename),
        author: String(frontmatter.author || ''),
        bookId: String(frontmatter.book_id || ''),
        annotationCount: Number(frontmatter.annotation_count || 0),
        status: String(frontmatter.status || ''),
        cover: String(frontmatter.cover || ''),
      };
    }),
  );

  return books.sort((a, b) => b.annotationCount - a.annotationCount);
};

export const setHighlightFavorite = async (app: App, card: IHighlightCard, favorite: boolean): Promise<void> => {
  const file = getCardFile(app, card.path);
  const content = await app.vault.read(file);
  const updatedContent = updateFrontmatterValue(content, 'favorite', favorite ? 'true' : 'false');

  await app.vault.modify(file, updatedContent);
};

export const setHighlightLocalNote = async (app: App, card: IHighlightCard, note: string): Promise<void> => {
  const file = getCardFile(app, card.path);
  const content = await app.vault.read(file);
  const updatedContent = setSection(content, '笔记', note);

  await app.vault.modify(file, updatedContent);
};
