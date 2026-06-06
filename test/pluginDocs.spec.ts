import fs from 'fs/promises';
import path from 'path';
import { describe, expect, test } from 'vitest';
import type { IBook, IAnnotation } from '../src/types';

describe('Plugin documentation', () => {
  test('Check that README.md exists', () => {
    expect(path.join(process.cwd(), 'README.md')).toBeDefined();
  });

  test('Check that templates doc contains all IBook and IAnnotation variables', async () => {
    const allowedBookVariables = {
      bookId: 'string',
      bookTitle: 'string',
      bookAuthor: 'string',
      bookGenre: 'string',
      bookLanguage: 'string',
      bookLastOpenedDate: 1234567890,
      bookFinishedDate: 1234567890,
      bookCoverUrl: 'string',
    } as IBook;

    const allowedAnnotationVariables = {
      assetId: 'string',
      chapter: 'string',
      contextualText: 'string',
      highlight: 'string',
      note: 'string | null',
      highlightLocation: 'string',
      highlightStyle: 0,
      highlightCreationDate: 1234567890,
      highlightModificationDate: 1234567890,
    } as IAnnotation;

    const allAllowedVariables = { ...allowedBookVariables, annotations: [allowedAnnotationVariables], ...allowedAnnotationVariables };

    const customizationDocPath = path.join(process.cwd(), 'docs', 'customization', 'templates-and-variables.md');
    const customizationDocContent = await fs.readFile(customizationDocPath, 'utf-8');

    // Extract all Handlebars variable references from the doc (both {{ }} and {{{ }}} forms)
    const listedVariablesInDoc = customizationDocContent.match(/`\{{2,3}(\w+)\}{2,3}`/gm) || [];
    const uniqueVariableNames = new Set(listedVariablesInDoc.map((v) => v.match(/`\{{2,3}(\w+)\}{2,3}`/)?.[1]).filter(Boolean));

    // Every variable mentioned in the doc should be a valid IBook or IAnnotation field
    for (const variableName of uniqueVariableNames) {
      const isValidVariable = Object.keys(allAllowedVariables).includes(variableName!);
      expect(isValidVariable, `Unknown variable "${variableName}" in docs`).toBeTruthy();
    }

    // All IBook fields should be documented (except bookPath which is internal)
    const bookFields = Object.keys(allowedBookVariables).filter((k) => k !== 'bookPath');
    for (const field of bookFields) {
      expect(uniqueVariableNames.has(field), `IBook field "${field}" missing from docs`).toBeTruthy();
    }
  });
});
