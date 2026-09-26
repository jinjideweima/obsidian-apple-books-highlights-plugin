import { Modal, Notice } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
export function showImportResult(plugin: IBookHighlightsPlugin): void {
  const result = plugin.settings.lastImport;
  if (!result) {
    const notice = new Notice('还没有导入记录。');
    void notice;
    return;
  }
  const modal = new Modal(plugin.app);
  modal.contentEl.createEl('h2', { text: '最近导入结果' });
  modal.contentEl.createEl('p', { text: new Date(result.at).toLocaleString() });
  modal.contentEl.createEl('p', {
    text: `处理 ${result.books} 本书；新增 ${result.created}、更新 ${result.updated}、未变化 ${result.unchanged} 个笔记文件。`,
  });
  modal.contentEl.createEl('p', { text: `移入已移除摘录 ${result.archived} 条；保留整理成果 ${result.retained} 条。` });
  for (const message of [...result.warnings, ...result.failures.map((f) => `失败：${f}`)]) modal.contentEl.createEl('p', { text: message });
  modal.open();
}
