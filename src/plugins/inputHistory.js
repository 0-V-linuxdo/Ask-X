// Port of Void++'s InputHistory: recall the prompts you sent to Grok with
// ↑ / ↓ in the input box, like a shell. ↑ at the start of the box (or in an
// empty box) goes to older prompts, ↓ at the end comes back, past the newest
// one your unsent draft returns; Esc restores the draft. While browsing a
// small counter sits on the box; click it to search and pick from the list.
// ⌥ + ↑ / ↓ always browses, wherever the caret is.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { findButton, isPrivateOn, readValue, writeEditable, writeTextarea } from '../drawer.js';
import { rootOf } from '../grok.js';
import { ICONS } from '../icons.js';
import { pageTheme } from '../theme.js';
import { el } from '../ui/dom.js';
import { confirmDialog } from '../ui/pluginDialog.js';
import { xLabels } from '../x-strings.js';

const MAX_MIN = 10;
const MAX_MAX = 500;
const DEDUPE_MS = 2_000;
const HUD = 'askx-ih-hud';
const STYLE_ID = 'askx-input-history';

const cleanList = (value) => (Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x.trim()) : undefined);

const settings = definePluginSettings({
  maxEntries: {
    type: OptionType.SLIDER,
    label: '最多保存条数',
    description: '超出后丢掉最早的。',
    min: MAX_MIN,
    max: MAX_MAX,
    default: 100
  },
  skipPrivate: {
    type: OptionType.BOOLEAN,
    label: '无痕对话不记录',
    description: '在 Private Chat 里发的内容不存进历史。',
    default: true
  },
  history: {
    type: OptionType.COMPONENT,
    stacked: true,
    label: '历史记录',
    description: '保存在本机的脚本管理器里。可以搜索、复制和删除。',
    component: (doc, layer) => historyPanel(doc, layer)
  },
  entries: {
    type: OptionType.COMPONENT,
    hidden: true,
    keepOnReset: true,
    validate: cleanList,
    default: []
  }
});

// Browsing state (one composer at a time).
let cursor = -1; // index into entries while browsing, -1 = not browsing
let draft = '';
let shown = null; // the text we last put into the box
let field = null;
const recent = new Map();

export const normalize = (text) => String(text ?? '').replace(/​/g, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '');

export function entries() {
  return settings.store.entries;
}

export function pushEntry(text, now = Date.now()) {
  const value = normalize(text);
  if (!value.trim()) return false;
  if (recent.has(value) && now - recent.get(value) < DEDUPE_MS) return false;
  recent.set(value, now);
  if (recent.size > 20) recent.delete(recent.keys().next().value);
  const list = entries().filter((e) => e !== value);
  list.push(value);
  const max = Math.min(MAX_MAX, Math.max(MAX_MIN, settings.store.maxEntries));
  settings.store.entries = list.slice(-max);
  return true;
}

function removeEntry(index) {
  settings.store.entries = entries().filter((_, i) => i !== index);
}

// The Grok input: a <textarea> in the older drawer, a rich (Lexical)
// editor in the newer one.
export function isComposer(target) {
  if (!target || !rootOf(target, target.ownerDocument)) return false;
  return target.tagName === 'TEXTAREA' || (target.isContentEditable && target.getAttribute('role') === 'textbox');
}

let writing = false;

function placeCaret(area, atStart) {
  if (area.tagName === 'TEXTAREA') {
    const pos = atStart ? 0 : area.value.length;
    try { area.setSelectionRange(pos, pos); } catch {}
    return;
  }
  const doc = area.ownerDocument;
  const range = doc.createRange();
  range.selectNodeContents(area);
  range.collapse(atStart);
  const sel = doc.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function setText(area, text, caretAtStart) {
  shown = text;
  if (area.tagName === 'TEXTAREA') {
    writeTextarea(area, text);
    placeCaret(area, caretAtStart);
    return;
  }
  writing = true;
  void writeEditable(area, text).finally(() => {
    writing = false;
    placeCaret(area, caretAtStart);
  });
}

function stopBrowsing() {
  cursor = -1;
  shown = null;
  hideHud();
}

// One step through history. older=true goes back in time.
export function step(area, older) {
  const list = entries();
  if (!list.length) return false;
  if (cursor < 0) {
    if (!older) return false;
    draft = readValue(area);
    cursor = list.length;
  }
  const next = older ? cursor - 1 : cursor + 1;
  if (next < 0) return true; // already at the oldest: swallow the key
  if (next >= list.length) {
    setText(area, draft, false);
    stopBrowsing();
    return true;
  }
  cursor = next;
  field = area;
  setText(area, list[next], older);
  showHud(area, `${next + 1} / ${list.length}`);
  return true;
}

function restoreDraft(area) {
  setText(area, draft, false);
  stopBrowsing();
}

// Text between the caret and the start (or end) of the editor.
function aroundCaret(area, before) {
  const doc = area.ownerDocument;
  const sel = doc.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed || !area.contains(sel.anchorNode)) return null;
  const range = doc.createRange();
  range.selectNodeContents(area);
  if (before) range.setEnd(sel.anchorNode, sel.anchorOffset);
  else range.setStart(sel.anchorNode, sel.anchorOffset);
  return range.toString();
}

