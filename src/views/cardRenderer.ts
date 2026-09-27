import { Component, MarkdownRenderer, Menu, Platform, setIcon, type App } from 'obsidian';
import type { IHighlightCard } from '../types';
import {
  confirmDeleteCard,
  copyHighlight,
  editCardNote,
  openCardFile,
  openCardMenu,
  restoreCard,
  toggleFavorite,
  type CardActionContext,
} from './cardActions';
import { HIGHLIGHT_COLORS, iconButton, readPrefs, renderLines, writePrefs } from './ui';

interface BoardFilters {
  bookId?: string;
}

interface RenderContext {
  readOnly?: boolean;
  snapshotLabel?: string;
  initialArchived?: boolean;
  onRefresh: () => Promise<void>;
  initialOnlyFavorite?: boolean;
  initialOnlyUnreviewed?: boolean;
  initialOnlyWithAppleNote?: boolean;
  initialOnlyWithChapter?: boolean;
}

type Layout = 'list' | 'grid';

interface BoardPrefs {
  showThought: boolean;
  showNote: boolean;
  clampLong: boolean;
  bookLayout: Layout;
  allLayout: Layout;
}

interface BoardState {
  query: string;
  archived: boolean;
  bookTitle: string;
  chapter: string;
  color: string;
  onlyFavorite: boolean;
  onlyUnreviewed: boolean;
  onlyWithThought: boolean;
  onlyWithChapter: boolean;
  random: string[] | null;
}

interface CardOptions {
  layout: Layout;
  scoped: boolean;
  showThought: boolean;
  showNote: boolean;
  clampLong: boolean;
  readOnly: boolean;
}

const DEFAULT_PREFS: BoardPrefs = { showThought: true, showNote: true, clampLong: true, bookLayout: 'list', allLayout: 'grid' };
const LONG_QUOTE = 280;
const RANDOM_SIZE = 12;
const GRID_MIN_WIDTH = 280;
const GRID_GAP = 12;

const noteComponents = new Map<HTMLElement, Component>();
const releaseCard = (el: HTMLElement) => {
  noteComponents.get(el)?.unload();
  noteComponents.delete(el);
};

const boundTocDocuments = new WeakSet<Document>();
const boundTocCleanups: Array<() => void> = [];

const initialState = (context: RenderContext, bookTitle: string): BoardState => ({
  query: '',
  archived: Boolean(context.initialArchived),
  bookTitle,
  chapter: '',
  color: '',
  onlyFavorite: Boolean(context.initialOnlyFavorite),
  onlyUnreviewed: Boolean(context.initialOnlyUnreviewed),
  onlyWithThought: Boolean(context.initialOnlyWithAppleNote),
  onlyWithChapter: Boolean(context.initialOnlyWithChapter),
  random: null,
});

const filterCards = (cards: IHighlightCard[], state: BoardState): IHighlightCard[] => {
  const query = state.query.trim().toLowerCase();
  return cards.filter(
    (card) =>
      Boolean(card.archived) === state.archived &&
      (!state.bookTitle || card.bookTitle === state.bookTitle) &&
      (!state.chapter || card.chapter === state.chapter) &&
      (!state.color || card.highlightColor === state.color) &&
      (!state.onlyFavorite || card.favorite) &&
      (!state.onlyUnreviewed || !card.reviewed) &&
      (!state.onlyWithThought || card.appleNote.trim() || card.localNote.trim()) &&
      (!state.onlyWithChapter || card.chapter.trim()) &&
      (!query ||
        [card.highlight, card.appleNote, card.localNote, card.bookTitle, card.bookAuthor, card.chapter]
          .join('\n')
          .toLowerCase()
          .includes(query)),
  );
};

const uniqueValues = (cards: IHighlightCard[], pick: (card: IHighlightCard) => string): string[] =>
  Array.from(new Set(cards.map(pick).filter(Boolean))).sort((a, b) => a.localeCompare(b));

// ---------- Note TOC links in the book page scroll to the matching card ----------

const getTocHighlightIndex = (link: HTMLAnchorElement): string | null =>
  decodeURIComponent(link.getAttribute('href') || '').match(/摘录-?(\d+)/)?.[1] || link.textContent?.match(/\d+/)?.[0] || null;

const focusCard = (target: HTMLElement): void => {
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  target.classList.add('abkc-card-focus');
  window.setTimeout(() => target.classList.remove('abkc-card-focus'), 1400);
};

