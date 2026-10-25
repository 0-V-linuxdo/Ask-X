// Bare domains in Grok's conversation (pearltrees.com, github.com/x/y …)
// become clickable, like Void++'s BetterLinks. X's message nodes are never
// changed: the domains are painted with the CSS Custom Highlight API, and a
// click is matched to the text under the pointer. Links X already made,
// code, and your input box are left alone.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { grokRoots, messageList } from '../grok.js';
import { addStyle, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';

const HIGHLIGHT = 'askx-bare-link';
const VISITED = 'askx-bare-link-visited';
const MAX_VISITED = 500;

const settings = definePluginSettings({
  visitedColor: {
    type: OptionType.BOOLEAN,
    label: '已访问链接变色',
    description: '点过的域名链接改用紫色显示（移植自 void++）。',
    default: true
  }
});

// Visited links, kept in Ask X's own storage (newest last).
function visitedList() {
  const list = app.manager?.pluginData?.('BetterLinks')?.visited;
  return Array.isArray(list) ? list : [];
}

export function markVisited(href) {
  const list = visitedList().filter((h) => h !== href);
  list.push(href);
  app.manager?.mergePluginData?.('BetterLinks', { visited: list.slice(-MAX_VISITED) });
}
const STYLE_ID = 'askx-better-links';
const TLDS = 'com|org|net|io|ai|dev|app|co|me|gg|tv|xyz|info|edu|gov|so|sh|tech|site|wiki|page|link|cn|jp|kr|uk|de|fr|ru|us|ca|au|in|eu|hk|tw|sg';
// A host with a known top-level domain, optionally followed by a path.
const DOMAIN = new RegExp(`(?<![@\\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?![\\w-])(?:/[^\\s，。、；：！？）)」』"'<>]*)?`, 'gi');
const SKIP = 'a, code, pre, textarea, [contenteditable="true"], button, .askx-um';

export function findDomains(text) {
  const out = [];
  for (const m of text.matchAll(DOMAIN)) {
    const value = m[0].replace(/[.,:;!?]+$/u, '');
    out.push({ index: m.index, text: value });
  }
  return out;
}

export function hrefFor(text) {
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function textNodes(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode: (n) => (n.nodeValue && n.nodeValue.includes('.') && !n.parentElement?.closest(SKIP) ? 1 : 3)
  });
  const out = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
  return out;
}

// [{ range, href }] for every bare domain in the Grok conversations.
export function collect(doc = app.doc) {
  const found = [];
  for (const root of grokRoots(doc)) {
    const list = messageList(root);
    if (!list) continue;
    for (const node of textNodes(list)) {
      for (const { index, text } of findDomains(node.nodeValue)) {
        const range = doc.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        found.push({ range, href: hrefFor(text) });
      }
    }
  }
  return found;
}

let links = [];

function paint(doc) {
  links = collect(doc);
  const view = doc.defaultView;
  if (!view.CSS?.highlights || typeof view.Highlight !== 'function') return;
  const visited = settings.store.visitedColor ? new Set(visitedList()) : new Set();
  const fresh = links.filter((l) => !visited.has(l.href)).map((l) => l.range);
  const seen = links.filter((l) => visited.has(l.href)).map((l) => l.range);
  if (fresh.length) view.CSS.highlights.set(HIGHLIGHT, new view.Highlight(...fresh));
  else view.CSS.highlights.delete(HIGHLIGHT);
  if (seen.length) view.CSS.highlights.set(VISITED, new view.Highlight(...seen));
  else view.CSS.highlights.delete(VISITED);
}

function linkAt(doc, x, y) {
  const pos = doc.caretPositionFromPoint?.(x, y);
  const node = pos ? pos.offsetNode : doc.caretRangeFromPoint?.(x, y)?.startContainer;
  const offset = pos ? pos.offset : doc.caretRangeFromPoint?.(x, y)?.startOffset;
  if (!node || node.nodeType !== 3) return null;
  return links.find(({ range }) => range.startContainer === node && offset >= range.startOffset && offset <= range.endOffset
    && (() => { const r = range.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; })()) || null;
}

const inGrok = (target) => Boolean(target?.closest?.('[data-testid="GrokDrawer"], html[data-askx-grok-page] main'));

function onClick(event) {
  if (event.button !== 0 || !links.length || !inGrok(event.target)) return;
  const doc = event.target.ownerDocument;
  if (doc.defaultView.getSelection?.()?.toString()) return; // selecting text, not clicking
  const hit = linkAt(doc, event.clientX, event.clientY);
  if (!hit) return;
  event.preventDefault();
  event.stopPropagation();
  doc.defaultView.open(hit.href, '_blank', 'noopener');
  markVisited(hit.href);
  paint(doc);
}

let lastCursor = null;
function onMove(event) {
  const host = links.length ? event.target.closest?.('[data-testid="GrokDrawer"], html[data-askx-grok-page] main') : null;
  const over = Boolean(host && linkAt(event.target.ownerDocument, event.clientX, event.clientY));
  if (over && host) { host.style.cursor = 'pointer'; lastCursor = host; }
  else if (lastCursor) { lastCursor.style.removeProperty('cursor'); lastCursor = null; }
}

let stop = null;

export default definePlugin({
  name: 'BetterLinks',
  description: 'Grok 回复里只写了域名的地方（如 pearltrees.com）变成可点击的链接，在新标签页打开。不改动 X 的消息内容（移植自 void++）。',
  icon: ICONS.link,
  tags: ['messages'],
  enabledByDefault: true,
  settings,
  onSettingsChange: () => paint(app.doc),
  start() {
    const doc = app.doc;
    addStyle(doc, STYLE_ID, `::highlight(${HIGHLIGHT}){color:rgb(29,155,240);text-decoration:underline;text-underline-offset:2px}`
      + `::highlight(${VISITED}){color:rgb(149,117,205);text-decoration:underline;text-underline-offset:2px}`);
    stop = watchGrok(doc, paint);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('mousemove', onMove, { passive: true });
  },
  stop() {
    const doc = app.doc;
    stop?.();
    stop = null;
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('mousemove', onMove);
    doc.defaultView.CSS?.highlights?.delete(HIGHLIGHT);
    doc.defaultView.CSS?.highlights?.delete(VISITED);
    doc.getElementById(STYLE_ID)?.remove();
    lastCursor?.style.removeProperty('cursor');
    lastCursor = null;
    links = [];
  }
});
