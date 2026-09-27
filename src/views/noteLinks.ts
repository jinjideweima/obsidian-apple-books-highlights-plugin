import type { App, TFile } from 'obsidian';
import { cardLink } from '../utils/cardIdentity';

export const pendingWikiLink = (text: string, cursor: number): { start: number; query: string } | null => {
  const match = text.slice(0, cursor).match(/\[\[([^\][\n]*)$/);
  return match ? { start: cursor - match[0].length, query: match[1] } : null;
};

// Suggestions write real wiki links into the card's Markdown; Obsidian owns their resolution/backlinks.
export function attachNoteLinks(app: App, textarea: HTMLTextAreaElement, host: HTMLElement, sourcePath: string): () => void {
  const list = host.createDiv({ cls: 'abkc-link-suggestions', attr: { role: 'listbox', 'aria-label': '选择要链接的笔记' } });
  let matches: TFile[] = [],
    selected = 0;
  const choose = (file: TFile) => {
    const pending = pendingWikiLink(textarea.value, textarea.selectionStart);
    if (!pending) return;
    const cursor = textarea.selectionStart;
    const after = textarea.value.slice(cursor).startsWith(']]') ? cursor + 2 : cursor;
    const link = cardLink(file.path, file.basename);
    textarea.setRangeText(link, pending.start, after, 'end');
    textarea.focus();
    matches = [];
    list.empty();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const draw = () => {
    list.empty();
    matches.forEach((file, i) => {
      const button = list.createEl('button', {
        text: `${file.basename} · ${file.path}`,
        attr: { role: 'option', 'aria-selected': String(i === selected), type: 'button' },
      });
      button.addEventListener('mousedown', (e) => e.preventDefault());
      button.addEventListener('click', () => choose(file));
    });
  };
  const refresh = () => {
    const pending = pendingWikiLink(textarea.value, textarea.selectionStart);
    selected = 0;
    const q = pending?.query.toLocaleLowerCase() || '';
    matches = pending
      ? app.vault
          .getMarkdownFiles()
          .filter((file) => {
            if (file.path === sourcePath || /-bk-\d+\//.test(file.path)) return false;
            const aliases = app.metadataCache?.getFileCache(file)?.frontmatter?.aliases || [];
            return `${file.path} ${Array.isArray(aliases) ? aliases.join(' ') : aliases}`.toLocaleLowerCase().includes(q);
          })
          .slice(0, 12)
      : [];
    draw();
  };
  const keydown = (event: KeyboardEvent) => {
    if (!matches.length) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === 'Enter') choose(matches[selected]);
    else if (event.key === 'Escape') {
      matches = [];
      draw();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      draw();
    }
  };
  textarea.addEventListener('input', refresh);
  textarea.addEventListener('click', refresh);
  textarea.addEventListener('keydown', keydown);
  return () => {
    textarea.removeEventListener('input', refresh);
    textarea.removeEventListener('click', refresh);
    textarea.removeEventListener('keydown', keydown);
    list.remove();
  };
}
