/* oxlint-disable no-console -- CLI build script: console output is intentional */
// Copy the built plugin (dist/) into your local Obsidian plugin folder.
//
// Set the target via OBSIDIAN_PLUGIN_DIR — either as an environment variable
// or in a .env.local file at the project root (see .env.example).
//
// Usage:
//   npm run deploy          # copy dist/ -> plugin folder
//   npm run build:deploy    # build first, then copy
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_KEY = 'OBSIDIAN_PLUGIN_DIR';

const readFromEnvLocal = () => {
  if (!existsSync('.env.local')) {
    return undefined;
  }

  const match = readFileSync('.env.local', 'utf8').match(/^\s*OBSIDIAN_PLUGIN_DIR\s*=\s*(.+?)\s*$/m);

  return match ? match[1].trim().replace(/^["']|["']$/g, '') : undefined;
};

const pluginDir = process.env[ENV_KEY] || readFromEnvLocal();

if (!pluginDir) {
  console.error(
    `未设置 ${ENV_KEY}。\n` +
      `请在项目根创建 .env.local（可参考 .env.example），写入你的 Obsidian 插件目录：\n` +
      `  ${ENV_KEY}="/path/to/your-vault/.obsidian/plugins/apple-books-knowledge-cards"`,
  );
  process.exit(1);
}

if (!existsSync(pluginDir)) {
  console.error(`插件目录不存在：${pluginDir}\n请确认路径正确，且该插件已在 Obsidian 中安装过一次。`);
  process.exit(1);
}

for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  copyFileSync(join('dist', file), join(pluginDir, file));
}

console.log(`✓ 已部署到：${pluginDir}`);
console.log('  在 Obsidian 里禁用→启用本插件（或重启 Obsidian）即可生效。');
