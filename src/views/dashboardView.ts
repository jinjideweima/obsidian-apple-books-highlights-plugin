import { type App, ItemView, Platform, setIcon, WorkspaceLeaf } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
import type { IBookNoteSummary, IHighlightCard } from '../types';
import { getBookSummaries, getHighlightCards } from '../modules/highlightRepository';
import { openCardsView } from './cardsView';

export const DASHBOARD_VIEW_TYPE = 'apple-books-knowledge-dashboard-view';

interface LibraryStats {
  bookCount: number;
  highlightCount: number;
  favoriteCount: number;
  noteCount: number;
}

const getStats = (books: IBookNoteSummary[], cards: IHighlightCard[]): LibraryStats => {
  return {
    bookCount: books.length,
    highlightCount: cards.length,
    favoriteCount: cards.filter((card) => card.favorite).length,
    noteCount: cards.filter((card) => card.appleNote.trim()).length,
  };
};

const getRecentBooks = (books: IBookNoteSummary[]): IBookNoteSummary[] => {
  // Take up to 12; the CSS grid auto-fits columns to width, so wider screens fill more in (6–12).
  return [...books].sort((a, b) => b.annotationCount - a.annotationCount).slice(0, 12);
};

const getRecentCards = (cards: IHighlightCard[]): IHighlightCard[] => {
  return [...cards]
    .sort((a, b) => {
      const dateComparison = b.highlightCreationDate - a.highlightCreationDate;

      if (dateComparison !== 0) {
        return dateComparison;
      }

      return b.path.localeCompare(a.path);
    })
    .slice(0, 4);
};

const getRandomCards = (cards: IHighlightCard[], count = 4): IHighlightCard[] => {
  const shuffled = [...cards];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
};

const trimText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
};

const renderInlineHighlight = (container: HTMLElement, text: string): void => {
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    if (index > 0) {
      container.createEl('br');
    }

    container.createSpan({ text: line, cls: 'abkc-highlight-text' });
  });
};

const getCoverPath = (cover: string): string => {
  return cover.match(/\[\[([^\]]+)\]\]/)?.[1] || '';
};

const openHighlightsFolder = async (app: App, plugin: IBookHighlightsPlugin): Promise<void> => {
  // Prefer the user-configured library page (e.g. 我的图书馆.base).
  const libraryPagePath = plugin.settings.libraryPagePath?.trim();

  if (libraryPagePath) {
    await app.workspace.openLinkText(libraryPagePath, '', false);
    return;
  }

  // Otherwise reveal the highlights folder in the file explorer.
  const folder = app.vault.getFolderByPath(plugin.settings.highlightsFolder);

  if (folder) {
    const fileExplorer = app.workspace.getLeavesOfType('file-explorer')[0];

    if (fileExplorer) {
      app.workspace.revealLeaf(fileExplorer);
      return;
    }
  }

  await openCardsView(plugin);
};

const renderStat = (
  container: HTMLElement,
  label: string,
  value: string | number,
  icon: string,
  accent: string,
  onClick: () => Promise<void>,
) => {
  const stat = container.createEl('button', { cls: 'abkc-dashboard-stat' });
  stat.setAttr('style', `--abkc-stat-accent: ${accent}`);
  const iconEl = stat.createDiv({ cls: 'abkc-dashboard-stat-icon' });
  setIcon(iconEl, icon);
  const text = stat.createDiv({ cls: 'abkc-dashboard-stat-text' });
  text.createDiv({ text: String(value), cls: 'abkc-dashboard-stat-value' });
  text.createDiv({ text: label, cls: 'abkc-dashboard-stat-label' });
  stat.addEventListener('click', async () => {
    await onClick();
  });
};

