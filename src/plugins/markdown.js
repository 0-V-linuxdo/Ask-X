// Renders Markdown in your own messages. On grok.com (and so under Void++)
// what you type is shown as Markdown; X's Grok shows it as raw text with the
// ** and ` still visible. This plugin draws it the way grok.com does:
// headings, bold, italic, strikethrough, inline code, code blocks, lists,
// links and rules. Lines starting with ">" are left as text for UserQuotes.
//
// Built from DOM nodes (never innerHTML), so nothing you typed can run as
// HTML. Drawn on a copy of the message (see userMessages.js), never by
// editing X's own nodes; new messages are handled before the browser paints.

import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';
import { startReplyBold, stopReplyBold } from '../replyBold.js';
import { hasTransform, refreshAll, setTransform } from '../userMessages.js';

const DONE = 'data-askx-md';
const STYLE_ID = 'askx-markdown';

const HINT = /(^|\n)(#{1,6}\s|\s*[-*+]\s+\S|\s*\d+[.)]\s+\S|```|(?:-{3,}|\*{3,}|_{3,})\s*(\n|$))|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|(^|[\s(])\*[^*\s][^*\n]*\*(?=$|[\s).,!?:;])|(^|[\s(])_[^_\s][^_\n]*_(?=$|[\s).,!?:;])/;

export function looksLikeMarkdown(text) {
  return HINT.test(String(text || ''));
}

const INLINE = [
  { re: /`([^`\n]+)`/, make: (doc, m) => node(doc, 'code', 'askx-md-code', [doc.createTextNode(m[1])]) },
  { re: /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/, make: (doc, m) => link(doc, m[2], m[1]) },
  { re: /(\*\*|__)([^\n]+?)\1/, make: (doc, m) => node(doc, 'strong', '', inline(doc, m[2])) },
  { re: /~~([^~\n]+)~~/, make: (doc, m) => node(doc, 's', '', inline(doc, m[1])) },
  { re: /(^|[\s(])\*([^*\s][^*\n]*?)\*(?=$|[\s).,!?:;，。！？：；])/, lead: true, make: (doc, m) => node(doc, 'em', '', inline(doc, m[2])) },
  { re: /(^|[\s(])_([^_\s][^_\n]*?)_(?=$|[\s).,!?:;，。！？：；])/, lead: true, make: (doc, m) => node(doc, 'em', '', inline(doc, m[2])) },
  { re: /https?:\/\/[^\s<>"'）)]+[^\s<>"'）).,!?:;，。！？：；]/, make: (doc, m) => link(doc, m[0], m[0]) }
];

function node(doc, tag, cls, children = []) {
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  for (const child of children) el.appendChild(child);
  return el;
}

function link(doc, href, text) {
  const a = node(doc, 'a', 'askx-md-link', [doc.createTextNode(text)]);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

// Inline Markdown -> list of nodes. Takes the earliest match each round.
export function inline(doc, text) {
  const out = [];
  let rest = String(text);
  while (rest) {
    let best = null;
    for (const rule of INLINE) {
      const m = rule.re.exec(rest);
      if (!m) continue;
      const start = m.index + (rule.lead ? m[1].length : 0);
      if (!best || start < best.start) best = { rule, m, start, end: m.index + m[0].length };
    }
    if (!best) { out.push(doc.createTextNode(rest)); break; }
    if (best.start) out.push(doc.createTextNode(rest.slice(0, best.start)));
    out.push(best.rule.make(doc, best.m));
    rest = rest.slice(best.end);
  }
  return out;
}

// Block Markdown -> one fragment.
export function render(doc, text) {
  const frag = doc.createDocumentFragment();
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  const flush = () => {
    if (!para.length) return;
    const p = node(doc, 'div', 'askx-md-p');
    para.forEach((line, i) => {
      if (i) p.appendChild(doc.createTextNode('\n'));
      if (line.startsWith('>')) p.appendChild(doc.createTextNode(line));
      else for (const n of inline(doc, line)) p.appendChild(n);
    });
    frag.appendChild(p);
    para = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = /^\s*```(.*)$/.exec(line);
    if (fence) {
      flush();
      const body = [];
      for (i += 1; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i += 1) body.push(lines[i]);
      const pre = node(doc, 'pre', 'askx-md-pre', [node(doc, 'code', '', [doc.createTextNode(body.join('\n'))])]);
      if (fence[1].trim()) pre.dataset.lang = fence[1].trim();
      frag.appendChild(pre);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      frag.appendChild(node(doc, 'div', `askx-md-h askx-md-h${heading[1].length}`, inline(doc, heading[2])));
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      frag.appendChild(node(doc, 'hr', 'askx-md-hr'));
      continue;
    }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[1]);
      const list = node(doc, ordered ? 'ol' : 'ul', 'askx-md-list');
      if (ordered) list.start = parseInt(item[1], 10) || 1;
      for (; i < lines.length; i += 1) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m || /\d/.test(m[1]) !== ordered) { i -= 1; break; }
        list.appendChild(node(doc, 'li', '', inline(doc, m[2])));
      }
      frag.appendChild(list);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    para.push(line);
  }
  flush();
  return frag;
}

