import { type App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
import { type IBookHighlightsPluginSettings, IHighlightsSortingCriterion } from '../types';

export const defaultTemplate = `---
type: book
title: "{{{bookTitle}}}"
author: "{{{bookAuthor}}}"
source: Apple Books
book_id: "{{bookId}}"
annotation_count: {{annotations.length}}
status: "{{#if bookFinishedDate}}已读{{else}}在读{{/if}}"
{{#if coverImagePath}}
cover: "[[{{{coverImagePath}}}]]"
{{else if bookCoverUrl}}
cover: "{{{bookCoverUrl}}}"
{{/if}}
cssclasses:
  - wide-apple-book
tags:
  - book
---

<details class="abkc-note-toc-details">
<summary>摘录目录</summary>
<div class="abkc-note-toc">
{{#each annotations}}
<a href="#摘录-{{displayIndex @index}}">摘录 {{displayIndex @index}}</a>
{{/each}}
</div>
</details>

## 本书摘录

\`\`\`apple-books-board
book_id: {{bookId}}
theme: receipt
\`\`\`
`;

const allowedFilenameTemplateVariables = [
  'bookTitle', // Default
  'bookId',
  'bookAuthor',
  'bookGenre',
  'bookLanguage',
];

export const defaultPluginSettings: IBookHighlightsPluginSettings = {
  highlightsFolder: 'ibooks-highlights',
  backup: false,
  importOnStart: false,
  highlightsSortingCriterion: 'creationDateOldToNew',
  template: defaultTemplate,
  filenameTemplate: `{{{${allowedFilenameTemplateVariables[0]}}}}`,
  coverPathTemplate: '',
  keepMeSectionOpeningDelimiter: '%% keep-me %%',
  keepMeSectionClosingDelimiter: '%% /keep-me %%',
  keepMeSectionData: {},
};

export class IBookHighlightsSettingTab extends PluginSettingTab {
  plugin: IBookHighlightsPlugin;

  constructor(app: App, plugin: IBookHighlightsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    this.addHighlightsFolderSetting(containerEl);
    this.addImportOnStartSetting(containerEl);
    this.addBackupSetting(containerEl);
    this.addHighlightsSortingCriterionSetting(containerEl);
    this.addTemplateSetting(containerEl);
    this.addKeepMeSectionSetting(containerEl);
    this.addFilenameTemplateSetting(containerEl);
    this.addCoverPathTemplateSetting(containerEl);
    this.addResetTemplateSetting(containerEl);
    this.addCredits(containerEl);
  }

  addHighlightsFolderSetting(containerEl: HTMLElement): void {
    const folder = new Setting(containerEl)
      .setName('导入目录')
      .setDesc('保存 Apple Books 书籍主笔记和摘录卡片的 Vault 内目录。')
      .setClass('ibooks-highlights-folder');

    folder.addText((text) =>
      text
        .setPlaceholder('保存导入内容的目录')
        .setValue(this.plugin.settings.highlightsFolder)
        .onChange(async (value) => {
          if (!value) {
            folder.controlEl.addClass('setting-error');
            return;
          }

          folder.controlEl.removeClass('setting-error');
          this.plugin.settings.highlightsFolder = value;

          await this.plugin.saveSettings();
        }),
    );
  }

  addImportOnStartSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('启动时导入')
      .setDesc('Obsidian 启动时自动导入所有 Apple Books 摘录。')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.importOnStart).onChange(async (value) => {
          this.plugin.settings.importOnStart = value;

          await this.plugin.saveSettings();
        });
      });
  }

  addBackupSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('导入前备份')
      .setDesc(
        createFragment((el) => {
          el.appendText('导入前备份已有摘录。');
          el.createEl('br');
          el.appendText('- 文件夹格式：<导入目录>-bk-<时间戳>');
          el.createEl('br');
          el.appendText('- 文件格式：<书籍文件>-bk-<时间戳>');
        }),
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.backup).onChange(async (value) => {
          if (!value) {
            // oxlint-disable-next-line
            new Notice('关闭备份可能带来数据丢失风险，请谨慎使用。', 0);
          }
          this.plugin.settings.backup = value;

          await this.plugin.saveSettings();
        });
      });
  }

  addHighlightsSortingCriterionSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('摘录排序方式')
      .setDesc('导入时如何排序摘录。默认建议使用“按书中位置”。')
      .setClass('ibooks-highlights-sorting')
      .addDropdown((dropdown) => {
        const options: Record<IHighlightsSortingCriterion, string> = {
          creationDateOldToNew: '按创建时间：从旧到新',
          creationDateNewToOld: '按创建时间：从新到旧',
          lastModifiedDateOldToNew: '按修改时间：从旧到新',
          lastModifiedDateNewToOld: '按修改时间：从新到旧',
          book: '按书中位置',
        };

        dropdown
          .addOptions(options)
          .setValue(this.plugin.settings.highlightsSortingCriterion)
          .onChange(async (value: IHighlightsSortingCriterion) => {
            this.plugin.settings.highlightsSortingCriterion = value;

            await this.plugin.saveSettings();
          });
      });
  }

  addTemplateSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('书籍主笔记模板')
      .setDesc('用于生成每本书主笔记的模板。独立摘录卡片由插件自动生成。')
      .setClass('ibooks-highlights-template')
      .addTextArea((text) => {
        text
          .setPlaceholder('书籍主笔记模板')
          .setValue(this.plugin.settings.template)
          .onChange(async (value) => {
            const valueToSet = value === '' ? defaultTemplate : value;
            this.plugin.settings.template = valueToSet;

            await this.plugin.saveSettings();
          });
        return text;
      });
  }

  addFilenameTemplateSetting(containerEl: HTMLElement): void {
    const filenameTemplate = new Setting(containerEl)
      .setName('书籍主笔记文件名模板')
      .setDesc(
        createFragment((el) => {
          el.appendText('用于生成书籍主笔记文件名的模板。');
          el.createEl('br');
          el.appendText('可用变量：');

          const ul = el.createEl('ul');
          for (const allowedVariable of allowedFilenameTemplateVariables) {
            ul.createEl('li', {
              text: `{{{${allowedVariable}}}}`,
            });
          }
          el.createEl('br');
          // The first variable is the default one
          el.appendText(`默认：${defaultPluginSettings.filenameTemplate}`);
        }),
      )
      .setClass('ibooks-highlights-file-naming-template');

    filenameTemplate.addTextArea((text) => {
      text
        .setPlaceholder('书籍主笔记文件名模板')
        .setValue(this.plugin.settings.filenameTemplate)
        .onChange(async (value) => {
          const valueToSet = value === '' ? defaultPluginSettings.filenameTemplate : value;
          this.plugin.settings.filenameTemplate = valueToSet;

          await this.plugin.saveSettings();
        });
      return text;
    });
  }

  addCoverPathTemplateSetting(containerEl: HTMLElement): void {
    const coverTemplate = new Setting(containerEl)
      .setName('封面路径模板')
      .setDesc(
        createFragment((el) => {
          el.appendText('从 EPUB 自动提取的封面图保存到 Vault 内的哪个路径（相对 Vault 根目录，不含扩展名）。');
          el.createEl('br');
          el.appendText('留空则保存到：<导入目录>/covers/<书名>');
          el.createEl('br');
          el.appendText('可用变量：');
          const ul = el.createEl('ul');
          for (const allowedVariable of allowedFilenameTemplateVariables) {
            ul.createEl('li', { text: `{{{${allowedVariable}}}}` });
          }
          el.appendText('示例：附件/书封/{{{bookTitle}}} - {{{bookAuthor}}}');
          el.createEl('br');
          el.appendText('扩展名会自动跟随封面真实格式（jpg/png/…），无需手动转换。');
        }),
      )
      .setClass('ibooks-highlights-cover-path-template');

    coverTemplate.addText((text) => {
      text
        .setPlaceholder('留空使用默认 covers/ 目录')
        .setValue(this.plugin.settings.coverPathTemplate || '')
        .onChange(async (value) => {
          this.plugin.settings.coverPathTemplate = value;

          await this.plugin.saveSettings();
        });
      return text;
    });
  }

  addKeepMeSectionSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('模板：保留区')
      .setDesc(
        createFragment((el) => {
          el.appendText('重新导入时不会被覆盖的内容区域。');
          el.createEl('br');
          el.appendText('默认分隔符：');
          const ul = el.createEl('ul');
          ul.createEl('li', { text: 'Opening: %% keep-me %%' });
          ul.createEl('li', { text: 'Closing: %% /keep-me %%' });
        }),
      )
      .setClass('ibooks-highlights-keep-me-section')
      .addText((text) => {
        text
          .setPlaceholder('开始分隔符')
          .setValue(this.plugin.settings.keepMeSectionOpeningDelimiter || defaultPluginSettings.keepMeSectionOpeningDelimiter)
          .onChange(async (value) => {
            const valueToSet = value === '' ? defaultPluginSettings.keepMeSectionOpeningDelimiter : value;
            this.plugin.settings.keepMeSectionOpeningDelimiter = valueToSet;

            await this.plugin.saveSettings();
          });
        return text;
      })
      .addText((text) => {
        text
          .setPlaceholder('结束分隔符')
          .setValue(this.plugin.settings.keepMeSectionClosingDelimiter || defaultPluginSettings.keepMeSectionClosingDelimiter)
          .onChange(async (value) => {
            const valueToSet = value === '' ? defaultPluginSettings.keepMeSectionClosingDelimiter : value;
            this.plugin.settings.keepMeSectionClosingDelimiter = valueToSet;

            await this.plugin.saveSettings();
          });
        return text;
      });
  }

  addResetTemplateSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('重置模板')
      .setDesc('将书籍主笔记模板恢复为默认值。')
      .addButton((button) => {
        button.setButtonText('重置模板').onClick(async () => {
          this.plugin.settings.template = defaultTemplate;

          await this.plugin.saveSettings();
          this.display();
        });
      });
  }

  addCredits(containerEl: HTMLElement): void {
    containerEl.createEl('hr');
    containerEl
      .createEl('small', {
        text: '基于原插件作者：',
        cls: 'credits',
      })
      .createEl('a', {
        text: 'bandantonio',
        href: 'https://github.com/bandantonio',
      });
  }
}