const bindNoteToc = (container: HTMLElement): void => {
  const doc = container.ownerDocument;
  if (boundTocDocuments.has(doc)) return;
  boundTocDocuments.add(doc);
  const handler = (event: MouseEvent) => {
    const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('.abkc-note-toc a, a[href^="#摘录"]');
    const highlightIndex = link && getTocHighlightIndex(link);
    if (!link || !highlightIndex) return;
    const scope: ParentNode =
      link.closest('.markdown-preview-view, .markdown-rendered, .markdown-source-view, .workspace-leaf-content') || link.ownerDocument;
    if (scope.querySelectorAll('.abkc-board').length !== 1) return;
    const target = scope.querySelector<HTMLElement>(`.abkc-root [data-highlight-index="${CSS.escape(highlightIndex)}"]`);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    focusCard(target);
  };
  doc.addEventListener('click', handler, true);
  boundTocCleanups.push(() => {
    doc.removeEventListener('click', handler, true);
    boundTocDocuments.delete(doc);
  });
};

// ---------- Card ----------

const renderCard = (actions: CardActionContext, card: IHighlightCard, options: CardOptions): HTMLElement => {
  const cardEl = createEl('article', {
    cls: `abkc-card is-${options.layout}`,
    attr: {
      id: card.annotationId,
      tabindex: '0',
      'data-color': card.highlightColor,
      'data-annotation-id': card.annotationId,
      'data-highlight-index': String(card.highlightIndex),
    },
  });
  if (options.layout === 'list') cardEl.createDiv({ text: String(card.highlightIndex), cls: 'abkc-card-index' });
  const main = cardEl.createDiv({ cls: 'abkc-card-main' });

  const quote = main.createDiv({ cls: 'abkc-card-quote' });
  renderLines(quote, card.highlight);
  if (options.clampLong && card.highlight.length > LONG_QUOTE) {
    quote.addClass('is-clamped');
    const expand = main.createEl('button', { text: '展开全文', cls: 'abkc-card-expand', attr: { type: 'button' } });
    expand.addEventListener('click', () => {
      const clamped = quote.classList.toggle('is-clamped');
      expand.setText(clamped ? '展开全文' : '收起');
    });
  }

  if (options.showThought && card.appleNote.trim()) {
    const thought = main.createDiv({ cls: 'abkc-card-annotation is-thought' });
    thought.createDiv({ text: 'Apple Books 想法', cls: 'abkc-card-label' });
    renderLines(thought.createDiv(), card.appleNote.trim());
  }

  if (options.showNote && card.localNote.trim()) {
    const note = main.createDiv({ cls: 'abkc-card-annotation is-note' });
    note.createDiv({ text: '我的笔记', cls: 'abkc-card-label' });
    const component = new Component();
    component.load();
    noteComponents.set(cardEl, component);
    void MarkdownRenderer.render(actions.app, card.localNote, note.createDiv({ cls: 'abkc-card-note-body' }), card.path, component);
  }

  const metaParts =
    options.layout === 'grid' ? [`#${card.highlightIndex}`, options.scoped ? '' : card.bookTitle, card.chapter].filter(Boolean) : [];
  const badges: Array<[string, string]> = [];
  if (card.reviewed) badges.push(['已整理', 'check']);
  if (card.sourceRemoved) badges.push([card.archived ? '已移除 · 可恢复' : 'Apple Books 中已删除 · 已保留', 'unlink']);
  if (metaParts.length || badges.length) {
    const meta = main.createDiv({ cls: 'abkc-card-meta' });
    if (metaParts.length) meta.createSpan({ text: metaParts.join(' · '), cls: 'abkc-card-source' });
    for (const [text, icon] of badges) {
      const badge = meta.createSpan({ cls: 'abkc-badge' });
      setIcon(badge.createSpan({ cls: 'abkc-badge-icon' }), icon);
      badge.appendText(text);
    }
  }

  if (options.readOnly) return cardEl;
  const bar = cardEl.createDiv({ cls: 'abkc-card-actions' });
  if (card.archived) {
    bar.createEl('button', { text: '恢复', cls: 'abkc-text-button', attr: { type: 'button' } }).addEventListener('click', () => {
      void restoreCard(actions, card);
    });
    bar
      .createEl('button', { text: '删除…', cls: 'abkc-text-button mod-warning', attr: { type: 'button' } })
      .addEventListener('click', () => {
        confirmDeleteCard(actions, card);
      });
  } else {
    const star = iconButton(bar, 'star', card.favorite ? '取消收藏' : '收藏', `abkc-star${card.favorite ? ' is-active' : ''}`);
    star.setAttr('aria-pressed', String(card.favorite));
    star.addEventListener('click', () => void toggleFavorite(actions, card));
    iconButton(bar, 'pencil', '编辑笔记').addEventListener('click', () => editCardNote(actions, card));
  }
  iconButton(bar, 'more-horizontal', '更多操作').addEventListener('click', (event) => {
    openCardMenu(actions, card, event);
  });
  return cardEl;
};

