import { vi } from 'vitest';

export const NoticeMock = vi.fn();
export class Notice {
  constructor(...args: any[]) {
    return NoticeMock(...args);
  }
}

// ---------------------------------------------------------------------------
// Lightweight fake of Obsidian's HTMLElement helpers (createEl/createDiv/...).
// Enough to let modal and settings code build a DOM tree we can assert against.
// ---------------------------------------------------------------------------
export interface ElementOptions {
  text?: string;
  cls?: string;
  href?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  attr?: Record<string, string>;
}

export class MockElement {
  tag: string;
  text = '';
  children: MockElement[] = [];
  classes = new Set<string>();
  attrs: Record<string, string> = {};
  listeners: Record<string, Array<(...args: any[]) => void>> = {};

  constructor(tag = 'div', options: ElementOptions = {}) {
    this.tag = tag;
    this.applyOptions(options);
  }

  private applyOptions(options: ElementOptions): void {
    if (options.text !== undefined) this.text = options.text;
    if (options.cls) options.cls.split(/\s+/).forEach((cls) => cls && this.classes.add(cls));
    if (options.href !== undefined) this.attrs.href = options.href;
    if (options.value !== undefined) this.attrs.value = options.value;
    if (options.type !== undefined) this.attrs.type = options.type;
    if (options.placeholder !== undefined) this.attrs.placeholder = options.placeholder;
    if (options.attr) Object.assign(this.attrs, options.attr);
  }

  createEl(tag: string, options: ElementOptions = {}): MockElement {
    const child = new MockElement(tag, options);
    this.children.push(child);
    return child;
  }

  createDiv(options: ElementOptions = {}): MockElement {
    return this.createEl('div', options);
  }

  createSpan(options: ElementOptions = {}): MockElement {
    return this.createEl('span', options);
  }

  appendText(text: string): void {
    this.text += text;
  }

  setText(text: string): void {
    this.text = text;
  }

  empty(): void {
    this.children = [];
    this.text = '';
  }

  addClass(cls: string): void {
    this.classes.add(cls);
  }

  removeClass(cls: string): void {
    this.classes.delete(cls);
  }

  toggleClass(cls: string, on?: boolean): void {
    const shouldAdd = on ?? !this.classes.has(cls);
    if (shouldAdd) this.classes.add(cls);
    else this.classes.delete(cls);
  }

  hasClass(cls: string): boolean {
    return this.classes.has(cls);
  }

  addEventListener(type: string, cb: (...args: any[]) => void): void {
    (this.listeners[type] ||= []).push(cb);
  }

  dispatch(type: string, ...args: any[]): void {
    (this.listeners[type] || []).forEach((cb) => cb(...args));
  }

  /** Recursively collect text from this element and all descendants. */
  collectText(): string {
    return [this.text, ...this.children.map((child) => child.collectText())].filter(Boolean).join(' ');
  }

  /** Recursively collect every element matching a tag. */
  findAll(tag: string): MockElement[] {
    const matches = this.children.flatMap((child) => child.findAll(tag));
    return this.tag === tag ? [this, ...matches] : matches;
  }
}

export const createMockElement = (tag = 'div'): MockElement => new MockElement(tag);

// `createFragment` is a global helper in the Obsidian runtime.
export function createFragment(callback?: (el: MockElement) => void): MockElement {
  const fragment = new MockElement('fragment');
  callback?.(fragment);
  return fragment;
}
(globalThis as any).createFragment = createFragment;

// ---------------------------------------------------------------------------
// Component fakes used by Setting (button/text/toggle/dropdown/textarea).
// ---------------------------------------------------------------------------
export class ButtonComponent {
  buttonText = '';
  cta = false;
  clickHandler: (() => unknown) | null = null;
  setButtonText(text: string): this {
    this.buttonText = text;
    return this;
  }
  setCta(): this {
    this.cta = true;
    return this;
  }
  onClick(handler: () => unknown): this {
    this.clickHandler = handler;
    return this;
  }
  async click(): Promise<void> {
    await this.clickHandler?.();
  }
}

