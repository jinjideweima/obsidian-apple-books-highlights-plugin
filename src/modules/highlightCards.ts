import type { IAnnotation, IBookWithAnnotations } from '../types';
import type { VaultManagement } from './vaultManagement';
import { sourceUrl, compareLocations, cardLink } from '../utils/cardIdentity';
import { parseFrontmatter, patchProperties, splitMarkdown, writeMarkdown, extractSection, setSection } from '../utils/markdown';

const simpleHash = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const getAnnotationId = (bookId: string, highlightLocation: string): string => {
  const bookPrefix = simpleHash(bookId);
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

const toBlockquote = (value: string): string => {
  if (!value) {
    return '';
  }

  return value
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
};

const buildSourceKey = sourceUrl;

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
  const context = shouldShowContext ? toBlockquote(annotation.contextualText) : extractSection(existingContent, '上下文');
  const appleNote = annotation.note ? annotation.note : '';
  const existingLocalNote = extractSection(existingContent, '笔记');
  let localNote = existingLocalNote;
  const legacyLink = parseFrontmatter(existingContent).linked_atomic_note;
  if (legacyLink && !localNote.includes(String(legacyLink)))
    localNote += `\n\n关联笔记：${String(legacyLink).startsWith('[[') ? legacyLink : `[[${legacyLink}]]`}`;
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
card_id: ${escapeYamlString(annotationId)}
source_annotation_id: ${escapeYamlString(annotation.sourceAnnotationId || '')}
source_key: ${escapeYamlString(sourceKey)}
highlight_location: ${escapeYamlString(annotation.highlightLocation)}
highlight_creation_date: ${annotation.highlightCreationDate || 0}
highlight_modification_date: ${annotation.highlightModificationDate || 0}
highlight_color: ${escapeYamlString(highlightColor)}
highlight_preview: ${escapeYamlString(highlightPreview)}
chapter: ${escapeYamlString(annotation.chapter || String(localState.chapter || ''))}
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

<!-- abkc:local:start -->
${localNote}
<!-- abkc:local:end -->

## 来源

- 书籍：[[${book.bookTitle} - ${book.bookAuthor}|${book.bookTitle}]]
- Apple Books：[打开原始标注](${sourceKey})
`;
};

export interface CardImportResult {
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  retained: number;
}

export const importHighlightCards = async (
  vault: VaultManagement,
  book: IBookWithAnnotations,
  bookFilename: string,
  deletedLocations: Set<string> = new Set(),
  deletedIds: Set<string> = new Set(),
): Promise<CardImportResult> => {
  const result: CardImportResult = { created: 0, updated: 0, unchanged: 0, archived: 0, retained: 0 };
  const folder = `${vault.getHighlightsFolder()}/cards/${bookFilename}`;
  await vault.ensureFolder(folder);
  const existing = new Map<string, { path: string; content: string }>();
  const before = new Map<string, string>();
  const localIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const a of book.annotations) {
    if (a.sourceAnnotationId && sourceIds.has(a.sourceAnnotationId)) throw new Error('来源批注 ID 重复，未导入该书。');
    if (a.sourceAnnotationId) sourceIds.add(a.sourceAnnotationId);
  }
  for (const file of vault.getCardFiles(book.bookId)) {
    if (!file.path.includes('/cards/')) continue;
    const content = await vault.readFileIfExists(file.path);
    const fm = parseFrontmatter(content);
    if (fm.type === 'ibooks_highlight' && String(fm.book_id) === book.bookId) {
      const id = String(fm.card_id || fm.annotation_id || '');
      if (id && localIds.has(id)) throw new Error('本地卡片 ID 重复，未猜测关联，请检查：' + file.path);
      if (id) localIds.add(id);
      const key = String(fm.source_annotation_id || '') ? `uuid:${fm.source_annotation_id}` : String(fm.highlight_location || '');
      // Never silently choose between duplicate cards containing independent edits.
      if (existing.has(key)) throw new Error('同一摘录有多个卡片文件，请先检查重复文件：' + file.path);
      existing.set(key, { path: file.path, content });
      before.set(file.path, content);
    }
  }
  for (const [index, annotation] of book.annotations.entries()) {
    const uuidKey = annotation.sourceAnnotationId ? `uuid:${annotation.sourceAnnotationId}` : '';
    const oldKey = uuidKey && existing.has(uuidKey) ? uuidKey : annotation.highlightLocation;
    // Only legacy cards may acquire a source UUID by matching their exact location.
    const old = existing.get(oldKey);
    if (
      !old &&
      !annotation.sourceAnnotationId &&
      [...existing.values()].some((v) => parseFrontmatter(v.content).highlight_location === annotation.highlightLocation)
    )
      throw new Error('来源批注 ID 暂不可读，未猜测匹配旧卡片，请重试。');
    const path = old?.path || `${folder}/ibooks-${globalThis.crypto.randomUUID()}.md`;
    const generated = buildCardContent(
      book,
      annotation,
      Number(parseFrontmatter(old?.content || '').highlight_index) || index + 1,
      old?.content,
    );
    const fresh = splitMarkdown(generated);
    const previous = old ? splitMarkdown(old.content) : { properties: {}, body: '' };
    let body = fresh.body;
    if (old) {
      body = previous.body;
    }
    for (const heading of ['划线', '上下文', '想法', '笔记']) body = setSection(body, heading, extractSection(fresh.body, heading));
    body = setSection(
      body,
      '来源',
      `- 书籍：${cardLink(`${vault.getHighlightsFolder()}/${bookFilename}.md`, book.bookTitle)}\n- Apple Books：[打开原始标注](${buildSourceKey(book.bookId, annotation.highlightLocation)})`,
    );
    const properties: Record<string, unknown> = { ...previous.properties, ...fresh.properties, source_removed: false, archived: false };
    if (previous.properties.annotation_id) properties.annotation_id = previous.properties.annotation_id;
    if (!old) properties.annotation_id = path.split('/').pop()!.replace(/\.md$/, '');
    properties.card_id = previous.properties.card_id || properties.annotation_id;
    if (!annotation.sourceAnnotationId && previous.properties.source_annotation_id)
      properties.source_annotation_id = previous.properties.source_annotation_id;
    // Preserve unknown/custom properties, tags and explicitly stored links.
    properties.tags = Array.from(
      new Set([...(Array.isArray(previous.properties.tags) ? previous.properties.tags : []), 'book-highlight', 'apple-books']),
    );
    const content = writeMarkdown(properties, body);
    result[await vault.upsertFile(path, content, old?.content || '')]++;
    existing.delete(oldKey);
  }
  // Only explicit deletion records on a still-present book authorize removal from daily browsing.
  for (const [location, old] of existing) {
    const fm = parseFrontmatter(old.content);
    if (fm.source_annotation_id ? !deletedIds.has(String(fm.source_annotation_id)) : !deletedLocations.has(location)) continue;
    // Re-evaluate legacy removed cards: Apple Books thoughts now receive equal protection.
    const protectedCard = Boolean(
      Array.from(old.content.matchAll(/^## (.+)$/gm)).some(
        (match) => !['划线', '上下文', '想法', '我的想法', '笔记', '来源'].includes(match[1].trim()),
      ) ||
      extractSection(old.content, '笔记') ||
      extractSection(old.content, '想法') ||
      extractSection(old.content, '我的想法') ||
      fm.favorite === true ||
      fm.reviewed === true ||
      fm.linked_atomic_note ||
      fm.restored === true,
    );
    const content = patchProperties(old.content, { source_removed: true, archived: !protectedCard });
    result[await vault.upsertFile(old.path, content, old.content)]++;
    if (fm.source_removed !== true || fm.archived !== !protectedCard) {
      if (protectedCard) result.retained++;
      else result.archived++;
    }
  }
  // Include retained and archived cards when assigning each list's display numbers.
  const all = [];
  for (const path of await vault.listFiles(folder)) {
    if (!path.endsWith('.md')) continue;
    const content = await vault.readFileIfExists(path);
    const fm = parseFrontmatter(content);
    if (String(fm.book_id) === book.bookId) all.push({ path, content, fm });
  }
  all.sort(
    (a, b) =>
      compareLocations(String(a.fm.highlight_location || ''), String(b.fm.highlight_location || '')) ||
      String(a.fm.card_id || a.fm.annotation_id).localeCompare(String(b.fm.card_id || b.fm.annotation_id)),
  );
  let normal = 0,
    archived = 0;
  for (const card of all) {
    const n = card.fm.archived === true ? ++archived : ++normal;
    const next = patchProperties(card.content.replace(/^# 摘录 \d+/m, `# 摘录 ${n}`), { highlight_index: n });
    if (next !== card.content) await vault.upsertFile(card.path, next, card.content);
  }
  result.created = 0;
  result.updated = 0;
  result.unchanged = 0;
  for (const card of all) {
    const current = await vault.readFileIfExists(card.path);
    if (!before.has(card.path)) result.created++;
    else if (before.get(card.path) === current) result.unchanged++;
    else result.updated++;
  }
  return result;
};
