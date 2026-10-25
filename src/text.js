// Selection cleanup and prompt templating.

const HAS_WORD = /[\p{L}\p{N}]/u;
export const DEFAULT_TEMPLATE = '来源：{url}\n\n>{text}\n\n';

export function cleanSelection(raw, maxLength = 2_000) {
  let text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, '').replace(/[ \t]{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!HAS_WORD.test(text)) return '';
  const limit = Number(maxLength);
  if (Number.isFinite(limit) && limit > 0 && text.length > limit) text = text.slice(0, limit);
  return text;
}

function quoteLines(text) {
  return text.split('\n').map((line) => `>${line}`).join('\n');
}

// Placeholders: {text} {quote} {url} {author}. A line whose placeholders all
// resolve to nothing is dropped together with one blank line after it, so an
// unknown source does not leave a dangling "来源：" header.
export function renderTemplate(template, values) {
  const source = String(template || DEFAULT_TEMPLATE);
  const fields = {
    text: values.text || '',
    quote: values.text ? quoteLines(values.text) : '',
    url: values.url || '',
    author: values.author || ''
  };
  const lines = source.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const keys = [...line.matchAll(/\{(text|quote|url|author)\}/g)].map((m) => m[1]);
    if (keys.length && keys.every((key) => !fields[key])) {
      if (lines[i + 1] === '') i += 1;
      continue;
    }
    // ">{text}" quotes the whole selection, not only its first line: every
    // line of a multi-paragraph selection (blank ones too) gets the prefix.
    const quoted = /^(\s*>+\s?)\{text\}/.exec(line);
    if (quoted && fields.text.includes('\n')) {
      const prefix = quoted[1];
      const body = fields.text.split('\n').map((l, j) => (j ? `${prefix}${l}` : l)).join('\n');
      out.push(line.replace('{text}', body).replace(/\{(text|quote|url|author)\}/g, (_, key) => fields[key]));
      continue;
    }
    out.push(line.replace(/\{(text|quote|url|author)\}/g, (_, key) => fields[key]));
  }
  return out.join('\n');
}

export function appendPrompt(existing, prompt) {
  const head = String(existing || '').replace(/[\s​]+$/u, '');
  return head ? `${head}\n\n${prompt}` : prompt;
}
