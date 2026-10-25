// Hides "Link accounts" in the top-right corner of the full /i/grok page
// (the pill on an empty chat, the bare chain icon in a conversation). Found
// by X's chain icon or its label, only inside the page's <main> while
// /i/grok is open; X's other buttons and the drawer are untouched.

import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { addStyle, PAGE_FLAG, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';

const STYLE_ID = 'askx-no-link-accounts';

// Start of the path of X's chain icon, which X does not translate.
const CHAIN_ICON = 'M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0';
export const LINK_LABELS = ['Link accounts', '关联账号', '連結帳號'];

export const CSS = `html[${PAGE_FLAG}] main :is(button, [role="button"]):is(${
  LINK_LABELS.map((label) => `[aria-label="${label}" i]`).join(', ')
}, :has(svg path[d^="${CHAIN_ICON}"])){display:none!important}`;

let stop = null;

export default definePlugin({
  name: 'NoLinkAccounts',
  description: '隐藏 Grok 全页（x.com/i/grok）右上角的“Link accounts”连接提示：空对话时的按钮和对话里的链条图标。',
  icon: ICONS.linkOff,
  tags: ['declutter'],
  enabledByDefault: true,
  start() {
    addStyle(app.doc, STYLE_ID, CSS);
    stop = watchGrok(app.doc);
  },
  stop() {
    stop?.();
    stop = null;
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
