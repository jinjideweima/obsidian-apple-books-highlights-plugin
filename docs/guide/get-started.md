# 快速开始

本插件将 Apple Books 的高亮和笔记导入 Obsidian，以**知识卡片**和**阅读仪表盘**的形式管理你的阅读。

## 核心功能

- **书籍主笔记** — 每本书生成一个 Markdown 笔记，包含元数据和摘录目录
- **摘录卡片** — 每条高亮生成独立的 `.md` 文件，包含划线、上下文、想法、笔记等结构化内容
- **摘录墙** — 卡片墙视图，支持按书籍/作者/章节/颜色筛选，全文搜索
- **阅读仪表盘** — 一览式仪表盘，展示阅读统计、随机回顾、最新摘录
- **EPUB 章节推断** — 自动从本地 EPUB 文件解析章节名和段落上下文

## 安装

### 方式一：通过 Obsidian 社区插件

1. 打开 Obsidian **设置** > **第三方插件**
2. 点击**浏览**，搜索 **Apple Books**
3. 点击**安装**，然后点击**启用**

### 方式二：手动安装

1. 从 [GitHub Releases](https://github.com/bandantonio/obsidian-apple-books-highlights-plugin/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 将文件放入 Vault 的 `.obsidian/plugins/apple-books-import-highlights/` 目录
3. 重启 Obsidian，在**设置** > **第三方插件**中启用

## 使用方法

### 导入摘录

插件提供两种导入方式：

| 操作 | 触发方式 |
|------|---------|
| **导入全部** | 点击侧边栏的 📖 图标，或 `Cmd+P` > `导入全部 Apple Books 摘录` |
| **导入指定书籍** | `Cmd+P` > `导入指定书籍...`，然后搜索选择 |

> [!NOTE]
> 导入功能仅在 macOS 上可用。iOS/iPadOS 端可通过 iCloud 同步查看已导入的笔记。

### 打开视图

| 视图 | 触发方式 |
|------|---------|
| **摘录墙** | `Cmd+P` > `打开 Apple Books 摘录` |
| **阅读仪表盘** | 点击侧边栏的仪表盘图标，或 `Cmd+P` > `打开 Apple Books 阅读仪表盘` |

### 内嵌代码块

你也可以在任意笔记中使用代码块嵌入摘录墙或仪表盘：

````md
```apple-books-board
book_id: <bookId>
theme: receipt
```
````

````md
```apple-books-dashboard
```
````

## 目录结构

导入后，Vault 中会生成如下结构：

```
ibooks-highlights/
  ├── 书籍标题.md              ← 书籍主笔记
  ├── covers/
  │   └── 书籍标题.jpg         ← 从 EPUB 自动提取的封面
  └── cards/
      └── 书籍标题/
          ├── ibooks-XXXX-XXXX.md  ← 摘录卡片（按稳定 ID 命名）
          └── ...
```

- 每条摘录卡片包含 YAML frontmatter（书名、作者、颜色、收藏状态等）和结构化的划线/上下文/想法/笔记/来源各节
- 卡片文件名基于 `annotationId`（由 bookId + highlightLocation 哈希生成），重导入不会打乱顺序
- 收藏状态、个人笔记在重导入时自动保留
- 若书籍是可提取的 EPUB（无 DRM），封面会自动存入 `covers/` 并写入主笔记 frontmatter，阅读仪表盘可直接显示