const renderBook = (app: App, container: HTMLElement, book: IBookNoteSummary) => {
  const bookEl = container.createEl('button', { cls: 'abkc-dashboard-book' });
  const coverPath = getCoverPath(book.cover);

  if (coverPath) {
    const image = bookEl.createEl('img', { attr: { alt: book.title } });
    image.src = app.vault.adapter.getResourcePath(coverPath);
  } else {
    bookEl.createDiv({ text: book.title.slice(0, 1), cls: 'abkc-dashboard-cover-fallback' });
  }

  const meta = bookEl.createDiv({ cls: 'abkc-dashboard-book-meta' });
  meta.createDiv({ text: book.title, cls: 'abkc-dashboard-book-title' });
  meta.createDiv({ text: book.author, cls: 'abkc-dashboard-muted' });
  meta.createDiv({ text: `${book.annotationCount} 条摘录 · ${book.status || '未标记'}`, cls: 'abkc-dashboard-muted' });

  bookEl.addEventListener('click', async () => {
    await app.workspace.openLinkText(book.path, '', false);
  });
};

const renderHighlight = (app: App, container: HTMLElement, card: IHighlightCard) => {
  const cardEl = container.createEl('button', { cls: `abkc-dashboard-highlight abkc-card abkc-card-${card.highlightColor}` });
  const header = cardEl.createDiv({ cls: 'abkc-card-header' });
  header.createDiv({ text: 'Apple Books', cls: 'abkc-card-brand' });
  header.createDiv({ text: 'Note Receipt', cls: 'abkc-card-title' });
  cardEl.createDiv({ cls: 'abkc-card-rule' });
  cardEl.createDiv({ text: `摘录 ${card.highlightIndex}`, cls: 'abkc-card-index' });

  if (card.chapter) {
    cardEl.createDiv({ text: card.chapter, cls: 'abkc-card-chapter' });
  }

  const highlightEl = cardEl.createDiv({ cls: 'abkc-card-highlight' });
  renderInlineHighlight(highlightEl, trimText(card.highlight, 160));

  if (card.appleNote.trim()) {
    const note = cardEl.createDiv({ cls: 'abkc-card-note' });
    note.createDiv({ text: '想法', cls: 'abkc-card-label' });
    note.createDiv({ text: trimText(card.appleNote, 90) });
  }

  cardEl.createDiv({ cls: 'abkc-card-rule' });
  const meta = cardEl.createDiv({ cls: 'abkc-card-meta' });
  meta.createDiv({ text: trimText(card.bookTitle, 42) });

  cardEl.addEventListener('click', async () => {
    await app.workspace.openLinkText(card.path, '', true);
  });
};

