import { beforeEach, expect, test, vi } from 'vitest';
import { IBookHighlightsPluginSearchModal } from '../../src/modals/searchSuggestions';
import { getBooks } from '../../src/modules/dataFetching';
import { backupAndImport } from '../../src/utils/backupAndImportFlow';
vi.mock('../../src/modules/dataFetching');
vi.mock('../../src/utils/backupAndImportFlow');
const books = [
  { bookId: '1', bookTitle: 'Atomic Habits', bookAuthor: 'James' },
  { bookId: '2', bookTitle: 'Deep Work', bookAuthor: 'Cal' },
] as any;
let modal: IBookHighlightsPluginSearchModal;
const plugin = { app: {}, settings: {}, manifest: { name: 'test' } } as any;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getBooks).mockResolvedValue(books);
  modal = new IBookHighlightsPluginSearchModal(plugin.app, plugin);
});
test('searches titles and authors without opening EPUBs', async () => {
  expect((await modal.getSuggestions('atomic'))[0].bookId).toBe('1');
  expect((await modal.getSuggestions('cal'))[0].bookId).toBe('2');
  expect(getBooks).toHaveBeenCalledTimes(1);
});
test('selection calls shared import flow with stable book ID', () => {
  modal.onChooseSuggestion(books[0]);
  expect(backupAndImport).toHaveBeenCalledWith(plugin, plugin.settings, 'modify', '1');
});
test('a failed list load can be retried', async () => {
  vi.mocked(getBooks).mockRejectedValueOnce(new Error('locked'));
  expect(await modal.getSuggestions('')).toEqual([]);
  expect(await modal.getSuggestions('')).toHaveLength(2);
});
