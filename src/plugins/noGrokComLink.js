// Hides "Go to grok.com" at the bottom of the Grok model menu (under Auto /
// Fast / Expert), with the divider above it. Matched by the domain in the
// item's text, which X does not translate, so it works in every language;
// every other item in the menu, and every other X menu, is left alone.

import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { ICONS } from '../icons.js';

const MARK = 'data-askx-hidden-grokcom';
const STYLE_ID = 'askx-no-grokcom';
const LINK_TEXT = /grok\.com/i;

// A childless sibling right above the item is the menu's divider line.
function divider(item) {
  const prev = item.previousElementSibling;
  return prev && !prev.childElementCount && !prev.textContent.trim() ? prev : null;
}

export function hideIn(root) {
  let count = 0;
  for (const item of root.querySelectorAll('[role="menu"] [role="menuitem"]')) {
    if (item.hasAttribute(MARK) || !LINK_TEXT.test(item.textContent || '')) continue;
    item.setAttribute(MARK, '');
    divider(item)?.setAttribute(MARK, '');
    count += 1;
  }
  return count;
}

let observer = null;

export default definePlugin({
  name: 'NoGrokComLink',
  description: '隐藏 Grok 模型菜单（Auto / Fast / Expert）最下面的 “Go to grok.com” 和它上面的分隔线，其余选项不变。',
  icon: ICONS.linkOff,
  tags: ['declutter'],
  enabledByDefault: true,
  start() {
    const doc = app.doc;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `[${MARK}]{display:none!important}`;
      (doc.head || doc.documentElement).appendChild(style);
    }
    hideIn(doc);
    // Menus open in X's #layers portal; only look when one is added.
    observer = new doc.defaultView.MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const menu = node.closest('[role="menu"]');
          if (menu) hideIn(menu.parentElement || menu);
          else if (node.querySelector('[role="menu"]')) hideIn(node);
        }
      }
    });
    observer.observe(doc.getElementById('layers') || doc.body, { childList: true, subtree: true });
  },
  stop() {
    observer?.disconnect();
    observer = null;
    app.doc.getElementById(STYLE_ID)?.remove();
    for (const el of app.doc.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
  }
});
