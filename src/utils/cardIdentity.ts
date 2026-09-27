// Identity and navigation are deliberately independent of a card's display number.
export const sourceUrl = (bookId: string, location: string): string => {
  if (!bookId || !location) return '';
  // Preserve CFI delimiters; encode characters that can break Markdown or URLs.
  const fragment = encodeURI(location).replace(/#/g, '%23').replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `ibooks://assetid/${encodeURIComponent(bookId)}#${fragment}`;
};

export const compareLocations = (a: string, b: string): number => {
  const tokens = (s: string) => s.replace(/\[(?:\^.|[^\]])*\]/g, '').match(/\d+|[^\d]+/g) || [];
  const aa = tokens(a),
    bb = tokens(b);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    const x = aa[i],
      y = bb[i];
    const diff = /^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : x.localeCompare(y);
    if (diff) return diff;
  }
  return aa.length - bb.length;
};

export const cardLink = (path: string, label: string): string => `[[${path.replace(/\.md$/, '')}|${label.replace(/[[\]|\r\n]/g, ' ')}]]`;
