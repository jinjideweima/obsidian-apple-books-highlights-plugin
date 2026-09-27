import { parseYaml } from 'obsidian';
import { expect, test, vi } from 'vitest';
import { LIBRARY_BASE_CONTENT, LIBRARY_CARDS_CSS, markLibraryLeaves, migrateLibraryBase } from '../../../src/views/libraryBase';
import { memoryVault } from '../../mocks/memoryVault';
test('Base syntax parses and all generated CSS selectors are scoped', () => {
  expect(parseYaml(LIBRARY_BASE_CONTENT).views).toHaveLength(6);
  expect(LIBRARY_CARDS_CSS).not.toMatch(/^\.bases/gm);
  expect(LIBRARY_CARDS_CSS).toContain('.abkc-library-host .bases-view');
});
test('only the plugin library leaf receives cover styling', () => {
  const own = { file: { path: 'Apple Books 图书馆.base' }, containerEl: { toggleClass: vi.fn() } };
  const other = { file: { path: '我的工作.base' }, containerEl: { toggleClass: vi.fn() } };
  markLibraryLeaves({ app: { workspace: { iterateAllLeaves: (cb: any) => [own, other].forEach((view) => cb({ view })) } } } as any);
  expect(own.containerEl.toggleClass).toHaveBeenCalledWith('abkc-library-host', true);
  expect(other.containerEl.toggleClass).toHaveBeenCalledWith('abkc-library-host', false);
});
test('legacy Base receives backup filter without changing custom view text', async () => {
  const env = memoryVault();
  const path = 'Apple Books 图书馆.base';
  env.put(path, 'filters:\n  and:\n    - type == "book"\nviews:\n  - name: 我修改过的视图\n    type: table\n');
  await migrateLibraryBase({ app: env.app } as any);
  expect(env.files.get(path)).toContain('!file.path.contains("-bk-")');
  expect(env.files.get(path)).toContain('我修改过的视图');
  const first = env.files.get(path);
  await migrateLibraryBase({ app: env.app } as any);
  expect(env.files.get(path)).toBe(first);
});
