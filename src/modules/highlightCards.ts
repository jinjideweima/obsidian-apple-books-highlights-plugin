import type { IAnnotation, IBookWithAnnotations } from '../types';
import type { VaultManagement } from './vaultManagement';

const joinPath = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/');

const simpleHash = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const getAnnotationId = (bookId: string, highlightLocation: string): string => {
  const bookPrefix = bookId.slice(0, 8).toLowerCase();
  const locationHash = simpleHash(highlightLocation).slice(0, 8);

  return `ibooks-${bookPrefix}-${locationHash}`;
};

export const getHighlightColor = (highlightStyle: number): string => {
  const colorMap: Record<number, string> = {
    0: 'underline',
    1: 'green',
    2: 'blue',
    3: 'yellow',
    4: 'pink',
    5: 'purple',
  };

  return colorMap[highlightStyle] || 'plain';
};

const escapeYamlString = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) {
    return '""';
  }

  return JSON.stringify(String(value));
};

const toYamlBoolean = (value: boolean): string => (value ? 'true' : 'false');

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
    } else if (/^\d+(\.\d+)?$/.test(unquotedValue)) {
      data[key] = Number(unquotedValue);
    } else {
      data[key] = unquotedValue;
    }
  }

  return data;
};

const toBlockquote = (value: string): string => {
  if (!value) {
    return '';
  }

  return value
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
};

const extractSection = (content: string, heading: string): string => {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^## ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));

  if (!match) {
    return '';
  }

  return match[1].trim();
};

const buildSourceKey = (bookId: string, highlightLocation: string): string => {
  return `ibooks://assetid/${bookId}#${highlightLocation}`;
};

const buildPreview = (value: string, maxLength = 120): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
};

const buildCardContent = (book: IBookWithAnnotations, annotation: IAnnotation, highlightIndex: number, existingContent = ''): string => {
  const annotationId = getAnnotationId(book.bookId, annotation.highlightLocation);
  const sourceKey = buildSourceKey(book.bookId, annotation.highlightLocation);
  const highlightColor = getHighlightColor(annotation.highlightStyle);
  const shouldShowContext = annotation.contextualText && annotation.contextualText !== annotation.highlight;
  const highlight = toBlockquote(annotation.highlight);
  const context = shouldShowContext ? toBlockquote(annotation.contextualText) : '';
  const appleNote = annotation.note ? annotation.note : '';
  const existingAppleNote = extractSection(existingContent, '想法') || extractSection(existingContent, '我的想法');
  const existingLocalNote = extractSection(existingContent, '笔记');
  const localNote = existingLocalNote || (existingAppleNote && existingAppleNote !== appleNote ? existingAppleNote : '');
  const localState = parseFrontmatter(existingContent);
  const highlightPreview = buildPreview(annotation.highlight);
  const favorite = typeof localState.favorite === 'boolean' ? localState.favorite : false;
  const reviewed = typeof localState.reviewed === 'boolean' ? localState.reviewed : false;
  const linkedAtomicNote = typeof localState.linked_atomic_note === 'string' ? localState.linked_atomic_note : '';

  return `---
type: ibooks_highlight
book_title: ${escapeYamlString(book.bookTitle)}
book_author: ${escapeYamlString(book.bookAuthor)}
book_id: ${escapeYamlString(book.bookId)}
annotation_id: ${escapeYamlString(annotationId)}
source_key: ${escapeYamlString(sourceKey)}
highlight_location: ${escapeYamlString(annotation.highlightLocation)}
highlight_creation_date: ${annotation.highlightCreationDate || 0}
highlight_modification_date: ${annotation.highlightModificationDate || 0}
highlight_color: ${escapeYamlString(highlightColor)}
highlight_preview: ${escapeYamlString(highlightPreview)}
chapter: ${escapeYamlString(annotation.chapter || '')}
highlight_index: ${highlightIndex}
favorite: ${toYamlBoolean(favorite)}
reviewed: ${toYamlBoolean(reviewed)}
linked_atomic_note: ${escapeYamlString(linkedAtomicNote)}
tags:
  - book-highlight
  - apple-books
---

# 摘录 ${highlightIndex}

## 划线

${highlight}
${context ? `\n\n## 上下文\n\n${context}` : ''}
${appleNote ? `\n\n## 想法\n\n${appleNote}` : '\n\n## 想法\n'}

## 笔记

${localNote}

## 来源

- 书籍：[[${book.bookTitle} - ${book.bookAuthor}|${book.bookTitle}]]
- Apple Books：[打开原始标注](${sourceKey})
`;
};

const getCardRelativePath = (bookFilename: string, highlightIndex: number): string => {
  const paddedIndex = String(highlightIndex).padStart(3, '0');

  return joinPath('cards', bookFilename, `摘录-${paddedIndex}.md`);
};

export const importHighlightCards = async (vault: VaultManagement, book: IBookWithAnnotations, bookFilename: string): Promise<void> => {
  await vault.ensureFolder(joinPath(vault.getHighlightsFolder(), 'cards'));
  await vault.ensureFolder(joinPath(vault.getHighlightsFolder(), 'cards', bookFilename));

  for (const [index, annotation] of book.annotations.entries()) {
    const displayIndex = index + 1;
    const relativePath = getCardRelativePath(bookFilename, displayIndex);
    const filePath = joinPath(vault.getHighlightsFolder(), relativePath);
    const existingContent = await vault.readFileIfExists(filePath);
    const content = buildCardContent(book, annotation, displayIndex, existingContent);

    await vault.upsertFile(filePath, content);
  }
};
