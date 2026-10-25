// Your own Grok messages, redrawn without touching X's nodes.
//
// X (React) owns the message text. Rewriting it in place breaks React the
// next time it updates or removes that message, which can take the whole
// Grok drawer down. So the original block is only hidden (an attribute React
// does not manage) and a decorated copy is placed right after it. The copy
// is rebuilt when the original's text changes and removed when the original
// goes away.
//
// Plugins register transforms (Markdown, UserQuotes); a message gets a copy
// only when some transform changes it. Work happens inside the
// MutationObserver callback (before paint) and only for changes inside Grok.

import { app } from './app.js';
import { DRAWER } from './drawer.js';
import { isUserMessage, onGrokPage, rootOf } from './grok.js';

export const VIEW = 'askx-um';
const SOURCE = 'data-askx-um-src';
const STYLE_ID = 'askx-user-messages';
const OBSERVE = { childList: true, subtree: true, characterData: true };

const transforms = new Map(); // name -> { order, apply(doc, el, text) => boolean }
const sourceOf = new WeakMap(); // view -> original block
let observer = null;
let observedDoc = null;

function roots(doc) {
  const list = [...doc.querySelectorAll(DRAWER)];
  if (onGrokPage(doc)) {
    const main = doc.querySelector('main');
    if (main) list.push(main);
  }
  return list;
}

const isView = (el) => Boolean(el?.closest?.(`.${VIEW}`));

function viewFor(block) {
  const next = block.nextElementSibling;
  return next?.classList.contains(VIEW) && sourceOf.get(next) === block ? next : null;
}

function build(doc, block, text) {
  // A deep clone keeps X's own spans, links and line breaks; transforms then
  // decorate or replace its contents.
  const el = block.cloneNode(true);
  el.removeAttribute('id');
  for (const n of el.querySelectorAll('[id]')) n.removeAttribute('id');
  el.removeAttribute(SOURCE);
  el.classList.add(VIEW);
  let changed = false;
  for (const t of [...transforms.values()].sort((a, b) => a.order - b.order)) {
    try { changed = t.apply(doc, el, text) || changed; } catch (error) { console.error('[Ask X] message transform failed', error); }
  }
  return changed ? el : null;
}

function unhide(block) {
  block.removeAttribute(SOURCE);
  viewFor(block)?.remove();
}

// Returns 1 when the block now shows a (new) decorated copy.
function refreshBlock(doc, block) {
  if (isView(block) || block.closest('textarea, [contenteditable="true"]')) return 0;
  if (!isUserMessage(block)) return 0;
  const text = block.textContent;
  const current = viewFor(block);
  if (current && current.dataset.text === text) return 0;
  const next = transforms.size ? build(doc, block, text) : null;
  if (!next) {
    if (current || block.hasAttribute(SOURCE)) unhide(block);
    return 0;
  }
  next.dataset.text = text;
  sourceOf.set(next, block);
  if (current) current.replaceWith(next);
  else block.after(next);
  block.setAttribute(SOURCE, '');
  return 1;
}

// Copies whose original was removed or re-rendered elsewhere.
function sweep(scope) {
  for (const view of scope.querySelectorAll(`.${VIEW}`)) {
    const block = sourceOf.get(view);
    if (!block || !block.isConnected || block.nextElementSibling !== view) view.remove();
  }
}

export function refreshAll(doc = app.doc) {
  let count = 0;
  for (const root of roots(doc)) {
    sweep(root);
    for (const block of root.querySelectorAll('div[dir]')) count += refreshBlock(doc, block);
  }
  return count;
}

// Only the blocks touched by these mutations, and only inside Grok.
export function refreshFromMutations(records, doc = app.doc) {
  const blocks = new Set();
  const scopes = new Set();
  const consider = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    if (!el || isView(el)) return;
    const root = rootOf(el, doc);
    if (!root) {
      // The drawer (or /i/grok's main) itself was just mounted.
      if (node.nodeType === 1 && (node.matches?.(DRAWER) || node.querySelector?.(DRAWER))) {
        for (const r of roots(doc)) for (const b of r.querySelectorAll('div[dir]')) blocks.add(b);
      }
      return;
    }
    scopes.add(root);
    const own = el.closest('div[dir]');
    if (own) blocks.add(own);
    if (node.nodeType === 1) for (const inner of node.querySelectorAll('div[dir]')) blocks.add(inner);
  };
  for (const record of records) {
    if (record.type === 'characterData') consider(record.target);
    else {
      for (const added of record.addedNodes) consider(added);
      if (record.removedNodes?.length) {
        const root = rootOf(record.target, doc);
        if (root) scopes.add(root);
      }
    }
  }
  for (const scope of scopes) sweep(scope);
  let count = 0;
  for (const block of blocks) if (block.isConnected) count += refreshBlock(doc, block);
  return count;
}

function restoreAll(doc) {
  for (const view of doc.querySelectorAll(`.${VIEW}`)) view.remove();
  for (const block of doc.querySelectorAll(`[${SOURCE}]`)) block.removeAttribute(SOURCE);
}

function watcher(doc) {
  const mo = new doc.defaultView.MutationObserver((records) => {
    // Our own insertions would re-trigger the observer; pause while writing.
    mo.disconnect();
    try { refreshFromMutations(records, doc); } finally { if (observer === mo && doc.body) mo.observe(doc.body, OBSERVE); }
  });
  mo.observe(doc.body, OBSERVE);
  return mo;
}

function ensureObserver() {
  const doc = app.doc;
  if (observer && observedDoc !== doc) {
    observer.disconnect();
    observer = null;
  }
  if (transforms.size && !observer) {
    observedDoc = doc;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `[${SOURCE}]{display:none!important}`;
      (doc.head || doc.documentElement).appendChild(style);
    }
    observer = watcher(doc);
  } else if (!transforms.size && observer) {
    observer.disconnect();
    observer = null;
    doc.getElementById(STYLE_ID)?.remove();
  }
}

export const hasTransform = (name) => transforms.has(name);

// Registers (or with null, removes) a transform and redraws every message.
// Returns how many messages now show a decorated copy.
export function setTransform(name, transform) {
  if (transform) transforms.set(name, transform);
  else transforms.delete(name);
  const doc = app.doc;
  // Rebuild from scratch so a removed transform leaves nothing behind.
  restoreAll(doc);
  ensureObserver();
  return transforms.size ? refreshAll(doc) : 0;
}

export function hasView(el) {
  return isView(el);
}
