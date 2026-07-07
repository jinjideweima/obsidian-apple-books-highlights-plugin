import type IBookHighlightsPlugin from '../../main';
import type { IBookHighlightsPluginSettings } from '../types';
import { importHighlights } from '../importHighlights';
import { showSuccessfulImportNotice, showFailedImportNotice, showErrorInConsole } from './notificationCenter';

export const backupAndImport = async (plugin: IBookHighlightsPlugin, settings: IBookHighlightsPluginSettings, importMode?: 'modify') => {
  try {
    if (settings.backup) {
      await plugin.vault.backupAllHighlights();
      await importHighlights(plugin.vault, settings, importMode);
    } else {
      await importHighlights(plugin.vault, settings, importMode ?? 'modify');
    }

    showSuccessfulImportNotice();
  } catch (error) {
    showFailedImportNotice(plugin.manifest.name);
    showErrorInConsole(plugin.manifest.name, error);
  }
};
