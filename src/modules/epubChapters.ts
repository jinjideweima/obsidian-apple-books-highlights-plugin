import type { IAnnotation, IBookWithAnnotations } from '../types';
import { requireNodeModule } from '../utils/nodeModules';

interface TocEntry {
  href: string;
  label: string;
}

interface EpubFileReader {
  readText: (relativePath: string) => Promise<string>;
  readBinary: (relativePath: string) => Promise<Uint8Array>;
  listFiles: () => Promise<string[]>;
}

interface BookEpubContext {
  reader: EpubFileReader;
  opf: string;
  opfDir: string;
  manifestItems: Map<string, string>;
  spineHrefs: string[];
}

const textDecoder = new TextDecoder('utf-8');

const normalizePath = (value: string): string => decodeURIComponent(value.split('#')[0]).replace(/^\.?\//, '');

const dirname = (value: string): string => {
  const lastSlashIndex = value.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return '';
  }

  return value.slice(0, lastSlashIndex);
};

const joinPath = (...parts: string[]): string => {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\.?\//, '');
};

const stripXml = (value: string): string => {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeText = (value: string): string => stripXml(value).replace(/\s+/g, '');

const getTextBlocks = (html: string): string[] => {
  const blocks: string[] = [];
  const blockRegex = /<(p|blockquote|li)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(html))) {
    const text = stripXml(blockMatch[0]);

    if (text) {
      blocks.push(text);
    }
  }

  return blocks.length > 0 ? blocks : [stripXml(html)].filter(Boolean);
};

const getAttr = (tag: string, attrName: string): string => {
  const attrMatch = tag.match(new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, 'i'));

  return attrMatch?.[1] || '';
};

const createDirectoryReader = async (rootPath: string): Promise<EpubFileReader> => {
  const fs = requireNodeModule<typeof import('fs/promises')>('fs/promises');
  const path = requireNodeModule<typeof import('path')>('path');

  const listFiles = async (directory: string, prefix = ''): Promise<string[]> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const relativePath = joinPath(prefix, entry.name);
        const absolutePath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          return listFiles(absolutePath, relativePath);
        }

        return [relativePath];
      }),
    );

    return files.flat();
  };

  return {
    readText: async (relativePath: string) => fs.readFile(path.join(rootPath, relativePath), 'utf8'),
    readBinary: async (relativePath: string) => fs.readFile(path.join(rootPath, relativePath)),
    listFiles: async () => listFiles(rootPath),
  };
};

const createZipReader = async (rootPath: string): Promise<EpubFileReader> => {
  const fs = requireNodeModule<typeof import('fs/promises')>('fs/promises');
  const { inflateRawSync } = requireNodeModule<typeof import('zlib')>('zlib');
  const buffer = await fs.readFile(rootPath);
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.subarray(offset + 30, offset + 30 + fileNameLength).toString('utf8');
    const dataStart = offset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    const compressedData = buffer.subarray(dataStart, dataEnd);

    if (!fileName.endsWith('/')) {
      if (compressionMethod === 0) {
        entries.set(fileName, compressedData);
      } else if (compressionMethod === 8) {
        const data = inflateRawSync(compressedData, { finishFlush: 2 });
        entries.set(fileName, uncompressedSize ? data.subarray(0, uncompressedSize) : data);
      }
    }

    offset = dataEnd;
  }

  return {
    readText: async (relativePath: string) => {
      const content = entries.get(relativePath);

      if (!content) {
        throw new Error(`找不到 EPUB 文件：${relativePath}`);
      }

      return textDecoder.decode(content);
    },
    readBinary: async (relativePath: string) => {
      const content = entries.get(relativePath);

      if (!content) {
        throw new Error(`找不到 EPUB 文件：${relativePath}`);
      }

      return content;
    },
    listFiles: async () => Array.from(entries.keys()),
  };
};

