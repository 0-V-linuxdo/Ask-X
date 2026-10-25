// Port of Void++'s CustomGreeting. Replaces Grok's empty-chat title ("How
// can I help you today?") in the drawer and on /i/grok with your own
// phrases, rotated on each new chat, on a timer, or when you click it.
//
// The title is found by structure (the large text of an empty chat), not by
// its wording, so it works in every X language. X keeps rendering its own
// text; Ask X only hides it and draws the phrase with CSS, so React never
// fights over the node.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { getComposer } from '../drawer.js';
import { getMessages, grokRoots, timeThrottle, touchesGrok } from '../grok.js';
import { ICONS } from '../icons.js';

const MARK = 'data-askx-greet';
const PH_MARK = 'data-askx-greet-ph';
const STYLE_ID = 'askx-greeting';
const MIN_FONT = 20;

const DEFAULT_PHRASES = [
  '今天想弄明白点什么？',
  '划一段文字，问问 Grok。',
  '好问题，值得一个好答案。'
].join('\n');

const settings = definePluginSettings({
  phrases: {
    type: OptionType.STRING,
    multiline: true,
    allowEmpty: true,
    label: '问候语',
    description: '每行一句。留空则保留 Grok 自己的问候语。',
    default: DEFAULT_PHRASES
  },
  mode: {
    type: OptionType.SELECT,
    label: '切换时机',
    description: '什么时候换下一句。',
    options: [
      { value: 'refresh', label: '每次新对话' },
      { value: 'interval', label: '定时切换' },
      { value: 'manual', label: '点击问候语' }
    ],
    default: 'refresh'
  },
  order: {
    type: OptionType.SELECT,
    label: '顺序',
    description: '按列表顺序还是随机挑一句。',
    options: [
      { value: 'sequential', label: '顺序' },
      { value: 'random', label: '随机' }
    ],
    default: 'sequential'
  },
  intervalSec: {
    type: OptionType.SLIDER,
    label: '切换间隔（秒）',
    description: '“定时切换”时每隔多少秒换一句。',
    min: 1,
    max: 3600,
    default: 10
  },
  placeholder: {
    type: OptionType.BOOLEAN,
    label: '替换输入框提示',
    description: '同时把输入框里的灰色提示（Ask anything）换成当前这句问候语。',
    default: false
  }
});

