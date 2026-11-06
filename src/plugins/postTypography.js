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
// On the conversation's message list, so list rules stay inside messages.
const MSGS = 'data-askx-msgs';
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
  return `${scope} [${MARK}]{font-size:15px!important;line-height:20px!important}` + listCss(`${scope} [${MSGS}]`);
}

// Grok spaces list items for its 28px lines, and indents them deeply. Once
// lines are 20px that reads as a gap between items larger than the one
// between paragraphs, and bullets far from the text above. Lists in replies
// get post-like spacing: a small gap before and after, 4px between items,
// and the bullet just inside the text edge. User messages (.askx-md-list)
// have their own rules.
export function listCss(base) {
  const L = `${base} :is(ul, ol):not(.askx-md-list)`;
  return [
    `${L}{margin:6px 0 8px!important;padding:0 0 0 1.4em!important;gap:0!important;list-style-position:outside!important}`,
    `${L} :is(ul, ol){margin:4px 0 0!important}`,
    `${L} > li{margin:0!important;padding-block:0!important}`,
    `${L} > li + li{margin-top:4px!important}`,
    `${L} > li > :is(p, div){margin-block:0!important;padding-block:0!important}`
  ].join('');
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
  if (!list.hasAttribute(MSGS)) list.setAttribute(MSGS, '');
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
  description: 'Grok 里的消息文字改用和 X 帖子一样的字号与行距（15px / 20px），不再有过大的行距和段距，列表的项距和缩进也随之收紧；小窗和 Grok 全页都生效，全页可单独关闭。',
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
    if (!settings.store.fullPage) {
      for (const el of doc.querySelectorAll(`main [${MARK}]`)) el.removeAttribute(MARK);
      for (const el of doc.querySelectorAll(`main [${MSGS}]`)) el.removeAttribute(MSGS);
    }
    markAll(doc);
  },
  stop() {
    const doc = app.doc;
    stop?.();
    stop = null;
    doc.getElementById(STYLE_ID)?.remove();
    for (const el of doc.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
    for (const el of doc.querySelectorAll(`[${MSGS}]`)) el.removeAttribute(MSGS);
  }
});
