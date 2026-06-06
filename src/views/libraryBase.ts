import { Notice } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';

export const LIBRARY_VIEW_FILENAME = 'Apple Books 图书馆.base';

// An Obsidian Bases database that surfaces every book main-note the plugin imports
// (type: book + source: Apple Books + #book), including the auto-extracted cover via `note.cover`.
// Fields the plugin doesn't generate (rating/category/priority/...) are user-maintained; Bases
// simply leaves them blank until filled in.
export const LIBRARY_BASE_CONTENT = `filters:
  and:
    - file.ext == "md"
    - type == "book"
    - source == "Apple Books"
    - file.hasTag("book")
formulas:
  book: file.asLink(title)
  cover_image: if(cover, image(cover), null)
properties:
  formula.cover_image:
    displayName: 封面
  formula.book:
    displayName: 书名
  author:
    displayName: 作者
  status:
    displayName: 状态
  rating:
    displayName: 评分
  category:
    displayName: 分类
  priority:
    displayName: 优先级
  annotation_count:
    displayName: 标注数
  reviewed:
    displayName: 已整理
  last_opened:
    displayName: 最近阅读
  finished_at:
    displayName: 完成日期
views:
  - type: cards
    name: 封面书架
    order:
      - formula.book
    image: note.cover
    imageFit: contain
    imageAspectRatio: 1.45
    cardSize: 180
  - type: table
    name: 全部书籍
    order:
      - formula.cover_image
      - formula.book
      - author
      - status
      - rating
      - category
      - priority
      - annotation_count
      - reviewed
      - last_opened
      - finished_at
      - file.mtime
    summaries:
      annotation_count: Sum
  - type: table
    name: 在读
    filters:
      and:
        - status == "在读"
    order:
      - formula.book
      - author
      - annotation_count
      - last_opened
      - priority
      - rating
      - reviewed
  - type: table
    name: 已读
    filters:
      and:
        - status == "已读"
    order:
      - formula.book
      - author
      - annotation_count
      - finished_at
      - rating
      - category
      - reviewed
  - type: table
    name: 已读待整理
    filters:
      and:
        - status == "已读"
        - reviewed != true
    order:
      - formula.book
      - author
      - annotation_count
      - finished_at
      - rating
      - category
  - type: table
    name: 高价值书
    filters:
      and:
        - rating >= 4
    order:
      - formula.book
      - author
      - rating
      - reviewed
      - category
      - annotation_count
`;

export const LIBRARY_CARDS_SNIPPET = 'apple-books-library-cards';

// Hardcover-style book covers for the library Base's card view.
// Targets global .bases-* classes, so it affects all Bases card views.
export const LIBRARY_CARDS_CSS = `/* Hardcover book cover effect for Obsidian Bases card views */
.bases-view {
  --bases-cards-background: transparent;
  --bases-cards-cover-background: transparent;
  --bases-cards-shadow: none;
  --bases-cards-shadow-hover: none;
}

.bases-cards-group {
  gap: 20px;
  padding: 20px;
}

.bases-cards-label {
  display: none;
}

.bases-cards-item {
  overflow: visible;
  gap: 0;
  contain: inherit;
}

.bases-cards-property.mod-title {
  padding-top: 10px;
}

.bases-cards-cover {
  transition:
    transform 0.1s ease-out,
    box-shadow 0.1s ease-out;
  border-radius: 2px 6px 6px 2px;
  box-shadow:
    inset 1px 1px 0 1px rgba(255, 255, 255, 0.2),
    inset 0 0 0 1px rgba(0, 0, 0, 0.1),
    -4px 2px 4px 0 rgba(0, 0, 0, 0.3),
    -8px 8px 20px 0 rgba(0, 0, 0, 0.2);
}

.bases-cards-cover::before {
  content: "";
  background-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.2),
    rgba(255, 255, 255, 0.3) 1%,
    transparent 6%,
    rgba(0, 0, 0, 0.15) 8%,
    rgba(255, 255, 255, 0.2) 9%,
    transparent 20%
  );
  width: 100%;
  position: absolute;
  height: 100%;
}

.bases-cards-item:hover .bases-cards-cover {
  transform: translateY(-4px) scale(1.03);
  box-shadow:
    inset 1px 1px 0 1px rgba(255, 255, 255, 0.2),
    inset 0 0 0 1px rgba(0, 0, 0, 0.1),
    -4px 4px 8px 0 rgba(0, 0, 0, 0.3),
    -12px 16px 30px 0 rgba(0, 0, 0, 0.3);
}

.bases-cards-property.mod-title .bases-cards-line {
  font-size: var(--font-ui-small);
  line-height: 1.2;
  height: 2.8em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
`;

const notify = (message: string): void => {
  const notice = new Notice(message);
  void notice;
};

// Write the hardcover-cover CSS snippet and best-effort enable it (no public API for enabling).
const installLibraryCardsSnippet = async (plugin: IBookHighlightsPlugin): Promise<boolean> => {
  const adapter = plugin.app.vault.adapter;
  const snippetsDir = `${plugin.app.vault.configDir}/snippets`;

  if (!(await adapter.exists(snippetsDir))) {
    await adapter.mkdir(snippetsDir);
  }

  await adapter.write(`${snippetsDir}/${LIBRARY_CARDS_SNIPPET}.css`, LIBRARY_CARDS_CSS);

  const customCss = (
    plugin.app as unknown as {
      customCss?: { requestLoadSnippets?: () => void; setCssEnabledStatus?: (name: string, enabled: boolean) => void };
    }
  ).customCss;

  if (customCss?.setCssEnabledStatus) {
    customCss.requestLoadSnippets?.();
    customCss.setCssEnabledStatus(LIBRARY_CARDS_SNIPPET, true);
    return true;
  }

  return false;
};

export const createLibraryView = async (plugin: IBookHighlightsPlugin): Promise<void> => {
  const existed = Boolean(plugin.app.vault.getFileByPath(LIBRARY_VIEW_FILENAME));

  if (!existed) {
    await plugin.app.vault.create(LIBRARY_VIEW_FILENAME, LIBRARY_BASE_CONTENT);
  }

  let cssEnabled = false;
  try {
    cssEnabled = await installLibraryCardsSnippet(plugin);
  } catch (error) {
    console.warn('Apple Books Knowledge Cards: 无法安装图书馆封面样式', error);
  }

  await plugin.app.workspace.openLinkText(LIBRARY_VIEW_FILENAME, '', false);

  if (cssEnabled) {
    notify(existed ? '图书馆视图已就绪，精装封面样式已启用。' : '已创建图书馆视图，精装封面样式已启用。');
  } else {
    notify('图书馆视图已就绪。请在「设置 → 外观 → CSS 片段」中启用 apple-books-library-cards 以获得精装封面效果。');
  }
};
