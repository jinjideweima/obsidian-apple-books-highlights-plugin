import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { IBookWithAnnotations } from '../../src/types';
import { App, MockElement, NoticeMock, Setting, TFile, createMockElement } from '../mocks/obsidian';

vi.mock('obsidian', async () => await import('../mocks/obsidian'));

vi.mock('../../src/modules/annotationsProcessing', () => ({
  aggregateBooksWithAnnotations: vi.fn(),
}));
vi.mock('../../src/modules/templateProcessing', () => ({
  compileTemplate: vi.fn(),
}));
vi.mock('../../src/modules/highlightCards', () => ({
  importHighlightCards: vi.fn(),
}));
vi.mock('../../src/importHighlights', () => ({
  importHighlights: vi.fn(),
}));

import { importHighlights } from '../../src/importHighlights';
import { OverwriteBookModal } from '../../src/modals/overwriteConsent';
import { IBookHighlightsPluginSearchModal } from '../../src/modals/searchSuggestions';
import { aggregateBooksWithAnnotations } from '../../src/modules/annotationsProcessing';
import { importHighlightCards } from '../../src/modules/highlightCards';
import { compileTemplate } from '../../src/modules/templateProcessing';

const makeBook = (overrides: Partial<IBookWithAnnotations> = {}): IBookWithAnnotations =>
  ({
    bookId: 'B1',
    bookTitle: 'Atomic Habits',
    bookAuthor: 'James Clear',
    bookGenre: 'Self-help',
    bookLanguage: 'EN',
    bookLastOpenedDate: 0,
    bookFinishedDate: null,
    bookCoverUrl: '',
    annotations: [{ highlight: 'a highlight' }],
    ...overrides,
  }) as IBookWithAnnotations;

const baseSettings = {
  highlightsFolder: 'ibooks-highlights',
  backup: false,
  importOnStart: false,
  highlightsSortingCriterion: 'creationDateOldToNew' as const,
  template: 'TEMPLATE',
  filenameTemplate: 'FILENAME_TEMPLATE',
  keepMeSectionOpeningDelimiter: '%% keep-me %%',
  keepMeSectionClosingDelimiter: '%% /keep-me %%',
  keepMeSectionData: {},
};

const makePlugin = (overrides: Record<string, unknown> = {}) =>
  ({
    app: new App(),
    manifest: { name: 'Apple Books Test Mock' },
    settings: { ...baseSettings },
    vault: {
      getHighlightsFolderPath: vi.fn(() => ({}) as unknown),
      createHighlightsFolder: vi.fn(),
      getFilePath: vi.fn(() => null as unknown),
      createBookFile: vi.fn(),
      modifyBookFile: vi.fn(),
      backupBookFile: vi.fn(),
    },
    ...overrides,
  }) as any;

describe('IBookHighlightsPluginSearchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Setting.instances.length = 0;
    // The import flow compiles the content template and the filename template separately.
    vi.mocked(compileTemplate).mockImplementation(
      (tpl: string) => (tpl === baseSettings.filenameTemplate ? () => 'rendered-filename' : () => 'RENDERED_CONTENT') as any,
    );
  });

  test('Should filter books based on query', async () => {
    const books = [makeBook(), makeBook({ bookId: 'B2', bookTitle: 'Deep Work', bookAuthor: 'Cal Newport' })];
    vi.mocked(aggregateBooksWithAnnotations).mockResolvedValue(books);
    const modal = new IBookHighlightsPluginSearchModal(new App() as any, makePlugin());

    const byTitle = await modal.getSuggestions('atomic');
    expect(byTitle.map((book) => book.bookTitle)).toEqual(['Atomic Habits']);

    const byAuthor = await modal.getSuggestions('NEWPORT');
    expect(byAuthor.map((book) => book.bookTitle)).toEqual(['Deep Work']);

    // The book list is fetched once and cached across queries.
    expect(aggregateBooksWithAnnotations).toHaveBeenCalledTimes(1);
  });

  test('Should display suggestions in the modal', () => {
    const modal = new IBookHighlightsPluginSearchModal(new App() as any, makePlugin());
    const el = createMockElement();

    modal.renderSuggestion(makeBook(), el as unknown as HTMLElement);

    expect(el.children).toHaveLength(2);
    expect(el.children[0].tag).toBe('div');
    expect(el.children[0].text).toBe('Atomic Habits');
    expect(el.children[1].tag).toBe('small');
    expect(el.children[1].text).toBe('James Clear');
  });

  test('Should handle selection of a suggestion (new book file)', async () => {
    const plugin = makePlugin();
    const book = makeBook();
    const modal = new IBookHighlightsPluginSearchModal(new App() as any, plugin);

    await (modal as any).handleChooseSuggestion(book);

    expect(plugin.vault.createBookFile).toHaveBeenCalledWith('rendered-filename', 'RENDERED_CONTENT');
    expect(importHighlightCards).toHaveBeenCalledWith(plugin.vault, book, 'rendered-filename');
    expect(plugin.vault.backupBookFile).not.toHaveBeenCalled();
  });

  test('Should back up and rewrite when the book file already exists and backup is enabled', async () => {
    const existingFile = Object.assign(new TFile(), { name: 'rendered-filename.md' });
    const plugin = makePlugin();
    plugin.settings.backup = true;
    plugin.vault.getFilePath = vi.fn(() => existingFile);
    const book = makeBook();
    const modal = new IBookHighlightsPluginSearchModal(new App() as any, plugin);

    await (modal as any).handleChooseSuggestion(book);

    expect(plugin.vault.backupBookFile).toHaveBeenCalledWith(existingFile);
    expect(plugin.vault.createBookFile).toHaveBeenCalledWith('rendered-filename', 'RENDERED_CONTENT');
    expect(importHighlightCards).toHaveBeenCalledWith(plugin.vault, book, 'rendered-filename');
  });

  test('Should ask for overwrite consent when the file exists and backup is disabled', async () => {
    const existingFile = Object.assign(new TFile(), { name: 'rendered-filename.md' });
    const plugin = makePlugin();
    plugin.settings.backup = false;
    plugin.vault.getFilePath = vi.fn(() => existingFile);
    const openSpy = vi.spyOn(OverwriteBookModal.prototype, 'open').mockImplementation(() => {});
    const modal = new IBookHighlightsPluginSearchModal(new App() as any, plugin);

    await (modal as any).handleChooseSuggestion(makeBook());

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(plugin.vault.createBookFile).not.toHaveBeenCalled();
  });

  test('onChooseSuggestion delegates to the selection handler', async () => {
    const plugin = makePlugin();
    const modal = new IBookHighlightsPluginSearchModal(new App() as any, plugin);
    const handlerSpy = vi.spyOn(modal as any, 'handleChooseSuggestion').mockResolvedValue(undefined);
    const book = makeBook();

    modal.onChooseSuggestion(book, {} as MouseEvent);

    expect(handlerSpy).toHaveBeenCalledWith(book);
  });

  test('Should handle no results found', async () => {
    vi.mocked(aggregateBooksWithAnnotations).mockResolvedValue([makeBook()]);
    const modal = new IBookHighlightsPluginSearchModal(new App() as any, makePlugin());

    const suggestions = await modal.getSuggestions('nothing matches this');

    expect(suggestions).toEqual([]);
  });

  test('Should return no suggestions and notify when fetching fails', async () => {
    vi.mocked(aggregateBooksWithAnnotations).mockRejectedValue(new Error('db unavailable'));
    const modal = new IBookHighlightsPluginSearchModal(new App() as any, makePlugin());

    const suggestions = await modal.getSuggestions('atomic');

    expect(suggestions).toEqual([]);
    expect(NoticeMock).toHaveBeenCalledWith('[Apple Books Test Mock]:\n导入摘录失败，请打开开发者控制台查看详情（⌥ ⌘ I）', 0);
  });
});

