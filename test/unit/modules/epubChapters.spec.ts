import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { IBookWithAnnotations } from '../../../src/types';
import { inferMissingChapters } from '../../../src/modules/epubChapters';

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
