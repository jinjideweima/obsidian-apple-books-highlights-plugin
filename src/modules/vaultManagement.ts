import { consolidateCards, relocateFile, redirectLinks } from './bookResources';
import type { App, Vault, TFolder, TFile } from 'obsidian';
import type { IBookHighlightsPluginSettings } from '../types';
import { parseFrontmatter, safeRelativePath } from '../utils/markdown';

const joinPath = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/');

export class VaultManagement {
  private app: App;
  private vault: Vault;
  private indexedBooks: Map<string, TFile> | null = null;
  private indexedCards: Map<string, TFile[]> | null = null;
  private settings: IBookHighlightsPluginSettings;
  constructor(app: App, settings: IBookHighlightsPluginSettings) {
    this.app = app;
    this.vault = this.app.vault;
    this.settings = settings;
  }

  getApp(): App { return this.app; }

  async readBookState(bookId: string): Promise<Record<string, unknown>> {
    const path = `${this.getHighlightsFolder()}/.abkc-state/${encodeURIComponent(bookId)}.json`;
    if (!(await this.vault.adapter.exists(path))) return {};
    try { return JSON.parse(await this.vault.adapter.read(path)); }
    catch { throw new Error('书籍同步记录无法读取，已停止该书导入：' + path); }
  }

  async writeBookState(bookId: string, state: Record<string, unknown>): Promise<void> {
    const dir = `${this.getHighlightsFolder()}/.abkc-state`;
    if (!(await this.vault.adapter.exists(dir))) await this.vault.adapter.mkdir(dir);
    const path = `${dir}/${encodeURIComponent(bookId)}.json`;
    const text = JSON.stringify(state, null, 2);
    if (await this.vault.adapter.exists(path) && await this.vault.adapter.read(path) === text) return;
    await this.vault.adapter.write(path, text);
  }

  async organizeCards(bookId: string, filename: string): Promise<string[]> {
    const result = await consolidateCards(this.app, this.getCardFiles(bookId), bookId, `${this.getHighlightsFolder()}/cards/${filename}`, (p) => this.ensureFolder(p));
    // Obsidian updates TFile paths on rename; retain the per-book index for this import.
    return result;
  }

  async moveResource(from: string, to: string): Promise<void> {
    const file = this.vault.getFileByPath(from);
    if (!file || from === to) return;
    await this.ensureFolder(to.slice(0, to.lastIndexOf('/')));
    const target = this.vault.getFileByPath(to);
    if (target) {
      const a = new Uint8Array(await this.vault.readBinary(file));
      const b = new Uint8Array(await this.vault.readBinary(target));
      if (a.length !== b.length || !a.every((v, i) => v === b[i])) throw new Error('封面同名但内容不同，未覆盖：' + to);
      await redirectLinks(this.app, from, target);
      await this.app.fileManager.trashFile(file);
    } else await relocateFile(this.app, file, to);
  }

  getHighlightsFolder(): string {
    return safeRelativePath(this.settings.highlightsFolder);
  }

  getHighlightsFolderPath(): TFolder | null {
    const folderPath = this.getHighlightsFolder();

    const checkPath = this.vault.getFolderByPath(folderPath);
    return checkPath;
  }

  getFilePath(filenameTemplate: string): TFile | null {
    const filePath = joinPath(this.getHighlightsFolder(), `${filenameTemplate}.md`);

    const result = this.vault.getFileByPath(filePath);

    return result;
  }

  async createHighlightsFolder(): Promise<void> {
    const highlightsFolderPath = this.getHighlightsFolderPath();

    if (!highlightsFolderPath) {
      await this.ensureFolder(this.getHighlightsFolder());
    }
  }

