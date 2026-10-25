// Grok sets its messages in 15.75px type with 1.75 line height, much looser
// than the posts next to it (15px / 20px). This plugin gives Grok's message
// text the same size and line height as an X post, so a reply reads like a
// post: in the drawer, and on the full /i/grok page unless that is turned
// off. Only body text in the conversation is matched (headings, code and
// X's other text keep their own sizes), and only by a marker attribute plus
// CSS, so X's text itself is untouched.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { DRAWER } from '../drawer.js';
import { messageList } from '../grok.js';
import { addStyle, PAGE_FLAG, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';

const MARK = 'data-askx-post-text';
const STYLE_ID = 'askx-post-typography';

const settings = definePluginSettings({
  fullPage: {
    type: OptionType.BOOLEAN,
    label: 'Grok 全页也生效',
    description: '在 x.com/i/grok 全页里同样使用帖子字号和行距。关闭则只影响小窗。',
    default: true
  }
});

function roots(doc) {
  const out = [];
  const drawer = doc.querySelector(DRAWER);
  if (drawer) out.push(drawer);
  if (settings.store.fullPage && doc.documentElement.hasAttribute(PAGE_FLAG)) {
    const main = doc.querySelector('main');
    if (main) out.push(main);
  }
  return out;
}

function css() {
  const scope = settings.store.fullPage ? `:is(${DRAWER}, html[${PAGE_FLAG}] main)` : DRAWER;
  // Only marked blocks are resized; text inside that inherits follows them,
  // and anything with its own smaller size (source chips, code) keeps it.
  return `${scope} [${MARK}]{font-size:15px!important;line-height:20px!important}`;
}

// Body text: about 15–16.5px with a loose (≥ 1.5) line height.
export function isLooseBody(fontSize, lineHeight) {
  return fontSize >= 14.5 && fontSize <= 16.5 && lineHeight / fontSize >= 1.5;
}

// Text directly inside, or quote lines UserQuotes drew there (their block
// keeps only line breaks of its own).
function hasOwnText(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    if (n.nodeType === 1 && n.classList.contains('askx-uq')) return true;
  }
  return false;
}

export function markAll(doc = app.doc) {
  let count = 0;
  for (const root of roots(doc)) count += markList(doc, messageList(root));
  return count;
}

function markList(doc, list) {
  if (!list) return 0;
  const view = doc.defaultView;
  let count = 0;
  for (const el of list.querySelectorAll('span, div, p, li')) {
    if (el.hasAttribute(MARK)) { count += 1; continue; }
    if (!hasOwnText(el) || el.closest('pre, code, h1, h2, h3, h4, h5, h6')) continue;
    // Mark the outermost loose block around this text, so its margins and
    // line boxes shrink with it. Inner text that sets the loose size itself
    // stays loose after its block is marked, and gets marked on its own.
    let target = null;
    for (let e = el; e && e !== list; e = e.parentElement) {
      const s = view.getComputedStyle(e);
      if (!isLooseBody(parseFloat(s.fontSize), parseFloat(s.lineHeight))) break;
      target = e;
    }
    if (target && !target.hasAttribute(MARK)) { target.setAttribute(MARK, ''); count += 1; }
  }
  return count;
}

let stop = null;

export default definePlugin({
  name: 'PostTypography',
  description: 'Grok 里的消息文字改用和 X 帖子一样的字号与行距（15px / 20px），不再有过大的行距和段距；小窗和 Grok 全页都生效，全页可单独关闭。',
  icon: ICONS.type,
  tags: ['messages'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    addStyle(doc, STYLE_ID, css());
    stop = watchGrok(doc, markAll);
    markAll(doc);
  },
  onSettingsChange() {
    const doc = app.doc;
    addStyle(doc, STYLE_ID, css());
    // Marks left on the page do nothing once the CSS is drawer-only.
    if (!settings.store.fullPage) for (const el of doc.querySelectorAll(`main [${MARK}]`)) el.removeAttribute(MARK);
    markAll(doc);
  },
  stop() {
    const doc = app.doc;
    stop?.();
    stop = null;
    doc.getElementById(STYLE_ID)?.remove();
    for (const el of doc.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
  }
});
