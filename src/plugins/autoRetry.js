// When a Grok reply fails ("Something went wrong … try again" with a Retry
// button under your message), click X's own Retry once, like Void++'s
// AutoRetry. Only the Retry button inside the Grok conversation (its last
// row) counts, never X's page-level "Try reloading"; and only one automatic
// retry per failure, at most one per minute, so a broken connection is not
// hammered.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { grokRoots, messageList } from '../grok.js';
import { watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';
import { showToast } from './toasts.js';

const settings = definePluginSettings({
  delay: {
    type: OptionType.SLIDER,
    label: '等待秒数',
    description: '出错后等几秒再自动重试。',
    min: 1,
    max: 10,
    default: 2
  }
});

export const RETRY_LABELS = ['Retry', 'Try again', '重试', '再试一次', '重新尝试', '重新整理'];
const COOLDOWN_MS = 60_000;

const tried = new WeakSet();
let lastAuto = -Infinity;
let pending = 0;

const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase();

// X's Retry button in the last row of a Grok conversation, if any.
export function findRetry(root) {
  const list = messageList(root);
  const last = list?.lastElementChild;
  if (!last) return null;
  const wanted = RETRY_LABELS.map((l) => l.toLowerCase());
  for (let row = last; row; row = row.previousElementSibling) {
    if (!row.textContent.trim()) continue; // trailing spacer
    return [...row.querySelectorAll('button, [role="button"]')].find((b) => wanted.includes(label(b)) && !b.disabled) || null;
  }
  return null;
}

export function check(doc = app.doc, now = Date.now()) {
  for (const root of grokRoots(doc)) {
    const button = findRetry(root);
    if (!button || tried.has(button)) continue;
    tried.add(button);
    if (now - lastAuto < COOLDOWN_MS) return 'cooldown';
    lastAuto = now;
    const view = doc.defaultView;
    view.clearTimeout(pending);
    pending = view.setTimeout(() => {
      if (!button.isConnected) return;
      button.click();
      showToast('Grok 回复出错，已自动重试一次。', 'info', doc);
    }, Math.max(1, settings.store.delay) * 1000);
    return 'scheduled';
  }
  return null;
}

export function resetRetry() {
  lastAuto = -Infinity;
}

let stop = null;

export default definePlugin({
  name: 'AutoRetry',
  description: 'Grok 回复出错（Something went wrong）时，自动点一次 X 自带的 Retry。每次出错只重试一次，一分钟内最多一次（移植自 void++）。',
  icon: ICONS.retry,
  tags: ['chats'],
  enabledByDefault: true,
  settings,
  start() {
    stop = watchGrok(app.doc, (doc) => check(doc));
  },
  stop() {
    stop?.();
    stop = null;
    app.doc.defaultView.clearTimeout(pending);
  }
});