const createReader = async (bookPath: string): Promise<EpubFileReader | null> => {
  if (!bookPath) {
    return null;
  }

  try {
    const fs = requireNodeModule<typeof import('fs/promises')>('fs/promises');
    const stat = await fs.stat(bookPath);

    return stat.isDirectory() ? createDirectoryReader(bookPath) : createZipReader(bookPath);
  } catch (error) {
    console.warn(`Apple Books Knowledge Cards: 无法读取 EPUB：${bookPath}`, error);
    return null;
  }
};

const findOpfPath = async (reader: EpubFileReader): Promise<string> => {
  try {
    const containerXml = await reader.readText('META-INF/container.xml');
    const rootfileTag = containerXml.match(/<rootfile\b[^>]*>/i)?.[0] || '';
    const opfPath = getAttr(rootfileTag, 'full-path');

    if (opfPath) {
      return normalizePath(opfPath);
    }
  } catch {
    // Fall through to file scan.
  }

  const files = await reader.listFiles();

  return files.find((file) => file.toLowerCase().endsWith('.opf')) || '';
};

const getManifestItems = (opf: string): Map<string, string> => {
  const items = new Map<string, string>();
  const itemRegex = /<item\b[^>]*>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(opf))) {
    const tag = itemMatch[0];
    const id = getAttr(tag, 'id');
    const href = getAttr(tag, 'href');

    if (id && href) {
      items.set(id, href);
    }
  }

  return items;
};

const findCoverImageHref = (opf: string): string => {
  // EPUB 2 style: <meta name="cover" content="cover-image-id"/>
  const coverMetaTag = opf.match(/<meta\b[^>]*\bname\s*=\s*["']cover["'][^>]*>/i)?.[0] || '';
  const coverIdFromMeta = coverMetaTag ? getAttr(coverMetaTag, 'content') : '';

  let epub3Href = '';
  let metaHref = '';
  let fallbackHref = '';

  const itemRegex = /<item\b[^>]*>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(opf))) {
    const tag = itemMatch[0];
    const href = getAttr(tag, 'href');

    if (!href) {
      continue;
    }

    const id = getAttr(tag, 'id');
    const mediaType = getAttr(tag, 'media-type');
    const properties = getAttr(tag, 'properties');

    // EPUB 3 style: the manifest item carries properties="cover-image" (highest priority).
    if (/\bcover-image\b/i.test(properties)) {
      epub3Href = href;
      break;
    }

    // EPUB 2 style: the manifest item whose id matches the cover meta.
    if (coverIdFromMeta && id === coverIdFromMeta) {
      metaHref = href;
    }

    // Fallback: any image whose id or href hints at being a cover.
    if (!fallbackHref && /^image\//i.test(mediaType) && /cover/i.test(`${id} ${href}`)) {
      fallbackHref = href;
    }
  }

  return epub3Href || metaHref || fallbackHref || '';
};

const getSpineHrefs = (opf: string, manifestItems: Map<string, string>, opfDir: string): string[] => {
  const spine = opf.match(/<spine\b[\s\S]*?<\/spine>/i)?.[0] || '';
  const itemrefRegex = /<itemref\b[^>]*>/gi;
  const hrefs: string[] = [];
  let itemrefMatch: RegExpExecArray | null;

  while ((itemrefMatch = itemrefRegex.exec(spine))) {
    const idref = getAttr(itemrefMatch[0], 'idref');
    const href = idref ? manifestItems.get(idref) : '';

    if (href) {
      hrefs.push(normalizePath(joinPath(opfDir, href)));
    }
  }

  return hrefs;
};

