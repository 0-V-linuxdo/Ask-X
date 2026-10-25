// Port of Void++'s ResponseNotification: when Grok finishes a reply, play a
// chime and/or show a system notification. On X "away" means the tab is in
// the background or the Grok drawer is minimised (you cannot see the reply).
// While the tab is visible but the drawer is minimised, a small toast says
// the reply is ready; clicking it opens the drawer.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { openDrawer } from '../drawer.js';
import { isDrawerOpen, onGrokPage } from '../grok.js';
import { ICONS } from '../icons.js';
import { watchStreams } from '../streamWatch.js';
import { el } from '../ui/dom.js';
import { toastOptions } from './completeToast.js';
import { showToast } from './toasts.js';

/* global GM_notification, GM_xmlhttpRequest */

const settings = definePluginSettings({
  sound: {
    type: OptionType.BOOLEAN,
    label: '提示音',
    description: '回复结束时播放提示音。',
    default: true
  },
  soundUrl: {
    type: OptionType.STRING,
    allowEmpty: true,
    label: '自定义提示音',
    description: '音频地址（https 或 data URL）。留空使用内置提示音。',
    placeholder: 'https://example.com/done.mp3',
    default: ''
  },
  preview: {
    type: OptionType.COMPONENT,
    label: '试听',
    description: '播放一次当前的提示音。',
    component: (doc) => el(doc, 'button', { type: 'button', class: 'askx-button askx-button-secondary', text: '试听', onclick: () => { unlock(); void playSound(); } })
  },
  browserNotification: {
    type: OptionType.BOOLEAN,
    label: '系统通知',
    description: '回复结束时弹出系统通知，点通知回到 X 并展开 Grok 小窗。',
    default: true
  },
  toast: {
    type: OptionType.BOOLEAN,
    label: '页面提示',
    description: '页面可见但 Grok 小窗收起时，在页面底部提示“Grok 回复完成”，点一下展开小窗。',
    default: true
  },
  onlyWhenAway: {
    type: OptionType.BOOLEAN,
    label: '仅在看不到回复时提醒',
    description: '标签页在后台或小窗已收起时才响铃和弹通知。',
    default: true
  }
});

let ctx = null;
let off = null;
const buffers = new Map();

function audio() {
  const view = app.doc.defaultView;
  const Ctx = view.AudioContext || view.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx || ctx.state === 'closed') {
    try { ctx = new Ctx(); } catch { ctx = null; }
  }
  return ctx;
}

// Browsers only allow sound after the user has interacted with the page.
function unlock() {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

// Built-in chime: two soft sine notes.
function chime(c) {
  const now = c.currentTime;
  [[880, 0], [1318.5, 0.12]].forEach(([freq, at]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.6);
    osc.connect(gain).connect(c.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.65);
  });
}

function fetchBytes(url) {
  if (url.startsWith('data:')) {
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return Promise.resolve(bytes.buffer);
  }
  // X's CSP blocks fetching other sites from the page; go through the
  // userscript manager instead.
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('no GM_xmlhttpRequest')); return; }
    GM_xmlhttpRequest({
      method: 'GET', url, responseType: 'arraybuffer', timeout: 15_000,
      onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.response) : reject(new Error(`HTTP ${r.status}`))),
      onerror: () => reject(new Error('network')),
      ontimeout: () => reject(new Error('timeout'))
    });
  });
}

async function playSound() {
  const c = audio();
  if (!c) return false;
  if (c.state === 'suspended') { try { await c.resume(); } catch {} }
  const url = settings.store.soundUrl.trim();
  if (!url) { chime(c); return true; }
  try {
    let buf = buffers.get(url);
    if (!buf) {
      buf = await c.decodeAudioData((await fetchBytes(url)).slice(0));
      buffers.set(url, buf);
    }
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = 0.5;
    src.buffer = buf;
    src.connect(gain).connect(c.destination);
    src.start();
  } catch (error) {
    console.info('[Ask X] custom sound failed, using the built-in chime', error);
    chime(c);
  }
  return true;
}

const reveal = () => {
  try { app.doc.defaultView.focus(); } catch {}
  void openDrawer(app.doc);
};

export function isAway(doc = app.doc) {
  if (doc.hidden || doc.visibilityState === 'hidden') return true;
  return !onGrokPage(doc) && !isDrawerOpen(doc);
}

export function onStreamEnd(detail, doc = app.doc) {
  if (detail.phase !== 'end' || detail.ok === false || detail.cancelled) return null;
  const away = isAway(doc);
  const done = { sound: false, notification: false, toast: false };
  const extra = toastOptions(doc);
  if (settings.store.toast && away && (!doc.hidden || extra?.whileHidden)) {
    const toast = showToast('Grok 回复完成，点这里查看。', 'info', doc, { ...(extra || {}), onClick: reveal });
    toast.dataset.replyDone = '';
    done.toast = true;
  }
  if (settings.store.onlyWhenAway && !away) return done;
  if (settings.store.sound) { void playSound(); done.sound = true; }
  if (settings.store.browserNotification && typeof GM_notification === 'function') {
    GM_notification({ title: 'Grok', text: '回复完成。', silent: true, onclick: reveal });
    done.notification = true;
  }
  return done;
}

export default definePlugin({
  name: 'ResponseNotification',
  description: 'Grok 回复结束时提醒你：提示音、系统通知，小窗收起时还有页面提示（移植自 void++）。',
  icon: ICONS.bellRing,
  tags: ['notifications'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    doc.addEventListener('pointerdown', unlock, true);
    doc.addEventListener('keydown', unlock, true);
    off = watchStreams(doc, (detail) => onStreamEnd(detail, doc));
  },
  stop() {
    off?.();
    off = null;
    app.doc.removeEventListener('pointerdown', unlock, true);
    app.doc.removeEventListener('keydown', unlock, true);
  }
});
