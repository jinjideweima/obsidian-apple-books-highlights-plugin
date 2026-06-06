import type { App, Vault, TFolder, TFile } from 'obsidian';
import type { IBookHighlightsPluginSettings } from '../types';

const joinPath = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/');

export class VaultManagement {
  private app: App;
  private vault: Vault;
  private settings: IBookHighlightsPluginSettings;
  constructor(app: App, settings: IBookHighlightsPluginSettings) {
    this.app = app;
    this.vault = this.app.vault;
    this.settings = settings;
  }

  getHighlightsFolder(): string {
    return this.settings.highlightsFolder;
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
      await this.vault.createFolder(this.getHighlightsFolder());
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

  async upsertFile(filePath: string, content: string): Promise<void> {
    const existingFile = this.vault.getFileByPath(filePath);

    if (existingFile) {
      await this.vault.modify(existingFile, content);
      return;
    }

    await this.vault.create(filePath, content);
  }

  async upsertBinaryFile(filePath: string, data: ArrayBuffer): Promise<void> {
    const existingFile = this.vault.getFileByPath(filePath);

    if (existingFile) {
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

    return this.vault.cachedRead(existingFile);
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

  async backupAllHighlights(): Promise<void> {
    const highlightsFolderPath = this.getHighlightsFolderPath();

    if (highlightsFolderPath) {
      const files = (await this.vault.adapter.list(highlightsFolderPath.path)).files;

      if (files.length > 0) {
        const highlightsBackupFolderName = `${this.getHighlightsFolder()}-bk-${Date.now()}`;
        await this.vault.adapter.rename(highlightsFolderPath.path, highlightsBackupFolderName);
      }
    }
  }

  async backupBookFile(file: TFile): Promise<void> {
    const backupFileName = `${file.basename}-bk-${Date.now()}.md`;
    await this.vault.adapter.rename(file.path, joinPath(this.getHighlightsFolder(), backupFileName));
  }
}
