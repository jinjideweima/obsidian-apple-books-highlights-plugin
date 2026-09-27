import { setIcon, type App } from 'obsidian';
import type { IHighlightCard } from '../types';
import { recordReview } from '../modules/highlightRepository';
import { buildReviewQueue, dayString, formatInterval, GRADE_LABELS, previewIntervals, type Grade } from '../modules/review';
import { editCardNote, openCardMenu, toggleFavorite, type CardActionContext } from './cardActions';
import { iconButton, renderLines, showNotice } from './ui';

// Extra new cards the reader asked for today ("再学 5 条"); resets on a new day.
let extraNew = { day: '', count: 0 };
const EXTRA_STEP = 5;
const LONG_QUOTE = 600;

export interface ReviewPanelHandle {
  onKey: (event: KeyboardEvent) => boolean;
}

export const renderReviewPanel = (
  app: App,
  host: HTMLElement,
  cards: IHighlightCard[],
  newPerDay: number,
  refresh: () => Promise<void>,
): ReviewPanelHandle => {
  const today = dayString();
  if (extraNew.day !== today) extraNew = { day: today, count: 0 };
  const queue = buildReviewQueue(cards, today, newPerDay + extraNew.count);
  const remaining = [...queue.due, ...queue.fresh];
  const current = remaining[0];
  const actions: CardActionContext = { app, refresh };

  const panel = host.createEl('section', { cls: 'abkc-review' });
  const header = panel.createDiv({ cls: 'abkc-review-header' });
  header.createEl('h2', { text: '今日回顾' });
  const total = queue.doneToday + remaining.length;
  if (total) {
    header.createSpan({
      cls: 'abkc-review-progress-text',
      text: remaining.length ? `${queue.doneToday} / ${total}` : `已完成 ${queue.doneToday} 条`,
    });
    const bar = panel.createDiv({
      cls: 'abkc-progress',
      attr: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(queue.doneToday) },
    });
    bar.createDiv({ cls: 'abkc-progress-fill' }).style.width = `${Math.round((queue.doneToday / total) * 100)}%`;
  }

  if (!cards.length) {
    const empty = panel.createDiv({ cls: 'abkc-review-empty' });
    setIcon(empty.createDiv({ cls: 'abkc-review-empty-icon' }), 'book-open');
    empty.createDiv({ text: '导入摘录后，这里每天会安排几条值得重读的内容。', cls: 'abkc-muted' });
    return { onKey: () => false };
  }

  if (!current) {
    const done = panel.createDiv({ cls: 'abkc-review-empty' });
    setIcon(done.createDiv({ cls: 'abkc-review-empty-icon is-done' }), 'check-circle-2');
    done.createDiv({ text: '今天的回顾完成了', cls: 'abkc-review-done-title' });
    done.createDiv({ text: queue.dueTomorrow ? `明天有 ${queue.dueTomorrow} 条到期` : '明天没有到期的摘录', cls: 'abkc-muted' });
    const unseen = cards.filter((card) => !card.archived && !card.review?.suspended && !(card.review && card.review.stability > 0)).length;
    if (unseen) {
      done
        .createEl('button', { text: `再学 ${Math.min(EXTRA_STEP, unseen)} 条新摘录`, attr: { type: 'button' } })
        .addEventListener('click', () => {
          extraNew.count += EXTRA_STEP;
          void refresh();
        });
    }
    return { onKey: () => false };
  }

  const isNew = !(current.review && current.review.stability > 0);
  const meta = panel.createDiv({ cls: 'abkc-review-meta' });
  meta.createSpan({ text: isNew ? '新摘录' : `第 ${current.review!.reps + 1} 次回顾`, cls: 'abkc-tag' });
  meta.createSpan({ text: [current.bookTitle, current.chapter].filter(Boolean).join(' · '), cls: 'abkc-review-source' });

  const quote = panel.createDiv({ cls: 'abkc-review-quote', attr: { 'data-color': current.highlightColor } });
  renderLines(quote, current.highlight);
  if (current.highlight.length > LONG_QUOTE) {
    quote.addClass('is-clamped');
    const expand = panel.createEl('button', { text: '展开全文', cls: 'abkc-card-expand', attr: { type: 'button' } });
    expand.addEventListener('click', () => expand.setText(quote.classList.toggle('is-clamped') ? '展开全文' : '收起'));
  }
  for (const [label, text] of [
    ['Apple Books 想法', current.appleNote],
    ['我的笔记', current.localNote],
  ]) {
    if (!text.trim()) continue;
    const note = panel.createDiv({ cls: 'abkc-card-annotation' });
    note.createDiv({ text: label, cls: 'abkc-card-label' });
    // Plain text keeps the panel cheap to re-render; wiki links show their display text.
    renderLines(
      note.createDiv(),
      text.trim().replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, path: string, alias?: string) => alias || path.split('/').pop()!),
    );
  }

  const footer = panel.createDiv({ cls: 'abkc-review-footer' });
  const tools = footer.createDiv({ cls: 'abkc-review-tools' });
  const star = iconButton(tools, 'star', current.favorite ? '取消收藏' : '收藏', `abkc-star${current.favorite ? ' is-active' : ''}`);
  star.addEventListener('click', () => void toggleFavorite(actions, current));
  iconButton(tools, 'pencil', '写笔记').addEventListener('click', () => editCardNote(actions, current));
  iconButton(tools, 'more-horizontal', '更多操作').addEventListener('click', (event) => openCardMenu(actions, current, event));

  const grades = footer.createDiv({ cls: 'abkc-grades', attr: { role: 'group', 'aria-label': '这条摘录的熟悉程度' } });
  const intervals = previewIntervals(current.review ?? null, today);
  const buttons: HTMLButtonElement[] = [];
  let busy = false;
  const grade = async (value: Grade) => {
    if (busy) return;
    busy = true;
    buttons.forEach((button) => button.setAttr('disabled', 'true'));
    try {
      await recordReview(app, current, value, today);
      await refresh();
    } catch (error) {
      busy = false;
      buttons.forEach((button) => button.removeAttribute('disabled'));
      showNotice(`记录失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  for (const value of [1, 2, 3, 4] as Grade[]) {
    const button = grades.createEl('button', {
      cls: `abkc-grade${value === 3 ? ' mod-cta' : ''}`,
      attr: { type: 'button', 'data-grade': String(value), title: `快捷键 ${value}` },
    });
    button.createSpan({ text: GRADE_LABELS[value], cls: 'abkc-grade-label' });
    button.createSpan({ text: formatInterval(intervals[value]), cls: 'abkc-grade-interval' });
    button.addEventListener('click', () => void grade(value));
    buttons.push(button);
  }

  return {
    onKey: (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return false;
      if (/^[1-4]$/.test(event.key)) {
        void grade(Number(event.key) as Grade);
        return true;
      }
      if (event.key === 'f') {
        void toggleFavorite(actions, current);
        return true;
      }
      if (event.key === 'e') {
        editCardNote(actions, current);
        return true;
      }
      return false;
    },
  };
};
