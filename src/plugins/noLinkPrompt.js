// Answers X's "One Grok, everywhere" prompt (link your X and Grok accounts,
// Agree and continue / Not now) with "Not now" as soon as it opens. X shows
// it as a modal in the #layers portal, at /i/jf/grok/entry, when Grok is
// opened. The dialog is found by its hero image, which X does not translate;
// "Not now" is the button right after "Agree and continue". "Agree and
// continue" is never pressed. X's own "Not now" drops you on the timeline,
// so afterwards Ask X goes on to the page you were opening (the prompt's
// ?redirect=, x.com only).

import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { ICONS } from '../icons.js';

const HERO = 'img[src*="/jf/grok/entry_hero"]';
const DONE = 'data-askx-not-now';
export const NOT_NOW_LABELS = ['Not now', '暂时不要', '以后再说', '暫時不要', '稍後再說'];

const norm = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

export function findNotNow(root) {
  const hero = root.querySelector?.(HERO);
  const dialog = hero?.closest('[role="dialog"]');
  if (!dialog) return null;
  const buttons = [...dialog.querySelectorAll('button')].filter((b) => norm(b.textContent));
  const labels = NOT_NOW_LABELS.map(norm);
  const byText = buttons.find((b) => labels.includes(norm(b.textContent)));
  if (byText) return byText;
  // Unknown language: the two text buttons sit side by side, Agree first.
  const [agree, next] = buttons;
  return next && agree.nextElementSibling === next ? next : null;
}

// X's buttons here react to pointer events, not to a bare click().
function press(button) {
  const view = button.ownerDocument.defaultView;
  const r = button.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  const Pointer = view.PointerEvent || view.MouseEvent;
  const pointer = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  button.dispatchEvent(new Pointer('pointerdown', { ...pointer, buttons: 1 }));
  button.dispatchEvent(new view.MouseEvent('mousedown', { ...init, buttons: 1 }));
  button.dispatchEvent(new Pointer('pointerup', pointer));
  button.dispatchEvent(new view.MouseEvent('mouseup', init));
  button.dispatchEvent(new view.MouseEvent('click', init));
}

// Path of the x.com page the prompt was opened for, or null.
export function redirectPath(loc) {
  if (!/^\/i\/jf\/grok\/entry/.test(loc.pathname)) return null;
  try {
    const url = new URL(new URLSearchParams(loc.search).get('redirect') || '', loc.origin);
    return url.origin === loc.origin ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

// X routes on popstate, so this moves within the app without a reload.
function goTo(view, path) {
  view.history.pushState({}, '', path);
  view.dispatchEvent(new view.PopStateEvent('popstate', { state: {} }));
}

export function dismissIn(root) {
  const button = findNotNow(root);
  if (!button || button.hasAttribute(DONE)) return false;
  button.setAttribute(DONE, '');
  const view = button.ownerDocument.defaultView;
  const target = redirectPath(view.location);
  press(button);
  if (target) {
    view.setTimeout(() => {
      const loc = view.location;
      if (loc.pathname + loc.search !== target && !redirectPath(loc)) goTo(view, target);
    }, 800);
  }
  return true;
}

let observer = null;

export default definePlugin({
  name: 'NoLinkPrompt',
  description: '打开 Grok 时 X 弹出的“One Grok, everywhere”关联账号提示（Agree and continue / Not now），自动点 “Not now” 关掉，不会点同意。',
  icon: ICONS.linkOff,
  tags: ['declutter'],
  enabledByDefault: true,
  start() {
    const doc = app.doc;
    dismissIn(doc);
    // The prompt opens in X's #layers portal; the image may arrive after the dialog.
    observer = new doc.defaultView.MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches(HERO) || node.querySelector(HERO)) { dismissIn(doc); return; }
        }
      }
    });
    observer.observe(doc.getElementById('layers') || doc.body, { childList: true, subtree: true });
  },
  stop() {
    observer?.disconnect();
    observer = null;
  }
});