export class TextComponent {
  placeholder = '';
  value = '';
  changeHandler: ((value: string) => unknown) | null = null;
  setPlaceholder(placeholder: string): this {
    this.placeholder = placeholder;
    return this;
  }
  setValue(value: string): this {
    this.value = value;
    return this;
  }
  onChange(handler: (value: string) => unknown): this {
    this.changeHandler = handler;
    return this;
  }
  async change(value: string): Promise<void> {
    this.value = value;
    await this.changeHandler?.(value);
  }
}

export class ToggleComponent {
  value = false;
  changeHandler: ((value: boolean) => unknown) | null = null;
  setValue(value: boolean): this {
    this.value = value;
    return this;
  }
  onChange(handler: (value: boolean) => unknown): this {
    this.changeHandler = handler;
    return this;
  }
  async change(value: boolean): Promise<void> {
    this.value = value;
    await this.changeHandler?.(value);
  }
}

export class DropdownComponent {
  options: Record<string, string> = {};
  value = '';
  changeHandler: ((value: string) => unknown) | null = null;
  addOptions(options: Record<string, string>): this {
    Object.assign(this.options, options);
    return this;
  }
  addOption(value: string, label: string): this {
    this.options[value] = label;
    return this;
  }
  setValue(value: string): this {
    this.value = value;
    return this;
  }
  onChange(handler: (value: string) => unknown): this {
    this.changeHandler = handler;
    return this;
  }
  async change(value: string): Promise<void> {
    this.value = value;
    await this.changeHandler?.(value);
  }
}

export function setIcon(): void {}

export class App {}

export class Setting {
  /** Every Setting created during a test, newest last. Clear between tests. */
  static instances: Setting[] = [];

  containerEl: MockElement;
  controlEl: MockElement = new MockElement('div');
  nameText = '';
  descValue: unknown = '';
  classes: string[] = [];
  components: Array<ButtonComponent | TextComponent | ToggleComponent | DropdownComponent> = [];

  constructor(containerEl: MockElement) {
    this.containerEl = containerEl;
    Setting.instances.push(this);
  }

  setName(name: string): this {
    this.nameText = name;
    return this;
  }
  setDesc(desc: unknown): this {
    this.descValue = desc;
    return this;
  }
  setClass(cls: string): this {
    this.classes.push(cls);
    return this;
  }
  addButton(cb: (button: ButtonComponent) => void): this {
    const button = new ButtonComponent();
    cb(button);
    this.components.push(button);
    return this;
  }
  addText(cb: (text: TextComponent) => void): this {
    const text = new TextComponent();
    cb(text);
    this.components.push(text);
    return this;
  }
  addTextArea(cb: (text: TextComponent) => void): this {
    const text = new TextComponent();
    cb(text);
    this.components.push(text);
    return this;
  }
  addToggle(cb: (toggle: ToggleComponent) => void): this {
    const toggle = new ToggleComponent();
    cb(toggle);
    this.components.push(toggle);
    return this;
  }
  addDropdown(cb: (dropdown: DropdownComponent) => void): this {
    const dropdown = new DropdownComponent();
    cb(dropdown);
    this.components.push(dropdown);
    return this;
  }

  buttons(): ButtonComponent[] {
    return this.components.filter((component): component is ButtonComponent => component instanceof ButtonComponent);
  }
}

export class PluginSettingTab {
  app: App;
  plugin: unknown;
  containerEl: MockElement = new MockElement('div');
  constructor(app: App, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
  }
}

export class Plugin {
  app: App = new App();
  addRibbonIcon() {}
  addCommand() {}
  addSettingTab() {}
  registerView() {}
  registerMarkdownCodeBlockProcessor() {}
  loadData() {
    return {};
  }
  saveData() {}
  registerEvent() {}
}

export class SuggestModal<T> {
  app: App;
  constructor(app: App) {
    this.app = app;
  }
  open() {}
  close() {}
  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }
}

export class ItemView {
  app: App = new App();
  contentEl = new MockElement('div');
  leaf: unknown;

  constructor(leaf?: unknown) {
    this.leaf = leaf;
  }
}

export class WorkspaceLeaf {}

export const Platform = {
  isMobile: false,
  isPhone: false,
  isTablet: false,
};

export class Modal {
  app: App;
  contentEl = new MockElement('div');
  constructor(app: App) {
    this.app = app;
  }
  open() {}
  close() {}
}

export class TFile {
  path: string = '';
  name: string = '';
  basename: string = '';
}
