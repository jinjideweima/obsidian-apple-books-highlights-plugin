import { type App, Modal, Setting, TFile } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
import type { IBookWithAnnotations } from '../types';
import { importHighlightCards } from '../modules/highlightCards';
import { showFailedImportNotice, showSuccessfulImportNotice, showErrorInConsole } from '../utils/notificationCenter';

type BookFileDetails = { file: TFile; compiledContent: string; book?: IBookWithAnnotations; compiledFilename?: string };

// This class is used to display a modal that asks for the user's consent
// to overwrite the existing selected book in the highlights folder.
export class OverwriteBookModal extends Modal {
  plugin: IBookHighlightsPlugin;
  fileDetails: BookFileDetails;

  constructor(app: App, plugin: IBookHighlightsPlugin, fileDetails: BookFileDetails) {
    super(app);
    this.plugin = plugin;
    this.fileDetails = fileDetails;
  }

  onOpen() {
    const { contentEl } = this;
    const bookToOverwrite = this.fileDetails;

    contentEl.createEl('p', { text: '选中的书籍主笔记已经存在：' });
    contentEl.createEl('p', { text: `${bookToOverwrite.file.name}`, cls: 'modal-rewrite-book-title' });
    contentEl.createEl('p', { text: '是否继续覆盖？' });

    new Setting(contentEl)
      .addButton((YesButton) => {
        YesButton.setButtonText('确认覆盖')
          .setCta()
          .onClick(async () => {
            try {
              await this.plugin.vault.modifyBookFile(bookToOverwrite.file, bookToOverwrite.compiledContent);
              if (bookToOverwrite.book && bookToOverwrite.compiledFilename) {
                await importHighlightCards(this.plugin.vault, bookToOverwrite.book, bookToOverwrite.compiledFilename);
              }
              showSuccessfulImportNotice();
              this.close();
            } catch (error) {
              showFailedImportNotice(this.plugin.manifest.name);
              showErrorInConsole(this.plugin.manifest.name, error);
            }
          });
      })

      .addButton((NoButton) => {
        NoButton.setButtonText('取消').onClick(() => {
          this.close();
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
