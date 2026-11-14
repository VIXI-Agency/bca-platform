/** Decode HTML entities (named and numeric) */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Strip all HTML tags and decode entities to render uniform plain text */
export function stripHtml(html: string): string {
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr|ul|ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  text = text.replace(/\n{2,}/g, '\n').trim();
  return text;
}
