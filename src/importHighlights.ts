import type { VaultManagement } from './modules/vaultManagement';
import type { IBookHighlightsPluginSettings, IBookWithAnnotations, ImportResult } from './types';
import { enrichBooksWithAnnotations, mapAnnotationsToBooks } from './modules/annotationsProcessing';
import { mergeBookNote } from './modules/bookNotes';
import { getBooks, getAnnotations, getDeletedAnnotations } from './modules/dataFetching';
import { extractBookCover, inferMissingChapters, enrichBookMetadata } from './modules/epubChapters';
import { importHighlightCards } from './modules/highlightCards';
import { compileTemplate } from './modules/templateProcessing';
import { compareLocations, cardLink } from './utils/cardIdentity';
import { getHighlightCards } from './modules/highlightRepository';
import { safeRelativePath, parseFrontmatter, textValue, filenameValue } from './utils/markdown';

export const importHighlights = async (
  vault: VaultManagement,
  settings: IBookHighlightsPluginSettings,
  _importMode: 'create' | 'modify' = 'modify',
  selectedBookId?: string,
): Promise<ImportResult> => {
  // Read the complete source before any backup/write. A failed query cannot trigger cleanup.
  const [books, annotations, deleted] = await Promise.all([
    getBooks(true),
    getAnnotations('book', true),
    getDeletedAnnotations(),
  ]);
  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, archived: 0, retained: 0, books: 0, failures: [], warnings: [] };
  await vault.prepareImport();
  const map = new Map();
  mapAnnotationsToBooks(annotations, map);
  const selected = books.filter((b) => !selectedBookId || b.bookId === selectedBookId);
  const enriched: IBookWithAnnotations[] = [];
  enrichBooksWithAnnotations(selected, map, enriched);
  // Zero-highlight books are deliberately retained: without a trustworthy book deletion flag,
  // removal of the whole book and removal of its final highlight cannot safely be distinguished.
  for (const book of selected) {
    if (!map.has(book.bookId) && (await vault.findBookFile(book.bookId))) {
      result.warnings.push(`《${book.bookTitle}》本次没有有效摘录，已保留原笔记（可能是整本书被移除）。`);
    }
  }
  if (selectedBookId && !selected.length) result.warnings.push('Apple Books 中暂未找到这本书，已有笔记已保留。');
  if (settings.backup && enriched.length) await vault.backupAllHighlights();
  const filenameTemplate = compileTemplate(settings.filenameTemplate);
  const coverTemplate = settings.coverPathTemplate?.trim() ? compileTemplate(settings.coverPathTemplate) : null;
  const template = compileTemplate(settings.template);
  for (const book of enriched) {
    try {
      await inferMissingChapters([book]);
      await enrichBookMetadata(book);
      const namingData = {
        ...book,
        bookTitle: filenameValue(book.bookTitle),
        bookAuthor: filenameValue(book.bookAuthor || ''),
        bookGenre: filenameValue(book.bookGenre || ''),
        bookLanguage: filenameValue(book.bookLanguage || ''),
        bookId: filenameValue(book.bookId),
      };
      const file = await vault.findBookFile(book.bookId);
      let filename = file ? file.path.slice(vault.getHighlightsFolder().length + 1, -3) : safeRelativePath(filenameTemplate(namingData));
      if (!file && vault.getFilePath(filename)) {
        filename = `${filename} - ${safeRelativePath(book.bookId)}`;
        if (vault.getFilePath(filename)) throw new Error('书籍文件名冲突，请检查：' + filename);
      }
      const path = `${vault.getHighlightsFolder()}/${filename}.md`;
      let existing = await vault.readFileIfExists(path);
      const state = await vault.readBookState(book.bookId);
      const oldProperties = parseFrontmatter(existing);
      let baseline = (state.baseline || {}) as Record<string, unknown>;
      const originalFilename = safeRelativePath(filenameTemplate(namingData));
      const oldFolders = await vault.organizeCards(book.bookId, filename);
      const originalFolder = `${vault.getHighlightsFolder()}/cards/${originalFilename}`;
      if (!oldFolders.includes(originalFolder)) oldFolders.push(originalFolder);
      if (originalFilename !== filename && vault.getApp().vault.getFolderByPath(originalFolder)) {
        const listing = await vault.getApp().vault.adapter.list(originalFolder);
        if (!listing.files.length && !listing.folders.length) await vault.getApp().vault.adapter.rmdir(originalFolder, true);
      }
      existing = await vault.readFileIfExists(path);
      // Parse before any writes: malformed properties should never be overwritten.
      parseFrontmatter(existing);
      const cover = await extractBookCover(book).catch((error) => {
        result.warnings.push(`《${book.bookTitle}》封面暂不可读，已保留旧封面。${error instanceof Error ? error.message : ''}`);
        return null;
      });
      const oldCover = String(oldProperties.cover || '').match(/^\[\[([^|\]]+)/)?.[1];
      const baselineCover = String(baseline.cover || existing.match(/<!-- abkc:metadata ([\s\S]*?) -->/)?.[1] && JSON.parse(existing.match(/<!-- abkc:metadata ([\s\S]*?) -->/)![1]).cover || '');
      const managedCover = !coverTemplate && oldCover?.startsWith(`${vault.getHighlightsFolder()}/covers/`) && (!baselineCover || baselineCover === oldProperties.cover);
      if (managedCover && oldCover) {
        const extension = oldCover.split('.').pop();
        const target = `${vault.getHighlightsFolder()}/covers/${filename}.${extension}`;
        // Other book notes may intentionally share this cover; leave shared assets in place.
        let shared = false;
        for (const other of vault.getMarkdownFiles()) {
          if (other.path === path || other.path.includes('/cards/')) continue;
          const fm = parseFrontmatter(await vault.readFileIfExists(other.path));
          if (fm.type === 'book' && fm.cover === oldProperties.cover) shared = true;
        }
        if (!shared) {
          await vault.moveResource(oldCover, target);
          for (const oldFolder of oldFolders) {
            const relative = oldFolder.slice(`${vault.getHighlightsFolder()}/cards/`.length);
            const duplicate = `${vault.getHighlightsFolder()}/covers/${relative}.${extension}`;
            if (duplicate !== target && duplicate !== oldCover) await vault.moveResource(duplicate, target);
          }
          existing = await vault.readFileIfExists(path);
          if (baseline.cover === oldProperties.cover) baseline = { ...baseline, cover: `[[${target}]]` };
        }
      }
      const currentCover = String(parseFrontmatter(existing).cover || '').match(/^\[\[([^|\]]+)/)?.[1];
      if (cover) {
        const coverPath = safeRelativePath(
          currentCover || `${coverTemplate ? coverTemplate(namingData) : `${vault.getHighlightsFolder()}/covers/${filename}`}.${cover.extension}`,
        );
        await vault.ensureFolder(coverPath.slice(0, coverPath.lastIndexOf('/')));
        if (!currentCover) await vault.upsertBinaryFile(
          coverPath,
          cover.data.buffer.slice(cover.data.byteOffset, cover.data.byteOffset + cover.data.byteLength) as ArrayBuffer,
        );
        book.coverImagePath = coverPath;
      }
      const generated = template(book);
      let nextBaseline = baseline;
      let content = mergeBookNote(existing, generated, book, baseline, (value) => { nextBaseline = value; });
      const mergedProperties = parseFrontmatter(content);
      const displayBook = { ...book, bookTitle: textValue(mergedProperties.title), bookAuthor: textValue(mergedProperties.author) };
      const cards = await importHighlightCards(
        vault,
        displayBook,
        filename,
        new Set(deleted.filter((a) => a.assetId === book.bookId).map((a) => a.highlightLocation)),
        new Set(deleted.filter((a) => a.assetId === book.bookId).map((a) => a.sourceAnnotationId || '').filter(Boolean)),
      );
      for (const key of ['created', 'updated', 'unchanged', 'archived', 'retained'] as const) result[key] += cards[key];
      const currentCards = (await getHighlightCards(vault.getApp(), settings)).filter((c) => c.bookId === book.bookId && !c.archived)
        .sort((a, b) => compareLocations(a.highlightLocation, b.highlightLocation));
      const toc = `<details class="abkc-note-toc-details">\n<summary>摘录目录</summary>\n\n${currentCards.map((c) => cardLink(c.path, `摘录 ${c.highlightIndex}`)).join(' · ')}\n\n</details>`;
      content = content.replace(/<details class="abkc-note-toc-details">[\s\S]*?<\/details>/g, () => toc);
      // Do not overwrite edits made while the import was running.
      const oldSynced = parseFrontmatter(existing).synced_at;
      const candidateProperties = parseFrontmatter(content);
      if (oldSynced) {
        const withoutTimestamp = content.replace(/^synced_at:.*$/m, `synced_at: ${oldSynced}`);
        if (withoutTimestamp === existing) content = existing;
      }
      void candidateProperties;
      result[await vault.upsertFile(path, content, existing)]++;
      await vault.writeBookState(book.bookId, { baseline: nextBaseline });
      result.books++;
    } catch (error) {
      result.failures.push(`《${book.bookTitle}》：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
};
