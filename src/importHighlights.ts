import type { IBookHighlightsPluginSettings, IBookWithAnnotations } from './types';
import { aggregateBooksWithAnnotations } from './modules/annotationsProcessing';
import { extractBookCover, isEpubPermissionError } from './modules/epubChapters';
import { importHighlightCards } from './modules/highlightCards';
import { compileTemplate } from './modules/templateProcessing';
import { VaultManagement } from './modules/vaultManagement';
import { getKeepMeSectionDataFromSettings, embedKeepMeSectionDataIntoBookFile } from './utils/manageKeepMeSection';
import { showCoverAccessNotice } from './utils/notificationCenter';

const toArrayBuffer = (data: Uint8Array): ArrayBuffer =>
  data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

// Returns true when the cover could not be read because of a permission error
// (e.g. the book is in iCloud and Obsidian lacks Full Disk Access), so the caller
// can show a single access notice at the end instead of failing the whole import.
const importBookCover = async (
  vault: VaultManagement,
  book: IBookWithAnnotations,
  bookFilename: string,
  coverPathTemplate: ((data: IBookWithAnnotations) => string) | null,
): Promise<boolean> => {
  let cover: { data: Uint8Array; extension: string } | null;

  try {
    cover = await extractBookCover(book);
  } catch (error) {
    if (isEpubPermissionError(error)) {
      return true;
    }

    return false;
  }

  if (!cover) {
    return false;
  }

  // The cover path template (relative to the vault root, without extension) lets the user place
  // covers anywhere, e.g. "附件/书封/{{bookTitle}} - {{bookAuthor}}". When empty, covers go into
  // "<highlights folder>/covers/<book filename>". The real extension always follows the source image.
  const coverPath = coverPathTemplate
    ? `${coverPathTemplate(book)}.${cover.extension}`
    : `${vault.getHighlightsFolder()}/covers/${bookFilename}.${cover.extension}`;

  const coverFolder = coverPath.includes('/') ? coverPath.slice(0, coverPath.lastIndexOf('/')) : '';

  if (coverFolder) {
    await vault.ensureFolder(coverFolder);
  }

  await vault.upsertBinaryFile(coverPath, toArrayBuffer(cover.data));
  book.coverImagePath = coverPath;

  return false;
};

export const importHighlights = async (
  vault: VaultManagement,
  settings: IBookHighlightsPluginSettings,
  importMode: 'create' | 'modify' = 'create',
) => {
  const doesHighlightsFolderExist = Boolean(vault.getHighlightsFolderPath());

  if (!doesHighlightsFolderExist) {
    await vault.createHighlightsFolder();
  }

  const aggregatedBooksAndAnnotations = await aggregateBooksWithAnnotations(settings.highlightsSortingCriterion);

  const precompiledTemplate = compileTemplate(settings.template);
  const precompiledFilenameTemplate = compileTemplate(settings.filenameTemplate);
  const precompiledCoverPathTemplate = settings.coverPathTemplate?.trim() ? compileTemplate(settings.coverPathTemplate) : null;

  let coverAccessDenied = false;

  for (const bookWithAnnotations of aggregatedBooksAndAnnotations) {
    const compiledFilename = precompiledFilenameTemplate(bookWithAnnotations);

    try {
      if (await importBookCover(vault, bookWithAnnotations, compiledFilename, precompiledCoverPathTemplate)) {
        coverAccessDenied = true;
      }

      const preCompiledContent = precompiledTemplate(bookWithAnnotations);
      const keepMeSectionData = getKeepMeSectionDataFromSettings(compiledFilename, settings);

      let compiledContent = preCompiledContent;

      if (keepMeSectionData) {
        compiledContent = embedKeepMeSectionDataIntoBookFile(keepMeSectionData, preCompiledContent, settings);
      }

      if (importMode === 'create') {
        await vault.createBookFile(compiledFilename, compiledContent);
      } else if (importMode === 'modify') {
        const filePath = vault.getFilePath(compiledFilename);

        if (filePath) {
          await vault.modifyBookFile(filePath, compiledContent);
        } else {
          console.warn(`Apple Books Knowledge Cards: 无法修改“${compiledFilename}”，因为书籍主笔记不存在。将改为新建。`);
          await vault.createBookFile(compiledFilename, compiledContent);
        }
      }

      await importHighlightCards(vault, bookWithAnnotations, compiledFilename);
    } catch (error) {
      throw new Error(`导入《${bookWithAnnotations.bookTitle}》失败：${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  if (coverAccessDenied) {
    showCoverAccessNotice();
  }
};
