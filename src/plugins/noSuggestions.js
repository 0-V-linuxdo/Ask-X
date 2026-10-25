// Hides the row of suggestion buttons under the Grok composer, in the drawer
// and on the full /i/grok page (Create Videos / Create Images / Edit Image /
// Latest News …).
// Found by structure, not by label, so it works in every X language: the row
// is a later sibling of the composer whose buttons all show text and carry no
// aria-label (the composer's own controls do have aria-labels).

import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { getComposer } from '../drawer.js';
import { grokRoots, touchesGrok } from '../grok.js';
import { ICONS } from '../icons.js';

const MARK = 'data-askx-no-suggestions';
let observer = null;

function isSuggestionRow(node, composer) {
  if (node.contains(composer) || node.querySelector('textarea, [contenteditable="true"]')) return false;
  const buttons = [...node.querySelectorAll('button, [role="button"]')];
  return buttons.length >= 2 && buttons.every((b) => !b.hasAttribute('aria-label') && b.textContent.trim());
}

export function findSuggestionRows(root) {
  const composer = getComposer(root);
  if (!composer) return [];
  for (let node = composer; node && node.parentElement && node !== root; node = node.parentElement) {
    const siblings = [...node.parentElement.children];
    const rows = siblings.slice(siblings.indexOf(node) + 1).filter((s) => isSuggestionRow(s, composer));
    if (rows.length) return rows;
  }
  return [];
}

export function hideSuggestions(doc = app.doc) {
  const rows = new Set();
  for (const root of grokRoots(doc)) for (const row of findSuggestionRows(root)) rows.add(row);
  for (const row of rows) if (!row.hasAttribute(MARK)) row.setAttribute(MARK, '');
  // X reuses nodes: one that no longer holds the suggestion buttons (it may
  // now hold the Private Chat notice) is shown again.
  for (const el of doc.querySelectorAll(`[${MARK}]`)) if (!rows.has(el)) el.removeAttribute(MARK);
  return rows.size;
}

// Runs inside the observer callback (before paint) so the row never flashes
// in and then disappears, and only when Grok itself changed.
function onMutations(records) {
  if (!touchesGrok(records, app.doc)) return;
  observer.disconnect();
  try { hideSuggestions(); } finally { observer.observe(app.doc.body, { childList: true, subtree: true }); }
}

export default definePlugin({
  name: 'NoSuggestions',
  description: '隐藏 Grok 输入框下面那排功能提示按钮（Create Videos、Create Images、Edit Image、Latest News 等），小窗和 Grok 全页都生效。',
  icon: ICONS.eyeOff,
  tags: ['declutter'],
  enabledByDefault: true,
  start() {
    const doc = app.doc;
    if (!doc.getElementById('askx-no-suggestions')) {
      const style = doc.createElement('style');
      style.id = 'askx-no-suggestions';
      style.textContent = `[${MARK}] { display: none !important; }`;
      (doc.head || doc.documentElement).appendChild(style);
    }
    hideSuggestions();
    observer = new doc.defaultView.MutationObserver(onMutations);
    observer.observe(doc.body, { childList: true, subtree: true });
  },
  stop() {
    observer?.disconnect();
    observer = null;
    app.doc.getElementById('askx-no-suggestions')?.remove();
    for (const node of app.doc.querySelectorAll(`[${MARK}]`)) node.removeAttribute(MARK);
  }
});
