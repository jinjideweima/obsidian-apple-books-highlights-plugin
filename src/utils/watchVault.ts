import type { App, Component } from 'obsidian';
// Debounce imports and external sync bursts; remove subscriptions when the view/block closes.
export const watchVault = (app: App, owner: Component, refresh: () => Promise<void>): void => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!disposed) void refresh();
    }, 250);
  };
  for (const event of ['create', 'modify', 'delete', 'rename'] as const) owner.registerEvent(app.vault.on(event as 'modify', changed));
  owner.register(() => {
    disposed = true;
    clearTimeout(timer);
  });
};
