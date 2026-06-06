import { Modal, Notice, Platform, Setting, type App } from 'obsidian';
import type { IHighlightCard } from '../types';
import { setHighlightFavorite, setHighlightLocalNote } from '../modules/highlightRepository';

interface BoardFilters {
  bookId?: string;
}

interface ToolbarOptions {
  initialBookTitle?: string;
  initialOnlyFavorite?: boolean;
  initialOnlyUnreviewed?: boolean;
  initialOnlyWithAppleNote?: boolean;
  initialOnlyWithChapter?: boolean;
}

interface RenderContext {
  onRefresh: () => Promise<void>;
  initialOnlyFavorite?: boolean;
  initialOnlyUnreviewed?: boolean;
  initialOnlyWithAppleNote?: boolean;
  initialOnlyWithChapter?: boolean;
}

interface ToolbarState {
  query: string;
  bookTitle: string;
  bookAuthor: string;
  chapter: string;
  color: string;
  onlyFavorite: boolean;
  onlyUnreviewed: boolean;
  onlyWithAppleNote: boolean;
  onlyWithChapter: boolean;
}

// Rendering preferences toggled from the toolbar (not filters — they only affect how each card looks).
interface RenderOptions {
  showLocalNote: boolean;
  maxChars: number;
}

const DEFAULT_MAX_CHARS = 500;

const boundTocDocuments = new WeakSet<Document>();
const boundTocCleanups: Array<() => void> = [];

const colorLabelMap: Record<string, string> = {
  underline: '下划线',
  green: '绿色',
  blue: '蓝色',
  yellow: '黄色',
  pink: '粉色',
  purple: '紫色',
  plain: '普通',
};

const showNotice = (message: string): void => {
  const notice = new Notice(message);
  void notice;
};

const applyFilters = (cards: IHighlightCard[], filters: BoardFilters): IHighlightCard[] => {
  return cards.filter((card) => {
    if (filters.bookId && card.bookId !== filters.bookId) {
      return false;
    }

    return true;
  });
};

const getBookTitleFromFilter = (cards: IHighlightCard[], filters: BoardFilters): string => {
  if (!filters.bookId) {
    return '';
  }

  return cards.find((card) => card.bookId === filters.bookId)?.bookTitle || '';
};

