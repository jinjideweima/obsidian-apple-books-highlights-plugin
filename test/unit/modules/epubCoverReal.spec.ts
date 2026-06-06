import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// Forward the plugin's node-module loader to the REAL fs/path/zlib so this test
// exercises the actual ZIP reader against an actual deflate-compressed .epub on disk
// (the other epub test uses a fake directory-based fs).
vi.mock('../../../src/utils/nodeModules', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const zlib = await import('node:zlib');

  return {
    requireNodeModule: (name: string) => {
      if (name === 'fs/promises') return fs;
      if (name === 'path') return path;
      if (name === 'zlib') return zlib;
      throw new Error(`unexpected module ${name}`);
    },
  };
});

import { extractBookCover } from '../../../src/modules/epubChapters';

// Build a minimal but real ZIP (local file entries, deflate-compressed) — exactly the
// structure the hand-written reader walks. crc32 is left 0 because the reader doesn't verify it.
const zipEntry = (name: string, data: Buffer): Buffer => {
  const compressed = deflateRawSync(data);
  const nameBuf = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // flags (no data descriptor)
  header.writeUInt16LE(8, 8); // compression method = deflate
  header.writeUInt32LE(0, 14); // crc32 (not validated by the reader)
  header.writeUInt32LE(compressed.length, 18); // compressed size
  header.writeUInt32LE(data.length, 22); // uncompressed size
  header.writeUInt16LE(nameBuf.length, 26); // file name length
  return Buffer.concat([header, nameBuf, compressed]);
};

const buildEpub = (files: Array<[string, Buffer]>): Buffer => Buffer.concat(files.map(([name, data]) => zipEntry(name, data)));

const makeBook = (bookPath: string): any => ({
  bookId: 'B1',
  bookTitle: 'T',
  bookAuthor: 'A',
  bookGenre: '',
  bookLanguage: 'zh',
  bookLastOpenedDate: 0,
  bookFinishedDate: null,
  bookCoverUrl: '',
  bookPath,
  annotations: [],
});

describe('extractBookCover from a real deflate-compressed .epub file', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'abkc-epub-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('EPUB 3: extracts the properties="cover-image" item from a zipped epub', async () => {
    const cover = Buffer.from('REAL-EPUB3-JPEG-COVER-BYTES');
    const epubPath = join(dir, 'epub3.epub');
    writeFileSync(
      epubPath,
      buildEpub([
        ['META-INF/container.xml', Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')],
        [
          'OEBPS/content.opf',
          Buffer.from(
            '<package><manifest><item id="cv" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/></manifest><spine></spine></package>',
          ),
        ],
        ['OEBPS/images/cover.jpg', cover],
      ]),
    );

    const result = await extractBookCover(makeBook(epubPath));

    expect(result).not.toBeNull();
    expect(result!.extension).toBe('jpg');
    expect(Buffer.from(result!.data).equals(cover)).toBe(true);
  });

  test('EPUB 2: extracts the cover referenced by <meta name="cover"> from a zipped epub', async () => {
    const cover = Buffer.from('REAL-EPUB2-PNG-COVER-BYTES');
    const epubPath = join(dir, 'epub2.epub');
    writeFileSync(
      epubPath,
      buildEpub([
        ['META-INF/container.xml', Buffer.from('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>')],
        [
          'content.opf',
          Buffer.from(
            '<package><metadata><meta name="cover" content="cv"/></metadata><manifest><item id="cv" href="cover.png" media-type="image/png"/></manifest><spine></spine></package>',
          ),
        ],
        ['cover.png', cover],
      ]),
    );

    const result = await extractBookCover(makeBook(epubPath));

    expect(result!.extension).toBe('png');
    expect(Buffer.from(result!.data).equals(cover)).toBe(true);
  });
});