const renderDashboardContent = async (
  app: App,
  plugin: IBookHighlightsPlugin,
  contentEl: HTMLElement,
  onRefresh: () => Promise<void>,
): Promise<void> => {
  contentEl.empty();
  contentEl.addClass('abkc-dashboard-root');
  contentEl.toggleClass('abkc-mobile', Platform.isMobile);

  try {
    const [books, cards] = await Promise.all([getBookSummaries(app, plugin.settings), getHighlightCards(app, plugin.settings)]);
    const stats = getStats(books, cards);
    const randomCards = getRandomCards(cards);

    const hero = contentEl.createDiv({ cls: 'abkc-dashboard-hero' });
    const heroText = hero.createDiv({ cls: 'abkc-dashboard-intro' });
    heroText.createDiv({ text: 'Apple Books', cls: 'abkc-dashboard-kicker' });
    heroText.createEl('h1', { text: '阅读仪表盘' });
    heroText.createEl('p', { text: '从书、摘录、想法和随机回顾进入你的阅读现场。' });
    const heroActions = heroText.createDiv({ cls: 'abkc-dashboard-actions' });
    heroActions.createEl('button', { text: '打开摘录墙', cls: 'abkc-dashboard-primary' }).addEventListener('click', async () => {
      await openCardsView(plugin);
    });
    heroActions.createEl('button', { text: '浏览书籍', cls: 'abkc-dashboard-secondary' }).addEventListener('click', async () => {
      await openHighlightsFolder(app, plugin);
    });

    const statGrid = hero.createDiv({ cls: 'abkc-dashboard-stats' });
    renderStat(statGrid, '书籍', stats.bookCount, 'book', '#0a84ff', async () => {
      await openHighlightsFolder(app, plugin);
    });
    renderStat(statGrid, '摘录', stats.highlightCount, 'highlighter', '#ff9f0a', async () => {
      await openCardsView(plugin);
    });
    renderStat(statGrid, '想法', stats.noteCount, 'lightbulb', '#30d158', async () => {
      await openCardsView(plugin, { onlyWithAppleNote: true });
    });
    renderStat(statGrid, '收藏', stats.favoriteCount, 'star', '#ff375f', async () => {
      await openCardsView(plugin, { onlyFavorite: true });
    });

    const mainGrid = contentEl.createDiv({ cls: 'abkc-dashboard-grid' });
    const booksSection = mainGrid.createDiv({ cls: 'abkc-dashboard-section abkc-dashboard-section-wide' });
    booksSection.createEl('h2', { text: '最近值得回看的书' });
    const bookGrid = booksSection.createDiv({ cls: 'abkc-dashboard-books' });
    for (const book of getRecentBooks(books)) {
      renderBook(app, bookGrid, book);
    }

    const randomSection = mainGrid.createDiv({ cls: 'abkc-dashboard-section' });
    const randomHeader = randomSection.createDiv({ cls: 'abkc-dashboard-section-header' });
    randomHeader.createEl('h2', { text: '随机回顾' });
    randomHeader.createEl('button', { text: '重新随机', cls: 'abkc-dashboard-section-action' }).addEventListener('click', async () => {
      await onRefresh();
    });
    randomSection.createEl('p', { text: '从全部摘录里抽几张，适合每天快速复习。', cls: 'abkc-dashboard-muted' });
    const randomList = randomSection.createDiv({ cls: 'abkc-dashboard-highlights' });
    for (const card of randomCards) {
      renderHighlight(app, randomList, card);
    }

    const recentSection = mainGrid.createDiv({ cls: 'abkc-dashboard-section' });
    const recentHeader = recentSection.createDiv({ cls: 'abkc-dashboard-section-header' });
    recentHeader.createEl('h2', { text: '最近摘录' });
    recentSection.createEl('p', { text: '按时间排序，最新加入的摘录排在最前面。', cls: 'abkc-dashboard-muted' });
    const recentList = recentSection.createDiv({ cls: 'abkc-dashboard-highlights' });
    for (const card of getRecentCards(cards)) {
      renderHighlight(app, recentList, card);
    }
  } catch (error) {
    contentEl.createDiv({
      cls: 'abkc-empty',
      text: `Apple Books 阅读仪表盘加载失败：${error instanceof Error ? error.message : String(error)}`,
    });
    console.error('[Apple Books Knowledge Cards]:', error);
  }
};

export class DashboardView extends ItemView {
  private plugin: IBookHighlightsPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: IBookHighlightsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Apple Books 阅读仪表盘';
  }

  getIcon(): string {
    return 'book-open-check';
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    await renderDashboardContent(this.app, this.plugin, this.contentEl, () => this.render());
  }
}

export const renderDashboard = async (plugin: IBookHighlightsPlugin, container: HTMLElement): Promise<void> => {
  await renderDashboardContent(plugin.app, plugin, container, () => renderDashboard(plugin, container));
};

export const openDashboardView = async (plugin: IBookHighlightsPlugin): Promise<void> => {
  const existingLeaves = plugin.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);

  if (existingLeaves.length > 0) {
    plugin.app.workspace.revealLeaf(existingLeaves[0]);
    return;
  }

  const leaf = plugin.app.workspace.getLeaf(true);

  await leaf.setViewState({
    type: DASHBOARD_VIEW_TYPE,
    active: true,
  });

  plugin.app.workspace.revealLeaf(leaf);
};
