// Spaced review of highlights, scheduled with FSRS-4.5 (the default Anki scheduler) at 90% target retention.
// State lives in each card's properties so it syncs per file and survives re-imports.

export type Grade = 1 | 2 | 3 | 4;

export interface ReviewState {
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  last: string;
  started: string;
  suspended: boolean;
}

export const GRADE_LABELS: Record<Grade, string> = { 1: '忘了', 2: '模糊', 3: '记得', 4: '熟悉' };

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const MAX_INTERVAL = 36500;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 4) => Number(value.toFixed(digits));

const pad = (value: number) => String(value).padStart(2, '0');
export const dayString = (date = new Date()): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDay = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const addDays = (day: string, days: number): string => {
  const date = new Date(parseDay(day) + days * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};
export const daysBetween = (from: string, to: string): number => Math.round((parseDay(to) - parseDay(from)) / 86400000);

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const readReview = (properties: Record<string, unknown>): ReviewState | null => {
  const suspended = properties.review_suspended === true;
  const due = String(properties.review_due ?? '').slice(0, 10);
  const stability = Number(properties.review_stability);
  if (!isDay(due) || !(stability > 0)) {
    return suspended ? { due: '', stability: 0, difficulty: 0, reps: 0, lapses: 0, last: '', started: '', suspended } : null;
  }
  const last = String(properties.review_last ?? '').slice(0, 10);
  return {
    due,
    stability,
    difficulty: clamp(Number(properties.review_difficulty) || 5, 1, 10),
    reps: Math.max(0, Number(properties.review_reps) || 0),
    lapses: Math.max(0, Number(properties.review_lapses) || 0),
    last: isDay(last) ? last : due,
    started: String(properties.review_started ?? '').slice(0, 10),
    suspended,
  };
};

export const reviewProperties = (state: ReviewState): Record<string, unknown> => ({
  review_due: state.due,
  review_stability: round(state.stability),
  review_difficulty: round(state.difficulty),
  review_reps: state.reps,
  review_lapses: state.lapses,
  review_last: state.last,
  review_started: state.started,
  review_suspended: state.suspended,
});

const initialDifficulty = (grade: Grade) => clamp(W[4] - (grade - 3) * W[5], 1, 10);
const interval = (stability: number) => clamp(Math.round(stability), 1, MAX_INTERVAL);
export const retrievability = (elapsedDays: number, stability: number) =>
  Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);

export const schedule = (previous: ReviewState | null, grade: Grade, today: string): ReviewState => {
  const learned = previous && previous.stability > 0 ? previous : null;
  let stability: number;
  let difficulty: number;
  if (!learned) {
    stability = W[grade - 1];
    difficulty = initialDifficulty(grade);
  } else {
    const r = retrievability(daysBetween(learned.last, today), learned.stability);
    const d = learned.difficulty;
    if (grade === 1) {
      stability = W[11] * Math.pow(d, -W[12]) * (Math.pow(learned.stability + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
      stability = Math.min(stability, learned.stability);
    } else {
      const hardPenalty = grade === 2 ? W[15] : 1;
      const easyBonus = grade === 4 ? W[16] : 1;
      stability =
        learned.stability *
        (Math.exp(W[8]) * (11 - d) * Math.pow(learned.stability, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hardPenalty * easyBonus + 1);
    }
    const next = d - W[6] * (grade - 3);
    difficulty = clamp(W[7] * initialDifficulty(3) + (1 - W[7]) * next, 1, 10);
  }
  stability = clamp(stability, 0.1, MAX_INTERVAL);
  return {
    due: addDays(today, interval(stability)),
    stability,
    difficulty,
    reps: (previous?.reps ?? 0) + 1,
    lapses: (previous?.lapses ?? 0) + (learned && grade === 1 ? 1 : 0),
    last: today,
    started: previous?.started || today,
    suspended: false,
  };
};

export const previewIntervals = (previous: ReviewState | null, today: string): Record<Grade, number> => {
  const result = {} as Record<Grade, number>;
  for (const grade of [1, 2, 3, 4] as Grade[]) result[grade] = daysBetween(today, schedule(previous, grade, today).due);
  return result;
};

export const formatInterval = (days: number): string => {
  if (days < 7) return `${days} 天`;
  if (days < 30) return `${Math.round(days / 7)} 周`;
  if (days < 365) return `${Math.round(days / 30)} 个月`;
  return `${Number((days / 365).toFixed(1))} 年`;
};

// Deterministic per-day ordering for new cards: stable through a day, different across days.
const dailyHash = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export interface Reviewable {
  path: string;
  archived?: boolean;
  favorite?: boolean;
  review?: ReviewState | null;
}

export interface ReviewQueue<T> {
  due: T[];
  fresh: T[];
  doneToday: number;
  dueTomorrow: number;
}

export const buildReviewQueue = <T extends Reviewable>(cards: T[], today: string, newPerDay: number): ReviewQueue<T> => {
  const active = cards.filter((card) => !card.archived && !card.review?.suspended);
  const due = active
    .filter((card) => card.review && card.review.stability > 0 && card.review.due <= today)
    .sort((a, b) => a.review!.due.localeCompare(b.review!.due) || a.path.localeCompare(b.path));
  const introducedToday = active.filter((card) => card.review?.started === today).length;
  const fresh = active
    .filter((card) => !card.review || !(card.review.stability > 0))
    // Favorites are introduced first; the rest follow a stable daily shuffle.
    .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || dailyHash(today + a.path) - dailyHash(today + b.path))
    .slice(0, Math.max(0, newPerDay - introducedToday));
  const tomorrow = addDays(today, 1);
  return {
    due,
    fresh,
    doneToday: active.filter((card) => card.review?.last === today).length,
    dueTomorrow: active.filter((card) => card.review && card.review.stability > 0 && card.review.due === tomorrow).length,
  };
};