const transform = {
  order: 10,
  apply(doc, el, text) {
    if (!looksLikeMarkdown(text)) return false;
    el.textContent = '';
    el.appendChild(render(doc, text));
    el.setAttribute(DONE, '');
    return true;
  }
};

// Kept for tests and callers.
export const decorate = (doc = app.doc) => (hasTransform('markdown') ? refreshAll(doc) : setTransform('markdown', transform));
export const undecorate = () => setTransform('markdown', null);

const CSS = `
[${DONE}] .askx-md-p { white-space: pre-wrap; }
[${DONE}] .askx-md-p + .askx-md-p, [${DONE}] .askx-md-p + .askx-md-list, [${DONE}] .askx-md-list + .askx-md-p,
[${DONE}] .askx-md-pre + *, [${DONE}] * + .askx-md-pre, [${DONE}] .askx-md-h + *, [${DONE}] * + .askx-md-h { margin-top: 0.6em; }
[${DONE}] .askx-md-h { font-weight: 700; line-height: 1.3; }
[${DONE}] .askx-md-h1 { font-size: 1.35em; } [${DONE}] .askx-md-h2 { font-size: 1.22em; } [${DONE}] .askx-md-h3 { font-size: 1.1em; }
[${DONE}] .askx-md-list { margin: 0; padding-left: 1.4em; white-space: normal; }
[${DONE}] .askx-md-list li + li { margin-top: 0.2em; }
[${DONE}] .askx-md-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; padding: 0.1em 0.35em; border-radius: 4px; background: rgba(127, 127, 127, 0.22); }
[${DONE}] .askx-md-pre { margin: 0; padding: 10px 12px; border-radius: 8px; background: rgba(0, 0, 0, 0.28); overflow-x: auto; white-space: pre; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; line-height: 1.5; }
[${DONE}] .askx-md-link { color: rgb(29, 155, 240); text-decoration: none; }
[${DONE}] .askx-md-link:hover { text-decoration: underline; }
[${DONE}] .askx-md-hr { border: 0; border-top: 1px solid rgba(127, 127, 127, 0.4); margin: 0.6em 0; }
`;

let stopRescan = null;

export default definePlugin({
  name: 'Markdown',
  description: '像 grok.com 一样把你发给 Grok 的消息按 Markdown 显示：标题、粗体、斜体、删除线、代码、代码块、列表、链接和分隔线；Grok 回复里漏渲染的 **粗体** 也补上（不改动 X 的消息内容）。',
  icon: ICONS.markdown,
  tags: ['messages'],
  enabledByDefault: true,
  start() {
    const doc = app.doc;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }
    setTransform('markdown', transform);
    // Safety net: after editing a sent message X may re-render it in a way
    // the targeted update misses; re-check Grok's messages when Grok changes.
    stopRescan = watchGrok(doc, (d) => refreshAll(d));
    startReplyBold(doc);
  },
  stop() {
    stopRescan?.();
    stopRescan = null;
    stopReplyBold(app.doc);
    setTransform('markdown', null);
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
