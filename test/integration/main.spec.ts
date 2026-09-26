import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import IBookHighlightsPlugin from '../../main';

describe('Editor events', () => {
  let plugin: IBookHighlightsPlugin;

  const mockLoadData = vi.fn();
  const mockSaveData = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    plugin = new IBookHighlightsPlugin({} as any, {} as any);
    plugin.loadData = mockLoadData;
    plugin.saveData = mockSaveData;
    plugin.manifest = { name: 'Apple Books Test Mock' } as any;
    plugin.app = {
      vault: {
        adapter: { exists: vi.fn().mockResolvedValue(false) },
        getFolderByPath: vi.fn().mockReturnValue({}),
        getFileByPath: vi.fn(),
        createFolder: vi.fn(),
        create: vi.fn(),
      },
      workspace: {
        iterateAllLeaves: vi.fn(),
        onLayoutReady: vi.fn().mockImplementation(async (cb: () => Promise<void> | void) => await cb()),
        on: vi.fn(),
      },
    } as any;

    mockLoadData.mockResolvedValueOnce({});
    const onMock = plugin.app.workspace.on as any;
    await plugin.onload();

    // The legacy keep-me section listener wrote data.json on every edit; imports preserve the whole body now.
    expect(onMock).not.toHaveBeenCalledWith('quick-preview', expect.any(Function));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('Does not persist settings while notes are edited', () => {
    expect(mockSaveData).not.toHaveBeenCalled();
  });
});
