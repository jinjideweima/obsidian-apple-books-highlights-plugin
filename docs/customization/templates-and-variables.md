# 模板与变量

<span v-pre>

插件使用 Handlebars + Markdown 自定义书籍主笔记的输出格式。

## 默认模板

```hbs
---
type: book
title: "{{{bookTitle}}}"
author: "{{{bookAuthor}}}"
source: Apple Books
book_id: "{{bookId}}"
annotation_count: {{annotations.length}}
status: "{{#if bookFinishedDate}}已读{{else}}在读{{/if}}"
{{#if coverImagePath}}
cover: "[[{{{coverImagePath}}}]]"
{{else if bookCoverUrl}}
cover: "{{{bookCoverUrl}}}"
{{/if}}
cssclasses:
  - wide-apple-book
tags:
  - book
---

<details class="abkc-note-toc-details">
<summary>摘录目录</summary>
<div class="abkc-note-toc">
{{#each annotations}}
<a href="#摘录-{{displayIndex @index}}">摘录 {{displayIndex @index}}</a>
{{/each}}
</div>
</details>

## 本书摘录

\`\`\`apple-books-board
book_id: {{bookId}}
theme: receipt
\`\`\`
```

默认模板使用 YAML frontmatter 格式，并通过 `apple-books-board` 代码块嵌入该书的摘录墙。

## 模板变量

### 书籍级变量

| 变量 | 说明 |
|------|------|
| `{{{bookTitle}}}` | 书名 |
| `{{bookId}}` | Apple Books 唯一标识符 |
| `{{{bookAuthor}}}` | 作者 |
| `{{{bookGenre}}}` | 类别 |
| `{{bookLanguage}}` | 语言代码 |
| `{{bookLastOpenedDate}}` | 最后打开日期（需配合 `dateFormat`） |
| `{{bookFinishedDate}}` | 读完日期（需配合 `dateFormat`） |
| `{{bookCoverUrl}}` | Apple Books 数据库里的封面地址（常为空） |
| `{{{coverImagePath}}}` | 导入时从 EPUB 自动提取的封面在 Vault 内的路径；提取成功时默认模板会优先用它 |
| `{{annotations}}` | 摘录数组 |
| `{{annotations.length}}` | 摘录总数 |

### 摘录级变量（在 `{{#each annotations}}` 内使用）

| 变量 | 说明 |
|------|------|
| `{{{highlight}}}` | 高亮文本 |
| `{{{contextualText}}}` | 上下文文本 |
| `{{{chapter}}}` | 章节名（可能为空） |
| `{{{note}}}` | 用户在 Apple Books 中添加的笔记 |
| `{{{highlightLocation}}}` | 高亮位置标识符（epubcfi） |
| `{{highlightStyle}}` | 高亮样式代码 |
| `{{highlightCreationDate}}` | 高亮创建日期 |
| `{{highlightModificationDate}}` | 高亮修改日期 |

### 高亮样式对照

| 值 | 颜色 |
|----|------|
| 0 | 下划线 |
| 1 | 绿色 |
| 2 | 蓝色 |
| 3 | 黄色 |
| 4 | 粉色 |
| 5 | 紫色 |

### Handlebars 辅助函数

| 函数 | 用法 | 说明 |
|------|------|------|
| `dateFormat` | `{{dateFormat bookLastOpenedDate "YYYY-MM-DD"}}` | 将 Apple 时间戳格式化为可读日期（使用 dayjs） |
| `displayIndex` | `{{displayIndex @index}}` | 将 0-based 索引转为 1-based 显示序号 |
| `padIndex` | `{{padIndex @index 3}}` | 补零索引，如 `001` |
| `eq` | `{{#if (eq highlightStyle "3")}}...{{/if}}` | 相等判断 |

> [!IMPORTANT]
> 使用三重花括号（如 `{{{bookTitle}}}`）来避免 HTML 转义（Handlebars 默认行为）。
> 如果需要转义输出，使用双重花括号（如 `{{bookId}}`）。

### 文件名模板变量

文件名模板只能使用以下变量：

- `{{{bookTitle}}}` （默认）
- `{{bookId}}`
- `{{{bookAuthor}}}`
- `{{{bookGenre}}}`
- `{{bookLanguage}}`

## 日期格式化

`dateFormat` 辅助函数接受一个 Apple 时间戳和 [dayjs 格式字符串](https://day.js.org/docs/en/display/format)：

```hbs
{{dateFormat bookLastOpenedDate "YYYY-MM-DD HH:mm:ss"}}
// → 2024-03-04 17:50:28

{{dateFormat bookLastOpenedDate "ddd, MMM DD YYYY"}}
// → Mon, Mar 04 2024
```

> [!NOTE]
> Apple Books 使用从 2001-01-01 开始的纪元时间，插件会自动转换为标准 Unix 时间戳。

</span>
