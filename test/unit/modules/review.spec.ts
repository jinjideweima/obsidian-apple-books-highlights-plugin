import { expect, test } from 'vitest';
import {
  addDays,
  buildReviewQueue,
  daysBetween,
  formatInterval,
  previewIntervals,
  readReview,
  reviewProperties,
  schedule,
  type ReviewState,
} from '../../../src/modules/review';

const today = '2026-09-27';

test('day arithmetic crosses months and years', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
});

test('first review uses FSRS initial stability for each grade', () => {
  const intervals = previewIntervals(null, today);
  expect(intervals).toEqual({ 1: 1, 2: 1, 3: 4, 4: 14 });
  const good = schedule(null, 3, today);
  expect(good).toMatchObject({ due: '2026-10-01', reps: 1, lapses: 0, last: today, started: today });
  expect(good.difficulty).toBeCloseTo(5.16, 2);
});

test('successful reviews grow the interval and harder grades grow it less', () => {
  const first = schedule(null, 3, today);
  const onTime = first.due;
  const next = previewIntervals(first, onTime);
  expect(next[3]).toBeGreaterThan(4);
  expect(next[4]).toBeGreaterThan(next[3]);
  expect(next[2]).toBeLessThan(next[3]);
  expect(next[1]).toBe(1);
});

test('forgetting counts a lapse and never raises stability', () => {
  let state = schedule(null, 4, today);
  state = schedule(state, 3, state.due);
  const forgotten = schedule(state, 1, state.due);
  expect(forgotten.lapses).toBe(1);
  expect(forgotten.stability).toBeLessThanOrEqual(state.stability);
  expect(forgotten.started).toBe(today);
});

test('properties round-trip and malformed values read as unreviewed', () => {
  const state = schedule(null, 3, today);
  const read = readReview(reviewProperties(state))!;
  expect(read.due).toBe(state.due);
  expect(read.stability).toBeCloseTo(state.stability, 3);
  expect(readReview({ review_due: 'soon', review_stability: 'x' })).toBeNull();
  expect(readReview({ review_suspended: true })?.suspended).toBe(true);
});

test('queue takes due cards first, limits new cards per day, and skips archived or suspended ones', () => {
  const learned = (due: string, extra: Partial<ReviewState> = {}): ReviewState => ({
    due,
    stability: 5,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    last: '2026-09-20',
    started: '2026-09-01',
    suspended: false,
    ...extra,
  });
  const cards = [
    { path: 'late.md', review: learned('2026-09-20') },
    { path: 'today.md', review: learned(today) },
    { path: 'later.md', review: learned('2026-09-28') },
    { path: 'archived.md', archived: true, review: learned('2026-09-01') },
    { path: 'paused.md', review: { ...learned('2026-09-01'), suspended: true } },
    { path: 'introduced.md', review: learned('2026-09-28', { started: today, last: today }) },
    { path: 'new-a.md' },
    { path: 'new-b.md', favorite: true },
    { path: 'new-c.md' },
  ];
  const queue = buildReviewQueue(cards, today, 3);
  expect(queue.due.map((card) => card.path)).toEqual(['late.md', 'today.md']);
  expect(queue.fresh).toHaveLength(2);
  expect(queue.fresh[0].path).toBe('new-b.md');
  expect(queue.doneToday).toBe(1);
  expect(queue.dueTomorrow).toBe(2);
  expect(buildReviewQueue(cards, today, 3).fresh).toEqual(queue.fresh);
});

test('intervals read naturally', () => {
  expect([1, 10, 45, 800].map(formatInterval)).toEqual(['1 天', '1 周', '2 个月', '2.2 年']);
});
