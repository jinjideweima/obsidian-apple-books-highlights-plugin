import { expect, test } from 'vitest';
import { parseFrontmatter, rawBookId, tryParseFrontmatter } from '../../../src/utils/markdown';

// Exactly what the 1.8 default template wrote for a title containing double quotes.
const legacyNote = `---
type: book
title: "插件验收：学会说 "保留""
author: "本地测试作者"
book_id: "271DF0B4F32ADFDF1860355414379AE3"
cover: "[[附件/书封/插件验收：学会说 "保留" - 本地测试作者.jpg]]"
tags:
  - book
---
正文`;

test('1.8 notes with unescaped quotes are read with their intended values', () => {
  expect(parseFrontmatter(legacyNote)).toMatchObject({
    title: '插件验收：学会说 "保留"',
    author: '本地测试作者',
    cover: '[[附件/书封/插件验收：学会说 "保留" - 本地测试作者.jpg]]',
    tags: ['book'],
  });
});

test('valid quoting is left alone and other broken YAML still fails', () => {
  expect(parseFrontmatter('---\ntitle: "a \\"b\\""\n---\n').title).toBe('a "b"');
  expect(() => parseFrontmatter('---\ntitle: [broken\n---\n')).toThrow();
  expect(tryParseFrontmatter('---\ntitle: [broken\n---\n')).toBeNull();
});

test('the book ID is recovered from notes whose properties cannot be parsed', () => {
  expect(rawBookId('---\ntitle: [broken\nbook_id: "0042"\n---\n')).toBe('0042');
  expect(rawBookId("---\nbook_id: abc\n---\n")).toBe('abc');
  expect(rawBookId('no properties\nbook_id: 1')).toBe('');
});
