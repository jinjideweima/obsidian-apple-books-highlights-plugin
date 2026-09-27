import { type App, ItemView, Menu, Platform, setIcon, WorkspaceLeaf } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
import type { IBookNoteSummary, IHighlightCard } from '../types';
import { showImportResult } from '../modals/importResult';
import { getBookSummaries, getHighlightCards } from '../modules/highlightRepository';
import { watchVault } from '../utils/watchVault';
import { openCardFile } from './cardActions';
import { openCardsView, type CardsViewState } from './cardsView';
import { renderReviewPanel, type ReviewPanelHandle } from './reviewPanel';
import { appleDate, relativeDay, truncate } from './ui';

export const DASHBOARD_VIEW_TYPE = 'apple-books-knowledge-dashboard-view';

const HEATMAP_WEEKS = 18;
const SHELF_SIZE = 8;
const RECENT_SIZE = 6;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const panelHandles = new WeakMap<HTMLElement, ReviewPanelHandle>();

const getCoverPath = (cover: string): string => cover.match(/\[\[([^\]|]+)/)?.[1] || '';

// Recently opened books first; books without a known open date follow by highlight count.
export const shelfOrder = (books: IBookNoteSummary[]): IBookNoteSummary[] =>
  [...books].sort((a, b) => (b.lastOpened || '').localeCompare(a.lastOpened || '') || b.annotationCount - a.annotationCount);

const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export const heatmapDays = (cards: IHighlightCard[], weeks: number, now = new Date()): Array<{ date: Date; count: number }> => {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!card.highlightCreationDate) continue;
    const key = localDay(appleDate(card.highlightCreationDate));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // Start on the Monday `weeks - 1` weeks before this week's Monday.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
  const total = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - start.getTime()) / 86400000) + 1;
  return Array.from({ length: total }, (_, offset) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    return { date, count: counts.get(localDay(date)) || 0 };
  });
};

const openLibrary = async (plugin: IBookHighlightsPlugin): Promise<void> => {
  const libraryPagePath = plugin.settings.libraryPagePath?.trim();
  if (libraryPagePath) {
    await plugin.app.workspace.openLinkText(libraryPagePath, '', false);
    return;
  }
  const explorer = plugin.app.workspace.getLeavesOfType('file-explorer')[0];
  if (explorer && plugin.app.vault.getFolderByPath(plugin.settings.highlightsFolder)) {
    plugin.app.workspace.revealLeaf(explorer);
    return;
  }
  await openCardsView(plugin);
};

const runImport = async (plugin: IBookHighlightsPlugin, refresh: () => Promise<void>) => {
  const { backupAndImport } = await import('../utils/backupAndImportFlow');
  await backupAndImport(plugin, plugin.settings);
  await refresh();
};

const openImportOne = async (plugin: IBookHighlightsPlugin) => {
  const { IBookHighlightsPluginSearchModal } = await import('../modals/searchSuggestions');
  new IBookHighlightsPluginSearchModal(plugin.app, plugin).open();
};

const renderHeader = (
  plugin: IBookHighlightsPlugin,
  root: HTMLElement,
  books: IBookNoteSummary[],
  cards: IHighlightCard[],
  refresh: () => Promise<void>,
) => {
  const header = root.createDiv({ cls: 'abkc-home-header' });
  const titles = header.createDiv();
  const now = new Date();
  titles.createEl('h1', { text: `${now.getMonth() + 1} 月 ${now.getDate()} 日 星期${WEEKDAYS[now.getDay()]}` });
  const summary = titles.createDiv({ cls: 'abkc-home-summary' });
  const stat = (text: string, onClick: () => void) => {
    if (summary.childElementCount) summary.createSpan({ text: '·', cls: 'abkc-dot' });
    summary.createEl('button', { text, cls: 'abkc-link-button', attr: { type: 'button' } }).addEventListener('click', onClick);
  };
  stat(`${books.length} 本书`, () => void openLibrary(plugin));
  stat(`${cards.length} 条摘录`, () => void openCardsView(plugin));
  stat(
    `${cards.filter((card) => card.appleNote.trim() || card.localNote.trim()).length} 条有想法`,
    () => void openCardsView(plugin, { onlyWithAppleNote: true }),
  );

  const actions = header.createDiv({ cls: 'abkc-home-actions' });
  const wall = actions.createEl('button', { cls: 'abkc-button', attr: { type: 'button' } });
  setIcon(wall.createSpan({ cls: 'abkc-button-icon' }), 'layout-grid');
  wall.appendText('摘录墙');
  wall.addEventListener('click', () => void openCardsView(plugin));
  if (!Platform.isMobile) {
    const importButton = actions.createEl('button', { cls: 'abkc-button', attr: { type: 'button' } });
    setIcon(importButton.createSpan({ cls: 'abkc-button-icon' }), 'download');
    importButton.appendText('导入');
    importButton.addEventListener('click', (event) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle('导入全部书籍')
          .setIcon('library')
          .onClick(() => runImport(plugin, refresh)),
      );
      menu.addItem((item) =>
        item
          .setTitle('导入指定书籍…')
          .setIcon('book-plus')
          .onClick(() => openImportOne(plugin)),
      );
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle('最近导入结果')
          .setIcon('history')
          .onClick(() => showImportResult(plugin)),
      );
      menu.showAtMouseEvent(event);
    });
  }
};