// Rough rendered height in lines, used to balance grid columns without measuring layout.
const estimateLines = (card: IHighlightCard, options: CardOptions): number => {
  const lines = (text: string, perLine: number) => Math.ceil(text.length / perLine) + (text.match(/\n/g)?.length ?? 0);
  const quote = options.clampLong && card.highlight.length > LONG_QUOTE ? 8 : lines(card.highlight, 20);
  const thought = options.showThought && card.appleNote.trim() ? 2 + lines(card.appleNote.trim(), 26) : 0;
  const note = options.showNote && card.localNote.trim() ? 2 + lines(card.localNote.trim(), 26) : 0;
  return 4 + quote + thought + note;
};

// ---------- Toolbar ----------

const pillSelect = (parent: HTMLElement, label: string, onChange: (value: string) => void): HTMLSelectElement => {
  const select = parent.createEl('select', { cls: 'abkc-pill dropdown', attr: { 'aria-label': label } });
  select.addEventListener('change', () => {
    select.toggleClass('is-active', Boolean(select.value));
    onChange(select.value);
  });
  return select;
};

const setOptions = (select: HTMLSelectElement, placeholder: string, options: Array<[string, string]>, value: string): void => {
  const signature = JSON.stringify([placeholder, options, value]);
  if (select.dataset.options !== signature) {
    select.dataset.options = signature;
    select.empty();
    select.createEl('option', { text: placeholder, value: '' });
    for (const [optionValue, label] of options) select.createEl('option', { text: label, value: optionValue });
    // Keep a chosen value even if no card currently matches it.
    if (value && !options.some(([optionValue]) => optionValue === value)) select.createEl('option', { text: value, value });
  }
  select.value = value;
  select.toggleClass('is-active', Boolean(value));
};

const chip = (parent: HTMLElement, label: string, icon: string, onToggle: () => void): HTMLButtonElement => {
  const button = parent.createEl('button', { cls: 'abkc-pill abkc-chip', attr: { type: 'button', 'aria-pressed': 'false' } });
  setIcon(button.createSpan({ cls: 'abkc-chip-icon' }), icon);
  button.appendText(label);
  button.addEventListener('click', onToggle);
  return button;
};

// ---------- Board ----------

const boardControllers = new WeakMap<HTMLElement, { key: string; update: (cards: IHighlightCard[]) => void }>();
const resizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

// Keep `parent`'s children exactly `elements`, moving only what is out of place.
const place = (parent: HTMLElement, elements: HTMLElement[]): void => {
  let cursor = parent.firstElementChild;
  for (const element of elements) {
    if (element !== cursor) parent.insertBefore(element, cursor);
    cursor = element.nextElementSibling;
  }
  while (cursor) {
    const next = cursor.nextElementSibling;
    cursor.remove();
    cursor = next;
  }
};

