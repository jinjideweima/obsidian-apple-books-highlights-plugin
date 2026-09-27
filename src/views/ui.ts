import { Notice, setIcon } from 'obsidian';

export const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '黄色',
  green: '绿色',
  blue: '蓝色',
  pink: '粉色',
  purple: '紫色',
  underline: '下划线',
  plain: '普通',
};

// Apple Books stores dates as seconds since 2001-01-01 UTC.
export const appleDate = (seconds: number): Date => new Date(Date.UTC(2001, 0, 1) + seconds * 1000);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export const relativeDay = (date: Date, now = new Date()): string => {
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
};

export const showNotice = (message: string): void => {
  const notice = new Notice(message);
  void notice;
};

export const iconButton = (parent: HTMLElement, icon: string, label: string, cls = ''): HTMLButtonElement => {
  const button = parent.createEl('button', {
    cls: `abkc-icon-button clickable-icon ${cls}`.trim(),
    attr: { 'aria-label': label, type: 'button' },
  });
  setIcon(button, icon);
  return button;
};

export const renderLines = (container: HTMLElement, text: string): void => {
  text.split('\n').forEach((line, index) => {
    if (index > 0) container.createEl('br');
    container.appendText(line);
  });
};

export const truncate = (text: string, maxChars: number): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars).trimEnd()}…`;
};

// Per-viewer UI preferences. Storage may be unavailable; defaults always apply.
export const readPrefs = <T extends object>(key: string, defaults: T): T => {
  try {
    return { ...defaults, ...(JSON.parse(window.localStorage.getItem(`abkc:${key}`) || '{}') as Partial<T>) };
  } catch {
    return { ...defaults };
  }
};

export const writePrefs = (key: string, value: object): void => {
  try {
    window.localStorage.setItem(`abkc:${key}`, JSON.stringify(value));
  } catch {
    /* Preferences are a convenience only. */
  }
};
