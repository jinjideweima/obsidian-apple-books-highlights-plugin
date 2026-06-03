import { beforeEach, describe, expect, test } from 'vitest';

declare module 'vitest' {
  interface TestContext {
    manifest: {
      id: string;
      name: string;
      description: string;
      minAppVersion: string;
      version: string;
      author: string;
      authorUrl: string;
    };
  }
}

import * as packageJson from '../package.json';

describe('Plugin information', () => {
  beforeEach((context) => {
    context.manifest = require('../manifest.json');
  });

  test('Check that versions in package.json and manifest.json match', ({ manifest }) => {
    expect(packageJson.version).toEqual(manifest.version);
  });

  test('check minimum Obsidian version', ({ manifest }) => {
    expect(manifest.minAppVersion).toEqual('1.5.7');
  });

  test('Check plugin id, name and description', ({ manifest }) => {
    expect(manifest.id).toEqual('apple-books-knowledge-cards');
    expect(manifest.name).toEqual('Apple Books Knowledge Cards');
    expect(manifest.description).toEqual('Import Apple Books highlights as structured notes and knowledge cards.');
  });

  test('Check author information', ({ manifest }) => {
    expect(packageJson.author).toEqual(manifest.author);
    expect(manifest.authorUrl).toEqual('https://github.com/jinjideweima');
  });
});
