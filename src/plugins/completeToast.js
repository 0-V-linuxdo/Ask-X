// Port of Void++'s CompleteToast for ResponseNotification's "reply done"
// toast: it stays until you close it (×) or open Grok, and shows the start
// of the reply when Grok's text is on the page. On X the drawer's content is
// unmounted while it is minimised, so the preview appears when the drawer was
// open (for example while the tab was in the background), not when it was
// collapsed. Nothing of X's is read beyond the visible reply text.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { getMessages, grokRoots, isDrawerOpen } from '../grok.js';
import { watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';

const settings = definePluginSettings({
  keep: {
    type: OptionType.BOOLEAN,
    label: '一直显示',
    description: '“回复完成”提示不自动消失，点 × 或打开 Grok 小窗才关闭。',
    default: true
  },
  seconds: {
    type: OptionType.SLIDER,
    label: '显示秒数',
    description: '关闭“一直显示”时，提示停留的秒数。',
    min: 2,
    max: 30,
    default: 8
  },
  preview: {
    type: OptionType.BOOLEAN,
    label: '回复预览',
    description: '在提示里显示回复开头的一小段（小窗展开着才能读到）。',
    default: true
  }
});

const PREVIEW_CHARS = 80;
const THINKING = /^(thoughts?|thinking…?|thought for .*|思考中?…?|已思考.*|想了.*)$/i;

export function replyPreview(doc = app.doc, max = PREVIEW_CHARS) {
  for (const root of grokRoots(doc)) {
    const last = getMessages(root).filter((m) => m.role === 'assistant').pop();
    if (!last) continue;
    // Drop Grok's "Thought for 18s" header (and similar) above the answer.
    const text = (last.el.innerText || last.el.textContent || '')
      .split('\n').map((l) => l.trim()).filter((l) => l && !THINKING.test(l))
      .join(' ').replace(/\s+/g, ' ').trim();
    if (text) return text.length > max ? `${text.slice(0, max)}…` : text;
  }
  return '';
}

// Toast options for ResponseNotification, or null when this plugin is off.
export function toastOptions(doc = app.doc) {
  if (!app.manager?.isEnabled?.('CompleteToast')) return null;
  const { keep, seconds, preview } = settings.store;
  return {
    duration: keep ? 0 : Math.max(2, seconds) * 1000,
    closable: true,
    detail: preview ? replyPreview(doc) : '',
    // Shown even with the tab in the background, so it is there on return.
    whileHidden: keep
  };
}

let stopWatch = null;
let wasOpen = false;

export default definePlugin({
  name: 'CompleteToast',
  description: 'Grok“回复完成”的页面提示一直显示，直到点 × 或打开小窗；还能显示回复开头的一小段（移植自 void++）。',
  icon: ICONS.bellRing,
  tags: ['notifications'],
  enabledByDefault: true,
  settings,
  start() {
    // Opening the drawer counts as reading the reply: close a waiting
    // "reply done" toast (only on opening, not while it simply stays open).
    wasOpen = isDrawerOpen(app.doc);
    stopWatch = watchGrok(app.doc, (doc) => {
      const open = isDrawerOpen(doc);
      if (open && !wasOpen) doc.querySelector('.askx-toast[data-reply-done]')?.remove();
      wasOpen = open;
    });
  },
  stop() {
    stopWatch?.();
    stopWatch = null;
  }
});
