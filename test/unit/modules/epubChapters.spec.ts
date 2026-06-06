import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { IBookWithAnnotations } from '../../../src/types';
import { extractBookCover, inferMissingChapters, isEpubPermissionError } from '../../../src/modules/epubChapters';

// ─── EPUB fixtures ─────────────────────────────────────────────────────────────

const EPUB_ROOT = '/books/test-book';

/**
 * Minimal valid EPUB directory structure used across all tests.
 * - Two chapters, each with two paragraphs
 * - TOC in NCX format (EPUB 2)
 */
const EPUB_FILES: Record<string, string> = {
  'META-INF/container.xml': `<container>
    <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
  </container>`,

  'OEBPS/content.opf': `<package>
    <manifest>
      <item id="ncx"      href="toc.ncx"        media-type="application/x-dtbncx+xml"/>
      <item id="chapter1" href="chapter1.xhtml"  media-type="application/xhtml+xml"/>
      <item id="chapter2" href="chapter2.xhtml"  media-type="application/xhtml+xml"/>
    </manifest>
    <spine toc="ncx">
      <itemref idref="chapter1"/>
      <itemref idref="chapter2"/>
    </spine>
  </package>`,

  'OEBPS/toc.ncx': `<ncx><navMap>
    <navPoint id="p1">
      <navLabel><text>第一章</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
    <navPoint id="p2">
      <navLabel><text>第二章</text></navLabel>
      <content src="chapter2.xhtml"/>
    </navPoint>
  </navMap></ncx>`,

  'OEBPS/chapter1.xhtml': `<html><body>
    <p>这是第一章的第一段内容。</p>
    <p>这是第一章的第二段内容，更长的上下文。</p>
  </body></html>`,

  'OEBPS/chapter2.xhtml': `<html><body>
    <p>第二章的开篇，与众不同的段落。</p>
  </body></html>`,
};

// ─── File-system mock ──────────────────────────────────────────────────────────

const { mockStat, mockReadFile, mockReaddir } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockReadFile: vi.fn(),
  mockReaddir: vi.fn(),
}));

