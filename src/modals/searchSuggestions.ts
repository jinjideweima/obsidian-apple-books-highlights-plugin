import { type App, SuggestModal } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
import type { IBook } from '../types';
import { getBooks } from '../modules/dataFetching';
import { backupAndImport } from '../utils/backupAndImportFlow';
import { showFailedImportNotice, showErrorInConsole } from '../utils/notificationCenter';

export class IBookHighlightsPluginSearchModal extends SuggestModal<IBook> {
  plugin: IBookHighlightsPlugin;
  private books: Promise<IBook[]> | null = null;
  constructor(app: App, plugin: IBookHighlightsPlugin) {
    super(app);
    this.plugin = plugin;
  }
  async getSuggestions(query: string): Promise<IBook[]> {
    try {
      this.books ||= getBooks(true);
      const books = await this.books;
      return books.filter((book) => `${book.bookTitle} ${book.bookAuthor || ''}`.toLowerCase().includes(query.toLowerCase()));
    } catch (error) {
      this.books = null;
      showFailedImportNotice(this.plugin.manifest.name);
      showErrorInConsole(this.plugin.manifest.name, error);
      return [];
    }
  }
  renderSuggestion(book: IBook, el: HTMLElement): void {
    el.createDiv({ text: book.bookTitle });
    el.createEl('small', { text: book.bookAuthor || '作者未知' });
  }
  onChooseSuggestion(book: IBook, _event?: MouseEvent | KeyboardEvent): void {
    void backupAndImport(this.plugin, this.plugin.settings, 'modify', book.bookId);
  }
}
