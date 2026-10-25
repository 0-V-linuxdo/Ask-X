// Hides the suggested follow-up questions ("猜你想问") Grok lists under a
// reply. Found by structure, not by label, so it works in every language:
// right after a reply's action bar (Regenerate / Copy / Share / Like …, all
// labelled icon buttons) comes a block of unlabelled buttons that each show
// an icon and a question. By default the latest reply keeps its questions;
// NoSideScroll keeps wrapping the ones that are shown.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { grokRoots, messageList } from '../grok.js';
import { addStyle, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';

const MARK = 'data-askx-hidden-followups';
const STYLE_ID = 'askx-hide-followups';

const settings = definePluginSettings({
  keepLatest: {
    type: OptionType.BOOLEAN,
    label: '保留最新消息的猜你想问',
    description: '只隐藏较早回复下的建议问题，最新一条回复下的照常显示。',
    default: true
  }
});

const buttonsOf = (el) => [...el.querySelectorAll('button, [role="button"]')];

function isActionBar(el) {
  const buttons = buttonsOf(el);
  return buttons.length >= 3 && !el.textContent.trim() && buttons.every((b) => b.getAttribute('aria-label'));
}

export function isFollowUpBlock(el) {
  const buttons = buttonsOf(el);
  return buttons.length >= 1
    && buttons.every((b) => !b.getAttribute('aria-label') && b.querySelector('svg') && b.textContent.trim())
    && Boolean(el.previousElementSibling && isActionBar(el.previousElementSibling));
}

export function findFollowUps(root) {
  const list = messageList(root);
  if (!list) return [];
  const out = [];
  for (const bar of list.querySelectorAll('div')) {
    if (!isActionBar(bar)) continue;
    const next = bar.nextElementSibling;
    if (next && isFollowUpBlock(next)) out.push(next);
  }
  return out;
}

export function hideAll(doc = app.doc, keepLatest = settings.store.keepLatest) {
  const hidden = new Set();
  for (const root of grokRoots(doc)) {
    const blocks = findFollowUps(root);
    const keep = keepLatest ? blocks[blocks.length - 1] : null;
    for (const block of blocks) if (block !== keep) hidden.add(block);
  }
  for (const block of hidden) if (!block.hasAttribute(MARK)) block.setAttribute(MARK, '');
  // Anything else still marked (the latest reply's block, or a node X has
  // reused for other content) is shown again.
  for (const el of doc.querySelectorAll(`[${MARK}]`)) if (!hidden.has(el)) el.removeAttribute(MARK);
  return hidden.size;
}

let stop = null;

export default definePlugin({
  name: 'HideFollowUps',
  description: '隐藏 Grok 回复下方的“猜你想问”建议问题；默认保留最新一条回复下的。关闭插件时这些问题照常显示（并由 NoSideScroll 自动换行）。',
  icon: ICONS.eyeOff,
  tags: ['declutter'],
  enabledByDefault: true,
  settings,
  onSettingsChange: () => hideAll(app.doc),
  start() {
    addStyle(app.doc, STYLE_ID, `[${MARK}]{display:none!important}`);
    stop = watchGrok(app.doc, hideAll);
  },
  stop() {
    stop?.();
    stop = null;
    app.doc.getElementById(STYLE_ID)?.remove();
    for (const el of app.doc.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
  }
});
