# Apple Books Knowledge Cards

## 1.9.1 验收反馈修复

- 摘录按书中位置连续编号；本地身份与显示编号分离，读取来源批注 UUID，调整范围时优先复用原卡片。
- 编辑窗口支持 `[[` 搜索、选择笔记，保存后由 Obsidian 建立双向链接；新增复制摘录链接，移除手填路径的关联按钮。
- 来源想法与本地笔记享有同等删除保护；备份卡片墙读取对应快照并提供只读展示。
- 主笔记改名后统一整理卡片与封面，迁移链接；内部同步比较记录移出正文，修复正文与标题被拼接的问题。
- 阅读仪表盘集中提供导入一本、导入全部、已移除摘录和最近导入结果入口。

本轮详细操作与验收步骤：[1.9.1 验收说明](docs/acceptance-1.9.1.md)。

> 中文 | [English](#english)

---

将 Apple Books 的阅读摘录，变成 Obsidian 里的结构化知识卡片。

## 1.9.0 更新

- 单本与批量导入使用同一流程，均支持封面与 EPUB 书目补全。
- 备份改为复制快照；原笔记保留在原位置，收藏和本地笔记继续继承。
- 明确删除的普通划线进入「已移除摘录」；带本地笔记、收藏、整理或关联记录的卡片保留，并提示来源已移除。
- 整本书消失时保留原笔记；零摘录且无法可靠区分整本书移除的情况同样保留，并提示。
- 书籍的人工属性、正文与现有文件名保留。已有自定义正文不会整篇重新套用模板；自动摘录目录和嵌入区域继续更新。
- 相同文件不重写；卡片墙局部刷新，保留搜索、筛选、显示选项和随机样本。
- 新增「标记已整理」「关联笔记」、已移除摘录恢复与清理，以及「查看最近导入结果」。

测试步骤、边界与回退说明见 [1.9.0 验收清单](docs/acceptance-1.9.0.md)。

## 功能

### 📥 摘录导入

- 一键导入全部 Apple Books 高亮摘录
- 支持按单本书籍导入
- 自动从 EPUB 文件补全章节信息
- 自动从 EPUB 文件补全摘录段落上下文
- 支持启动时自动同步
- 每次导入前可备份，防止意外覆盖

### 🃏 摘录卡片墙

- 以卡片形式浏览全部摘录
- 支持按书名、作者、章节、颜色筛选
- 支持全文搜索
- 支持"随机一组"功能，适合每日随机复习
- 可对摘录标记收藏、编辑本地笔记

### 📊 阅读仪表盘

- 统计书籍数量、摘录总数、收藏数、想法数
- 按摘录数量排列最值得回看的书
- 随机回顾模块，每次打开随机展示几条摘录
- 最近摘录模块

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

- Browse all highlights as visual cards
- Filter by book title, author, chapter, or highlight color
- Full-text search across highlights, notes, and metadata
- "Random batch" mode for daily serendipitous review
- Mark highlights as favorites and add local notes

### 📊 Reading Dashboard

- Stats overview: book count, total highlights, favorites, and annotated highlights
- "Most worth revisiting" books sorted by highlight count
- Random review section — a new set of cards every time you open it
- Recent highlights section

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