function atStart(area) {
  if (area.tagName === 'TEXTAREA') return area.selectionStart === 0 && area.selectionEnd === 0;
  const text = aroundCaret(area, true);
  return text !== null && !text.replace(/\u200B/g, '');
}

function atEnd(area) {
  if (area.tagName === 'TEXTAREA') {
    const n = area.value.length;
    return area.selectionStart === n && area.selectionEnd === n;
  }
  const text = aroundCaret(area, false);
  return text !== null && !text.replace(/[\u200B\n]/g, '');
}

function skip(area) {
  if (!settings.store.skipPrivate) return false;
  const root = rootOf(area);
  return Boolean(root && isPrivateOn(root));
}

function capture(area) {
  if (!skip(area)) pushEntry(readValue(area));
  stopBrowsing();
}

function onKeyDown(event) {
  const area = event.target;
  if (!isComposer(area) || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape' && cursor >= 0 && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    event.stopPropagation();
    restoreDraft(area);
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
    capture(area);
    return;
  }
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  if (event.shiftKey || event.metaKey || event.ctrlKey) return;
  const older = event.key === 'ArrowUp';
  const empty = !readValue(area).trim();
  const edge = older ? atStart(area) || empty : atEnd(area) && cursor >= 0;
  if (!event.altKey && !edge) return;
  if (!step(area, older)) return;
  event.preventDefault();
  event.stopPropagation();
}

function onInput(event) {
  if (writing || cursor < 0 || !isComposer(event.target)) return;
  // You edited the recalled prompt: it becomes your text, browsing ends.
  if (readValue(event.target) !== shown) stopBrowsing();
}

function onClick(event) {
  const button = event.target.closest?.('button, [role="button"]');
  if (!button) return;
  const root = rootOf(button, app.doc);
  if (!root) return;
  const send = findButton(root, xLabels().send);
  if (button !== send) return;
  const area = root.querySelector('textarea, [contenteditable="true"][role="textbox"]');
  if (area) capture(area);
}

// Counter shown on the input box while browsing; click it for the list.
function showHud(area, text) {
  const doc = area.ownerDocument;
  let hud = doc.querySelector(`.${HUD}`);
  if (!hud) {
    hud = el(doc, 'button', { type: 'button', class: HUD, title: '浏览输入历史', onmousedown: (e) => e.preventDefault(), onclick: () => openPicker(doc) });
    doc.body.appendChild(hud);
  }
  hud.textContent = text;
  hud.dataset.theme = pageTheme(doc);
  const box = area.getBoundingClientRect();
  hud.style.top = `${Math.round(box.top - 26)}px`;
  hud.style.left = `${Math.round(box.right - 64)}px`;
}

function onFocusOut(event) {
  if (event.target === field && !event.relatedTarget?.closest?.(`.${HUD}`)) hideHud();
}

function hideHud() {
  app.doc?.querySelector(`.${HUD}`)?.remove();
}

function historyPanel(doc, layer, { onUse } = {}) {
  const root = el(doc, 'div', { class: 'askx-ih-panel' });
  const search = el(doc, 'input', { type: 'text', class: 'askx-input', placeholder: '搜索历史', 'aria-label': '搜索历史' });
  const count = el(doc, 'span', { class: 'askx-label-desc' });
  const clear = el(doc, 'button', {
    type: 'button',
    class: 'askx-button askx-button-secondary',
    text: '清空历史',
    onclick: () => confirmDialog(doc, layer, {
      title: '清空输入历史',
      description: '删除所有保存的提问？此操作无法撤销。',
      confirmText: '清空',
      onConfirm: () => { settings.store.entries = []; render(); }
    })
  });
  const list = el(doc, 'div', { class: 'askx-ih-list' });
  const render = () => {
    const all = entries();
    const needle = search.value.trim().toLowerCase();
    const rows = all.map((text, index) => ({ text, index })).filter((r) => !needle || r.text.toLowerCase().includes(needle)).reverse();
    search.hidden = !all.length;
    clear.disabled = !all.length;
    count.textContent = needle ? `${rows.length} 条匹配` : `共 ${all.length} 条`;
    list.textContent = '';
    if (!rows.length) {
      list.appendChild(el(doc, 'p', { class: 'askx-paragraph askx-ih-empty', text: all.length ? '没有匹配的记录。' : '还没有保存的提问。' }));
      return;
    }
    for (const r of rows) {
      const body = el(doc, 'span', { class: 'askx-ih-body', text: r.text });
      const main = el(doc, 'div', { class: 'askx-ih-main', role: 'button', tabindex: '0', title: '展开 / 收起', onclick: () => item.classList.toggle('askx-ih-open') });
      main.appendChild(body);
      const actions = [
        onUse ? el(doc, 'button', { type: 'button', class: 'askx-card-btn', title: '使用', 'aria-label': '使用', html: ICONS.cornerDownLeft, onclick: () => onUse(r.text, r.index) }) : null,
        el(doc, 'button', { type: 'button', class: 'askx-card-btn', title: '复制', 'aria-label': '复制', html: ICONS.copy, onclick: () => { try { void doc.defaultView.navigator.clipboard.writeText(r.text); } catch {} } }),
        el(doc, 'button', { type: 'button', class: 'askx-card-btn', title: '删除', 'aria-label': '删除', html: ICONS.trash, onclick: () => { removeEntry(r.index); render(); } })
      ];
      const item = el(doc, 'div', { class: 'askx-ih-item' }, [
        el(doc, 'span', { class: 'askx-ih-index', text: String(r.index + 1) }),
        main,
        el(doc, 'div', { class: 'askx-ih-actions' }, actions)
      ]);
      list.appendChild(item);
    }
  };
  search.addEventListener('input', render);
  root.append(search, el(doc, 'div', { class: 'askx-ih-meta' }, [count, clear]), list);
  render();
  return root;
}