const renderFootprint = (side: HTMLElement, cards: IHighlightCard[]) => {
  const section = side.createEl('section', { cls: 'abkc-home-card' });
  section.createEl('h3', { text: '阅读足迹' });
  const days = heatmapDays(cards, HEATMAP_WEEKS);
  const max = Math.max(1, ...days.map((day) => day.count));
  const grid = section.createDiv({ cls: 'abkc-heatmap', attr: { role: 'img', 'aria-label': `近 ${HEATMAP_WEEKS} 周每天新增的摘录数` } });
  for (const { date, count } of days) {
    const level = count ? Math.max(1, Math.ceil((count / max) * 4)) : 0;
    grid.createDiv({
      cls: `abkc-heatmap-cell is-l${level}`,
      attr: { title: `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${count} 条` },
    });
  }
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const active = days.filter((day) => day.count).length;
  section.createDiv({
    text: total ? `近 ${HEATMAP_WEEKS} 周新增 ${total} 条，${active} 天有摘录` : `近 ${HEATMAP_WEEKS} 周还没有新摘录`,
    cls: 'abkc-muted',
  });
};

const renderTriage = (plugin: IBookHighlightsPlugin, side: HTMLElement, cards: IHighlightCard[], archivedCount: number) => {
  const section = side.createEl('section', { cls: 'abkc-home-card' });
  section.createEl('h3', { text: '整理' });
  const list = section.createDiv({ cls: 'abkc-triage' });
  const row = (icon: string, label: string, count: number, state: CardsViewState) => {
    const button = list.createEl('button', { cls: 'abkc-triage-row', attr: { type: 'button' } });
    setIcon(button.createSpan({ cls: 'abkc-triage-icon' }), icon);
    button.createSpan({ text: label, cls: 'abkc-triage-label' });
    button.createSpan({ text: String(count), cls: 'abkc-triage-count' });
    button.addEventListener('click', () => void openCardsView(plugin, state));
  };
  row('circle-dashed', '待整理', cards.filter((card) => !card.reviewed).length, { onlyUnreviewed: true });
  row('star', '收藏', cards.filter((card) => card.favorite).length, { onlyFavorite: true });
  row('message-square', '有想法', cards.filter((card) => card.appleNote.trim() || card.localNote.trim()).length, {
    onlyWithAppleNote: true,
  });
  row('archive', '已移除', archivedCount, { archived: true });

  const last = plugin.settings.lastImport;
  const status = section.createEl('button', { cls: 'abkc-import-status', attr: { type: 'button' } });
  setIcon(status.createSpan({ cls: 'abkc-triage-icon' }), 'history');
  if (last) {
    const at = new Date(last.at);
    const time = `${relativeDay(at)} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    const changes = last.created + last.updated ? `新增 ${last.created} · 更新 ${last.updated}` : '没有变化';
    status.createSpan({ text: `上次导入 ${time} · ${last.failures.length ? `${last.failures.length} 本失败` : changes}` });
    if (last.failures.length || last.warnings.length) status.addClass('has-issues');
  } else {
    status.createSpan({ text: '还没有导入记录' });
  }
  status.addEventListener('click', () => showImportResult(plugin));
};

const renderShelf = (app: App, plugin: IBookHighlightsPlugin, root: HTMLElement, books: IBookNoteSummary[]) => {
  if (!books.length) return;
  const section = root.createEl('section', { cls: 'abkc-home-section' });
  const header = section.createDiv({ cls: 'abkc-section-header' });
  header.createEl('h2', { text: '继续阅读' });
  header
    .createEl('button', { text: '全部书籍', cls: 'abkc-link-button', attr: { type: 'button' } })
    .addEventListener('click', () => void openLibrary(plugin));
  const shelf = section.createDiv({ cls: 'abkc-shelf' });
  for (const book of shelfOrder(books).slice(0, SHELF_SIZE)) {
    const item = shelf.createEl('button', { cls: 'abkc-book', attr: { type: 'button', title: book.title } });
    const cover = item.createDiv({ cls: 'abkc-book-cover' });
    const coverPath = getCoverPath(book.cover);
    if (coverPath && app.vault.getFileByPath(coverPath)) {
      cover.createEl('img', { attr: { alt: '', src: app.vault.adapter.getResourcePath(coverPath), loading: 'lazy' } });
    } else {
      cover.addClass('is-fallback');
      cover.createDiv({ text: truncate(book.title, 16), cls: 'abkc-book-fallback-title' });
    }
    item.createDiv({ text: book.title, cls: 'abkc-book-title' });
    const opened = book.lastOpened ? relativeDay(new Date(book.lastOpened)) : book.status;
    item.createDiv({ text: [`${book.annotationCount} 条`, opened].filter(Boolean).join(' · '), cls: 'abkc-muted' });
    item.addEventListener('click', () => void app.workspace.openLinkText(book.path, '', false));
  }
};

const renderRecent = (app: App, root: HTMLElement, cards: IHighlightCard[]) => {
  const recent = [...cards]
    .sort((a, b) => b.highlightCreationDate - a.highlightCreationDate || b.path.localeCompare(a.path))
    .slice(0, RECENT_SIZE);
  if (!recent.length) return;
  const section = root.createEl('section', { cls: 'abkc-home-section' });
  section.createDiv({ cls: 'abkc-section-header' }).createEl('h2', { text: '最近摘录' });
  const list = section.createDiv({ cls: 'abkc-recent' });
  for (const card of recent) {
    const item = list.createEl('button', { cls: 'abkc-recent-item', attr: { type: 'button', 'data-color': card.highlightColor } });
    item.createDiv({ text: truncate(card.highlight, 140), cls: 'abkc-recent-quote' });
    const when = card.highlightCreationDate ? relativeDay(appleDate(card.highlightCreationDate)) : '';
    item.createDiv({ text: [card.bookTitle, when].filter(Boolean).join(' · '), cls: 'abkc-muted' });
    item.addEventListener('click', () => void openCardFile(app, card));
  }
};

const renderDashboardContent = async (
  app: App,
  plugin: IBookHighlightsPlugin,
  contentEl: HTMLElement,
  refresh: () => Promise<void>,
): Promise<void> => {
  let books: IBookNoteSummary[];
  let allCards: IHighlightCard[];
  try {
    [books, allCards] = await Promise.all([getBookSummaries(app, plugin.settings), getHighlightCards(app, plugin.settings)]);
  } catch (error) {
    contentEl.empty();
    contentEl.createDiv({ cls: 'abkc-empty', text: `阅读仪表盘加载失败：${error instanceof Error ? error.message : String(error)}` });
    console.error('[Apple Books Knowledge Cards]:', error);
    return;
  }
  // Snapshot cards live outside the books folder, so every card here is current.
  const cards = allCards.filter((card) => !card.archived);
  // Rebuild synchronously after the data is ready so the view never flashes empty or loses its scroll position.
  const scroller = contentEl.closest<HTMLElement>('.view-content, .markdown-preview-view') || contentEl;
  const scrollTop = scroller.scrollTop;
  contentEl.empty();
  contentEl.addClass('abkc-home-root');
  contentEl.toggleClass('abkc-mobile', Platform.isMobile);
  const root = contentEl.createDiv({ cls: 'abkc-home' });
  renderHeader(plugin, root, books, cards, refresh);
  const grid = root.createDiv({ cls: 'abkc-home-grid' });
  const main = grid.createDiv({ cls: 'abkc-home-main' });
  panelHandles.set(contentEl, renderReviewPanel(app, main, cards, plugin.settings.reviewNewPerDay ?? 10, refresh));
  const side = grid.createDiv({ cls: 'abkc-home-side' });
  renderFootprint(side, allCards);
  renderTriage(plugin, side, cards, allCards.length - cards.length);
  renderShelf(app, plugin, root, books);
  renderRecent(app, root, cards);
  scroller.scrollTop = scrollTop;

  if (!contentEl.dataset.abkcKeys) {
    contentEl.dataset.abkcKeys = 'true';
    contentEl.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (panelHandles.get(contentEl)?.onKey(event)) event.preventDefault();
    });
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
    // Keyboard review shortcuts need the view to be focusable.
    this.contentEl.setAttr('tabindex', '-1');
    watchVault(this.app, this, () => this.render());
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
    await (existingLeaves[0].view as DashboardView).render();
    plugin.app.workspace.revealLeaf(existingLeaves[0]);
    return;
  }
  const leaf = plugin.app.workspace.getLeaf(true);
  await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
  plugin.app.workspace.revealLeaf(leaf);
};