const getUniqueValues = (cards: IHighlightCard[], getValue: (card: IHighlightCard) => string): string[] => {
  return Array.from(new Set(cards.map(getValue).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

const applyToolbarState = (cards: IHighlightCard[], state: ToolbarState): IHighlightCard[] => {
  let filteredCards = cards;

  if (state.query) {
    filteredCards = filteredCards.filter((card) => {
      return [card.highlight, card.appleNote, card.localNote, card.bookTitle, card.bookAuthor, card.chapter]
        .join('\n')
        .toLowerCase()
        .includes(state.query);
    });
  }

  if (state.bookTitle) {
    filteredCards = filteredCards.filter((card) => card.bookTitle === state.bookTitle);
  }

  if (state.bookAuthor) {
    filteredCards = filteredCards.filter((card) => card.bookAuthor === state.bookAuthor);
  }

  if (state.chapter) {
    filteredCards = filteredCards.filter((card) => card.chapter === state.chapter);
  }

  if (state.color) {
    filteredCards = filteredCards.filter((card) => card.highlightColor === state.color);
  }

  if (state.onlyFavorite) {
    filteredCards = filteredCards.filter((card) => card.favorite);
  }

  if (state.onlyUnreviewed) {
    filteredCards = filteredCards.filter((card) => !card.reviewed);
  }

  if (state.onlyWithAppleNote) {
    filteredCards = filteredCards.filter((card) => card.appleNote.trim());
  }

  if (state.onlyWithChapter) {
    filteredCards = filteredCards.filter((card) => card.chapter.trim());
  }

  return filteredCards;
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

// Cap a card's text length; <= 0 means no limit. Full text is always available on the card's own page.
const truncate = (text: string, maxChars: number): string => {
  if (maxChars <= 0 || text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars).trimEnd()}…`;
};

const getTocHighlightIndex = (link: HTMLAnchorElement): string | null => {
  const hrefIndex = decodeURIComponent(link.getAttribute('href') || '').match(/摘录-?(\d+)/)?.[1];

  if (hrefIndex) {
    return hrefIndex;
  }

  return link.textContent?.match(/\d+/)?.[0] || null;
};

const focusCard = (target: HTMLElement): void => {
  target.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth',
  });
  target.classList.add('abkc-card-focus');
  window.setTimeout(() => {
    target.classList.remove('abkc-card-focus');
  }, 1400);
};

const getTocScope = (link: HTMLAnchorElement): ParentNode => {
  return link.closest('.markdown-preview-view, .markdown-rendered, .markdown-source-view, .workspace-leaf-content') || link.ownerDocument;
};

const bindNoteToc = (container: HTMLElement): void => {
  const doc = container.ownerDocument;

  if (boundTocDocuments.has(doc)) {
    return;
  }

  boundTocDocuments.add(doc);

  const handler = (event: MouseEvent) => {
    const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('.abkc-note-toc a, a[href^="#摘录"]');

    if (!link) {
      return;
    }

    const highlightIndex = getTocHighlightIndex(link);

    if (!highlightIndex) {
      return;
    }

    const scope = getTocScope(link);
    const target =
      scope.querySelector<HTMLElement>(`.abkc-root [data-highlight-index="${CSS.escape(highlightIndex)}"]`) ||
      doc.querySelector<HTMLElement>(`.abkc-root [data-highlight-index="${CSS.escape(highlightIndex)}"]`);

    if (!target) {
      return;
    }

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

const createSelect = (
  container: HTMLElement,
  placeholder: string,
  values: string[],
  onChange: (value: string) => void,
): HTMLSelectElement => {
  const select = container.createEl('select', { cls: 'abkc-select' });
  select.createEl('option', { text: placeholder, value: '' });

  for (const value of values) {
    select.createEl('option', { text: value, value });
  }

  select.addEventListener('change', () => {
    onChange(select.value);
  });

  return select;
};

const setSelectOptions = (select: HTMLSelectElement, placeholder: string, values: string[]): void => {
  const previousValue = select.value;

  select.empty();
  select.createEl('option', { text: placeholder, value: '' });

  for (const value of values) {
    select.createEl('option', { text: value, value });
  }

  select.value = values.includes(previousValue) ? previousValue : '';
};

const createToggle = (container: HTMLElement, label: string, onChange: (enabled: boolean) => void): HTMLLabelElement => {
  const wrapper = container.createEl('label', { cls: 'abkc-toggle' });
  const checkbox = wrapper.createEl('input', {
    attr: {
      type: 'checkbox',
    },
  });
  wrapper.createSpan({ text: label });
  checkbox.addEventListener('change', () => {
    onChange(checkbox.checked);
  });

  return wrapper;
};

const renderToolbar = (
  container: HTMLElement,
  cards: IHighlightCard[],
  onFilter: (filteredCards: IHighlightCard[]) => void,
  filters: BoardFilters,
  renderOptions: RenderOptions,
  options: ToolbarOptions = {},
) => {
  const toolbar = container.createDiv({ cls: 'abkc-toolbar' });
  const searchGroup = toolbar.createDiv({ cls: 'abkc-toolbar-group abkc-toolbar-search-group' });
  const filtersGroup = toolbar.createDiv({ cls: 'abkc-toolbar-group abkc-toolbar-filters-group' });
  const togglesGroup = toolbar.createDiv({ cls: 'abkc-toolbar-group abkc-toolbar-toggles-group' });
  const actionsGroup = toolbar.createDiv({ cls: 'abkc-toolbar-group abkc-toolbar-actions-group' });
  const state: ToolbarState = {
    query: '',
    bookTitle: options.initialBookTitle || '',
    bookAuthor: '',
    chapter: '',
    color: '',
    onlyFavorite: Boolean(options.initialOnlyFavorite),
    onlyUnreviewed: Boolean(options.initialOnlyUnreviewed),
    onlyWithAppleNote: Boolean(options.initialOnlyWithAppleNote),
    onlyWithChapter: Boolean(options.initialOnlyWithChapter),
  };
  const searchInput = searchGroup.createEl('input', {
    cls: 'abkc-search',
    attr: {
      type: 'search',
      placeholder: '搜索摘录、书名、作者、章节',
    },
  });
  const getChapterSourceCards = (): IHighlightCard[] => {
    return cards.filter((card) => {
      if (state.bookTitle && card.bookTitle !== state.bookTitle) {
        return false;
      }

      if (state.bookAuthor && card.bookAuthor !== state.bookAuthor) {
        return false;
      }

      return true;
    });
  };

  const updateChapterOptions = () => {
    setSelectOptions(
      chapterSelect,
      '全部章节',
      getUniqueValues(getChapterSourceCards(), (card) => card.chapter),
    );
    state.chapter = chapterSelect.value;
  };

  const bookSelect = createSelect(
    filtersGroup,
    '全部书籍',
    getUniqueValues(cards, (card) => card.bookTitle),
    (value) => {
      state.bookTitle = value;
      updateChapterOptions();
      runFilter();
    },
  );
  bookSelect.value = state.bookTitle;
  const authorSelect = createSelect(
    filtersGroup,
    '全部作者',
    getUniqueValues(cards, (card) => card.bookAuthor),
    (value) => {
      state.bookAuthor = value;
      updateChapterOptions();
      runFilter();
    },
  );
  const chapterSelect = createSelect(
    filtersGroup,
    '全部章节',
    getUniqueValues(getChapterSourceCards(), (card) => card.chapter),
    (value) => {
      state.chapter = value;
      runFilter();
    },
  );
  const colorSelect = createSelect(filtersGroup, '全部颜色', Object.values(colorLabelMap), () => {});
  colorSelect.empty();
  colorSelect.createEl('option', { text: '全部颜色', value: '' });
  for (const [value, label] of Object.entries(colorLabelMap)) {
    colorSelect.createEl('option', { text: label, value });
  }
  colorSelect.addEventListener('change', () => {
    state.color = colorSelect.value;
    runFilter();
  });
  const favoriteToggle = createToggle(togglesGroup, '只看收藏', (enabled) => {
    state.onlyFavorite = enabled;
    runFilter();
  });
  favoriteToggle.querySelector<HTMLInputElement>('input')!.checked = state.onlyFavorite;
  const unreviewedToggle = createToggle(togglesGroup, '只看未整理', (enabled) => {
    state.onlyUnreviewed = enabled;
    runFilter();
  });
  unreviewedToggle.querySelector<HTMLInputElement>('input')!.checked = state.onlyUnreviewed;

  const showNoteToggle = createToggle(togglesGroup, '显示笔记', (enabled) => {
    renderOptions.showLocalNote = enabled;
    runFilter();
  });
  showNoteToggle.querySelector<HTMLInputElement>('input')!.checked = renderOptions.showLocalNote;

  const charLimit = togglesGroup.createEl('label', { cls: 'abkc-char-limit' });
  charLimit.createSpan({ text: '字数上限' });
  const charLimitInput = charLimit.createEl('input', {
    cls: 'abkc-char-limit-input',
    attr: { type: 'number', min: '0', step: '50' },
  });
  charLimitInput.value = String(renderOptions.maxChars);
  charLimitInput.addEventListener('change', () => {
    const value = Number(charLimitInput.value);
    renderOptions.maxChars = Number.isFinite(value) && value >= 0 ? value : DEFAULT_MAX_CHARS;
    charLimitInput.value = String(renderOptions.maxChars);
    runFilter();
  });

  const randomButton = actionsGroup.createEl('button', {
    text: '随机一组',
    cls: 'abkc-button',
  });
  const runFilter = () => {
    state.query = searchInput.value.trim().toLowerCase();
    onFilter(applyToolbarState(cards, state));
  };

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      runFilter();
    }
  });
  randomButton.addEventListener('click', () => {
    const filteredCards = applyToolbarState(cards, state);
    const shuffledCards = [...filteredCards];
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }
    shuffledCards.splice(12);
    onFilter(shuffledCards);
  });
  const resetButton = actionsGroup.createEl('button', {
    text: '重置筛选',
    cls: 'abkc-button',
  });
  resetButton.addEventListener('click', () => {
    state.query = '';
    state.bookTitle = options.initialBookTitle || '';
    state.bookAuthor = '';
    state.chapter = '';
    state.color = '';
    state.onlyFavorite = Boolean(options.initialOnlyFavorite);
    state.onlyUnreviewed = Boolean(options.initialOnlyUnreviewed);
    state.onlyWithAppleNote = Boolean(options.initialOnlyWithAppleNote);
    state.onlyWithChapter = Boolean(options.initialOnlyWithChapter);
    searchInput.value = '';
    bookSelect.value = state.bookTitle;
    authorSelect.value = '';
    colorSelect.value = '';
    favoriteToggle.querySelector<HTMLInputElement>('input')!.checked = state.onlyFavorite;
    unreviewedToggle.querySelector<HTMLInputElement>('input')!.checked = state.onlyUnreviewed;
    updateChapterOptions();
    onFilter(applyToolbarState(cards, state));
  });
};

class EditNoteModal extends Modal {
  private card: IHighlightCard;
  private onSave: (note: string) => Promise<void>;

  constructor(app: App, card: IHighlightCard, onSave: (note: string) => Promise<void>) {
    super(app);
    this.card = card;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: `编辑笔记：摘录 ${this.card.highlightIndex}` });
    contentEl.createEl('p', { text: this.card.bookTitle, cls: 'abkc-modal-muted' });
    const textarea = contentEl.createEl('textarea', { cls: 'abkc-note-editor' });
    textarea.value = this.card.localNote;

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('保存')
          .setCta()
          .onClick(async () => {
            await this.onSave(textarea.value);
            this.close();
          });
      })
      .addButton((button) => {
        button.setButtonText('取消').onClick(() => {
          this.close();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

const renderCard = (app: App, board: HTMLElement, card: IHighlightCard, context: RenderContext, options: RenderOptions) => {
  const cardEl = board.createEl('article', {
    cls: `abkc-card abkc-card-${card.highlightColor}`,
    attr: {
      id: card.annotationId,
      'data-annotation-id': card.annotationId,
      'data-highlight-index': String(card.highlightIndex),
    },
  });
  const header = cardEl.createDiv({ cls: 'abkc-card-header' });
  if (card.sourceKey) {
    header.createEl('a', {
      text: 'Apple Books',
      href: card.sourceKey,
      cls: 'abkc-card-brand abkc-card-brand-link',
    });
  } else {
    header.createDiv({ text: 'Apple Books', cls: 'abkc-card-brand' });
  }
  header.createDiv({ text: 'Note Receipt', cls: 'abkc-card-title' });
  cardEl.createDiv({ cls: 'abkc-card-rule' });
  cardEl.createDiv({ text: `摘录 ${card.highlightIndex}`, cls: 'abkc-card-index' });

  if (card.chapter) {
    cardEl.createDiv({ text: card.chapter, cls: 'abkc-card-chapter' });
  }

  const highlightEl = cardEl.createDiv({ cls: 'abkc-card-highlight' });
  renderInlineHighlight(highlightEl, truncate(card.highlight, options.maxChars));

  if (card.appleNote) {
    const note = cardEl.createDiv({ cls: 'abkc-card-note' });
    note.createDiv({ text: '想法', cls: 'abkc-card-label' });
    note.createDiv({ text: truncate(card.appleNote, options.maxChars) });
  }

  if (options.showLocalNote && card.localNote.trim()) {
    const localNoteEl = cardEl.createDiv({ cls: 'abkc-card-note abkc-card-localnote' });
    localNoteEl.createDiv({ text: '笔记', cls: 'abkc-card-label' });
    renderInlineHighlight(localNoteEl.createDiv(), card.localNote);
  }

  cardEl.createDiv({ cls: 'abkc-card-rule' });
  const meta = cardEl.createDiv({ cls: 'abkc-card-meta' });
  meta.createDiv({ text: card.bookTitle });

  const actions = cardEl.createDiv({ cls: 'abkc-card-actions' });
  actions.createEl('button', { text: card.favorite ? '已收藏' : '收藏', cls: 'abkc-action-button' }).addEventListener('click', async () => {
    await setHighlightFavorite(app, card, !card.favorite);
    showNotice(!card.favorite ? '已收藏摘录' : '已取消收藏');
    await context.onRefresh();
  });
  actions.createEl('button', { text: '编辑', cls: 'abkc-action-button' }).addEventListener('click', () => {
    new EditNoteModal(app, card, async (note) => {
      await setHighlightLocalNote(app, card, note);
      showNotice('笔记已写回摘录文件');
      await context.onRefresh();
    }).open();
  });
  actions.createEl('button', { text: '复制', cls: 'abkc-action-button' }).addEventListener('click', async () => {
    await navigator.clipboard.writeText(`> ${card.highlight}\n\n— ${card.bookTitle}`);
    showNotice('摘录已复制到剪贴板');
  });
  actions.createEl('button', { text: '打开', cls: 'abkc-action-button' }).addEventListener('click', async () => {
    window.sessionStorage.setItem('abkc:last-card', card.annotationId);
    await app.workspace.openLinkText(card.path, '', true);
  });
};

export const renderCardsBoard = (
  app: App,
  container: HTMLElement,
  cards: IHighlightCard[],
  filters: BoardFilters = {},
  context: RenderContext = { onRefresh: async () => {} },
) => {
  container.empty();
  container.addClass('abkc-root');
  container.toggleClass('abkc-mobile', Platform.isMobile);
  container.toggleClass('abkc-phone', Platform.isPhone);
  container.toggleClass('abkc-tablet', Platform.isTablet);
  const title = container.createDiv({ cls: 'abkc-title' });
  if (!filters.bookId) {
    title.createEl('h2', { text: 'Apple Books 摘录' });
  }
  const titleMeta = title.createDiv({ cls: 'abkc-title-meta' });
  if (context.initialOnlyWithAppleNote) {
    titleMeta.createSpan({ text: '想法', cls: 'abkc-filter-chip' });
  }
  if (context.initialOnlyFavorite) {
    titleMeta.createSpan({ text: '收藏', cls: 'abkc-filter-chip' });
  }
  if (context.initialOnlyWithChapter) {
    titleMeta.createSpan({ text: '章节', cls: 'abkc-filter-chip' });
  }
  if (context.initialOnlyUnreviewed) {
    titleMeta.createSpan({ text: '未整理', cls: 'abkc-filter-chip' });
  }
  const countEl = titleMeta.createSpan({ text: `${applyFilters(cards, filters).length} 张卡片`, cls: 'abkc-count' });

  const toolbarHost = container.createDiv();
  const board = container.createDiv({ cls: 'abkc-board' });
  const renderOptions: RenderOptions = { showLocalNote: false, maxChars: DEFAULT_MAX_CHARS };
  const render = (filteredCards: IHighlightCard[], scrollToLast = false) => {
    board.empty();
    countEl.setText(`${filteredCards.length} 张卡片`);

    if (filteredCards.length === 0) {
      board.createDiv({ text: '没有找到符合条件的摘录卡片。', cls: 'abkc-empty' });
      return;
    }

    for (const card of filteredCards) {
      renderCard(app, board, card, context, renderOptions);
    }

    // Only scroll to the last-opened card on the initial render (returning from a card's page).
    // Filtering / random / reset must NOT scroll — that was the jump-to-middle bug.
    if (!scrollToLast) {
      return;
    }

    const lastCardId = window.sessionStorage.getItem('abkc:last-card');
    if (lastCardId) {
      window.requestAnimationFrame(() => {
        board.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(lastCardId)}"]`)?.scrollIntoView({
          block: 'center',
          inline: 'nearest',
        });
        window.sessionStorage.removeItem('abkc:last-card');
      });
    }
  };

  const initialBookTitle = getBookTitleFromFilter(cards, filters);
  const initialState: ToolbarState = {
    query: '',
    bookTitle: initialBookTitle,
    bookAuthor: '',
    chapter: '',
    color: '',
    onlyFavorite: Boolean(context.initialOnlyFavorite),
    onlyUnreviewed: Boolean(context.initialOnlyUnreviewed),
    onlyWithAppleNote: Boolean(context.initialOnlyWithAppleNote),
    onlyWithChapter: Boolean(context.initialOnlyWithChapter),
  };

  renderToolbar(toolbarHost, cards, render, filters, renderOptions, {
    initialBookTitle,
    initialOnlyFavorite: Boolean(context.initialOnlyFavorite),
    initialOnlyUnreviewed: Boolean(context.initialOnlyUnreviewed),
    initialOnlyWithAppleNote: Boolean(context.initialOnlyWithAppleNote),
    initialOnlyWithChapter: Boolean(context.initialOnlyWithChapter),
  });
  render(applyToolbarState(applyFilters(cards, filters), initialState), true);
  bindNoteToc(container);
};

export const cleanupCardRenderer = (): void => {
  for (const cleanup of boundTocCleanups) {
    cleanup();
  }

  boundTocCleanups.length = 0;
};