  async ensureFolder(folderPath: string): Promise<void> {
    const normalizedParts = folderPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of normalizedParts) {
      currentPath = currentPath ? joinPath(currentPath, part) : part;

      if (!this.vault.getFolderByPath(currentPath)) {
        await this.vault.createFolder(currentPath);
      }
    }
  }

  async createBookFile(filename: string, content: string): Promise<void> {
    const filePath = joinPath(this.getHighlightsFolder(), `${filename}.md`);

    await this.vault.create(filePath, content);
  }

  async modifyBookFile(file: TFile, content: string): Promise<void> {
    await this.vault.modify(file, content);
  }

  async upsertFile(filePath: string, content: string, expected?: string): Promise<'created' | 'updated' | 'unchanged'> {
    safeRelativePath(filePath);
    const existingFile = this.vault.getFileByPath(filePath);

    if (existingFile) {
      const currentContent = await this.vault.read(existingFile);
      if (expected !== undefined && currentContent !== expected)
        throw new Error('文件在导入期间被修改，已保留最新内容，请重试：' + filePath);
      // Do not invoke process for equal content: the host may write even when its callback returns the input.
      if (currentContent === content) return 'unchanged';
      let changed = false;
      await this.vault.process(existingFile, (current) => {
        if (expected !== undefined && current !== expected) throw new Error('文件在导入期间被修改，已保留最新内容，请重试：' + filePath);
        if (current === content) return current;
        changed = true;
        return content;
      });
      return changed ? 'updated' : 'unchanged';
    }

    await this.ensureFolder(filePath.slice(0, filePath.lastIndexOf('/')));
    await this.vault.create(filePath, content);
    return 'created';
  }

  async upsertBinaryFile(filePath: string, data: ArrayBuffer): Promise<void> {
    const existingFile = this.vault.getFileByPath(filePath);

    if (existingFile) {
      const previous = new Uint8Array(await this.vault.readBinary(existingFile));
      const next = new Uint8Array(data);
      if (previous.length === next.length && previous.every((v, i) => v === next[i])) return;
      await this.vault.modifyBinary(existingFile, data);
      return;
    }

    await this.vault.createBinary(filePath, data);
  }

  async readFileIfExists(filePath: string): Promise<string> {
    const existingFile = this.vault.getFileByPath(filePath);

    if (!existingFile) {
      return '';
    }

    return this.vault.read(existingFile);
  }

  async listFiles(folderPath: string): Promise<string[]> {
    try {
      const result = await this.vault.adapter.list(folderPath);
      return result.files;
    } catch {
      return [];
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const existingFile = this.vault.getFileByPath(filePath);

    if (existingFile) {
      await this.vault.delete(existingFile);
    }
  }

  getMarkdownFiles(): TFile[] {
    return this.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${this.getHighlightsFolder()}/`));
  }

  async prepareImport(): Promise<void> {
    this.indexedBooks = new Map();
    this.indexedCards = new Map();
    for (const file of this.getMarkdownFiles()) {
      if (/-bk-\d+/.test(file.path)) continue;
      const fm = parseFrontmatter(await this.vault.read(file));
      const id = String(fm.book_id || '');
      if (fm.type === 'book' && fm.source === 'Apple Books') {
        if (this.indexedBooks.has(id)) throw new Error('同一书籍 ID 对应多个笔记，请先检查：' + file.path);
        this.indexedBooks.set(id, file);
      }
      if (fm.type === 'ibooks_highlight') {
        const files = this.indexedCards.get(id) || [];
        files.push(file);
        this.indexedCards.set(id, files);
      }
    }
  }
  getCardFiles(bookId: string): TFile[] {
    return this.indexedCards?.get(bookId) || this.getMarkdownFiles().filter((f) => f.path.includes('/cards/'));
  }

  async findBookFile(bookId: string): Promise<TFile | null> {
    if (this.indexedBooks) return this.indexedBooks.get(bookId) || null;
    for (const file of this.getMarkdownFiles()) {
      if (/-bk-\d+/.test(file.path) || file.path.includes('/cards/')) continue;
      const fm = parseFrontmatter(await this.vault.read(file));
      if (fm.type === 'book' && String(fm.book_id) === bookId) return file;
    }
    return null;
  }

  async backupAllHighlights(): Promise<void> {
    if (!this.getHighlightsFolderPath()) return;
    const root = this.getHighlightsFolder();
    const target = `${root}-bk-${Date.now()}`;
    const copy = async (source: string, destination: string): Promise<void> => {
      const list = await this.vault.adapter.list(source);
      await this.ensureFolder(destination);
      for (const file of list.files) {
        await this.vault.adapter.copy(file, `${destination}/${file.slice(source.length + 1)}`);
      }
      for (const folder of list.folders || []) await copy(folder, `${destination}/${folder.slice(source.length + 1)}`);
    };
    await copy(root, target);
    const rewriteSnapshot = async (dir: string): Promise<void> => {
      const entries = await this.vault.adapter.list(dir);
      for (const file of entries.files.filter((p) => p.endsWith('.md'))) {
        const old = await this.vault.adapter.read(file);
        const next = old.split(`[[${root}/`).join(`[[${target}/`);
        if (next !== old) await this.vault.adapter.write(file, next);
      }
      for (const folder of entries.folders || []) await rewriteSnapshot(folder);
    };
    await rewriteSnapshot(target);
    // Cover templates may point outside the highlights directory. Include those files too.
    for (const file of this.getMarkdownFiles()) {
      if (file.path.includes('/cards/')) continue;
      const fm = parseFrontmatter(await this.vault.read(file));
      if (fm.type !== 'book') continue;
      const coverPath = String(fm.cover || '').match(/^\[\[([^|\]]+)/)?.[1];
      if (!coverPath || coverPath.startsWith(root + '/')) continue;
      safeRelativePath(coverPath);
      if (!this.vault.getFileByPath(coverPath)) continue;
      const destination = `${target}/.external-covers/${coverPath}`;
      await this.ensureFolder(destination.slice(0, destination.lastIndexOf('/')));
      await this.vault.adapter.copy(coverPath, destination);
    }
  }

  async backupBookFile(_file: TFile): Promise<void> {
    // A book includes cards and covers, including user-configured paths in the root.
    await this.backupAllHighlights();
  }
}
