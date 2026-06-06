import type { IBook, IAnnotation, IHighlightsSortingCriterion } from '../types';
import { executeDbQuery } from '../utils/databaseQuery';
import { requireNodeModule } from '../utils/nodeModules';
import { sortByLocation } from './annotationsProcessing';

const getEnvValue = (key: string): string | undefined => {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
};

export const getBooksDbPath = (): string => {
  const os = requireNodeModule<typeof import('os')>('os');
  const path = requireNodeModule<typeof import('path')>('path');

  return (
    getEnvValue('BOOKS_DB_PATH') ||
    path.join(os.homedir(), 'Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary/BKLibrary-1-091020131601.sqlite')
  );
};

export const getAnnotationsDbPath = (): string => {
  const os = requireNodeModule<typeof import('os')>('os');
  const path = requireNodeModule<typeof import('path')>('path');

  return (
    getEnvValue('ANNOTATIONS_DB_PATH') ||
    path.join(os.homedir(), 'Library/Containers/com.apple.iBooksX/Data/Documents/AEAnnotation/AEAnnotation_v10312011_1727_local.sqlite')
  );
};

const getOptionalBookPathSelect = async (dbPath: string): Promise<string> => {
  try {
    const columns = await executeDbQuery<Array<{ name: string }>>(dbPath, 'PRAGMA table_info(ZBKLIBRARYASSET)');
    const hasPathColumn = columns.some((column) => column.name === 'ZPATH');

    return hasPathColumn ? 'ZPATH as bookPath' : "'' as bookPath";
  } catch {
    return "'' as bookPath";
  }
};

export const getBooks = async (): Promise<IBook[]> => {
  const BOOKS_DB_PATH = getBooksDbPath();
  const bookPathSelect = await getOptionalBookPathSelect(BOOKS_DB_PATH);

  const dbQuery = `SELECT
  ZASSETID as bookId,
  ZTITLE as bookTitle,
  ZAUTHOR as bookAuthor,
  ZGENRE as bookGenre,
  ZLANGUAGE as bookLanguage,
  ZLASTOPENDATE as bookLastOpenedDate,
  ZDATEFINISHED as bookFinishedDate,
  ZCOVERURL as bookCoverUrl,
  ${bookPathSelect}
  FROM ZBKLIBRARYASSET
  WHERE ZTITLE IS NOT NULL`;

  const books = await dbRequest(BOOKS_DB_PATH, dbQuery);

  if (books.length === 0) {
    throw new Error('No books found. Looks like your Apple Books library is empty.');
  }

  return books;
};

export const getAnnotations = async (sortingCriterion: IHighlightsSortingCriterion): Promise<IAnnotation[]> => {
  const HIGHLIGHTS_DB_PATH = getAnnotationsDbPath();

  const baseQuery = `SELECT
  ZANNOTATIONASSETID as assetId,
  ZFUTUREPROOFING5 as chapter,
  ZANNOTATIONREPRESENTATIVETEXT as contextualText,
  ZANNOTATIONSELECTEDTEXT as highlight,
  ZANNOTATIONNOTE as note,
  ZANNOTATIONLOCATION as highlightLocation,
  ZANNOTATIONSTYLE as highlightStyle,
  ZANNOTATIONCREATIONDATE as highlightCreationDate,
  ZANNOTATIONMODIFICATIONDATE as highlightModificationDate
  FROM ZAEANNOTATION
  WHERE ZANNOTATIONDELETED IS 0
  AND ZANNOTATIONSELECTEDTEXT IS NOT NULL`;

  const sortingOptionsMap: Record<IHighlightsSortingCriterion, string> = {
    creationDateOldToNew: 'ORDER BY ZANNOTATIONCREATIONDATE',
    creationDateNewToOld: 'ORDER BY ZANNOTATIONCREATIONDATE DESC',
    lastModifiedDateOldToNew: 'ORDER BY ZANNOTATIONMODIFICATIONDATE',
    lastModifiedDateNewToOld: 'ORDER BY ZANNOTATIONMODIFICATIONDATE DESC',
    book: '',
  };

  const sortingQueryPart = sortingOptionsMap[sortingCriterion];

  const fullQuery = baseQuery + ' ' + sortingQueryPart;

  const retrievedAnnotations = await annotationsRequest(HIGHLIGHTS_DB_PATH, fullQuery);

  if (retrievedAnnotations.length === 0) {
    throw new Error('No highlights found. Make sure you made some highlights in your Apple Books.');
  }

  if (sortingCriterion !== 'book') {
    return retrievedAnnotations;
  } else {
    return sortByLocation(retrievedAnnotations);
  }
};

export const dbRequest = async (dbPath: string, sqlQuery: string): Promise<IBook[]> => {
  return executeDbQuery<IBook[]>(dbPath, sqlQuery);
};

export const annotationsRequest = async (dbPath: string, sqlQuery: string): Promise<IAnnotation[]> => {
  return executeDbQuery<IAnnotation[]>(dbPath, sqlQuery);
};
