// @vitest-environment jsdom
import { Menu } from 'obsidian';
import { beforeEach, expect, test, vi } from 'vitest';
import { getHighlightCards } from '../../../src/modules/highlightRepository';
import { parseFrontmatter, patchProperties, writeMarkdown } from '../../../src/utils/markdown';
import { renderCardsBoard, cleanupCardRenderer } from '../../../src/views/cardRenderer';
import { installObsidianDom, press } from '../../mocks/dom';
import { memoryVault } from '../../mocks/memoryVault';

beforeEach(() => {
  cleanupCardRenderer();
  document.body.innerHTML = '';
  installObsidianDom();
});

const card = (i: number, book: string, chapter: string, extra: Record<string, unknown> = {}) =>
  writeMarkdown(
    {
      type: 'ibooks_highlight',
      book_id: book === 'Book A' ? 'a' : 'b',
      book_title: book,
      annotation_id: `id-${i}`,
      highlight_location: `loc${i}`,
      highlight_color: i % 2 ? 'yellow' : 'blue',
      chapter,
      favorite: false,
      ...extra,
    },
    `\n## 划线\n\n> 测试摘录 ${i}\n\n## 笔记\n\n`,
  );

const setup = async (bookId?: string) => {
  const env = memoryVault();
  env.put('ibooks-highlights/cards/1.md', card(1, 'Book A', '第一章'));
  env.put('ibooks-highlights/cards/2.md', card(2, 'Book A', '第一章'));
  env.put('ibooks-highlights/cards/3.md', card(3, 'Book A', '第二章'));
  env.put('ibooks-highlights/cards/4.md', card(4, 'Book B', '序'));
  const container = document.body.appendChild(document.createElement('div'));
  const refresh = async () =>
    renderCardsBoard(env.app, container, await getHighlightCards(env.app, env.settings), bookId ? { bookId } : {}, { onRefresh: refresh });
  await refresh();
  const articles = () => Array.from(container.querySelectorAll<HTMLElement>('article'));
  const button = (label: string, scope: ParentNode = container) =>
    Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.getAttribute('aria-label') === label || b.textContent === label,
    )!;
  return { ...env, container, refresh, articles, button };
};

test('global wall defaults to a row-ordered grid with book and chapter in each card', async () => {
  const { container, articles } = await setup();
  expect(container.querySelector('.abkc-board')?.classList.contains('is-grid')).toBe(true);
  expect(articles()).toHaveLength(4);
  expect(articles()[0].querySelector('.abkc-card-source')?.textContent).toBe('#1 · Book A · 第一章');
  expect(container.querySelector('.abkc-count')?.textContent).toBe('4 条');
});

test('book page defaults to a reading list grouped by chapter, without a book filter', async () => {
  const { container, articles } = await setup('a');
  expect(container.querySelector('.abkc-board')?.classList.contains('is-list')).toBe(true);
  expect(articles()).toHaveLength(3);
  const headers = Array.from(container.querySelectorAll('.abkc-group-header')).map((h) => h.textContent);
  expect(headers).toEqual(['第一章2', '第二章1']);
  expect(container.querySelector('select[aria-label="按书籍筛选"]')).toBeNull();
  expect(container.querySelector('h2')).toBeNull();
});

test('layout toggle switches and is remembered for the next board', async () => {
  const env = await setup('a');
  env.button('切换为网格').click();
  expect(env.container.querySelector('.abkc-board')?.classList.contains('is-grid')).toBe(true);
  expect(env.container.querySelector('.abkc-group-header')).toBeNull();
  const next = document.body.appendChild(document.createElement('div'));
  renderCardsBoard(env.app, next, await getHighlightCards(env.app, env.settings), { bookId: 'a' });
  expect(next.querySelector('.abkc-board')?.classList.contains('is-grid')).toBe(true);
});

test('favorite updates one card without replacing the search box or other cards', async () => {
  const env = await setup();
  const input = env.container.querySelector<HTMLInputElement>('.abkc-search')!;
  input.value = '测试';
  input.dispatchEvent(new Event('input'));
  const other = env.articles()[1];
  env.button('收藏', env.articles()[0]).click();
  await vi.waitFor(() => expect(env.articles()[0].querySelector('.abkc-star')?.getAttribute('aria-pressed')).toBe('true'));
  expect(env.container.querySelector('.abkc-search')).toBe(input);
  expect(input.value).toBe('测试');
  expect(env.articles()[1]).toBe(other);
  expect(parseFrontmatter(env.files.get('ibooks-highlights/cards/1.md') as string).favorite).toBe(true);
});

