// Status badge on the minimised Grok drawer (Void++ shows chat state on the
// tab favicon; on X the drawer button is the natural place). While Grok is
// replying a blue dot pulses; when the reply is done a green dot stays until
// you open the drawer; a failed reply shows red.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { getDrawer } from '../drawer.js';
import { getMessages, isDrawerOpen, timeThrottle, touchesGrok } from '../grok.js';
import { ICONS } from '../icons.js';
import { cancelAll, isStreaming, watchStreams } from '../streamWatch.js';
import { tintsButton } from './grokState.js';

const BADGE = 'askx-status-dot';
const STYLE_ID = 'askx-badge-style';

const settings = definePluginSettings({
  showStreaming: {
    type: OptionType.BOOLEAN,
    label: '回复中',
    description: 'Grok 正在回复时显示闪动的蓝点。',
    default: true
  },
  showDone: {
    type: OptionType.BOOLEAN,
    label: '有新回复',
    description: '回复完成后显示绿点，直到你展开小窗。',
    default: true
  },
  showError: {
    type: OptionType.BOOLEAN,
    label: '出错',
    description: '回复失败时显示红点。',
    default: true
  }
});

// 'idle' | 'streaming' | 'done' | 'error'
let state = 'idle';
let startedAt = 0;
// How long a sent message may take to show up in the chat.
const SHOW_UP_MS = 8000;
let off = null;
let observer = null;
let schedule = null;

export function badgeState() {
  return state;
}

export function visibleState(s = state, opts = settings.store) {
  if (s === 'streaming' && opts.showStreaming) return 'streaming';
  if (s === 'done' && opts.showDone) return 'done';
  if (s === 'error' && opts.showError) return 'error';
  return '';
}

export function paint(doc = app.doc) {
  const drawer = getDrawer(doc);
  const open = isDrawerOpen(doc);
  // Seeing the drawer counts as reading the reply.
  if (open && (state === 'done' || state === 'error')) state = 'idle';
  // An open chat that is still empty well after the send is not replying to
  // anything: the send was dropped.
  if (open && state === 'streaming' && drawer && Date.now() - startedAt > SHOW_UP_MS && !getMessages(drawer).length) {
    state = 'idle';
    cancelAll();
  }
  // Only one indicator on the Grok button: GrokState's colour wins when on.
  const show = drawer && !open && !tintsButton() ? visibleState() : '';
  let badge = drawer?.querySelector(`:scope > .${BADGE}`);
  for (const stray of doc.querySelectorAll(`.${BADGE}`)) if (stray !== badge) stray.remove();
  if (!show) { badge?.remove(); return ''; }
  if (!badge) {
    badge = doc.createElement('span');
    badge.className = BADGE;
    badge.setAttribute('aria-hidden', 'true');
    drawer.appendChild(badge);
  }
  if (badge.dataset.state !== show) badge.dataset.state = show;
  badge.title = { streaming: 'Grok 正在回复', done: 'Grok 回复完成', error: 'Grok 回复失败' }[show];
  return show;
}

export function onStream(detail, doc = app.doc) {
  if (detail.phase === 'start') { state = 'streaming'; startedAt = Date.now(); }
  else if (detail.cancelled) state = 'idle';
  else if (!isStreaming()) state = detail.ok === false ? 'error' : (isDrawerOpen(doc) ? 'idle' : 'done');
  paint(doc);
}

const CSS = `
.${BADGE} { position: absolute !important; top: 6px; right: 6px; display: block !important; box-sizing: border-box !important; width: 10px !important; height: 10px !important; min-width: 0 !important; padding: 0 !important; margin: 0 !important; flex: none !important; border-radius: 50%; z-index: 2; pointer-events: none; box-shadow: 0 0 0 2px var(--askx-badge-ring, #000); }
.${BADGE}[data-state="streaming"] { background: #1d9bf0; animation: askx-badge-pulse 1.2s ease-in-out infinite; }
.${BADGE}[data-state="done"] { background: #00ba7c; }
.${BADGE}[data-state="error"] { background: #f4212e; }
@keyframes askx-badge-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.8); } }
@media (prefers-reduced-motion: reduce) { .${BADGE}[data-state="streaming"] { animation: none; } }
`;

export default definePlugin({
  name: 'StatusBadge',
  description: 'Grok 小窗收起时，在小窗按钮右上角用圆点显示状态：蓝点闪动表示正在回复，绿点表示有新回复，红点表示出错。GrokState 的“Grok 按钮变色”开启时不显示，两者只用其一。',
  icon: ICONS.badge,
  tags: ['notifications'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }
    state = isStreaming() ? 'streaming' : 'idle';
    schedule = timeThrottle(doc.defaultView, () => paint(doc), 100);
    off = watchStreams(doc, (detail) => onStream(detail, doc));
    observer = new doc.defaultView.MutationObserver((records) => { if (touchesGrok(records, doc)) schedule(); });
    observer.observe(doc.body, { childList: true, subtree: true });
    paint(doc);
  },
  onSettingsChange: () => paint(),
  stop() {
    off?.();
    off = null;
    observer?.disconnect();
    observer = null;
    schedule?.cancel();
    for (const badge of app.doc.querySelectorAll(`.${BADGE}`)) badge.remove();
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
