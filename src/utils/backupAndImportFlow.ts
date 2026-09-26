import { Notice } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
import type { IBookHighlightsPluginSettings } from '../types';
import { importHighlights } from '../importHighlights';
import { showFailedImportNotice, showErrorInConsole } from './notificationCenter';

const running = new WeakSet<IBookHighlightsPlugin>();
export const backupAndImport = async (
  plugin: IBookHighlightsPlugin,
  settings: IBookHighlightsPluginSettings,
  importMode?: 'modify',
  selectedBookId?: string,
) => {
  if (running.has(plugin)) {
    const notice = new Notice('已有导入正在进行，请等待本次完成。');
    void notice;
    return;
  }
  running.add(plugin);
  const progress = new Notice('正在读取 Apple Books，完成后显示导入结果……', 0);
  try {
    const result = await importHighlights(plugin.vault, settings, importMode ?? 'modify', selectedBookId);
    const message = `已处理 ${result.books} 本书：新增 ${result.created}、更新 ${result.updated}、未变化 ${result.unchanged} 个笔记文件；移入已移除摘录 ${result.archived} 条，保留有整理成果的摘录 ${result.retained} 条。`;
    settings.lastImport = { at: new Date().toISOString(), ...result };
    await plugin.saveSettings();
    const notice = new Notice(
      [message, ...result.warnings, ...result.failures.map((f) => `失败：${f}`)].join('\n'),
      result.failures.length || result.warnings.length ? 0 : 10000,
    );
    void notice;
  } catch (error) {
    showFailedImportNotice(plugin.manifest.name);
    showErrorInConsole(plugin.manifest.name, error);
  } finally {
    progress.hide();
    running.delete(plugin);
  }
};
