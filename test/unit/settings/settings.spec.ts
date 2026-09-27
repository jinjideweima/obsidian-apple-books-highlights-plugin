import * as obsidian from 'obsidian';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type IBookHighlightsPlugin from '../../../main';
import { defaultTemplate, defaultPluginSettings, IBookHighlightsSettingTab } from '../../../src/settings';
import { createMockElement, Setting } from '../../mocks/obsidian';

describe('Default settings', () => {
  test('Should check that default settings are defined', () => {
    expect(defaultPluginSettings).toBeDefined();
    expect(defaultTemplate).toBeDefined();
  });

  test('Should check that default settings have the expected properties', () => {
    expect(defaultPluginSettings).toHaveProperty('highlightsFolder');
    expect(defaultPluginSettings).toHaveProperty('backup');
    expect(defaultPluginSettings).toHaveProperty('importOnStart');
    expect(defaultPluginSettings).not.toHaveProperty('highlightsSortingCriterion');
    expect(defaultPluginSettings).not.toHaveProperty('keepMeSectionOpeningDelimiter');
    expect(defaultPluginSettings).toHaveProperty('template');
    expect(defaultPluginSettings).toHaveProperty('filenameTemplate');
  });

  test('Should check that default settings have the expected default values', () => {
    expect(defaultPluginSettings.highlightsFolder).toBe('ibooks-highlights');
    expect(defaultPluginSettings.backup).toBe(false);
    expect(defaultPluginSettings.importOnStart).toBe(false);
    expect(defaultPluginSettings.template).toBe(defaultTemplate);
    expect(defaultPluginSettings.filenameTemplate).toBe('{{{bookTitle}}} - {{{bookAuthor}}}');
  });

  test('Should check that default template contains the expected variables with proper escaping', () => {
    const expectedVariables = [
      '{{{yaml bookTitle}}}',
      '{{bookId}}',
      '{{{yaml bookAuthor}}}',
      '{{annotations.length}}',
      '{{#each annotations}}',
      '{{displayIndex @index}}',
      'book_id: {{bookId}}',
      '{{/each}}',
    ];

    expectedVariables.forEach((variable) => {
      expect(defaultTemplate).toContain(variable);
    });
  });
});

describe('Settings tab', () => {
  test('Should check that settings tab can be instantiated', () => {
    const mockApp = {} as obsidian.App;
    const mockPlugin = { settings: { ...defaultPluginSettings }, saveSettings: vi.fn() } as unknown as IBookHighlightsPlugin;
    const settingsTab = new IBookHighlightsSettingTab(mockApp, mockPlugin);

    expect(settingsTab).toBeInstanceOf(IBookHighlightsSettingTab);
    expect(settingsTab.plugin).toBe(mockPlugin);
  });

  test('Should check that settings tab registers all the expected settings', () => {
    const mockApp = {} as obsidian.App;
    const mockPlugin = { settings: { ...defaultPluginSettings }, saveSettings: vi.fn() } as unknown as IBookHighlightsPlugin;
    const settingsTab = new IBookHighlightsSettingTab(mockApp, mockPlugin);
    const mockContainerEl = createMockElement();
    settingsTab.containerEl = mockContainerEl as unknown as HTMLElement;

    const spies = [
      vi.spyOn(settingsTab, 'addHighlightsFolderSetting'),
      vi.spyOn(settingsTab, 'addImportOnStartSetting'),
      vi.spyOn(settingsTab, 'addBackupSetting'),
      vi.spyOn(settingsTab, 'addBackupRetentionSetting'),
      vi.spyOn(settingsTab, 'addReviewNewPerDaySetting'),
      vi.spyOn(settingsTab, 'addTemplateSetting'),
      vi.spyOn(settingsTab, 'addFilenameTemplateSetting'),
      vi.spyOn(settingsTab, 'addResetTemplateSetting'),
      vi.spyOn(settingsTab, 'addCredits'),
    ];

    settingsTab.display();

    spies.forEach((spy) => expect(spy).toHaveBeenCalledWith(mockContainerEl));
  });
});

