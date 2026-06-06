import { App, TFile, TFolder } from 'obsidian';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { IBookHighlightsPluginSettings } from '../../src/types';
import { importHighlights } from '../../src/importHighlights';
import * as annotationProcessing from '../../src/modules/annotationsProcessing';
import { extractBookCover } from '../../src/modules/epubChapters';
import { VaultManagement } from '../../src/modules/vaultManagement';
import { defaultTemplate } from '../../src/settings';
import aggregatedBooksAndAnnotations from '../fixtures/annotationProcessing/aggregatedBooksAndAnnotations.json' with { type: 'json' };

vi.mock('../../src/modules/epubChapters', () => ({ extractBookCover: vi.fn() }));

describe('importHighlights', () => {
  const mockApp = {
    vault: {
      getFolderByPath: vi.fn(),
      getFileByPath: vi.fn(),
      createFolder: vi.fn(),
      create: vi.fn(),
      modify: vi.fn(),
      delete: vi.fn(),
      adapter: {
        list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
        rename: vi.fn(),
      },
    },
  } as unknown as App;

  const mockSettings: IBookHighlightsPluginSettings = {
    highlightsFolder: 'ibooks-highlights',
    backup: false,
    importOnStart: false,
    highlightsSortingCriterion: 'creationDateOldToNew',
    template: defaultTemplate,
    filenameTemplate: '{{{bookTitle}}}',
    keepMeSectionOpeningDelimiter: '%% keep-me %%',
    keepMeSectionClosingDelimiter: '%% /keep-me %%',
    keepMeSectionData: {},
  };

  const expectBookContent = (content: string, bookTitle: string, bookId: string) => {
    expect(content).toContain('type: book');
    expect(content).toContain(`title: "${bookTitle}"`);
    expect(content).toContain(`book_id: "${bookId}"`);
    expect(content).toContain('<summary>摘录目录</summary>');
    expect(content).toContain('## 本书摘录');
    expect(content).toContain('```apple-books-board');
    expect(content).toContain(`book_id: ${bookId}`);
  };

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('Should save aggregated highlights as separate files using default importMode (create)', async () => {
    const vaultManagement = new VaultManagement(mockApp, mockSettings);

    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue(aggregatedBooksAndAnnotations);

    const createBookFileSpy = vi.spyOn(vaultManagement, 'createBookFile');
    const upsertFileSpy = vi.spyOn(vaultManagement, 'upsertFile');

    await importHighlights(vaultManagement, mockSettings);

    expect(createBookFileSpy).toHaveBeenCalledTimes(4);
    expect(createBookFileSpy).toHaveBeenNthCalledWith(1, 'iPhone User Guide', expect.any(String));
    expectBookContent(createBookFileSpy.mock.calls[0][1], 'iPhone User Guide', 'THBFYNJKTGFTTVCGSAE1');
    // Card filenames use stable annotationId instead of position index
    expect(upsertFileSpy).toHaveBeenCalledWith(
      'ibooks-highlights/cards/iPhone User Guide/ibooks-thbfynjk-7ed3b8a9.md',
      expect.stringContaining('# 摘录 1'),
    );
  });

  test('Should modify existing files when importMode === modify', async () => {
    const vaultManagement = new VaultManagement(mockApp, mockSettings);

    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue([aggregatedBooksAndAnnotations[0]]);
    vi.spyOn(vaultManagement, 'getFilePath').mockReturnValue({ path: 'ibooks-highlights/iPhone User Guide.md' } as TFile);

    const modifyBookFileSpy = vi.spyOn(vaultManagement, 'modifyBookFile');

    await importHighlights(vaultManagement, mockSettings, 'modify');

    expect(modifyBookFileSpy).toHaveBeenCalledWith({ path: 'ibooks-highlights/iPhone User Guide.md' }, expect.any(String));
    expectBookContent(modifyBookFileSpy.mock.calls[0][1], 'iPhone User Guide', 'THBFYNJKTGFTTVCGSAE1');
  });

  test('Should create a new file if importMode === modify but the file does not exist', async () => {
    const vaultManagement = new VaultManagement(mockApp, mockSettings);

    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue([aggregatedBooksAndAnnotations[0]]);
    vi.spyOn(vaultManagement, 'getFilePath').mockReturnValue(null);

    const createBookFileSpy = vi.spyOn(vaultManagement, 'createBookFile');

    await importHighlights(vaultManagement, mockSettings, 'modify');

    expect(createBookFileSpy).toHaveBeenCalledWith('iPhone User Guide', expect.any(String));
    expectBookContent(createBookFileSpy.mock.calls[0][1], 'iPhone User Guide', 'THBFYNJKTGFTTVCGSAE1');
  });

  test('Should embed Keep Me section data if it is stored in settings', async () => {
    const settingsWithKeepMeSection: IBookHighlightsPluginSettings = {
      ...mockSettings,
      template: `${defaultTemplate}\n%% keep-me %%\n%% /keep-me %%\n`,
      keepMeSectionData: {
        'iPhone User Guide': `This is a great guide!📕 I learned so much from it.\nDefinitely need to recommend it to Aaron. 😎🤜🤛😎`,
      },
    };
    const vaultManagement = new VaultManagement(mockApp, settingsWithKeepMeSection);

    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue([aggregatedBooksAndAnnotations[0]]);

    const createBookFileSpy = vi.spyOn(vaultManagement, 'createBookFile');

    await importHighlights(vaultManagement, settingsWithKeepMeSection);

    expect(createBookFileSpy).toHaveBeenCalledWith(
      'iPhone User Guide',
      expect.stringContaining('Definitely need to recommend it to Aaron.'),
    );
  });

  test('Should throw aggregated error if any file operation fails', async () => {
    const vaultManagement = new VaultManagement(mockApp, mockSettings);
    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue([aggregatedBooksAndAnnotations[0]]);
    vi.spyOn(vaultManagement, 'createBookFile').mockRejectedValueOnce(new Error('File write failed'));

    await expect(importHighlights(vaultManagement, mockSettings)).rejects.toThrow(/导入《iPhone User Guide》失败：File write failed/);
  });

  test('Should not create highlights folder if it already exists', async () => {
    const vaultManagement = new VaultManagement(mockApp, mockSettings);

    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue([aggregatedBooksAndAnnotations[0]]);
    vi.spyOn(vaultManagement, 'getHighlightsFolderPath').mockReturnValue({ path: 'ibooks-highlights' } as TFolder);

    const createHighlightsFolderSpy = vi.spyOn(vaultManagement, 'createHighlightsFolder');
    const createBookFileSpy = vi.spyOn(vaultManagement, 'createBookFile');

    await importHighlights(vaultManagement, mockSettings);

    expect(createHighlightsFolderSpy).not.toHaveBeenCalled();
    expect(createBookFileSpy).toHaveBeenCalled();
  });

  test('Should not process files if importMode is neither create nor modify', async () => {
    const vaultManagement = new VaultManagement(mockApp, mockSettings);

    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue([aggregatedBooksAndAnnotations[0]]);

    const createBookFileSpy = vi.spyOn(vaultManagement, 'createBookFile');
    const modifyBookFileSpy = vi.spyOn(vaultManagement, 'modifyBookFile');

    await importHighlights(vaultManagement, mockSettings, 'invalid' as any);

    expect(createBookFileSpy).not.toHaveBeenCalled();
    expect(modifyBookFileSpy).not.toHaveBeenCalled();
  });

  test('Should extract the EPUB cover, write it, and reference it in the frontmatter', async () => {
    const vaultManagement = new VaultManagement(mockApp, mockSettings);

    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue([{ ...aggregatedBooksAndAnnotations[0] }]);
    vi.mocked(extractBookCover).mockResolvedValue({ data: new Uint8Array([1, 2, 3]), extension: 'jpg' });

    const upsertBinarySpy = vi.spyOn(vaultManagement, 'upsertBinaryFile').mockResolvedValue();
    const createBookFileSpy = vi.spyOn(vaultManagement, 'createBookFile');

    await importHighlights(vaultManagement, mockSettings);

    expect(upsertBinarySpy).toHaveBeenCalledWith('ibooks-highlights/covers/iPhone User Guide.jpg', expect.any(ArrayBuffer));
    expect(createBookFileSpy.mock.calls[0][1]).toContain('cover: "[[ibooks-highlights/covers/iPhone User Guide.jpg]]"');
  });

  test('Should skip cover handling when the book has no extractable cover', async () => {
    const vaultManagement = new VaultManagement(mockApp, mockSettings);

    vi.spyOn(annotationProcessing, 'aggregateBooksWithAnnotations').mockResolvedValue([{ ...aggregatedBooksAndAnnotations[0] }]);
    vi.mocked(extractBookCover).mockResolvedValue(null);

    const upsertBinarySpy = vi.spyOn(vaultManagement, 'upsertBinaryFile').mockResolvedValue();

    await importHighlights(vaultManagement, mockSettings);

    expect(upsertBinarySpy).not.toHaveBeenCalled();
  });
});
