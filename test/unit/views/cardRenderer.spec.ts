// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { getHighlightCards } from '../../../src/modules/highlightRepository';
import { writeMarkdown } from '../../../src/utils/markdown';
import { renderCardsBoard, cleanupCardRenderer } from '../../../src/views/cardRenderer';
import { memoryVault } from '../../mocks/memoryVault';

beforeEach(() => {
  cleanupCardRenderer();
  document.body.innerHTML = '';
  const proto = HTMLElement.prototype as any;
  proto.createEl = function (tag: string, options: any = {}) {
    const el = document.createElement(tag);
    if (options.text) el.textContent = options.text;
    if (options.cls) el.className = options.cls;
    for (const key of ['value', 'href']) if (options[key] !== undefined) el.setAttribute(key, options[key]);
    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, String(value));
    this.appendChild(el);
    return el;
  };
  proto.createDiv = function (options: any) {
    return this.createEl('div', options);
  };
  proto.createSpan = function (options: any) {
    return this.createEl('span', options);
  };
  proto.empty = function () {
    this.replaceChildren();
  };
  proto.addClass = function (cls: string) {
    this.classList.add(cls);
  };
  proto.toggleClass = function (cls: string, enabled: boolean) {
    this.classList.toggle(cls, enabled);
  };
  proto.setText = function (text: string) {
    this.textContent = text;
  };
});
const setup = async () => {
  const env = memoryVault();
  for (const [i, title] of ['Book A', 'Book B'].entries()) {
    env.put(
      `ibooks-highlights/cards/${i}.md`,
      writeMarkdown(
        {
          type: 'ibooks_highlight',
          book_id: String(i),
          book_title: title,
          annotation_id: String(i),
          highlight_index: i + 1,
          favorite: false,
        },
        '\n## 划线\n\n> 测试摘录\n\n## 笔记\n\n',
      ),
    );
  }
  const container = document.body.appendChild(document.createElement('div'));
  const refresh = async () =>
    renderCardsBoard(env.app, container, await getHighlightCards(env.app, env.settings), {}, { onRefresh: refresh });
  await refresh();
  return { ...env, container, refresh };
};
test('favorite updates one card without replacing search/filter or unrelated DOM', async () => {
  const { container } = await setup();
  const input = container.querySelector<HTMLInputElement>('.abkc-search')!;
  input.value = '测试';
  input.dispatchEvent(new Event('input'));
  const other = container.querySelectorAll('article')[1];
  const button = Array.from(container.querySelectorAll('article button')).find((b) => b.textContent === '收藏') as HTMLButtonElement;
  button.click();
  await vi.waitFor(() => expect(container.querySelector('article')?.textContent).toContain('已收藏'));
  expect(container.querySelector('.abkc-search')).toBe(input);
  expect(input.value).toBe('测试');
  expect(container.querySelectorAll('article')[1]).toBe(other);
});
test('archive filter hides removed cards from default and offers restore action', async () => {
  const env = await setup();
  const path = 'ibooks-highlights/cards/0.md';
  const { patchProperties } = await import('../../../src/utils/markdown');
  env.put(path, patchProperties(env.files.get(path) as string, { archived: true, source_removed: true }));
  await env.refresh();
  expect(env.container.querySelectorAll('article')).toHaveLength(1);
  const select = Array.from(env.container.querySelectorAll('select')).find((s) => s.textContent?.includes('已移除摘录'))!;
  select.value = '已移除摘录';
  select.dispatchEvent(new Event('change'));
  expect(env.container.querySelector('article')?.textContent).toContain('Book A');
  const restore = Array.from(env.container.querySelectorAll('button')).find((b) => b.textContent === '恢复')!;
  restore.click();
  await vi.waitFor(() => expect(env.container.querySelectorAll('article')).toHaveLength(0));
  select.value = '';
  select.dispatchEvent(new Event('change'));
  expect(env.container.querySelectorAll('article')).toHaveLength(2);
});
test('embedded book scope remains constrained when toolbar filters change', async () => {
  const env = await setup();
  const all = await getHighlightCards(env.app, env.settings);
  renderCardsBoard(env.app, env.container, all, { bookId: '0' });
  const search = env.container.querySelector<HTMLInputElement>('.abkc-search')!;
  search.value = '测试';
  search.dispatchEvent(new Event('input'));
  expect(env.container.querySelectorAll('article')).toHaveLength(1);
  expect(env.container.querySelector('article')?.textContent).toContain('Book A');
});

test('snapshot cards have no controls that change current or backup files', async () => {
  const env = await setup();
  renderCardsBoard(env.app, env.container, await getHighlightCards(env.app, env.settings), {}, { onRefresh: async () => {}, readOnly: true, snapshotLabel: '备份快照 · 只读' });
  const buttons = Array.from(env.container.querySelectorAll('.abkc-card-actions button'));
  expect(buttons).toHaveLength(0);
  expect(env.container.textContent).toContain('备份快照 · 只读');
});

test('wiki link suggestions search by name, keep surrounding text and generate unique file paths', async () => {
  const { attachNoteLinks } = await import('../../../src/views/noteLinks');
  const env = memoryVault();
  env.put('知识/阅读.md', ''); env.put('其他/阅读.md', '');
  const host = document.body.appendChild(document.createElement('div'));
  const textarea = host.appendChild(document.createElement('textarea'));
  const cleanup = attachNoteLinks(env.app, textarea, host, '卡片.md');
  textarea.value = '我的想法：[[阅读'; textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.dispatchEvent(new Event('input'));
  expect(host.querySelectorAll('[role="option"]')).toHaveLength(2);
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(textarea.value).toBe('我的想法：[[其他/阅读|阅读]]');
  cleanup();
});
