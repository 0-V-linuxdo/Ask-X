// CSS that must only ever reach Grok (the drawer, or the /i/grok page) and
// never the rest of X. The drawer is matched by its test id; the full page by
// a flag on <html> that is kept in sync with the URL while a plugin runs.

import { DRAWER } from './drawer.js';
import { onGrokPage, timeThrottle, touchesGrok } from './grok.js';

export const PAGE_FLAG = 'data-askx-grok-page';

// Selector for the Grok surfaces themselves.
export const GROK = `:is(${DRAWER}, html[${PAGE_FLAG}] main)`;

const users = new Set();
let observer = null;
let schedule = null;
let lastPage = null;

function sync(doc) {
  const page = onGrokPage(doc);
  if (page !== lastPage) {
    lastPage = page;
    doc.documentElement.toggleAttribute(PAGE_FLAG, page);
  }
  for (const fn of users) {
    try { fn(doc); } catch (error) { console.error('[Ask X] grok scope update failed', error); }
  }
}

// Keeps the page flag current and calls onChange(doc) whenever Grok's DOM
// changes (throttled). Returns a function that stops it.
export function watchGrok(doc, onChange = () => {}) {
  users.add(onChange);
  if (!observer) {
    const view = doc.defaultView;
    schedule = timeThrottle(view, () => sync(doc), 120);
    observer = new view.MutationObserver((records) => {
      // X navigates without reloading: re-check the page flag on any change
      // of URL, otherwise only react to changes inside Grok.
      if (onGrokPage(doc) !== lastPage || touchesGrok(records, doc)) schedule();
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  }
  sync(doc);
  return () => {
    users.delete(onChange);
    if (users.size) return;
    observer?.disconnect();
    observer = null;
    schedule?.cancel();
    schedule = null;
    lastPage = null;
    doc.documentElement.removeAttribute(PAGE_FLAG);
  };
}

export function addStyle(doc, id, css) {
  let style = doc.getElementById(id);
  if (!style) {
    style = doc.createElement('style');
    style.id = id;
    (doc.head || doc.documentElement).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
  return style;
}
