// Where Grok lives on X and how its conversation is laid out. Shared by the
// message plugins (navigator, keys, markdown, greeting, follow-up…).
//
// Two surfaces: the side drawer ([data-testid="GrokDrawer"]) and the full
// page /i/grok (its <main>). In both, the conversation is one list whose
// children are rows: spacer, your message, Grok's reply, your message, …
// Your messages are right-aligned filled bubbles; Grok's replies are not.

import { DRAWER, getComposer, getDrawer } from './drawer.js';

export function onGrokPage(doc) {
  try {
    return /^\/i\/grok/.test(doc.defaultView?.location?.pathname || '');
  } catch {
    return false; // the window is going away
  }
}

export function isDrawerOpen(doc) {
  return Boolean(getComposer(getDrawer(doc)));
}

// Every Grok surface currently showing a conversation or composer.
export function grokRoots(doc) {
  const roots = [];
  const drawer = getDrawer(doc);
  if (drawer && getComposer(drawer)) roots.push(drawer);
  if (onGrokPage(doc)) {
    const main = doc.querySelector('main');
    if (main) roots.push(main);
  }
  return roots;
}

export function rootOf(node, doc = node?.ownerDocument) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  if (!el || !doc) return null;
  const drawer = el.closest(DRAWER);
  if (drawer) return drawer;
  if (onGrokPage(doc)) return el.closest('main');
  return null;
}

const clear = (bg) => !bg || bg === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(bg);

// A text block (div[dir]) inside a filled bubble whose column aligns its
// children to the end.
// Labels of buttons and links are never messages: on /i/grok the header's
// History / Private / Link accounts are filled, end-aligned pills too.
export function isUserMessage(textBlock) {
  if (textBlock.closest('button, [role="button"], a')) return false;
  const view = textBlock.ownerDocument.defaultView;
  for (let node = textBlock.parentElement, depth = 0; node && depth < 2; node = node.parentElement, depth += 1) {
    if (clear(view.getComputedStyle(node).backgroundColor)) continue;
    const column = node.parentElement?.parentElement;
    const align = column ? view.getComputedStyle(node.parentElement).alignItems : '';
    const outer = column ? view.getComputedStyle(column).alignItems : '';
    return align === 'flex-end' || outer === 'flex-end';
  }
  return false;
}

// Ask X's decorated copies of your messages (userMessages.js) are skipped:
// the original block, hidden next to its copy, still counts.
function userBlocks(root) {
  return [...root.querySelectorAll('div[dir]')].filter((b) => b.textContent.trim() && !b.closest('textarea, [contenteditable="true"], .askx-um') && isUserMessage(b));
}

// The element whose children are the conversation rows.
export function messageList(root) {
  const first = root && userBlocks(root)[0];
  if (!first) return null;
  let row = first;
  while (row.parentElement && row.parentElement !== root && row.parentElement.children.length < 3) row = row.parentElement;
  return row.parentElement && row.parentElement !== root ? row.parentElement : null;
}

const NOISE = /^(thoughts?|thinking|思考|想法|已思考.*|thought for .*)$/i;

