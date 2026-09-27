import { parseYaml, stringifyYaml } from 'obsidian';

export type Properties = Record<string, unknown>;

// The 1.8 default template wrapped values in quotes without escaping inner ones, e.g.
// `title: "学会说 "保留""`. Only such lines are re-quoted, and only after normal parsing failed.
const repairLegacyQuotes = (yaml: string): string =>
  yaml.replace(/^([A-Za-z_][\w-]*): "(.*)"[ \t]*$/gm, (line, key: string, inner: string) =>
    /(^|[^\\])"/.test(inner) ? `${key}: ${JSON.stringify(inner)}` : line,
  );

const parseProperties = (yaml: string): unknown => {
  try {
    return parseYaml(yaml);
  } catch (error) {
    const repaired = repairLegacyQuotes(yaml);
    if (repaired === yaml) throw error;
    return parseYaml(repaired);
  }
};

export const splitMarkdown = (content: string): { properties: Properties; body: string } => {
  const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { properties: {}, body: content };
  const value: unknown = parseProperties(match[1]);
  if (value !== null && (typeof value !== 'object' || Array.isArray(value)))
    throw new Error('笔记属性不是有效的 YAML 对象，已停止更新该文件。');
  return { properties: (value || {}) as Properties, body: content.slice(match[0].length) };
};
export const parseFrontmatter = (content: string): Properties => splitMarkdown(content).properties;

// For listings: one unreadable note must not break the whole view.
export const tryParseFrontmatter = (content: string): Properties | null => {
  try {
    return parseFrontmatter(content);
  } catch {
    return null;
  }
};

// Recovers the book a note belongs to even when its properties are not valid YAML.
export const rawBookId = (content: string): string =>
  content.match(/^\uFEFF?---\r?\n[\s\S]*?^book_id:[ \t]*["']?([^"'\r\n]*?)["']?[ \t]*$/m)?.[1] || '';
export const writeMarkdown = (properties: Properties, body: string): string => `---\n${stringifyYaml(properties).trimEnd()}\n---\n${body}`;
export const patchProperties = (content: string, values: Properties): string => {
  const { properties, body } = splitMarkdown(content);
  return writeMarkdown({ ...properties, ...values }, body);
};
export const extractSection = (content: string, heading: string): string => {
  if (heading === '笔记') {
    const marked = content.match(/<!-- abkc:local:start -->\r?\n([\s\S]*?)\r?\n<!-- abkc:local:end -->/);
    if (marked) return marked[1].trim();
  }
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.match(new RegExp(`^## ${escaped}[^\\S\\n]*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1].trim() || '';
};
export const setSection = (content: string, heading: string, value: string): string => {
  if (heading === '笔记') {
    const marker = /<!-- abkc:local:start -->[\s\S]*?<!-- abkc:local:end -->/;
    const marked = `<!-- abkc:local:start -->\n${value.trim()}\n<!-- abkc:local:end -->`;
    if (marker.test(content)) return content.replace(marker, () => marked);
    value = marked;
  }
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^## ${escaped}[^\\S\\n]*\\r?\\n[\\s\\S]*?(?=^## |$(?![\\s\\S]))`, 'm');
  const replacement = `## ${heading}\n\n${value.trim()}\n\n`;
  return regex.test(content) ? content.replace(regex, () => replacement) : `${content.trimEnd()}\n\n${replacement}`;
};
export const textValue = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join('、') : value == null ? '' : String(value);
export const safeRelativePath = (value: string): string => {
  if (/^[\\/]|^[a-z]:/i.test(value) || value.split(/[\\/]/).some((p) => p === '..' || p === '.'))
    throw new Error('路径必须在 Vault 内，不能包含 . 或 ..');
  const result = value
    .split('/')
    .map((p) =>
      Array.from(p, (char) => (char.charCodeAt(0) < 32 ? '-' : char))
        .join('')
        .replace(/[|#^[\]\\:*?"<>]/g, '-')
        .trim()
        .replace(/[. ]+$/, ''),
    )
    .filter(Boolean)
    .join('/');
  if (!result) throw new Error('文件路径不能为空');
  return result;
};

export const filenameValue = (value: string): string => (value ? safeRelativePath(value.replace(/[\\/]/g, '-')) : '');
