// No sideways scrolling in Grok. The suggested follow-up questions under a
// reply are single-line buttons whose text never wraps, so a long one pushes
// the conversation wider than the drawer and a horizontal scrollbar appears.
// Button text inside the conversation may wrap now, and the conversation's
// own scroller never scrolls sideways. Code blocks keep their own horizontal
// scrolling (they are not vertical scrollers, so they are left alone).

import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { grokRoots, messageList } from '../grok.js';
import { addStyle, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';

const STYLE_ID = 'askx-no-side-scroll';
const MARK = 'data-askx-no-xscroll';

const CSS = `[${MARK}]{overflow-x:hidden!important}`
  + `[${MARK}] button{max-width:100%;min-width:0}`
  + `[${MARK}] button *{white-space:normal!important;overflow-wrap:anywhere;min-width:0}`;

// The vertical scrollers holding the conversation: walk up from the message
// list to the Grok root (a handful of elements, cheap enough to redo on
// every change while Grok is writing).
export function findScrollers(root) {
  const view = root.ownerDocument.defaultView;
  const out = [];
  for (let el = messageList(root); el && root.contains(el); el = el.parentElement) {
    if (/(auto|scroll)/.test(view.getComputedStyle(el).overflowY)) out.push(el);
    if (el === root) break;
  }
  // On /i/grok the page itself scrolls: guard the Grok area instead.
  if (!out.length && messageList(root)) out.push(root);
  return out;
}

export function mark(doc = app.doc) {
  let count = 0;
  for (const root of grokRoots(doc)) {
    for (const el of findScrollers(root)) {
      if (!el.hasAttribute(MARK)) el.setAttribute(MARK, '');
      count += 1;
    }
  }
  return count;
}

let stop = null;

export default definePlugin({
  name: 'NoSideScroll',
  description: 'Grok 回复下面的建议问题太长时会把小窗撑宽、出现横向滚动条。这个插件让建议问题自动换行，Grok 对话区不再横向滚动；代码块仍可左右滚动。',
  icon: ICONS.wrap,
  tags: ['appearance'],
  enabledByDefault: true,
  start() {
    addStyle(app.doc, STYLE_ID, CSS);
    stop = watchGrok(app.doc, (doc) => mark(doc));
  },
  stop() {
    stop?.();
    stop = null;
    app.doc.getElementById(STYLE_ID)?.remove();
    for (const el of app.doc.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
  }
});