export function summarize(row, role, max = 60) {
  const scope = role === 'user' ? (userBlocks(row)[0] || row) : row;
  const lines = (scope.innerText ?? scope.textContent ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const text = lines.filter((l) => !NOISE.test(l)).join(' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// [{ el, role: 'user'|'assistant', text }] in page order.
export function getMessages(root) {
  const list = messageList(root);
  if (!list) return [];
  const users = new Set(userBlocks(list));
  const out = [];
  for (const row of list.children) {
    if (!row.textContent.trim()) continue;
    const role = [...users].some((b) => row.contains(b)) ? 'user' : 'assistant';
    out.push({ el: row, role, text: summarize(row, role) });
  }
  return out;
}

export function scrollerOf(el) {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  for (let node = el.parentElement; node && node !== doc.body; node = node.parentElement) {
    const { overflowY } = view.getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return doc.scrollingElement || doc.documentElement;
}

// Visible part of a scroller in viewport coordinates.
export function viewportOf(scroller) {
  const doc = scroller.ownerDocument;
  if (scroller === doc.scrollingElement || scroller === doc.documentElement) {
    return { top: 0, bottom: doc.defaultView.innerHeight };
  }
  const r = scroller.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
}

// Index of the message currently being read: the last one whose top edge is
// above the upper third of the visible area.
export function activeIndex(messages, scroller) {
  if (!messages.length) return -1;
  const { top, bottom } = viewportOf(scroller);
  const line = top + (bottom - top) * 0.3;
  let idx = 0;
  messages.forEach((m, i) => { if (m.el.getBoundingClientRect().top <= line) idx = i; });
  return idx;
}

// Scrolls a message to the top of its scroller, below any sticky header.
export function jumpTo(message, { effect = 'border', smooth = true } = {}) {
  const el = message.el;
  const scroller = scrollerOf(el);
  const doc = el.ownerDocument;
  const isDoc = scroller === doc.scrollingElement || scroller === doc.documentElement;
  const offset = isDoc ? 64 : 12;
  const delta = el.getBoundingClientRect().top - viewportOf(scroller).top - offset;
  const target = Math.max(0, scroller.scrollTop + delta);
  try { scroller.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' }); } catch { scroller.scrollTop = target; }
  if (effect === 'border') {
    el.setAttribute('data-askx-flash', '');
    doc.defaultView.setTimeout(() => el.removeAttribute('data-askx-flash'), 1_200);
  }
}

// True when X has laid one of its own sheets or dialogs (they open in the
// #layers portal) over this point of a Grok surface. `own` is Ask X's
// floating element at that point, ignored while hit-testing.
export function overlaidAt(doc, root, x, y, own) {
  if (typeof doc.elementsFromPoint !== 'function') return false;
  const top = doc.elementsFromPoint(x, y).find((el) => !own?.contains(el));
  return Boolean(top) && Boolean(top.closest('#layers')) && !root.contains(top);
}

// A mutation inside X's #layers portal that is not the drawer itself:
// a sheet, dialog or menu opening or closing.
export function touchesLayers(records) {
  return records.some((r) => {
    const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
    return Boolean(el?.closest('#layers')) && !el.closest(DRAWER);
  });
}

export function isTypingTarget(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'));
}

// Runs fn at most once per animation frame.
export function frameThrottle(view, fn) {
  let pending = 0;
  const run = () => { pending = 0; fn(); };
  const schedule = () => { if (!pending) pending = (view.requestAnimationFrame || ((f) => view.setTimeout(f, 16)))(run); };
  schedule.cancel = () => { if (pending) (view.cancelAnimationFrame || view.clearTimeout)(pending); pending = 0; };
  return schedule;
}

// Runs fn at most once per `ms` (trailing call guaranteed).
export function timeThrottle(view, fn, ms = 150) {
  let timer = 0;
  let last = 0;
  const run = () => { timer = 0; last = Date.now(); fn(); };
  const schedule = () => {
    if (timer) return;
    timer = view.setTimeout(run, Math.max(0, last + ms - Date.now()));
  };
  schedule.cancel = () => { if (timer) view.clearTimeout(timer); timer = 0; };
  return schedule;
}

// True when any of these mutations happened inside Grok (the drawer or the
// /i/grok page) or mounted the drawer. Lets page-wide observers ignore the
// constant churn of X's timeline cheaply.
export function touchesGrok(records, doc) {
  const page = onGrokPage(doc);
  for (const record of records) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (!target) continue;
    if (target.closest(DRAWER) || (page && target.closest('main'))) return true;
    for (const node of record.addedNodes) {
      if (node.nodeType === 1 && (node.matches(DRAWER) || node.querySelector(DRAWER))) return true;
    }
    for (const node of record.removedNodes) {
      if (node.nodeType === 1 && (node.matches(DRAWER) || node.querySelector(DRAWER))) return true;
    }
  }
  return false;
}
