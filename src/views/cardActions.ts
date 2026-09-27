import { Menu, Modal, Setting, type App } from 'obsidian';
import type { IHighlightCard } from '../types';
import {
  deleteArchivedCard,
  setHighlightFavorite,
  setHighlightLocalNote,
  setHighlightProperties,
  setReviewSuspended,
} from '../modules/highlightRepository';
import { cardLink } from '../utils/cardIdentity';
import { attachNoteLinks } from './noteLinks';
import { showNotice } from './ui';

class EditNoteModal extends Modal {
  private disposeLinks?: () => void;

  constructor(
    app: App,
    private card: IHighlightCard,
    private onSave: (note: string) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('abkc-edit-modal');
    contentEl.createEl('h2', { text: '我的笔记' });
    const quote = contentEl.createEl('blockquote', { cls: 'abkc-edit-quote', attr: { 'data-color': this.card.highlightColor } });
    quote.setText(this.card.highlight.length > 280 ? `${this.card.highlight.slice(0, 280)}…` : this.card.highlight);
    contentEl.createDiv({ text: [this.card.bookTitle, this.card.chapter].filter(Boolean).join(' · '), cls: 'abkc-modal-muted' });
    const textarea = contentEl.createEl('textarea', {
      cls: 'abkc-note-editor',
      attr: { placeholder: '写下你的想法。输入 [[ 可以链接到其他笔记。' },
    });
    textarea.value = this.card.localNote;
    this.disposeLinks = attachNoteLinks(this.app, textarea, contentEl, this.card.path);
    const save = async () => {
      try {
        await this.onSave(textarea.value);
        this.close();
      } catch (error) {
        showNotice(`保存失败：${error instanceof Error ? error.message : String(error)}`);
      }
    };
    // ⌘/Ctrl+Enter saves without leaving the keyboard.
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void save();
      }
    });
    new Setting(contentEl)
      .setDesc('⌘ / Ctrl + Enter 保存')
      .addButton((button) => button.setButtonText('取消').onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText('保存')
          .setCta()
          .onClick(() => void save()),
      );
    window.setTimeout(() => textarea.focus(), 0);
  }

  onClose(): void {
    this.disposeLinks?.();
    this.contentEl.empty();
  }
}

class DeleteCardModal extends Modal {
  constructor(
    app: App,
    private card: IHighlightCard,
    private refresh: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl('h2', { text: '删除这条已移除摘录？' });
    this.contentEl.createEl('p', { text: '文件会按 Obsidian 的删除设置处理，通常进入回收站。Apple Books 不受影响。' });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('删除摘录文件')
          .setWarning()
          .onClick(async () => {
            await deleteArchivedCard(this.app, this.card);
            await this.refresh();
            this.close();
          }),
      );
  }
}

export interface CardActionContext {
  app: App;
  refresh: () => Promise<void>;
}

export const editCardNote = ({ app, refresh }: CardActionContext, card: IHighlightCard): void => {
  new EditNoteModal(app, card, async (note) => {
    await setHighlightLocalNote(app, card, note, card.localNote);
    showNotice('笔记已保存');
    await refresh();
  }).open();
};

export const toggleFavorite = async ({ app, refresh }: CardActionContext, card: IHighlightCard): Promise<void> => {
  await setHighlightFavorite(app, card, !card.favorite);
  await refresh();
};

export const copyHighlight = async (card: IHighlightCard): Promise<void> => {
  await navigator.clipboard.writeText(`> ${card.highlight.replace(/\n/g, '\n> ')}\n\n— ${card.bookTitle}`);
  showNotice('摘录已复制');
};

export const openCardFile = async (app: App, card: IHighlightCard): Promise<void> => {
  window.sessionStorage.setItem('abkc:last-card', card.annotationId);
  await app.workspace.openLinkText(card.path, '', true);
};

export const restoreCard = async ({ app, refresh }: CardActionContext, card: IHighlightCard): Promise<void> => {
  await setHighlightProperties(app, card, { archived: false, restored: true });
  showNotice('已恢复到正常摘录');
  await refresh();
};

export const confirmDeleteCard = ({ app, refresh }: CardActionContext, card: IHighlightCard): void => {
  new DeleteCardModal(app, card, refresh).open();
};

export const openCardMenu = (context: CardActionContext, card: IHighlightCard, event: MouseEvent): Menu => {
  const { app, refresh } = context;
  const menu = new Menu();
  menu.addItem((item) =>
    item
      .setTitle('编辑笔记')
      .setIcon('pencil')
      .onClick(() => editCardNote(context, card)),
  );
  menu.addItem((item) =>
    item
      .setTitle(card.reviewed ? '取消已整理' : '标记为已整理')
      .setIcon('check-circle')
      .onClick(async () => {
        await setHighlightProperties(app, card, { reviewed: !card.reviewed });
        await refresh();
      }),
  );
  menu.addItem((item) =>
    item
      .setTitle(card.review?.suspended ? '恢复每日回顾' : '不再出现在每日回顾')
      .setIcon(card.review?.suspended ? 'play' : 'pause')
      .onClick(async () => {
        await setReviewSuspended(app, card, !card.review?.suspended);
        showNotice(card.review?.suspended ? '已恢复每日回顾' : '这条摘录不会再出现在每日回顾');
        await refresh();
      }),
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle('复制摘录')
      .setIcon('copy')
      .onClick(() => copyHighlight(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle('复制摘录链接')
      .setIcon('link')
      .onClick(async () => {
        await navigator.clipboard.writeText(cardLink(card.path, `${card.bookTitle} · ${card.highlight.slice(0, 28)}`));
        showNotice('链接已复制，可粘贴到其他笔记');
      }),
  );
  menu.addSeparator();
  if (card.sourceKey) {
    menu.addItem((item) =>
      item
        .setTitle('在 Apple Books 中打开')
        .setIcon('book-open')
        .onClick(() => {
          window.open(card.sourceKey);
        }),
    );
  }
  menu.addItem((item) =>
    item
      .setTitle('打开摘录文件')
      .setIcon('file-text')
      .onClick(() => openCardFile(app, card)),
  );
  menu.showAtMouseEvent(event);
  return menu;
};