describe('Settings tab UI interaction', () => {
  let settingsTab: IBookHighlightsSettingTab;
  let mockPlugin: { settings: typeof defaultPluginSettings; saveSettings: ReturnType<typeof vi.fn> };
  let containerEl: ReturnType<typeof createMockElement>;

  beforeEach(() => {
    Setting.instances.length = 0;
    mockPlugin = { settings: { ...defaultPluginSettings }, saveSettings: vi.fn() };
    settingsTab = new IBookHighlightsSettingTab({} as obsidian.App, mockPlugin as unknown as IBookHighlightsPlugin);
    containerEl = createMockElement();
    settingsTab.containerEl = containerEl as unknown as HTMLElement;
  });

  const lastSetting = () => Setting.instances.at(-1)!;

  test('Changing the highlights folder updates and persists the setting', async () => {
    settingsTab.addHighlightsFolderSetting(containerEl as unknown as HTMLElement);

    await (lastSetting().components[0] as any).change('99 Sources/Books');

    expect(mockPlugin.settings.highlightsFolder).toBe('99 Sources/Books');
    expect(mockPlugin.saveSettings).toHaveBeenCalled();
  });

  test('Clearing the highlights folder flags a validation error and does not persist', async () => {
    settingsTab.addHighlightsFolderSetting(containerEl as unknown as HTMLElement);
    const setting = lastSetting();

    await (setting.components[0] as any).change('');

    expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
    expect(setting.controlEl.hasClass('setting-error')).toBe(true);
  });

  test('Toggling import-on-start persists the new value', async () => {
    settingsTab.addImportOnStartSetting(containerEl as unknown as HTMLElement);

    await (lastSetting().components[0] as any).change(true);

    expect(mockPlugin.settings.importOnStart).toBe(true);
    expect(mockPlugin.saveSettings).toHaveBeenCalled();
  });

  test('Choosing a backup retention persists it as a number', async () => {
    expect(defaultPluginSettings.backupRetention).toBe(0);
    settingsTab.addBackupRetentionSetting(containerEl as unknown as HTMLElement);

    await (lastSetting().components[0] as any).change('5');

    expect(mockPlugin.settings.backupRetention).toBe(5);
    expect(mockPlugin.saveSettings).toHaveBeenCalled();
  });

  test('Choosing the daily new highlight count persists it as a number', async () => {
    expect(defaultPluginSettings.reviewNewPerDay).toBe(10);
    settingsTab.addReviewNewPerDaySetting(containerEl as unknown as HTMLElement);

    await (lastSetting().components[0] as any).change('20');

    expect(mockPlugin.settings.reviewNewPerDay).toBe(20);
  });

  test('Emptying the template field falls back to the default template', async () => {
    mockPlugin.settings.template = 'a custom template';
    settingsTab.addTemplateSetting(containerEl as unknown as HTMLElement);

    await (lastSetting().components[0] as any).change('');

    expect(mockPlugin.settings.template).toBe(defaultTemplate);
  });

  test('Emptying the filename template falls back to the default filename template', async () => {
    mockPlugin.settings.filenameTemplate = '{{{bookTitle}}} - {{{bookAuthor}}}';
    settingsTab.addFilenameTemplateSetting(containerEl as unknown as HTMLElement);

    await (lastSetting().components[0] as any).change('');

    expect(mockPlugin.settings.filenameTemplate).toBe(defaultPluginSettings.filenameTemplate);
  });

  test('Reset template button restores the default template and re-renders', async () => {
    mockPlugin.settings.template = 'a custom template';
    const displaySpy = vi.spyOn(settingsTab, 'display').mockImplementation(() => {});
    settingsTab.addResetTemplateSetting(containerEl as unknown as HTMLElement);

    await lastSetting().buttons()[0].click();

    expect(mockPlugin.settings.template).toBe(defaultTemplate);
    expect(mockPlugin.saveSettings).toHaveBeenCalled();
    expect(displaySpy).toHaveBeenCalled();
  });
});
