# Apple Books Knowledge Cards

> 中文 | [English](#english)

---

将 Apple Books 的阅读摘录，变成 Obsidian 里的结构化知识卡片。

更新记录见 [CHANGELOG](CHANGELOG.md)。

## 功能

### 📥 摘录导入

- 一键导入全部 Apple Books 高亮摘录
- 支持按单本书籍导入
- 自动从 EPUB 文件补全章节信息
- 自动从 EPUB 文件补全摘录段落上下文
- 支持启动时自动同步
- 每次导入前可备份，防止意外覆盖

### 🃏 摘录墙

- 书籍页默认是按章节分组的单栏阅读列表，全部摘录默认是瀑布流网格，可随时切换
- 一行工具栏：搜索，按书籍、章节、颜色筛选，只看收藏、未整理、有想法或已移除
- 收藏和编辑笔记一键完成，其余操作在「⋯」菜单里；长摘录自动折叠
- 键盘操作：`j`/`k` 上下移动，`f` 收藏，`e` 编辑，`c` 复制，回车打开
- 界面完全跟随当前 Obsidian 主题，支持深色模式

### 📊 阅读仪表盘

- 今日回顾：用 FSRS 间隔复习算法安排每天要重读的摘录，按「忘了、模糊、记得、熟悉」评分，数字键 1–4 快速操作
- 继续阅读：按最近打开时间排列的书架
- 阅读足迹：近 18 周每天新增摘录的热力图
- 整理入口：待整理、收藏、有想法、已移除，以及上次导入状态
- 最近摘录列表

### ✏️ 摘录卡片文件

每条摘录生成一个独立的 Markdown 文件，包含：

- 结构化 YAML frontmatter（书名、作者、章节、颜色等）
- 原始划线内容
- 段落上下文（自动从 EPUB 补全）
- Apple Books 内的想法/批注
- 本地笔记区（重新导入后保留）
- 返回 Apple Books 原始标注的深链接

## 安装

> 本插件为个人定制版，暂未上架 Obsidian 官方插件市场。

1. 前往 [Releases](https://github.com/jinjideweima/obsidian-apple-books-highlights-plugin/releases) 下载最新版本
2. 将 `main.js`、`manifest.json`、`styles.css` 复制到 Obsidian vault 的 `.obsidian/plugins/apple-books-knowledge-cards/` 目录
3. 在 Obsidian 设置 → 第三方插件中启用 **Apple Books Knowledge Cards**

## 使用方式

**导入摘录**

- 点击侧边栏书本图标，或使用命令面板搜索"导入全部"
- 使用命令面板搜索"导入指定书籍"可按书导入

**打开卡片墙**

- 点击侧边栏仪表盘图标，或命令面板搜索"打开摘录"

**打开阅读仪表盘**

- 命令面板搜索"打开阅读仪表盘"

**在笔记中嵌入卡片墙**

在任意笔记中插入代码块可嵌入指定书籍的卡片墙：

````markdown
```apple-books-board
book_id: 你的书籍ID
```
````

不填 `book_id` 则显示全部摘录。

## 设置

| 选项       | 说明                                       |
| ---------- | ------------------------------------------ |
| 摘录文件夹 | 摘录文件存放位置，默认 `ibooks-highlights` |
| 启动时导入 | Obsidian 启动时自动同步摘录                |
| 导入前备份 | 每次导入前备份旧文件                       |
| 内容模板   | 自定义书籍主笔记的 Handlebars 模板         |
| 文件名模板 | 自定义生成的文件名格式                     |

## 系统要求

- macOS（摘录导入功能依赖 Mac 上的 Apple Books 数据库）
- Obsidian 1.5.7 或更高版本
- iOS/iPadOS 设备上可以查看已同步的摘录卡片，但不支持直接导入

## 致谢

本插件基于 [bandantonio/obsidian-apple-books-highlights-plugin](https://github.com/bandantonio/obsidian-apple-books-highlights-plugin) 开发，在原版摘录导入功能的基础上，新增了摘录卡片系统、阅读仪表盘和 EPUB 元数据补全功能。

---

<a name="english"></a>

# Apple Books Knowledge Cards

> [中文](#apple-books-knowledge-cards) | English

---

Turn your Apple Books highlights into structured knowledge cards in Obsidian.

## Features

### 📥 Highlight Import

- Import all Apple Books highlights in one click
- Import highlights from a single book
- Automatically infer chapter names from EPUB files
- Automatically infer paragraph context from EPUB files
- Optional auto-import on Obsidian startup
- Optional backup before each import to prevent accidental data loss

### 🃏 Card Wall

- A book page opens as a single-column reading list grouped by chapter; the all-highlights wall opens as a masonry grid. Either can be switched.
- One-row toolbar: search, filter by book, chapter or color, and show only favorites, unprocessed, annotated or removed highlights
- Favorite and edit in one click; everything else lives in the "⋯" menu. Long highlights collapse.
- Keyboard: `j`/`k` to move, `f` favorite, `e` edit, `c` copy, Enter to open
- Follows the active Obsidian theme, including dark mode

### 📊 Reading Dashboard

- Daily review: highlights scheduled with the FSRS spaced-repetition algorithm, graded Forgot / Hazy / Remembered / Familiar (keys 1–4)
- Continue reading: a shelf ordered by when you last opened each book
- Reading footprint: an 18-week heatmap of new highlights
- Triage shortcuts for unprocessed, favorites, annotated and removed highlights, plus the last import status
- Recent highlights

### ✏️ Highlight Card Files

Each highlight is saved as an individual Markdown file containing:

- Structured YAML frontmatter (title, author, chapter, color, etc.)
- The highlighted text
- Surrounding paragraph context (auto-filled from EPUB)
- Apple Books annotations/thoughts
- A local notes section (preserved across re-imports)
- A deep link back to the original highlight in Apple Books

## Installation

> This is a personal fork and is not listed in the official Obsidian plugin directory.

1. Go to [Releases](https://github.com/jinjideweima/obsidian-apple-books-highlights-plugin/releases) and download the latest version
2. Copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/apple-books-knowledge-cards/` inside your Obsidian vault
3. In Obsidian → Settings → Community plugins, enable **Apple Books Knowledge Cards**

## Usage

**Import highlights**

- Click the book icon in the sidebar, or use the command palette: "导入全部 Apple Books 摘录"
- To import a single book, use the command palette: "导入指定书籍..."

**Open card wall**

- Click the dashboard icon in the sidebar, or use the command palette: "打开 Apple Books 摘录"

**Open reading dashboard**

- Command palette: "打开 Apple Books 阅读仪表盘"

**Embed a card wall in a note**

Insert a code block in any note to embed highlights for a specific book:

````markdown
```apple-books-board
book_id: YOUR_BOOK_ID
```
````

Omit `book_id` to display all highlights.

## Settings

| Option               | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| Highlights folder    | Where highlight files are stored. Default: `ibooks-highlights` |
| Import on startup    | Automatically sync highlights when Obsidian launches           |
| Backup before import | Back up existing files before each import                      |
| Content template     | Customize the book note format using Handlebars                |
| Filename template    | Customize how generated filenames are formatted                |

## Requirements

- macOS (highlight import relies on the Apple Books database on Mac)
- Obsidian 1.5.7 or later
- iOS/iPadOS devices can view synced highlight cards but cannot import directly

## Credits

This plugin is a personal fork of [bandantonio/obsidian-apple-books-highlights-plugin](https://github.com/bandantonio/obsidian-apple-books-highlights-plugin). The original plugin provides the highlight import engine. This fork adds a highlight card system, reading dashboard, and EPUB metadata inference on top of the original work.
