// Port of Void++'s UserQuotes. On grok.com the plugin restores <blockquote>
// for "> " lines in your own messages and gives them a visible left bar. X's
// Grok shows your messages as plain pre-wrapped text, so the literal ">"
// stays on screen. Each line that starts with ">" is wrapped in an inline
// span: the ">" keeps its width but is drawn as the left bar, so the message
// keeps exactly the same line breaks and height (no layout shift).
//
// The decoration is drawn on a copy of the message (see userMessages.js);
// X's own message nodes are never edited.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { isUserMessage } from '../grok.js';
import { ICONS } from '../icons.js';
import { hasTransform, refreshAll, refreshFromMutations, setTransform } from '../userMessages.js';

export { isUserMessage };

const QUOTE = 'askx-uq';
const MARK = 'askx-uq-mark';
const STYLE_ID = 'askx-user-quotes';

const settings = definePluginSettings({
  italic: {
    type: OptionType.BOOLEAN,
    label: '斜体',
    description: '引用行用斜体显示。',
    default: true
  },
  quotes: {
    type: OptionType.BOOLEAN,
    label: '引号',
    description: '在引用行前后加上装饰性的引号。',
    default: false
  }
});

function css() {
  return [
    // One box per quote line, so the bar runs down every wrapped line.
    // min-height keeps the bar on blank lines inside a multi-paragraph quote.
    `.${QUOTE}{display:inline-block;max-width:100%;min-height:1.3em;vertical-align:top;box-sizing:border-box;border-left:3px solid rgb(113,118,123);padding-left:8px;font-style:${settings.store.italic ? 'italic' : 'inherit'}}`,
    // The ">" stays in the text (copying keeps it) but takes no space.
    `.${MARK}{font-size:0;line-height:0;font-style:normal;user-select:text}`,
    settings.store.quotes ? `.${QUOTE}-text::before{content:"\\201C"}.${QUOTE}-text::after{content:"\\201D"}` : ''
  ].join('\n');
}

function applyStyle(doc = app.doc) {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    (doc.head || doc.documentElement).appendChild(style);
  }
  style.textContent = css();
}

function quoteLine(doc, line) {
  const block = doc.createElement('span');
  block.className = QUOTE;
  block.dataset.line = line;
  const mark = doc.createElement('span');
  mark.className = MARK;
  mark.textContent = '>';
  const body = doc.createElement('span');
  body.className = `${QUOTE}-text`;
  body.textContent = line.slice(1);
  block.append(mark, body);
  return block;
}

// Splits one text node into plain text and quote blocks. Returns true if it
// changed anything.
export function decorateTextNode(node) {
  const text = node.nodeValue || '';
  if (!/(^|\n)>/.test(text)) return false;
  const doc = node.ownerDocument;
  const frag = doc.createDocumentFragment();
  const parts = text.split(/(\n)/);
  let buffer = '';
  const flush = () => {
    if (buffer) frag.appendChild(doc.createTextNode(buffer));
    buffer = '';
  };
  for (const part of parts) {
    if (part.startsWith('>')) {
      flush();
      frag.appendChild(quoteLine(doc, part));
    } else {
      buffer += part;
    }
  }
  flush();
  node.parentNode.replaceChild(frag, node);
  return true;
}

// Decorates the ">" lines inside one rendered message (skips code).
export function decorateElement(doc, el) {
  const walker = doc.createTreeWalker(el, 4);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.parentElement.closest(`.${QUOTE}, pre, code`)) nodes.push(n);
  }
  let changed = false;
  for (const n of nodes) changed = decorateTextNode(n) || changed;
  return changed;
}

const transform = { order: 50, apply: (doc, el) => decorateElement(doc, el) };

// Kept for tests and callers: redraw everything / only what changed.
export const decorate = (doc = app.doc) => (hasTransform('quotes') ? refreshAll(doc) : setTransform('quotes', transform));
export const decorateMutations = (records, doc = app.doc) => refreshFromMutations(records, doc);
export const undecorate = () => setTransform('quotes', null);

export default definePlugin({
  name: 'UserQuotes',
  description: '给你自己发给 Grok 的消息里以 > 开头的引用行加上左侧竖线，可选斜体和引号（移植自 void++）。',
  icon: ICONS.userQuotes,
  tags: ['messages'],
  enabledByDefault: true,
  settings,
  start() {
    applyStyle();
    setTransform('quotes', transform);
  },
  onSettingsChange: () => applyStyle(),
  stop() {
    setTransform('quotes', null);
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