export function parsePhrases(raw) {
  return String(raw ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
}

let observer = null;
let timer = 0;
let index = -1;
let schedule = null;
let shownOnce = false;
const seen = new WeakSet();

function phrases() {
  return parsePhrases(settings.store.phrases);
}

export function nextIndex(current, count, order, random = Math.random) {
  if (count <= 1) return 0;
  if (order === 'random') {
    let next = current;
    while (next === current) next = Math.floor(random() * count);
    return next;
  }
  return (current + 1) % count;
}

function current() {
  const list = phrases();
  if (!list.length) return '';
  if (index < 0 || index >= list.length) index = 0;
  return list[index];
}

function rotate() {
  const list = phrases();
  index = nextIndex(index, list.length, settings.store.order);
  paint();
}

// The empty-chat title: the large leaf text of a root that has no messages.
export function findGreeting(root) {
  if (getMessages(root).length) return null;
  const view = root.ownerDocument.defaultView;
  const composer = getComposer(root);
  for (const el of root.querySelectorAll('span, h1, h2, div[dir]')) {
    if (el.childElementCount || !el.textContent.trim()) continue;
    if (composer && (el.contains(composer) || composer.contains(el))) continue;
    if (el.closest('button, [role="button"], a')) continue;
    if (parseFloat(view.getComputedStyle(el).fontSize) < MIN_FONT) continue;
    // X's newer drawer animates its title word by word inside an <h1>;
    // take the whole heading, not one word of it.
    const heading = el.closest('h1, h2, h3');
    return heading && root.contains(heading) ? heading : el;
  }
  return null;
}

// X's own text stays in the DOM but takes no space; the phrase is drawn by
// ::after so it wraps inside the drawer whatever X's title is doing
// (single span, or animated words with white-space:pre and fixed widths).
function css() {
  return `[${MARK}]{font-size:0!important;white-space:normal!important}`
    + `[${MARK}]>*{display:none!important}`
    + `[${MARK}]::after{content:attr(${MARK});display:inline-block;max-width:100%;font-size:var(--askx-greet-size,26px);line-height:1.3;white-space:normal;overflow-wrap:anywhere;text-wrap:balance}`
    + `[${MARK}][data-askx-greet-click]{cursor:pointer}`;
}

function clearMarks(doc) {
  for (const el of doc.querySelectorAll(`[${MARK}]`)) {
    el.removeAttribute(MARK);
    el.removeAttribute('data-askx-greet-click');
    el.style.removeProperty('--askx-greet-size');
  }
  for (const el of doc.querySelectorAll(`[${PH_MARK}]`)) {
    el.setAttribute('placeholder', el.getAttribute(PH_MARK));
    el.removeAttribute(PH_MARK);
  }
}

function onClick(event) {
  if (settings.store.mode !== 'manual') return;
  if (!event.target.closest?.(`[${MARK}]`)) return;
  event.preventDefault();
  rotate();
}

export function paint(doc = app.doc) {
  const text = current();
  let painted = 0;
  const titles = new Set();
  for (const root of grokRoots(doc)) {
    const title = findGreeting(root);
    if (title && text) {
      titles.add(title);
      // A freshly mounted title means a new empty chat: next phrase.
      if (!seen.has(title)) {
        seen.add(title);
        if (shownOnce && settings.store.mode === 'refresh') index = nextIndex(index, phrases().length, settings.store.order);
        shownOnce = true;
      }
      const phrase = current();
      if (!title.hasAttribute(MARK)) title.style.setProperty('--askx-greet-size', doc.defaultView.getComputedStyle(title).fontSize);
      if (title.getAttribute(MARK) !== phrase) title.setAttribute(MARK, phrase);
      if (settings.store.mode === 'manual') title.setAttribute('data-askx-greet-click', '');
      else title.removeAttribute('data-askx-greet-click');
      painted += 1;
    }
    const composer = getComposer(root);
    if (composer && composer.tagName === 'TEXTAREA') {
      if (settings.store.placeholder && text) {
        if (!composer.hasAttribute(PH_MARK)) composer.setAttribute(PH_MARK, composer.getAttribute('placeholder') || '');
        if (composer.getAttribute('placeholder') !== current()) composer.setAttribute('placeholder', current());
      } else if (composer.hasAttribute(PH_MARK)) {
        composer.setAttribute('placeholder', composer.getAttribute(PH_MARK));
        composer.removeAttribute(PH_MARK);
      }
    }
  }
  // A node that is no longer the empty-chat title (X reused it, or the chat
  // got messages) must not stay hidden behind the phrase.
  for (const el of doc.querySelectorAll(`[${MARK}]`)) {
    if (titles.has(el)) continue;
    el.removeAttribute(MARK);
    el.removeAttribute('data-askx-greet-click');
    el.style.removeProperty('--askx-greet-size');
  }
  return painted;
}

function restartTimer() {
  const view = app.doc.defaultView;
  view.clearInterval(timer);
  timer = 0;
  if (settings.store.mode === 'interval') timer = view.setInterval(rotate, Math.max(1, settings.store.intervalSec) * 1000);
}

export default definePlugin({
  name: 'CustomGreeting',
  description: '把 Grok 空对话的问候语（How can I help you today?）换成你自己的句子，可以每次新对话、定时或点击时轮换（移植自 void++）。',
  icon: ICONS.greeting,
  tags: ['appearance'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css();
      (doc.head || doc.documentElement).appendChild(style);
    }
    index = settings.store.order === 'random' ? nextIndex(-1, phrases().length, 'random') : 0;
    shownOnce = false;
    schedule = timeThrottle(doc.defaultView, () => paint(doc), 100);
    paint(doc);
    observer = new doc.defaultView.MutationObserver((records) => { if (touchesGrok(records, doc)) schedule(); });
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder'] });
    doc.addEventListener('click', onClick, true);
    restartTimer();
  },
  onSettingsChange() {
    clearMarks(app.doc);
    restartTimer();
    paint(app.doc);
  },
  stop() {
    observer?.disconnect();
    observer = null;
    schedule?.cancel();
    app.doc.defaultView.clearInterval(timer);
    app.doc.removeEventListener('click', onClick, true);
    clearMarks(app.doc);
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
