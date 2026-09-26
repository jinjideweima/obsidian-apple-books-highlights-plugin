import { expect, test } from 'vitest';
import { parseBookMetadata } from '../../../src/modules/epubChapters';
import { parseFrontmatter, setSection, extractSection } from '../../../src/utils/markdown';
test('EPUB metadata separates authors/translators and recognizes explicitly typed ISBN', () => {
  const data = parseBookMetadata(`<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>
  <dc:title>Say &quot;No&quot;</dc:title><dc:language>zh</dc:language>
  <dc:creator id="a">作者甲</dc:creator><dc:creator id="b">译者乙</dc:creator>
  <meta refines="#b" property="role">trl</meta><dc:publisher>出版社</dc:publisher>
  <dc:identifier>urn:uuid:fake</dc:identifier><dc:identifier opf:scheme="ISBN">9781234567890</dc:identifier>
  <dc:date>2024-01-02</dc:date></metadata></package>`);
  expect(data).toMatchObject({
    bookTitle: 'Say "No"',
    authors: ['作者甲'],
    translators: ['译者乙'],
    isbn: '9781234567890',
    publishedDate: '2024-01-02',
  });
});
test('arbitrary book IDs are not guessed to be ISBNs', () => {
  expect(parseBookMetadata('<package><metadata><identifier>1234567890123</identifier></metadata></package>').isbn).toBeUndefined();
});
test('YAML handles lists, CRLF, quoted booleans and leading zeros', () => {
  expect(parseFrontmatter('---\r\nid: "00123"\r\nfavorite: false\r\ntext: "false"\r\nauthors: [甲, 乙]\r\n---\r\n')).toEqual({
    id: '00123',
    favorite: false,
    text: 'false',
    authors: ['甲', '乙'],
  });
});
test('local notes retain their own headings, dollar signs and blockquotes', () => {
  const note = '## 我的子标题\n> 引用\n$& and $1\n## 另一个标题\n内容';
  const content = setSection('## 划线\n\n原文\n\n## 笔记\n\n旧内容\n\n## 来源\n\n链接', '笔记', note);
  expect(extractSection(content, '笔记')).toBe(note);
  const updated = setSection(content, '笔记', note + '\n末尾');
  expect(extractSection(updated, '笔记')).toBe(note + '\n末尾');
  expect(updated).toContain('## 来源');
});