vi.mock('../../../src/utils/nodeModules', () => ({
  requireNodeModule: (moduleName: string) => {
    if (moduleName === 'fs/promises') {
      return { stat: mockStat, readdir: mockReaddir, readFile: mockReadFile };
    }
    if (moduleName === 'path') {
      return {
        join: (...parts: string[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
      };
    }
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal IBookWithAnnotations for testing. */
const makeBook = (overrides: Partial<IBookWithAnnotations> = {}): IBookWithAnnotations => ({
  bookId: 'BOOK001',
  bookTitle: '测试书籍',
  bookAuthor: '测试作者',
  bookGenre: '',
  bookLanguage: 'zh',
  bookLastOpenedDate: 0,
  bookFinishedDate: null,
  bookCoverUrl: '',
  bookPath: EPUB_ROOT,
  annotations: [],
  ...overrides,
});

const baseAnnotation = {
  assetId: 'a1',
  note: null,
  highlightStyle: 0,
  highlightCreationDate: 0,
  highlightModificationDate: 0,
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('inferMissingChapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: bookPath points to an extractable directory epub
    mockStat.mockResolvedValue({ isDirectory: () => true });

    mockReaddir.mockImplementation(async (dirPath: string) => {
      const map: Record<string, Array<{ name: string; isDirectory: () => boolean }>> = {
        [EPUB_ROOT]: [
          { name: 'META-INF', isDirectory: () => true },
          { name: 'OEBPS', isDirectory: () => true },
        ],
        [`${EPUB_ROOT}/META-INF`]: [{ name: 'container.xml', isDirectory: () => false }],
        [`${EPUB_ROOT}/OEBPS`]: [
          { name: 'content.opf', isDirectory: () => false },
          { name: 'toc.ncx', isDirectory: () => false },
          { name: 'chapter1.xhtml', isDirectory: () => false },
          { name: 'chapter2.xhtml', isDirectory: () => false },
        ],
      };
      return map[dirPath] ?? [];
    });

    mockReadFile.mockImplementation(async (filePath: string) => {
      const relativePath = filePath.replace(`${EPUB_ROOT}/`, '');
      const content = EPUB_FILES[relativePath];
      if (content === undefined) {
        throw new Error(`Mock fs: 找不到文件 "${filePath}"`);
      }
      return content;
    });
  });

  // ── 1. 无 bookPath ────────────────────────────────────────────────────────

  test('should skip books without a bookPath', async () => {
    const book = makeBook({
      bookPath: undefined,
      annotations: [
        {
          ...baseAnnotation,
          chapter: '',
          contextualText: '',
          highlight: '第一段内容',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
      ],
    });

    await inferMissingChapters([book]);

    expect(mockStat).not.toHaveBeenCalled();
    expect(book.annotations[0].chapter).toBe('');
    expect(book.annotations[0].contextualText).toBe('');
  });

  // ── 2. 章节推断 ───────────────────────────────────────────────────────────

  test('should infer missing chapters from EPUB TOC', async () => {
    const book = makeBook({
      annotations: [
        {
          ...baseAnnotation,
          chapter: '',
          contextualText: '不同的上下文',
          highlight: '第一段',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
        {
          ...baseAnnotation,
          assetId: 'a2',
          chapter: '',
          contextualText: '不同的上下文',
          highlight: '第二章',
          highlightLocation: 'epubcfi(/6/4[chapter2]!/4/2/1:0)',
        },
      ],
    });

    await inferMissingChapters([book]);

    expect(book.annotations[0].chapter).toBe('第一章');
    expect(book.annotations[1].chapter).toBe('第二章');
  });

  test('should not overwrite an annotation that already has a chapter', async () => {
    const book = makeBook({
      annotations: [
        {
          ...baseAnnotation,
          chapter: '已有章节',
          contextualText: '不同的上下文',
          highlight: '摘录',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
      ],
    });

    await inferMissingChapters([book]);

    expect(book.annotations[0].chapter).toBe('已有章节');
  });

  test('should not read the TOC when all annotations already have chapters', async () => {
    const book = makeBook({
      annotations: [
        {
          ...baseAnnotation,
          chapter: '已有章节',
          contextualText: '不同的上下文',
          highlight: '摘录',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
      ],
    });

    await inferMissingChapters([book]);

    const readPaths = mockReadFile.mock.calls.map(([p]: [string]) => p as string);
    expect(readPaths.some((p) => p.includes('toc.ncx'))).toBe(false);
  });

  // ── 3. 段落上下文推断 ──────────────────────────────────────────────────────

  test('should infer paragraph context when contextualText is empty', async () => {
    const book = makeBook({
      annotations: [
        {
          ...baseAnnotation,
          chapter: '第一章',
          contextualText: '',
          highlight: '第一段内容',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
      ],
    });

    await inferMissingChapters([book]);

    // contextualText should now contain the highlight AND be longer than it
    expect(book.annotations[0].contextualText).toContain('第一段内容');
    expect(book.annotations[0].contextualText.length).toBeGreaterThan('第一段内容'.length);
  });

  test('should infer paragraph context when contextualText equals the highlight', async () => {
    const highlight = '第一段内容';
    const book = makeBook({
      annotations: [
        {
          ...baseAnnotation,
          chapter: '第一章',
          contextualText: highlight,
          highlight,
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
      ],
    });

    await inferMissingChapters([book]);

    expect(book.annotations[0].contextualText).not.toBe(highlight);
    expect(book.annotations[0].contextualText).toContain(highlight);
  });

  test('should not overwrite contextualText that already differs from highlight', async () => {
    const book = makeBook({
      annotations: [
        {
          ...baseAnnotation,
          chapter: '第一章',
          contextualText: '已有的完整上下文，和摘录内容不同。',
          highlight: '第一段内容',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
      ],
    });

    await inferMissingChapters([book]);

    expect(book.annotations[0].contextualText).toBe('已有的完整上下文，和摘录内容不同。');
  });

  // ── 4. 性能：HTML 缓存 ─────────────────────────────────────────────────────

  test('should read each chapter HTML only once even when multiple annotations need context', async () => {
    // Two annotations in chapter1, both missing contextualText
    const book = makeBook({
      annotations: [
        {
          ...baseAnnotation,
          assetId: 'a1',
          chapter: '第一章',
          contextualText: '',
          highlight: '第一段内容',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
        {
          ...baseAnnotation,
          assetId: 'a2',
          chapter: '第一章',
          contextualText: '',
          highlight: '第二段内容',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/2:0)',
        },
      ],
    });

    await inferMissingChapters([book]);

    const chapter1Reads = mockReadFile.mock.calls.filter(([p]: [string]) => (p as string).includes('chapter1.xhtml')).length;

    expect(chapter1Reads).toBe(1);
    // Both annotations should have received their context
    expect(book.annotations[0].contextualText).toContain('第一段内容');
    expect(book.annotations[1].contextualText).toContain('第二段内容');
  });

  // ── 5. 容错 ───────────────────────────────────────────────────────────────

  test('should handle a broken EPUB path gracefully without throwing', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const book = makeBook({
      annotations: [
        { ...baseAnnotation, chapter: '', contextualText: '', highlight: '摘录', highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)' },
      ],
    });

    await expect(inferMissingChapters([book])).resolves.not.toThrow();
    expect(book.annotations[0].chapter).toBe('');
  });

  // ── 6. 多本书并行 ─────────────────────────────────────────────────────────

  test('should process multiple books and infer chapters for each', async () => {
    const book1 = makeBook({
      bookId: 'B1',
      bookTitle: '书一',
      annotations: [
        {
          ...baseAnnotation,
          chapter: '',
          contextualText: '不同上下文',
          highlight: '书一摘录',
          highlightLocation: 'epubcfi(/6/2[chapter1]!/4/2/1:0)',
        },
      ],
    });
    const book2 = makeBook({
      bookId: 'B2',
      bookTitle: '书二',
      annotations: [
        {
          ...baseAnnotation,
          chapter: '',
          contextualText: '不同上下文',
          highlight: '书二摘录',
          highlightLocation: 'epubcfi(/6/4[chapter2]!/4/2/1:0)',
        },
      ],
    });

    await inferMissingChapters([book1, book2]);

    expect(book1.annotations[0].chapter).toBe('第一章');
    expect(book2.annotations[0].chapter).toBe('第二章');
  });
});

describe('extractBookCover', () => {
  const COVER_EPUB_ROOT = '/books/cover-book';

  const setupEpub = (opf: string, assets: Record<string, string> = {}): void => {
    const files: Record<string, string> = {
      'META-INF/container.xml': `<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
      'OEBPS/content.opf': opf,
      ...assets,
    };

    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReadFile.mockImplementation(async (filePath: string, encoding?: string) => {
      const relativePath = filePath.replace(`${COVER_EPUB_ROOT}/`, '');
      const content = files[relativePath];

      if (content === undefined) {
        throw new Error(`Mock fs: 找不到文件 "${filePath}"`);
      }

      // readText passes 'utf8' and expects a string; readBinary passes nothing and expects a Buffer.
      return encoding ? content : Buffer.from(content);
    });
  };

  const coverBook = () => makeBook({ bookPath: COVER_EPUB_ROOT });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('extracts the cover declared with properties="cover-image" (EPUB 3)', async () => {
    setupEpub(
      `<package><manifest>
        <item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
        <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
      </manifest><spine><itemref idref="c1"/></spine></package>`,
      { 'OEBPS/images/cover.jpg': 'JPEG-COVER-DATA' },
    );

    const result = await extractBookCover(coverBook());

    expect(result).not.toBeNull();
    expect(result!.extension).toBe('jpg');
    expect(Buffer.from(result!.data).toString()).toBe('JPEG-COVER-DATA');
  });

  test('extracts the cover referenced by <meta name="cover"> (EPUB 2)', async () => {
    setupEpub(
      `<package><metadata>
        <meta name="cover" content="cover-id"/>
      </metadata><manifest>
        <item id="cover-id" href="cover.png" media-type="image/png"/>
        <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
      </manifest><spine><itemref idref="c1"/></spine></package>`,
      { 'OEBPS/cover.png': 'PNG-COVER' },
    );

    const result = await extractBookCover(coverBook());

    expect(result!.extension).toBe('png');
    expect(Buffer.from(result!.data).toString()).toBe('PNG-COVER');
  });

  test('prefers the EPUB 3 cover-image over the EPUB 2 meta reference', async () => {
    setupEpub(
      `<package><metadata>
        <meta name="cover" content="old-cover"/>
      </metadata><manifest>
        <item id="old-cover" href="old.png" media-type="image/png"/>
        <item id="new-cover" href="new.jpg" media-type="image/jpeg" properties="cover-image"/>
      </manifest><spine></spine></package>`,
      { 'OEBPS/old.png': 'OLD', 'OEBPS/new.jpg': 'NEW' },
    );

    const result = await extractBookCover(coverBook());

    expect(Buffer.from(result!.data).toString()).toBe('NEW');
  });

  test('falls back to an image whose href hints at a cover', async () => {
    setupEpub(
      `<package><manifest>
        <item id="img1" href="cover.jpeg" media-type="image/jpeg"/>
        <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
      </manifest><spine><itemref idref="c1"/></spine></package>`,
      { 'OEBPS/cover.jpeg': 'FALLBACK-COVER' },
    );

    const result = await extractBookCover(coverBook());

    expect(result!.extension).toBe('jpg'); // .jpeg is normalized to .jpg
    expect(Buffer.from(result!.data).toString()).toBe('FALLBACK-COVER');
  });

  test('returns null when no cover can be located', async () => {
    setupEpub(
      `<package><manifest>
        <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
      </manifest><spine><itemref idref="c1"/></spine></package>`,
    );

    const result = await extractBookCover(coverBook());

    expect(result).toBeNull();
  });

  test('returns null when the book has no bookPath', async () => {
    const result = await extractBookCover(makeBook({ bookPath: undefined }));

    expect(result).toBeNull();
  });

  test('rethrows permission errors so the import can prompt for Full Disk Access', async () => {
    mockStat.mockRejectedValue(Object.assign(new Error('Operation not permitted'), { code: 'EPERM' }));

    await expect(extractBookCover(coverBook())).rejects.toMatchObject({ code: 'EPERM' });
  });

  test('returns null (does not throw) when the EPUB file is simply missing', async () => {
    mockStat.mockRejectedValue(Object.assign(new Error('no such file'), { code: 'ENOENT' }));

    const result = await extractBookCover(coverBook());

    expect(result).toBeNull();
  });

  test('isEpubPermissionError flags EPERM/EACCES only', () => {
    expect(isEpubPermissionError({ code: 'EPERM' })).toBe(true);
    expect(isEpubPermissionError({ code: 'EACCES' })).toBe(true);
    expect(isEpubPermissionError({ code: 'ENOENT' })).toBe(false);
    expect(isEpubPermissionError(null)).toBe(false);
  });
});
