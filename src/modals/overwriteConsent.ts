import { type App, Modal, Setting, TFile } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
import type { IBookWithAnnotations } from '../types';
import { importHighlights } from '../importHighlights';
import { importHighlightCards } from '../modules/highlightCards';
import { showFailedImportNotice, showSuccessfulImportNotice, showErrorInConsole } from '../utils/notificationCenter';

// This class is used to display a modal that asks for the user's consent
// to overwrite the existing book in the highlights folder
// It takes an optional `item` parameter with the selected book highlights
// When the parameter is not provided, the modal asks for the consent
// to overwrite all the books
export class OverwriteBookModal extends Modal {
  plugin: IBookHighlightsPlugin;
  fileDetails?: { file: TFile; compiledContent: string; book?: IBookWithAnnotations; compiledFilename?: string };

  constructor(
    app: App,
    plugin: IBookHighlightsPlugin,
    fileDetails?: { file: TFile; compiledContent: string; book?: IBookWithAnnotations; compiledFilename?: string },
  ) {
    super(app);
    this.plugin = plugin;
    this.fileDetails = fileDetails;
  }

  onOpen() {
    const { contentEl } = this;
    const bookToOverwrite = this.fileDetails;

    if (bookToOverwrite) {
      contentEl.createEl('p', { text: '选中的书籍主笔记已经存在：' });
      contentEl.createEl('p', { text: `${bookToOverwrite.file.name}`, cls: 'modal-rewrite-book-title' });
      contentEl.createEl('p', { text: '是否继续覆盖？' });
    } else {
      contentEl.createSpan({ text: '批量导入会覆盖导入目录中的' });
      contentEl.createSpan({ text: ' 所有书籍主笔记 ', cls: 'modal-rewrite-all-books' });
      contentEl.createSpan({ text: '。独立摘录卡片会按稳定 ID 更新。' });
      contentEl.createEl('p', { text: '是否继续？' });
    }

    new Setting(contentEl)
      .addButton((YesButton) => {
        YesButton.setButtonText('确认覆盖')
          .setCta()
          .onClick(async () => {
            try {
              if (bookToOverwrite) {
                await this.plugin.vault.modifyBookFile(bookToOverwrite.file, bookToOverwrite.compiledContent);
                if (bookToOverwrite.book && bookToOverwrite.compiledFilename) {
                  await importHighlightCards(this.plugin.vault, bookToOverwrite.book, bookToOverwrite.compiledFilename);
                }
              } else {
                await importHighlights(this.plugin.vault, this.plugin.settings, 'modify');
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
