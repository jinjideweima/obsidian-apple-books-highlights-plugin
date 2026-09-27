// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { dayString } from '../../../src/modules/review';
import { parseFrontmatter, writeMarkdown } from '../../../src/utils/markdown';
import { heatmapDays, renderDashboard, shelfOrder } from '../../../src/views/dashboardView';
import { installObsidianDom, press } from '../../mocks/dom';
import { memoryVault } from '../../mocks/memoryVault';

beforeEach(() => {
  document.body.innerHTML = '';
  installObsidianDom();
});

const book = (title: string, lastOpened: string, count: number) =>
  writeMarkdown(
    { type: 'book', source: 'Apple Books', title, book_id: title, annotation_count: count, last_opened: lastOpened },
    '\n正文\n',
  );

const card = (i: number, extra: Record<string, unknown> = {}) =>
  writeMarkdown(
    {
      type: 'ibooks_highlight',
      book_id: 'b1',
      book_title: '万历十五年',
      annotation_id: `id-${i}`,
      highlight_location: `loc${i}`,
      highlight_color: 'yellow',
      chapter: '第一章',
      highlight_creation_date: 800000000 + i,
      ...extra,
    },
    `\n## 划线\n\n> 摘录 ${i}\n\n## 想法\n\n${i === 1 ? '一条想法' : ''}\n\n## 笔记\n\n`,
  );

const setup = async (cardCount = 3) => {
  const env = memoryVault();
  env.put('ibooks-highlights/万历十五年.md', book('万历十五年', '2026-09-01T10:00:00+08:00', 54));
  env.put('ibooks-highlights/三体.md', book('三体', '2026-09-20T10:00:00+08:00', 14));
  env.put('ibooks-highlights/教父.md', book('教父', '', 90));
  for (let i = 1; i <= cardCount; i++) env.put(`ibooks-highlights/cards/${i}.md`, card(i));
  env.settings.reviewNewPerDay = 2;
  const plugin: any = { app: env.app, settings: env.settings, manifest: { name: 'test' } };
  const container = document.body.appendChild(document.createElement('div'));
  await renderDashboard(plugin, container);
  const review = () => container.querySelector('.abkc-review')!;
  const grade = (label: string) =>
    Array.from(review().querySelectorAll<HTMLButtonElement>('.abkc-grade')).find((b) => b.textContent?.startsWith(label))!;
  return { ...env, plugin, container, review, grade };
};

test('header summarises the library and the shelf puts recently opened books first', async () => {
  const { container } = await setup();
  expect(container.querySelector('.abkc-home-summary')?.textContent).toBe('3 本书·3 条摘录·1 条有想法');
  expect(Array.from(container.querySelectorAll('.abkc-book-title')).map((el) => el.textContent)).toEqual(['三体', '万历十五年', '教父']);
});

test('daily review shows today’s queue with interval hints and records a grade to the card', async () => {
  const env = await setup();
  expect(env.review().querySelector('.abkc-review-progress-text')?.textContent).toBe('0 / 2');
  expect(env.review().querySelector('.abkc-tag')?.textContent).toBe('新摘录');
  expect(env.grade('记得').textContent).toBe('记得4 天');
  const first = env.review().querySelector('.abkc-review-quote')!.textContent;
  env.grade('记得').click();
  await vi.waitFor(() => expect(env.review().querySelector('.abkc-review-progress-text')?.textContent).toBe('1 / 2'));
  const graded = [...env.files.entries()].find(([path, text]) => path.includes('/cards/') && String(text).includes(`> ${first}`))!;
  expect(parseFrontmatter(graded[1] as string)).toMatchObject({ review_reps: 1, review_last: dayString(), review_started: dayString() });
  expect(env.review().querySelector('.abkc-review-quote')!.textContent).not.toBe(first);
});

test('number keys grade, then the panel reports completion and offers more new cards', async () => {
  const env = await setup();
  press(env.review(), '3');
  await vi.waitFor(() => expect(env.review().querySelector('.abkc-review-progress-text')?.textContent).toBe('1 / 2'));
  press(env.review(), '4');
  await vi.waitFor(() => expect(env.review().textContent).toContain('今天的回顾完成了'));
  const more = Array.from(env.review().querySelectorAll('button')).find((b) => b.textContent?.startsWith('再学'))!;
  expect(more.textContent).toBe('再学 1 条新摘录');
  more.click();
  await vi.waitFor(() => expect(env.review().querySelector('.abkc-tag')?.textContent).toBe('新摘录'));
});

test('an empty library invites an import instead of showing a review', async () => {
  const { review } = await setup(0);
  expect(review().textContent).toContain('导入摘录后');
  expect(review().querySelectorAll('.abkc-grade')).toHaveLength(0);
});

test('heatmap covers whole weeks from Monday and counts highlights per local day', () => {
  const now = new Date(2026, 8, 27, 12);
  const created = (date: Date) => (date.getTime() - Date.UTC(2001, 0, 1)) / 1000;
  const days = heatmapDays(
    [{ highlightCreationDate: created(new Date(2026, 8, 27, 9)) }, { highlightCreationDate: created(new Date(2026, 8, 27, 20)) }] as any,
    2,
    now,
  );
  expect(days[0].date.getDay()).toBe(1);
  expect(days).toHaveLength(14);
  expect(days.at(-1)).toMatchObject({ count: 2 });
});

test('shelf order falls back to highlight count for books never opened', () => {
  const order = shelfOrder([
    { title: 'a', lastOpened: '', annotationCount: 5 },
    { title: 'b', lastOpened: '', annotationCount: 9 },
    { title: 'c', lastOpened: '2026-01-01', annotationCount: 1 },
  ] as any).map((b) => b.title);
  expect(order).toEqual(['c', 'b', 'a']);
});
