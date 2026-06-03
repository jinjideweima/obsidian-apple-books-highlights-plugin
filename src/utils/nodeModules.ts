type NodeRequire = <T = unknown>(specifier: string) => T;

declare const require: NodeRequire | undefined;

export const requireNodeModule = <T>(specifier: string): T => {
  if (typeof require === 'function') {
    return require<T>(specifier);
  }

  const requireFromGlobal = globalThis.require as NodeRequire | undefined;

  if (typeof requireFromGlobal === 'function') {
    return requireFromGlobal<T>(specifier);
  }

  const requireFromWindow = (globalThis as { window?: { require?: NodeRequire } }).window?.require;

  if (typeof requireFromWindow === 'function') {
    return requireFromWindow<T>(specifier);
  }

  throw new Error(`当前运行环境无法加载 Node 模块“${specifier}”。请在 macOS 桌面版 Obsidian 中执行 Apple Books 导入。`);
};
