import { Notice } from 'obsidian';

export const showSuccessfulImportNotice = (): Notice => {
  return new Notice('Apple Books 摘录导入成功');
};

export const showFailedImportNotice = (pluginName: string): Notice => {
  return new Notice(`[${pluginName}]:\n导入摘录失败，请打开开发者控制台查看详情（⌥ ⌘ I）`, 0);
};

export const showErrorInConsole = (pluginName: string, error: unknown): void => {
  console.error(`[${pluginName}]:`, error);
};