describe('OverwriteBookModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Setting.instances.length = 0;
  });

  const collectText = (modal: OverwriteBookModal): string => (modal.contentEl as unknown as MockElement).collectText();

  test('Should show a modal window for bulk import', () => {
    const modal = new OverwriteBookModal(new App() as any, makePlugin());

    modal.onOpen();

    const text = collectText(modal);
    expect(text).toContain('批量导入会覆盖导入目录中的');
    expect(text).toContain('所有书籍主笔记');
    expect(text).toContain('是否继续？');
    const content = modal.contentEl as unknown as MockElement;
    expect(content.findAll('span').some((span) => span.hasClass('modal-rewrite-all-books'))).toBe(true);
  });

  test('Should show a modal window with book details', () => {
    const file = Object.assign(new TFile(), { name: 'Atomic Habits.md' }) as any;
    const modal = new OverwriteBookModal(new App() as any, makePlugin(), { file, compiledContent: 'content' });

    modal.onOpen();

    const text = collectText(modal);
    expect(text).toContain('选中的书籍主笔记已经存在');
    expect(text).toContain('Atomic Habits.md');
    expect(text).toContain('是否继续覆盖？');
    const content = modal.contentEl as unknown as MockElement;
    expect(content.findAll('p').some((p) => p.hasClass('modal-rewrite-book-title'))).toBe(true);
  });

  test('Bulk overwrite confirmation imports all highlights and closes the modal', async () => {
    const plugin = makePlugin();
    const modal = new OverwriteBookModal(new App() as any, plugin);
    const closeSpy = vi.spyOn(modal, 'close').mockImplementation(() => {});
    modal.onOpen();

    const [confirmButton] = Setting.instances.at(-1)!.buttons();
    await confirmButton.click();

    expect(importHighlights).toHaveBeenCalledWith(plugin.vault, plugin.settings, 'modify');
    expect(NoticeMock).toHaveBeenCalledWith('Apple Books 摘录导入成功');
    expect(closeSpy).toHaveBeenCalled();
  });

  test('Single-book overwrite confirmation rewrites the file and its cards', async () => {
    const plugin = makePlugin();
    const file = Object.assign(new TFile(), { name: 'Atomic Habits.md' }) as any;
    const book = makeBook();
    const modal = new OverwriteBookModal(new App() as any, plugin, {
      file,
      compiledContent: 'new content',
      book,
      compiledFilename: 'Atomic Habits',
    });
    vi.spyOn(modal, 'close').mockImplementation(() => {});
    modal.onOpen();

    const [confirmButton] = Setting.instances.at(-1)!.buttons();
    await confirmButton.click();

    expect(plugin.vault.modifyBookFile).toHaveBeenCalledWith(file, 'new content');
    expect(importHighlightCards).toHaveBeenCalledWith(plugin.vault, book, 'Atomic Habits');
    expect(NoticeMock).toHaveBeenCalledWith('Apple Books 摘录导入成功');
  });

  test('Cancel button closes the modal without importing', async () => {
    const plugin = makePlugin();
    const modal = new OverwriteBookModal(new App() as any, plugin);
    const closeSpy = vi.spyOn(modal, 'close').mockImplementation(() => {});
    modal.onOpen();

    const cancelButton = Setting.instances.at(-1)!.buttons()[1];
    await cancelButton.click();

    expect(closeSpy).toHaveBeenCalled();
    expect(importHighlights).not.toHaveBeenCalled();
  });

  test('Failed overwrite shows the failure notice', async () => {
    const plugin = makePlugin();
    vi.mocked(importHighlights).mockRejectedValueOnce(new Error('write failed'));
    const modal = new OverwriteBookModal(new App() as any, plugin);
    vi.spyOn(modal, 'close').mockImplementation(() => {});
    modal.onOpen();

    const [confirmButton] = Setting.instances.at(-1)!.buttons();
    await confirmButton.click();

    expect(NoticeMock).toHaveBeenCalledWith('[Apple Books Test Mock]:\n导入摘录失败，请打开开发者控制台查看详情（⌥ ⌘ I）', 0);
  });

  test('onClose empties the modal content', () => {
    const modal = new OverwriteBookModal(new App() as any, makePlugin());
    modal.onOpen();
    expect((modal.contentEl as unknown as MockElement).children.length).toBeGreaterThan(0);

    modal.onClose();

    expect((modal.contentEl as unknown as MockElement).children).toHaveLength(0);
  });
});
