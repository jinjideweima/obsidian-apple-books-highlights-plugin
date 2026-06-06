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

const notify = (message: string): void => {
  const notice = new Notice(message);
  void notice;
};

export const createLibraryView = async (plugin: IBookHighlightsPlugin): Promise<void> => {
  const existing = plugin.app.vault.getFileByPath(LIBRARY_VIEW_FILENAME);

  if (existing) {
    notify(`图书馆视图已存在：${LIBRARY_VIEW_FILENAME}`);
    await plugin.app.workspace.openLinkText(LIBRARY_VIEW_FILENAME, '', false);
    return;
  }

  await plugin.app.vault.create(LIBRARY_VIEW_FILENAME, LIBRARY_BASE_CONTENT);
  notify(`已创建图书馆视图：${LIBRARY_VIEW_FILENAME}`);
  await plugin.app.workspace.openLinkText(LIBRARY_VIEW_FILENAME, '', false);
};