test('filters combine, show a clear button, and clearing restores the full list', async () => {
  const env = await setup();
  const clear = env.button('清除筛选');
  expect(clear.classList.contains('abkc-hidden')).toBe(true);
  const color = env.container.querySelector<HTMLSelectElement>('select[aria-label="按颜色筛选"]')!;
  expect(Array.from(color.options).map((o) => o.textContent)).toEqual(['全部颜色', '黄色', '蓝色']);
  color.value = 'yellow';
  color.dispatchEvent(new Event('change'));
  const book = env.container.querySelector<HTMLSelectElement>('select[aria-label="按书籍筛选"]')!;
  book.value = 'Book A';
  book.dispatchEvent(new Event('change'));
  expect(env.articles().map((a) => a.dataset.annotationId)).toEqual(['id-1', 'id-3']);
  expect(clear.classList.contains('abkc-hidden')).toBe(false);
  clear.click();
  expect(env.articles()).toHaveLength(4);
  expect(color.value).toBe('');
});

test('removed highlights are a separate list with restore and delete actions', async () => {
  const env = await setup();
  const path = 'ibooks-highlights/cards/1.md';
  env.put(path, patchProperties(env.files.get(path) as string, { archived: true, source_removed: true }));
  await env.refresh();
  expect(env.articles()).toHaveLength(3);
  const note = env.container.querySelector('.abkc-callout')!;
  expect(note.classList.contains('abkc-hidden')).toBe(true);
  env.button('已移除').click();
  expect(note.classList.contains('abkc-hidden')).toBe(false);
  expect(env.articles()).toHaveLength(1);
  expect(env.articles()[0].textContent).toContain('已移除 · 可恢复');
  expect(env.button('删除…', env.articles()[0])).toBeTruthy();
  env.button('恢复', env.articles()[0]).click();
  await vi.waitFor(() => expect(env.articles()).toHaveLength(0));
  env.button('已移除').click();
  expect(env.articles()).toHaveLength(4);
});

test('more menu marks a card as reviewed and can pause it from daily review', async () => {
  const env = await setup();
  env.button('更多操作', env.articles()[0]).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await (Menu as any).last.run('标记为已整理');
  await vi.waitFor(() => expect(env.articles()[0].textContent).toContain('已整理'));
  env.button('更多操作', env.articles()[0]).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await (Menu as any).last.run('不再出现在每日回顾');
  expect(parseFrontmatter(env.files.get('ibooks-highlights/cards/1.md') as string).review_suspended).toBe(true);
});

test('keyboard moves between cards and toggles favorite on the focused card', async () => {
  const env = await setup();
  env.articles()[0].focus();
  press(env.articles()[0], 'j');
  expect(document.activeElement).toBe(env.articles()[1]);
  press(env.articles()[1], 'f');
  await vi.waitFor(() => expect(parseFrontmatter(env.files.get('ibooks-highlights/cards/2.md') as string).favorite).toBe(true));
});

test('shuffle shows a random subset until filters change', async () => {
  const env = await setup();
  env.button('随机抽 12 条').click();
  expect(env.container.querySelector('.abkc-count')?.textContent).toBe('随机 4 条');
  const input = env.container.querySelector<HTMLInputElement>('.abkc-search')!;
  input.value = '摘录 4';
  input.dispatchEvent(new Event('input'));
  expect(env.container.querySelector('.abkc-count')?.textContent).toBe('1 条');
});

test('long quotes collapse behind an expand control', async () => {
  const env = memoryVault();
  env.put('ibooks-highlights/cards/1.md', card(1, 'Book A', '第一章').replace('测试摘录 1', '长'.repeat(400)));
  const container = document.body.appendChild(document.createElement('div'));
  renderCardsBoard(env.app, container, await getHighlightCards(env.app, env.settings));
  const quote = container.querySelector('.abkc-card-quote')!;
  expect(quote.classList.contains('is-clamped')).toBe(true);
  (container.querySelector('.abkc-card-expand') as HTMLButtonElement).click();
  expect(quote.classList.contains('is-clamped')).toBe(false);
});

test('snapshot cards have no controls that change current or backup files', async () => {
  const env = await setup();
  renderCardsBoard(
    env.app,
    env.container,
    await getHighlightCards(env.app, env.settings),
    {},
    { onRefresh: async () => {}, readOnly: true, snapshotLabel: '备份快照 · 只读' },
  );
  expect(env.container.querySelectorAll('.abkc-card-actions')).toHaveLength(0);
  expect(env.container.textContent).toContain('备份快照 · 只读');
  press(env.articles()[0], 'f');
  expect(parseFrontmatter(env.files.get('ibooks-highlights/cards/1.md') as string).favorite).toBe(false);
});

test('wiki link suggestions search by name, keep surrounding text and generate unique file paths', async () => {
  const { attachNoteLinks } = await import('../../../src/views/noteLinks');
  const env = memoryVault();
  env.put('知识/阅读.md', '');
  env.put('其他/阅读.md', '');
  const host = document.body.appendChild(document.createElement('div'));
  const textarea = host.appendChild(document.createElement('textarea'));
  const cleanup = attachNoteLinks(env.app, textarea, host, '卡片.md');
  textarea.value = '我的想法：[[阅读';
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.dispatchEvent(new Event('input'));
  expect(host.querySelectorAll('[role="option"]')).toHaveLength(2);
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(textarea.value).toBe('我的想法：[[其他/阅读|阅读]]');
  cleanup();
});
