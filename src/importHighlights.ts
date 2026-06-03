import type { IBookHighlightsPluginSettings } from './types';
import { aggregateBooksWithAnnotations } from './modules/annotationsProcessing';
import { importHighlightCards } from './modules/highlightCards';
import { compileTemplate } from './modules/templateProcessing';
import { VaultManagement } from './modules/vaultManagement';
import { getKeepMeSectionDataFromSettings, embedKeepMeSectionDataIntoBookFile } from './utils/manageKeepMeSection';
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