const parseNcx = (ncx: string, ncxDir: string): TocEntry[] => {
  const entries: TocEntry[] = [];
  const navPointRegex = /<navPoint\b[\s\S]*?<\/navPoint>/gi;
  let navPointMatch: RegExpExecArray | null;

  while ((navPointMatch = navPointRegex.exec(ncx))) {
    const navPoint = navPointMatch[0];
    const label = stripXml(navPoint.match(/<navLabel\b[\s\S]*?<\/navLabel>/i)?.[0] || '');
    const contentTag = navPoint.match(/<content\b[^>]*>/i)?.[0] || '';
    const src = getAttr(contentTag, 'src');

    if (label && src) {
      entries.push({ href: normalizePath(joinPath(ncxDir, src)), label });
    }
  }

  return entries;
};

const parseNavDocument = (navDocument: string, navDir: string): TocEntry[] => {
  const entries: TocEntry[] = [];
  const linkRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkRegex.exec(navDocument))) {
    const href = linkMatch[1];
    const label = stripXml(linkMatch[2]);

    if (href && label) {
      entries.push({ href: normalizePath(joinPath(navDir, href)), label });
    }
  }

  return entries;
};

const getTocEntries = async (
  reader: EpubFileReader,
  opf: string,
  manifestItems: Map<string, string>,
  opfDir: string,
): Promise<TocEntry[]> => {
  const ncxItem = Array.from(manifestItems.values()).find((href) => href.toLowerCase().endsWith('.ncx'));

  if (ncxItem) {
    const ncxPath = normalizePath(joinPath(opfDir, ncxItem));
    const ncx = await reader.readText(ncxPath);
    const entries = parseNcx(ncx, dirname(ncxPath));

    if (entries.length > 0) {
      return entries;
    }
  }

  const navItem = Array.from(manifestItems.values()).find((href) => /\.(xhtml|html)$/i.test(href) && /toc|nav/i.test(href));

  if (navItem) {
    const navPath = normalizePath(joinPath(opfDir, navItem));
    const navDocument = await reader.readText(navPath);
    const entries = parseNavDocument(navDocument, dirname(navPath));

    if (entries.length > 0) {
      return entries;
    }
  }

  return parseNavDocument(opf, opfDir);
};

const buildChapterMap = (spineHrefs: string[], tocEntries: TocEntry[]): Map<string, string> => {
  const tocByHref = new Map<string, string>();

  for (const entry of tocEntries) {
    tocByHref.set(normalizePath(entry.href), entry.label);
  }

  const chapterMap = new Map<string, string>();
  let currentChapter = '';

  for (const href of spineHrefs) {
    const label = tocByHref.get(href);

    if (label) {
      currentChapter = label;
    }

    if (currentChapter) {
      chapterMap.set(href, currentChapter);
    }
  }

  for (const [href, label] of tocByHref) {
    chapterMap.set(href, label);
  }

  return chapterMap;
};

const getChapterHrefFromCfi = (location: string, spineHrefs: string[]): string => {
  const idrefMatch = location.match(/\/6\/\d+\[([^\]]+)\]/);
  const idref = idrefMatch?.[1] || '';

  if (idref) {
    const exactHref = spineHrefs.find((href) => {
      const filename = href.split('/').pop() || '';
      const basename = filename.replace(/\.[^.]+$/, '');

      return basename === idref || filename === idref;
    });

    if (exactHref) {
      return exactHref;
    }
  }

  const spineStep = Number(location.match(/epubcfi\(\/6\/(\d+)/)?.[1] || 0);
  const spineIndex = spineStep > 0 ? Math.floor(spineStep / 2) - 1 : -1;

  return spineIndex >= 0 ? spineHrefs[spineIndex] || '' : '';
};

const getBookEpubContext = async (book: IBookWithAnnotations): Promise<BookEpubContext | null> => {
  const reader = await createReader(book.bookPath || '');

  if (!reader) {
    return null;
  }

  const opfPath = await findOpfPath(reader);

  if (!opfPath) {
    return null;
  }

  const opf = await reader.readText(opfPath);
  const opfDir = dirname(opfPath);
  const manifestItems = getManifestItems(opf);
  const spineHrefs = getSpineHrefs(opf, manifestItems, opfDir);

  return { reader, opf, opfDir, manifestItems, spineHrefs };
};

