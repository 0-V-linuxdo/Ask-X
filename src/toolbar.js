// Floating toolbar shown above a text selection. Its buttons come from the
// enabled plugins (toolbarButtons()), so turning a plugin off removes them.

import { rootOf } from './grok.js';
import { paintIcon } from './iconLoader.js';
import { watchTheme } from './theme.js';

export const ROOT_CLASS = 'askx-bar';
const SKIP = [
  `.${ROOT_CLASS}`,
  '.askx-toast',
  '.askx-layer',
  '[data-testid="GrokDrawerHeader"]',
  '#x-reply-blocker-ui',
  '.xrb-rule-dialog',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]'
].join(',');

function asElement(node) {
  if (!node) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}

export function currentSelection(win = window) {
  const doc = win.document;
  const sel = win.getSelection?.();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const text = sel.toString();
  if (!/[\p{L}\p{N}]/u.test(text)) return null;
  const range = sel.getRangeAt(0);
  const el = asElement(range.commonAncestorContainer);
  if (!el || !doc.contains(el) || el.closest(SKIP)) return null;
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  // Text picked inside Grok (drawer or /i/grok) is a follow-up to the
  // current chat; anything else comes from a post on X.
  const context = rootOf(el, doc) ? 'grok' : 'post';
  return { text, node: range.commonAncestorContainer, rect, context };
}

/**
 * @param {{ getButtons: (context: 'post'|'grok') => Array<{id:string,label:string,icon?:string,text?:string,className?:string,data?:object}>,
 *           onAsk: (selection, button, event) => void, win?: Window }} options
 */
export function createToolbar({ getButtons, onAsk, win = window }) {
  const doc = win.document;
  const bar = doc.createElement('div');
  bar.className = ROOT_CLASS;
  bar.setAttribute('role', 'toolbar');
  bar.hidden = true;
  (doc.body || doc.documentElement).appendChild(bar);

  let buttons = [];
  let builtFor = 'post';
  let current = null;
  let lastPicked = '';
  let quietUntil = 0;
  let timer = 0;

  function build(context = builtFor) {
    builtFor = context;
    buttons = getButtons(context);
    bar.textContent = '';
    buttons.forEach((def, index) => {
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = `askx-btn ${def.className || ''}`.trim();
      el.title = def.label;
      el.setAttribute('aria-label', def.label);
      el.dataset.index = String(index);
      if (def.icon) el.innerHTML = def.icon;
      else {
        if (def.iconUrl) {
          const icon = doc.createElement('span');
          icon.className = 'askx-btn-icon';
          el.appendChild(icon);
          void paintIcon(icon, def.iconUrl);
        }
        const text = doc.createElement('span');
        text.className = 'askx-btn-label';
        text.textContent = def.text || def.label;
        el.appendChild(text);
      }
      for (const [key, value] of Object.entries(def.data || {})) el.dataset[key] = value;
      bar.appendChild(el);
    });
  }

  function hide() {
    current = null;
    bar.hidden = true;
  }

  function place(rect) {
    bar.hidden = false;
    const w = bar.offsetWidth || 40;
    const h = bar.offsetHeight || 36;
    const left = Math.min(win.innerWidth - w - 8, Math.max(8, rect.left));
    let top = rect.top - h - 8;
    if (top < 8) top = Math.min(win.innerHeight - h - 8, rect.bottom + 8);
    bar.style.left = `${Math.round(left)}px`;
    bar.style.top = `${Math.round(top)}px`;
  }

  function refresh() {
    const sel = currentSelection(win);
    if (sel && sel.context !== builtFor) build(sel.context);
    if (!sel || !buttons.length) {
      hide();
      if (Date.now() > quietUntil) lastPicked = '';
      return;
    }
    if (lastPicked && sel.text === lastPicked && Date.now() <= quietUntil) {
      hide();
      return;
    }
    lastPicked = '';
    current = sel;
    place(sel.rect);
  }

  // Show the toolbar only once the selection is finished: after the mouse
  // button is released, or after a keyboard selection has paused. While a
  // drag is in progress it stays hidden.
  let dragging = false;
  const KEY_PAUSE_MS = 350;
  function schedule(event) {
    if (event?.target?.closest?.(`.${ROOT_CLASS}`)) return;
    win.clearTimeout(timer);
    if (event?.type === 'selectionchange' || event?.type === 'keyup') {
      if (dragging) return;
      timer = win.setTimeout(refresh, KEY_PAUSE_MS);
      return;
    }
    timer = win.setTimeout(refresh, 0);
  }
  function onDown(event) {
    if (event.button !== 0 || event.target?.closest?.(`.${ROOT_CLASS}`)) return;
    dragging = true;
    win.clearTimeout(timer);
    hide();
  }
  function onUp(event) {
    dragging = false;
    schedule(event);
  }

  bar.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  bar.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target || !current) return;
    event.preventDefault();
    event.stopPropagation();
    const picked = current;
    lastPicked = picked.text;
    quietUntil = Date.now() + 2_000;
    hide();
    try { win.getSelection()?.removeAllRanges(); } catch {}
    onAsk(picked, buttons[Number(target.dataset.index)], event);
  });

  const stopTheme = watchTheme(doc, (theme) => { bar.dataset.theme = theme; });
  build();

  doc.addEventListener('mousedown', onDown, true);
  doc.addEventListener('mouseup', onUp);
  doc.addEventListener('keyup', schedule);
  doc.addEventListener('selectionchange', schedule);
  win.addEventListener('scroll', hide, true);
  win.addEventListener('resize', hide);

  return {
    element: bar,
    rebuild: () => build(),
    refresh,
    hide,
    destroy() {
      win.clearTimeout(timer);
      stopTheme();
      doc.removeEventListener('mousedown', onDown, true);
      doc.removeEventListener('mouseup', onUp);
      doc.removeEventListener('keyup', schedule);
      doc.removeEventListener('selectionchange', schedule);
      win.removeEventListener('scroll', hide, true);
      win.removeEventListener('resize', hide);
      bar.remove();
    }
  };
}