export const renderCardsBoard = (
  app: App,
  container: HTMLElement,
  cards: IHighlightCard[],
  filters: BoardFilters = {},
  context: RenderContext = { onRefresh: async () => {} },
) => {
  const key = JSON.stringify([
    filters,
    context.readOnly,
    context.snapshotLabel,
    context.initialArchived,
    context.initialOnlyFavorite,
    context.initialOnlyUnreviewed,
    context.initialOnlyWithAppleNote,
    context.initialOnlyWithChapter,
  ]);
  const controller = boardControllers.get(container);
  if (controller?.key === key && container.querySelector('.abkc-board')) {
    controller.update(cards);
    return;
  }

  for (const el of Array.from(container.querySelectorAll<HTMLElement>('.abkc-card'))) releaseCard(el);
  resizeObservers.get(container)?.disconnect();
  container.empty();
  container.addClass('abkc-root');
  container.toggleClass('abkc-mobile', Platform.isMobile);

  let all = [...cards];
  const scoped = Boolean(filters.bookId);
  const inScope = () => all.filter((card) => !filters.bookId || card.bookId === filters.bookId);
  const prefs = readPrefs<BoardPrefs>('board', DEFAULT_PREFS);
  const layout = (): Layout => (scoped ? prefs.bookLayout : prefs.allLayout);
  const state = initialState(context, '');
  const actions: CardActionContext = { app, refresh: context.onRefresh };

  if (!scoped || context.snapshotLabel) {
    const header = container.createDiv({ cls: 'abkc-board-header' });
    if (!scoped) header.createEl('h2', { text: context.initialArchived ? '已移除摘录' : '摘录' });
    if (context.snapshotLabel) {
      const snapshot = header.createDiv({ cls: 'abkc-snapshot' });
      setIcon(snapshot.createSpan(), 'history');
      snapshot.appendText(context.snapshotLabel);
    }
  }

  const toolbar = container.createDiv({ cls: 'abkc-toolbar' });
  const search = toolbar.createEl('input', {
    cls: 'abkc-search',
    attr: { type: 'search', placeholder: scoped ? '搜索这本书的摘录' : '搜索摘录、书名、作者', 'aria-label': '搜索摘录' },
  });
  const filtersEl = toolbar.createDiv({ cls: 'abkc-toolbar-filters' });
  const bookSelect = scoped
    ? null
    : pillSelect(filtersEl, '按书籍筛选', (value) => {
        state.bookTitle = value;
        state.chapter = '';
        update();
      });
  const chapterSelect = pillSelect(filtersEl, '按章节筛选', (value) => {
    state.chapter = value;
    update();
  });
  const colorSelect = pillSelect(filtersEl, '按颜色筛选', (value) => {
    state.color = value;
    update();
  });
  const toggles: Array<[HTMLButtonElement, keyof BoardState]> = [
    [chip(filtersEl, '收藏', 'star', () => flip('onlyFavorite')), 'onlyFavorite'],
    [chip(filtersEl, '未整理', 'circle-dashed', () => flip('onlyUnreviewed')), 'onlyUnreviewed'],
    [chip(filtersEl, '有想法', 'message-square', () => flip('onlyWithThought')), 'onlyWithThought'],
    [chip(filtersEl, '已移除', 'archive', () => flip('archived')), 'archived'],
  ];
  const tools = toolbar.createDiv({ cls: 'abkc-toolbar-tools' });
  const countEl = tools.createSpan({ cls: 'abkc-count' });
  const clearButton = tools.createEl('button', { text: '清除筛选', cls: 'abkc-text-button', attr: { type: 'button' } });
  const shuffleButton = iconButton(tools, 'shuffle', `随机抽 ${RANDOM_SIZE} 条`);
  const layoutButton = iconButton(tools, 'layout-grid', '');
  const displayButton = iconButton(tools, 'sliders-horizontal', '显示选项');

  const archivedNote = container.createDiv({
    cls: 'abkc-callout',
    text: '这些摘录已在 Apple Books 中删除，文件仍保留。可以恢复，或移到回收站。',
  });
  const board = container.createDiv({ cls: 'abkc-board' });
  const nodes = new Map<string, { element: HTMLElement; fingerprint: string }>();
  // Card elements in reading order; grid columns interleave them, so the DOM order differs.
  let ordered: HTMLElement[] = [];
  let columnsShown = 0;
  const columnCount = () => {
    const width = board.clientWidth;
    return width ? Math.max(1, Math.floor((width + GRID_GAP) / (GRID_MIN_WIDTH + GRID_GAP))) : 1;
  };

  const flip = (field: keyof BoardState) => {
    (state as unknown as Record<string, unknown>)[field] = !state[field];
    update();
  };

  const isFiltered = () =>
    Boolean(state.query || state.bookTitle || state.chapter || state.color || state.random) ||
    state.onlyFavorite !== Boolean(context.initialOnlyFavorite) ||
    state.onlyUnreviewed !== Boolean(context.initialOnlyUnreviewed) ||
    state.onlyWithThought !== Boolean(context.initialOnlyWithAppleNote) ||
    state.archived !== Boolean(context.initialArchived);

  const syncToolbar = () => {
    const base = inScope();
    if (bookSelect) {
      setOptions(
        bookSelect,
        '全部书籍',
        uniqueValues(base, (card) => card.bookTitle).map((v) => [v, v]),
        state.bookTitle,
      );
    }
    const chapterSource = base.filter((card) => !state.bookTitle || card.bookTitle === state.bookTitle);
    setOptions(
      chapterSelect,
      '全部章节',
      uniqueValues(chapterSource, (card) => card.chapter).map((v) => [v, v]),
      state.chapter,
    );
    const colors = new Set(base.map((card) => card.highlightColor));
    setOptions(
      colorSelect,
      '全部颜色',
      Object.entries(HIGHLIGHT_COLORS).filter(([value]) => colors.has(value)),
      state.color,
    );
    for (const [button, field] of toggles) {
      button.toggleClass('is-active', Boolean(state[field]));
      button.setAttr('aria-pressed', String(Boolean(state[field])));
    }
    clearButton.toggleClass('abkc-hidden', !isFiltered());
    archivedNote.toggleClass('abkc-hidden', !state.archived);
    shuffleButton.toggleClass('is-active', Boolean(state.random));
    const next = layout() === 'list' ? 'grid' : 'list';
    setIcon(layoutButton, next === 'grid' ? 'layout-grid' : 'list');
    layoutButton.setAttr('aria-label', next === 'grid' ? '切换为网格' : '切换为列表');
  };

  const visibleCards = (): IHighlightCard[] => {
    const filtered = filterCards(inScope(), state);
    if (!state.random) return filtered;
    const byPath = new Map(filtered.map((card) => [card.path, card]));
    return state.random.map((path) => byPath.get(path)).filter((card): card is IHighlightCard => Boolean(card));
  };

  const groupLabel = (card: IHighlightCard) =>
    scoped ? card.chapter || '未标注章节' : [card.bookTitle, card.chapter].filter(Boolean).join(' · ') || '未标注章节';

  const render = (scrollToLast = false) => {
    syncToolbar();
    const visible = visibleCards();
    const mode = layout();
    const options: CardOptions = {
      layout: mode,
      scoped,
      showThought: prefs.showThought,
      showNote: prefs.showNote,
      clampLong: prefs.clampLong,
      readOnly: Boolean(context.readOnly),
    };
    board.className = `abkc-board is-${mode}`;
    countEl.setText(state.random ? `随机 ${visible.length} 条` : `${visible.length} 条`);
    board.querySelectorAll('.abkc-empty').forEach((el) => el.remove());

    const paths = new Set(visible.map((card) => card.path));
    for (const [path, node] of nodes) {
      if (paths.has(path)) continue;
      releaseCard(node.element);
      node.element.remove();
      nodes.delete(path);
    }

    if (!visible.length) {
      ordered = [];
      place(board, []);
      const empty = board.createDiv({ cls: 'abkc-empty' });
      empty.createDiv({ text: isFiltered() ? '没有符合条件的摘录' : state.archived ? '没有已移除的摘录' : '还没有摘录' });
      if (isFiltered()) {
        empty.createEl('button', { text: '清除筛选', attr: { type: 'button' } }).addEventListener('click', clear);
      }
      return;
    }

    // Headers group consecutive cards; card elements are reused so focus and scroll survive updates.
    const grouped = mode === 'list' && !state.random;
    const sequence: HTMLElement[] = [];
    let currentGroup: { label: string; count: HTMLElement; n: number } | null = null;
    for (const card of visible) {
      if (grouped && currentGroup?.label !== groupLabel(card)) {
        const header = createDiv({ cls: 'abkc-group-header' });
        header.createSpan({ text: groupLabel(card) });
        currentGroup = { label: groupLabel(card), count: header.createSpan({ cls: 'abkc-group-count' }), n: 0 };
        sequence.push(header);
      }
      if (currentGroup) currentGroup.count.setText(String(++currentGroup.n));
      const fingerprint = JSON.stringify([card, options]);
      const old = nodes.get(card.path);
      if (old?.fingerprint !== fingerprint) {
        const element = renderCard(actions, card, options);
        if (old) {
          releaseCard(old.element);
          old.element.replaceWith(element);
        }
        nodes.set(card.path, { element, fingerprint });
      }
      sequence.push(nodes.get(card.path)!.element);
    }
    ordered = visible.map((card) => nodes.get(card.path)!.element);
    if (mode === 'list') {
      place(board, sequence);
    } else {
      // Masonry: each card goes to the currently shortest column, so the first row reads 1, 2, 3… and no gaps open under short cards.
      const count = columnCount();
      let columns = Array.from(board.children).filter((el): el is HTMLElement => el.classList.contains('abkc-column'));
      if (columns.length !== count) columns = Array.from({ length: count }, () => createDiv({ cls: 'abkc-column' }));
      const heights = columns.map(() => 0);
      const buckets = columns.map((): HTMLElement[] => []);
      visible.forEach((card, index) => {
        const target = heights.indexOf(Math.min(...heights));
        buckets[target].push(ordered[index]);
        heights[target] += estimateLines(card, options);
      });
      place(board, columns);
      columns.forEach((column, index) => place(column, buckets[index]));
      columnsShown = count;
    }

    if (!scrollToLast) return;
    const lastCardId = window.sessionStorage.getItem('abkc:last-card');
    if (lastCardId) {
      window.requestAnimationFrame(() => {
        board.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(lastCardId)}"]`)?.scrollIntoView({ block: 'center' });
        window.sessionStorage.removeItem('abkc:last-card');
      });
    }
  };

  const update = () => {
    state.random = null;
    render();
  };

  function clear() {
    Object.assign(state, initialState(context, ''));
    search.value = '';
    render();
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    update();
  });
  clearButton.addEventListener('click', clear);
  shuffleButton.addEventListener('click', () => {
    const pool = filterCards(inScope(), state);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    state.random = pool.slice(0, RANDOM_SIZE).map((card) => card.path);
    render();
  });
  layoutButton.addEventListener('click', () => {
    if (scoped) prefs.bookLayout = layout() === 'list' ? 'grid' : 'list';
    else prefs.allLayout = layout() === 'list' ? 'grid' : 'list';
    writePrefs('board', prefs);
    render();
  });
  displayButton.addEventListener('click', (event) => {
    const menu = new Menu();
    const option = (title: string, field: 'showThought' | 'showNote' | 'clampLong') =>
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(prefs[field])
          .onClick(() => {
            prefs[field] = !prefs[field];
            writePrefs('board', prefs);
            render();
          }),
      );
    option('显示 Apple Books 想法', 'showThought');
    option('显示我的笔记', 'showNote');
    option('折叠长摘录', 'clampLong');
    menu.showAtMouseEvent(event);
  });

  // Keyboard: j/k or arrows move between cards; f favorite, e edit, c copy, Enter/o open.
  board.addEventListener('keydown', (event) => {
    const cardEl = (event.target as HTMLElement).closest<HTMLElement>('article.abkc-card');
    if (!cardEl || event.target !== cardEl || event.metaKey || event.ctrlKey || event.altKey) return;
    const card = visibleCards().find((entry) => entry.annotationId === cardEl.dataset.annotationId);
    const move = (step: number) => ordered[ordered.indexOf(cardEl) + step]?.focus();
    const handlers: Record<string, () => void> = {
      j: () => move(1),
      ArrowDown: () => move(1),
      k: () => move(-1),
      ArrowUp: () => move(-1),
    };
    if (card && !context.readOnly) {
      Object.assign(handlers, {
        f: () => void toggleFavorite(actions, card),
        e: () => editCardNote(actions, card),
        c: () => void copyHighlight(card),
        o: () => void openCardFile(app, card),
        Enter: () => void openCardFile(app, card),
      });
    }
    const handler = handlers[event.key];
    if (!handler) return;
    event.preventDefault();
    handler();
  });

  render(true);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (layout() === 'grid' && columnCount() !== columnsShown) render();
    });
    observer.observe(board);
    resizeObservers.set(container, observer);
  }
  boardControllers.set(container, {
    key,
    update: (next) => {
      all = [...next];
      render();
    },
  });
  bindNoteToc(container);
};

export const cleanupCardsBoard = (container: HTMLElement): void => {
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('.abkc-card'))) releaseCard(el);
  boardControllers.delete(container);
  resizeObservers.get(container)?.disconnect();
  resizeObservers.delete(container);
};

export const cleanupCardRenderer = (): void => {
  for (const component of noteComponents.values()) component.unload();
  noteComponents.clear();
  for (const cleanup of boundTocCleanups) cleanup();
  boundTocCleanups.length = 0;
};
