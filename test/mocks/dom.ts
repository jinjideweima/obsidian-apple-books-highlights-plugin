// Obsidian's DOM helpers (createEl, toggleClass, …) for jsdom-based view tests.
export const installObsidianDom = (): void => {
  const proto = HTMLElement.prototype as any;
  const build = (tag: string, options: any = {}) => {
    const el = document.createElement(tag);
    if (typeof options === 'string') {
      el.className = options;
      return el;
    }
    if (options.text) el.textContent = options.text;
    if (options.cls) el.className = options.cls;
    for (const key of ['value', 'href']) if (options[key] !== undefined) el.setAttribute(key, options[key]);
    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, String(value));
    return el;
  };
  proto.createEl = function (tag: string, options?: any) {
    return this.appendChild(build(tag, options));
  };
  proto.createDiv = function (options?: any) {
    return this.createEl('div', options);
  };
  proto.createSpan = function (options?: any) {
    return this.createEl('span', options);
  };
  proto.empty = function () {
    this.replaceChildren();
  };
  proto.addClass = function (cls: string) {
    this.classList.add(cls);
  };
  proto.removeClass = function (cls: string) {
    this.classList.remove(cls);
  };
  proto.toggleClass = function (cls: string, enabled: boolean) {
    this.classList.toggle(cls, enabled);
  };
  proto.setText = function (text: string) {
    this.textContent = text;
  };
  proto.appendText = function (text: string) {
    this.appendChild(document.createTextNode(text));
  };
  proto.setAttr = function (name: string, value: string) {
    this.setAttribute(name, value);
  };
  // Some Node/jsdom combinations expose no usable localStorage; views only need a per-test store.
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
  (globalThis as any).createEl = build;
  (globalThis as any).createDiv = (options?: any) => build('div', options);
};

export const press = (target: Element, key: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};