// The list as its own dialog, opened from the counter: pick one to use it.
function openPicker(doc) {
  const area = field;
  doc.querySelector('.askx-layer')?.remove();
  const layer = el(doc, 'div', { class: 'askx-layer', 'data-theme': pageTheme(doc) });
  const close = () => { layer.remove(); doc.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    const modals = layer.querySelectorAll('[data-askx-modal]');
    if (modals.length > 1) modals[modals.length - 1].remove();
    else close();
  };
  const use = (text, index) => {
    close();
    if (!area?.isConnected) return;
    if (cursor < 0) draft = readValue(area);
    cursor = index;
    setText(area, text, false);
    area.focus();
    showHud(area, `${index + 1} / ${entries().length}`);
  };
  const dialog = el(doc, 'div', { class: 'askx-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': '输入历史' }, [
    el(doc, 'button', { type: 'button', class: 'askx-icon-btn askx-dialog-close', 'aria-label': '关闭', title: '关闭', html: ICONS.close, onclick: close }),
    el(doc, 'div', { class: 'askx-dialog-header' }, [
      el(doc, 'h2', { class: 'askx-dialog-title', text: '输入历史' }),
      el(doc, 'p', { class: 'askx-dialog-desc', text: '点一条展开全文，点“使用”放回输入框。' })
    ]),
    el(doc, 'div', { class: 'askx-separator', role: 'separator' }),
    historyPanel(doc, layer, { onUse: use })
  ]);
  const box = el(doc, 'div', { class: 'askx-overlay', 'data-askx-modal': '', onmousedown: (e) => { if (e.target === box) close(); } }, [dialog]);
  layer.appendChild(box);
  layer.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  doc.body.appendChild(layer);
  doc.addEventListener('keydown', onKey, true);
}

const CSS = `
.${HUD} { position: fixed; z-index: 2147483000; min-width: 56px; padding: 2px 10px; border: 1px solid rgba(113, 118, 123, 0.5); border-radius: 9999px;
  background: rgba(0, 0, 0, 0.85); color: #e7e9ea; font: 500 12px/18px TwitterChirp, -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; text-align: center; }
.${HUD}[data-theme="light"] { background: rgba(255, 255, 255, 0.92); color: #0f1419; }
.${HUD}:hover { border-color: #1d9bf0; }
.askx-ih-panel { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.askx-ih-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.askx-ih-list { display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto; }
.askx-ih-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 4px 6px 8px; border-radius: 10px; }
.askx-ih-item:hover { background: var(--askx-d-hover); }
.askx-ih-index { flex: 0 0 auto; min-width: 20px; color: var(--askx-d-muted); font-size: 12px; line-height: 20px; text-align: right; }
.askx-ih-main { flex: 1 1 auto; min-width: 0; cursor: pointer; }
.askx-ih-body { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 20px; }
.askx-ih-open .askx-ih-body { display: block; -webkit-line-clamp: unset; }
.askx-ih-actions { display: flex; flex: 0 0 auto; gap: 2px; }
.askx-ih-empty { color: var(--askx-d-muted); }
`;

export default definePlugin({
  name: 'InputHistory',
  description: '在 Grok 输入框里用 ↑ ↓ 调出以前发过的提问，像终端一样；Esc 恢复草稿，点计数可以搜索和挑选历史（移植自 void++）。',
  icon: ICONS.history,
  tags: ['composer'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('input', onInput, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('focusout', onFocusOut, true);
  },
  stop() {
    const doc = app.doc;
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('input', onInput, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('focusout', onFocusOut, true);
    stopBrowsing();
    doc.getElementById(STYLE_ID)?.remove();
  }
});
