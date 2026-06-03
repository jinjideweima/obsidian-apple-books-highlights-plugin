import { ItemView, WorkspaceLeaf } from 'obsidian';
import type IBookHighlightsPlugin from '../../main';
import { getHighlightCards } from '../modules/highlightRepository';
import { renderCardsBoard } from './cardRenderer';

export const CARDS_VIEW_TYPE = 'apple-books-knowledge-cards-view';

export interface CardsViewState extends Record<string, unknown> {
  onlyFavorite?: boolean;
  onlyUnreviewed?: boolean;
  onlyWithAppleNote?: boolean;
  onlyWithChapter?: boolean;
}

export class CardsView extends ItemView {
  private plugin: IBookHighlightsPlugin;
  private state: CardsViewState = {};

  constructor(leaf: WorkspaceLeaf, plugin: IBookHighlightsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CARDS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Apple Books 摘录';
  }

  getIcon(): string {
    return 'layout-dashboard';
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    try {
      const cards = await getHighlightCards(this.app, this.plugin.settings);
      renderCardsBoard(
        this.app,
        this.contentEl,
        cards,
        {},
        {
          onRefresh: () => this.render(),
          initialOnlyFavorite: Boolean(this.state.onlyFavorite),
          initialOnlyUnreviewed: Boolean(this.state.onlyUnreviewed),
          initialOnlyWithAppleNote: Boolean(this.state.onlyWithAppleNote),
          initialOnlyWithChapter: Boolean(this.state.onlyWithChapter),
        },
      );
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.createDiv({
        cls: 'abkc-empty',
        text: `Apple Books 摘录卡片加载失败：${error instanceof Error ? error.message : String(error)}`,
      });
      console.error('[Apple Books Knowledge Cards]:', error);
    }
  }

  getState(): Record<string, unknown> {
    return this.state;
  }

  async setState(state: CardsViewState): Promise<void> {
    this.state = state || {};
    await this.render();
  }
}

export const openCardsView = async (plugin: IBookHighlightsPlugin, state: CardsViewState = {}): Promise<void> => {
  const existingLeaves = plugin.app.workspace.getLeavesOfType(CARDS_VIEW_TYPE);

  if (existingLeaves.length > 0) {
    await existingLeaves[0].setViewState({
      type: CARDS_VIEW_TYPE,
      state,
      active: true,
    });
    plugin.app.workspace.revealLeaf(existingLeaves[0]);
    return;
  }

  const leaf = plugin.app.workspace.getLeaf('tab');

  await leaf.setViewState({
    type: CARDS_VIEW_TYPE,
    state,
    active: true,
  });

  plugin.app.workspace.revealLeaf(leaf);
};
