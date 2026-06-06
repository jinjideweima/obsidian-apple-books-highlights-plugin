import { Notice, Platform, Plugin } from 'obsidian';
import type { IBookHighlightsPluginSettings } from './src/types';
import { getHighlightCards } from './src/modules/highlightRepository';
import { VaultManagement } from './src/modules/vaultManagement';
import { defaultPluginSettings, IBookHighlightsSettingTab } from './src/settings';
import { saveKeepMeSectionData } from './src/utils/manageKeepMeSection';
import { showFailedImportNotice, showErrorInConsole } from './src/utils/notificationCenter';
import { cleanupCardRenderer, renderCardsBoard } from './src/views/cardRenderer';
import { CARDS_VIEW_TYPE, CardsView, openCardsView } from './src/views/cardsView';
import { DASHBOARD_VIEW_TYPE, DashboardView, openDashboardView, renderDashboard } from './src/views/dashboardView';
import { createLibraryView } from './src/views/libraryBase';

const showNotice = (message: string, timeout?: number): void => {
  const notice = new Notice(message, timeout);
  void notice;
};

export default class IBookHighlightsPlugin extends Plugin {
  vault: VaultManagement;
  settings: IBookHighlightsPluginSettings;

  async onload() {
    await this.loadSettings();
    this.vault = new VaultManagement(this.app, this.settings);

    this.addSettingTab(new IBookHighlightsSettingTab(this.app, this));
    if (!Platform.isMobile) {
      addRibbonAction(this);
      addImportAllBooksCommand(this);
      addImportOneBookCommand(this);
    }
    addDashboardRibbonAction(this);
    addOpenDashboardCommand(this);
    addOpenCardsWallCommand(this);
    addCreateLibraryViewCommand(this);
    registerCardsView(this);
    registerDashboardView(this);
    registerCardsCodeBlock(this);
    registerDashboardCodeBlock(this);

    if (this.settings.importOnStart && !Platform.isMobile) {
      this.app.workspace.onLayoutReady(async () => {
        const { backupAndImport } = await import('./src/utils/backupAndImportFlow');
        await backupAndImport(this, this.settings, 'modify');
      });
    }

    this.registerEvent(
      this.app.workspace.on('quick-preview', async (file, data) => {
        await saveKeepMeSectionData(file, data, this, this.settings);
      }),
    );
  }

  onunload() {
    cleanupCardRenderer();
    this.app.workspace.detachLeavesOfType(CARDS_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, defaultPluginSettings, (await this.loadData()) as Partial<IBookHighlightsPluginSettings>);

    return this.settings;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
    this.vault = new VaultManagement(this.app, this.settings);
  }
}

function addRibbonAction(plugin: IBookHighlightsPlugin) {
  plugin.addRibbonIcon('book-open', `${plugin.manifest.name}: 导入全部`, async () => {
    if (Platform.isMobile) {
      showNotice('iOS/iPadOS 端暂不支持从 Apple Books 数据库导入，请在 Mac 端导入后通过 iCloud 同步查看。');
      return;
    }

    const { backupAndImport } = await import('./src/utils/backupAndImportFlow');
    await backupAndImport(plugin, plugin.settings);
  });
}

function addDashboardRibbonAction(plugin: IBookHighlightsPlugin) {
  plugin.addRibbonIcon('layout-dashboard', `${plugin.manifest.name}: 打开阅读仪表盘`, async () => {
    await openDashboardView(plugin);
  });
}

function addImportAllBooksCommand(plugin: IBookHighlightsPlugin) {
  plugin.addCommand({
    id: 'import-all-highlights',
    name: '导入全部 Apple Books 摘录',
    callback: async () => {
      if (Platform.isMobile) {
        showNotice('iOS/iPadOS 端暂不支持导入 Apple Books 数据库，请在 Mac 端导入后同步查看。');
        return;
      }

      const { backupAndImport } = await import('./src/utils/backupAndImportFlow');
      await backupAndImport(plugin, plugin.settings);
    },
  });
}

function addImportOneBookCommand(plugin: IBookHighlightsPlugin) {
  plugin.addCommand({
    id: 'import-single-highlights',
    name: '导入指定书籍...',
    callback: async () => {
      if (Platform.isMobile) {
        showNotice('iOS/iPadOS 端暂不支持导入指定书籍，请在 Mac 端导入后同步查看。');
        return;
      }

      try {
        const { IBookHighlightsPluginSearchModal } = await import('./src/modals/searchSuggestions');
        new IBookHighlightsPluginSearchModal(plugin.app, plugin).open();
      } catch (error) {
        showFailedImportNotice(plugin.manifest.name);
        showErrorInConsole(plugin.manifest.name, error);
      }
    },
  });
}

function addOpenCardsWallCommand(plugin: IBookHighlightsPlugin) {
  plugin.addCommand({
    id: 'open-cards-wall',
    name: '打开 Apple Books 摘录',
    callback: async () => {
      await openCardsView(plugin);
    },
  });
}

function addOpenDashboardCommand(plugin: IBookHighlightsPlugin) {
  plugin.addCommand({
    id: 'open-reading-dashboard',
    name: '打开 Apple Books 阅读仪表盘',
    callback: async () => {
      await openDashboardView(plugin);
    },
  });
}

function addCreateLibraryViewCommand(plugin: IBookHighlightsPlugin) {
  plugin.addCommand({
    id: 'create-library-view',
    name: '创建 Apple Books 图书馆视图（Base）',
    callback: async () => {
      try {
        await createLibraryView(plugin);
      } catch (error) {
        showFailedImportNotice(plugin.manifest.name);
        showErrorInConsole(plugin.manifest.name, error);
      }
    },
  });
}

function registerCardsView(plugin: IBookHighlightsPlugin) {
  plugin.registerView(CARDS_VIEW_TYPE, (leaf) => new CardsView(leaf, plugin));
}

function registerDashboardView(plugin: IBookHighlightsPlugin) {
  plugin.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, plugin));
}

function registerCardsCodeBlock(plugin: IBookHighlightsPlugin) {
  plugin.registerMarkdownCodeBlockProcessor('apple-books-board', async (source, el) => {
    const bookId = source.match(/book_id:\s*(.+)/)?.[1]?.trim();
    const render = async () => {
      try {
        const cards = await getHighlightCards(plugin.app, plugin.settings);

        renderCardsBoard(plugin.app, el, cards, { bookId }, { onRefresh: render });
      } catch (error) {
        el.empty();
        el.createDiv({
          cls: 'abkc-empty',
          text: `Apple Books 摘录卡片加载失败：${error instanceof Error ? error.message : String(error)}`,
        });
        showErrorInConsole(plugin.manifest.name, error);
      }
    };

    await render();
  });
}

function registerDashboardCodeBlock(plugin: IBookHighlightsPlugin) {
  plugin.registerMarkdownCodeBlockProcessor('apple-books-dashboard', async (_source, el) => {
    await renderDashboard(plugin, el);
  });
}
