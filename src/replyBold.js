// Grok's replies on X sometimes keep **bold** as raw text: X's renderer
// misses a closing ** right after full-width punctuation followed by CJK, as
// in **幸存者偏差（Survivorship Bias）**的. Such a paragraph is redrawn the
// way userMessages.js redraws your own messages: X's paragraph is only hidden
// (an attribute React does not manage) and a copy with real bold text is
// placed right after it. The copy is rebuilt when the original's text changes
// and removed when the original goes away. Code is never touched.

import { getMessages, grokRoots } from './grok.js';
import { addStyle, watchGrok } from './grokScope.js';

const VIEW = 'askx-rb';
const SOURCE = 'data-askx-rb-src';
const STYLE_ID = 'askx-reply-bold-style';
const SKIP = 'code, pre, textarea, [contenteditable="true"], .askx-um, .askx-rb';
const PAIR = /\*\*(?=\S)([^*\n]+?)\*\*/g;

// [{ start, end }] of each **…** pair in a string (start/end of the markers).
export function findBold(text) {
  const out = [];
  for (const m of String(text).matchAll(PAIR)) {
    if (/\s$/.test(m[1])) continue;
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// Replaces the **…** pairs in one text node with <strong> elements.
function boldTextNode(doc, node) {
  const text = node.nodeValue;
  const pairs = findBold(text);
  if (!pairs.length) return false;
  const frag = doc.createDocumentFragment();
  let at = 0;
  for (const { start, end } of pairs) {
    if (start > at) frag.appendChild(doc.createTextNode(text.slice(at, start)));
    const strong = doc.createElement('strong');
    strong.textContent = text.slice(start + 2, end - 2);
    frag.appendChild(strong);
    at = end;
  }
  if (at < text.length) frag.appendChild(doc.createTextNode(text.slice(at)));
  node.parentNode.replaceChild(frag, node);
  return true;
}

function textNodesWithPairs(doc, el) {
  const walker = doc.createTreeWalker(el, 4, {
    acceptNode: (n) => (n.nodeValue.includes('**') && !n.parentElement?.closest(SKIP) && findBold(n.nodeValue).length ? 1 : 3)
  });
  const out = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
  return out;
}

// The paragraph to redraw: the nearest block-level ancestor of the text.
function blockOf(doc, node, stop) {
  for (let e = node.parentElement; e && e !== stop; e = e.parentElement) {
    if (doc.defaultView.getComputedStyle(e).display !== 'inline') return e;
  }
  return null;
}

const viewFor = (block) => {
  const next = block.nextElementSibling;
  return next?.classList.contains(VIEW) && next.dataset.src === block.dataset.askxRbId ? next : null;
};

let nextId = 1;

function redraw(doc, block) {
  const text = block.textContent;
  let view = viewFor(block);
  if (view && view.dataset.text === text) return;
  view?.remove();
  view = block.cloneNode(true);
  view.removeAttribute(SOURCE);
  view.removeAttribute('data-askx-rb-id');
  for (const n of view.querySelectorAll('[id]')) n.removeAttribute('id');
  view.removeAttribute('id');
  let changed = false;
  for (const n of textNodesWithPairs(doc, view)) changed = boldTextNode(doc, n) || changed;
  if (!changed) { block.removeAttribute(SOURCE); return; }
  view.classList.add(VIEW); // after the search: the class marks text to skip
  if (!block.dataset.askxRbId) block.dataset.askxRbId = String(nextId++);
  view.dataset.src = block.dataset.askxRbId;
  view.dataset.text = text;
  block.after(view);
  block.setAttribute(SOURCE, '');
}

function paint(doc) {
  const blocks = new Set();
  for (const root of grokRoots(doc)) {
    for (const { el, role } of getMessages(root)) {
      if (role !== 'assistant') continue;
      for (const n of textNodesWithPairs(doc, el)) {
        const block = blockOf(doc, n, el);
        if (block) blocks.add(block);
      }
      // Paragraphs already redrawn whose ** have since gone (fixed by X).
      for (const b of el.querySelectorAll(`[${SOURCE}]`)) blocks.add(b);
    }
  }
  for (const block of blocks) redraw(doc, block);
  // Copies whose original is gone.
  for (const view of doc.querySelectorAll(`.${VIEW}`)) {
    const prev = view.previousElementSibling;
    if (!prev || prev.dataset.askxRbId !== view.dataset.src || !prev.hasAttribute(SOURCE)) view.remove();
  }
}

let stop = null;

export function startReplyBold(doc) {
  addStyle(doc, STYLE_ID, `[${SOURCE}]{display:none!important}.${VIEW} strong{font-weight:700}`);
  stop = watchGrok(doc, paint);
  paint(doc);
}

export function stopReplyBold(doc) {
  stop?.();
  stop = null;
  for (const view of doc.querySelectorAll(`.${VIEW}`)) view.remove();
  for (const el of doc.querySelectorAll(`[${SOURCE}]`)) el.removeAttribute(SOURCE);
  doc.getElementById(STYLE_ID)?.remove();
}
