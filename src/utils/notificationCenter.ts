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

export const showCoverAccessNotice = (): Notice => {
  return new Notice(
    'Apple Books 摘录已导入，但部分书籍的封面无法读取。\n这些书可能在 iCloud 中——请在「系统设置 → 隐私与安全性 → 完全磁盘访问」里添加 Obsidian，重启后重新导入。',
    0,
  );
};
