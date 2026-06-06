import type { IBookHighlightsPluginSettings, IBookWithAnnotations } from './types';
import { aggregateBooksWithAnnotations } from './modules/annotationsProcessing';
import { extractBookCover } from './modules/epubChapters';
import { importHighlightCards } from './modules/highlightCards';
import { compileTemplate } from './modules/templateProcessing';
import { VaultManagement } from './modules/vaultManagement';
import { getKeepMeSectionDataFromSettings, embedKeepMeSectionDataIntoBookFile } from './utils/manageKeepMeSection';

const toArrayBuffer = (data: Uint8Array): ArrayBuffer =>
  data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

const importBookCover = async (vault: VaultManagement, book: IBookWithAnnotations, bookFilename: string): Promise<void> => {
  const cover = await extractBookCover(book);

  if (!cover) {
    return;
  }

  const coverFolder = `${vault.getHighlightsFolder()}/covers`;
  await vault.ensureFolder(coverFolder);

  const coverPath = `${coverFolder}/${bookFilename}.${cover.extension}`;
  await vault.upsertBinaryFile(coverPath, toArrayBuffer(cover.data));
  book.coverImagePath = coverPath;
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

  for (const bookWithAnnotations of aggregatedBooksAndAnnotations) {
    const compiledFilename = precompiledFilenameTemplate(bookWithAnnotations);

    try {
      await importBookCover(vault, bookWithAnnotations, compiledFilename);

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
};
