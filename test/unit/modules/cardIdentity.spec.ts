import { test, expect } from 'vitest';
import { relocateFile } from '../../../src/modules/bookResources';
import { sourceUrl, compareLocations, cardLink } from '../../../src/utils/cardIdentity';
import { pendingWikiLink } from '../../../src/views/noteLinks';
import { memoryVault } from '../../mocks/memoryVault';

test('source navigation encodes unsafe URL/Markdown characters without changing CFI identity', () => {
  const loc = 'epubcfi(/6/10[章节 A]!/4/2/1,:0,:42)';
  const url = sourceUrl('book id', loc);
  expect(url).not.toContain(' ');
  expect(decodeURI(url.split('#')[1])).toBe(loc);
  expect(sourceUrl('', loc)).toBe('');
});
test('CFI sorting compares numeric positions beyond four digits and ignores assertions', () => {
  expect(compareLocations('epubcfi(/6/2[x]!/4/10000)', 'epubcfi(/6/2[y]!/4/9999)')).toBeGreaterThan(0);
});
test('wiki detection handles cursor in middle and does not replace closed links', () => {
  expect(pendingWikiLink('前文[[阅读 后文', 6)).toEqual({ start: 2, query: '阅读' });
  expect(pendingWikiLink('[[阅读]]', 6)).toBeNull();
  expect(cardLink('a/b.md', '测试|摘录')).toBe('[[a/b|测试 摘录]]');
});
test('failed rename leaves incoming links untouched', async () => {
  const env = memoryVault();
  env.put('a.md', '内容');
  env.put('ref.md', '[[a|引用]]');
  env.api.rename.mockRejectedValueOnce(new Error('disk error'));
  await expect(relocateFile(env.app, env.api.getFileByPath('a.md'), 'b.md')).rejects.toThrow('disk error');
  expect(env.files.get('ref.md')).toBe('[[a|引用]]');
});
test('failed link rewrite rolls rename and earlier link writes back', async () => {
  const env = memoryVault();
  env.put('a.md', '内容');
  env.put('ref.md', '[[a|引用]]');
  env.api.process.mockRejectedValueOnce(new Error('locked'));
  await expect(relocateFile(env.app, env.api.getFileByPath('a.md'), 'b.md')).rejects.toThrow('locked');
  expect(env.files.has('a.md')).toBe(true);
  expect(env.files.has('b.md')).toBe(false);
  expect(env.files.get('ref.md')).toBe('[[a|引用]]');
});