const buildBookChapterMap = async (context: BookEpubContext, book: IBookWithAnnotations): Promise<Map<string, string>> => {
  const spineHrefs = context.spineHrefs;
  const tocEntries = await getTocEntries(context.reader, context.opf, context.manifestItems, context.opfDir);
  const chapterMap = buildChapterMap(spineHrefs, tocEntries);
  const resolvedChapters = new Map<string, string>();

  for (const annotation of book.annotations || []) {
    const href = getChapterHrefFromCfi(annotation.highlightLocation, spineHrefs);
    const chapter = href ? chapterMap.get(href) || '' : '';

    if (chapter) {
      resolvedChapters.set(annotation.highlightLocation, chapter);
    }
  }

  return resolvedChapters;
};

const shouldResolveParagraphContext = (annotation: IAnnotation): boolean => {
  const contextualText = normalizeText(annotation.contextualText || '');
  const highlight = normalizeText(annotation.highlight || '');

  return Boolean(highlight) && (!contextualText || contextualText === highlight);
};

const findParagraphContext = async (context: BookEpubContext, annotation: IAnnotation, htmlCache: Map<string, string>): Promise<string> => {
  const href = getChapterHrefFromCfi(annotation.highlightLocation, context.spineHrefs);

  if (!href) {
    return '';
  }

  if (!htmlCache.has(href)) {
    htmlCache.set(href, await context.reader.readText(href));
  }

  const html = htmlCache.get(href)!;
  const normalizedHighlight = normalizeText(annotation.highlight);

  for (const block of getTextBlocks(html)) {
    const normalizedBlock = normalizeText(block);

    if (normalizedBlock.includes(normalizedHighlight) && normalizedBlock !== normalizedHighlight) {
      return block;
    }
  }

  return '';
};

const inferMissingParagraphContexts = async (context: BookEpubContext, book: IBookWithAnnotations): Promise<void> => {
  if (!book.annotations.some(shouldResolveParagraphContext)) {
    return;
  }

  const htmlCache = new Map<string, string>();

  for (const annotation of book.annotations) {
    if (!shouldResolveParagraphContext(annotation)) {
      continue;
    }

    const paragraphContext = await findParagraphContext(context, annotation, htmlCache);

    if (paragraphContext) {
      annotation.contextualText = paragraphContext;
    }
  }
};

export const inferMissingChapters = async (books: IBookWithAnnotations[]): Promise<void> => {
  await Promise.all(
    books.map(async (book) => {
      try {
        const context = await getBookEpubContext(book);

        if (!context) {
          return;
        }

        if (book.annotations.some((annotation) => !annotation.chapter)) {
          const chapterMap = await buildBookChapterMap(context, book);

          for (const annotation of book.annotations) {
            annotation.chapter = annotation.chapter || chapterMap.get(annotation.highlightLocation) || '';
          }
        }

        await inferMissingParagraphContexts(context, book);
      } catch (error) {
        console.warn(`Apple Books Knowledge Cards: 无法补全 EPUB 元数据：${book.bookTitle}`, error);
      }
    }),
  );
};

export const extractBookCover = async (book: IBookWithAnnotations): Promise<{ data: Uint8Array; extension: string } | null> => {
  try {
    const context = await getBookEpubContext(book);

    if (!context) {
      return null;
    }

    const coverHref = findCoverImageHref(context.opf);

    if (!coverHref) {
      return null;
    }

    const coverPath = normalizePath(joinPath(context.opfDir, coverHref));
    const data = await context.reader.readBinary(coverPath);
    const extension = (coverHref.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';

    return { data, extension };
  } catch (error) {
    console.warn(`Apple Books Knowledge Cards: 无法提取封面：${book.bookTitle}`, error);
    return null;
  }
};
