// Grok's chat state, like Void++'s ChatStateFavicons, shown where it belongs
// on X: the Grok button (the minimised drawer) takes the state colour —
// replying blue, reply done green, prompt typed amber, failed red. Optionally
// the tab icon shows it too, as X's own logo with a small coloured badge (X's
// icon is never replaced by another logo). Ask X only adds and removes its
// own <link>; X's links and its icon file are never edited.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { DRAWER, getComposer, readValue } from '../drawer.js';
import { getMessages, grokRoots } from '../grok.js';
import { addStyle, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';
import { watchStreams } from '../streamWatch.js';

const ICON_ID = 'askx-chat-state-favicon';
const STYLE_ID = 'askx-grok-state';
const STATE = 'data-askx-grok-state';
const STYLE = 'data-askx-grok-style';

const settings = definePluginSettings({
  buttonStyle: {
    type: OptionType.SELECT,
    label: 'Grok 按钮样式',
    description: '小窗收起后 Grok 按钮怎样显示状态（回复中蓝、完成绿、待发送黄、出错红），样式和 Void++ 一致，只用其中一种。选“不显示”时由 StatusBadge 的角标圆点接管。',
    options: [
      { value: 'hole', label: 'Grok 标志变色' },
      { value: 'bg', label: '背景变色' },
      { value: 'dot', label: '彩色圆点' },
      { value: 'badge', label: '徽标 + 符号' },
      { value: 'original', label: '只用表情' },
      { value: 'none', label: '不显示' }
    ],
    default: 'hole'
  },
  favicon: {
    type: OptionType.BOOLEAN,
    label: '标签页图标显示状态',
    description: '在 X 自己的图标右下角加一个彩色状态点。空闲时恢复 X 原图标。',
    default: false
  },
  faviconStyle: {
    type: OptionType.SELECT,
    label: '标签页图标样式',
    description: '状态点的样式。',
    options: [
      { value: 'dot', label: '彩色圆点' },
      { value: 'badge', label: '徽标 + 符号' }
    ],
    default: 'dot'
  }
});

// Whether GrokState shows the state on the Grok button (StatusBadge then
// stays out of the way, so the button never shows two indicators).
export function tintsButton() {
  return Boolean(app.manager?.isEnabled?.('GrokState') && settings.store.buttonStyle !== 'none');
}

export const KIND_COLOR = { rotate: '#3B82F6', done: '#22C55E', ready: '#F59E0B', error: '#EF4444' };

// X's logo (white mark on its black tile), drawn as SVG so a badge can sit on it.
const X_MARK = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const xTile = () => `<rect width="64" height="64" rx="12" fill="#000"/><g transform="translate(12 12) scale(1.6667)" fill="#fff"><path d="${X_MARK}"/></g>`;
const svgData = (inner) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${inner}</svg>`)}`;

function glyph(kind) {
  if (kind === 'rotate') return '<g transform="translate(50 50)"><g><path d="M0-6.1 A6.1 6.1 0 1 1 -5.3 3.05" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.85s" repeatCount="indefinite"/></g></g>';
  if (kind === 'done') return '<path d="M45 50.2 L48.6 53.8 L55.2 46" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
  if (kind === 'ready') return '<path d="M50 55V45M45.2 49.8 50 45l4.8 4.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  return '<path d="M45.8 45.8 54.2 54.2M54.2 45.8 45.8 54.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
}

// Data URL of X's icon with the state badge, or '' for 'wait' (X's own icon).
export function iconFor(style, kind) {
  const color = KIND_COLOR[kind];
  if (!color) return '';
  if (style === 'badge') return svgData(`${xTile()}<circle cx="50" cy="50" r="13" fill="#000"/><circle cx="50" cy="50" r="10.5" fill="${color}"/>${glyph(kind)}`);
  return svgData(`${xTile()}<circle cx="51" cy="51" r="11.5" fill="#000"/><circle cx="51" cy="51" r="8.5" fill="${color}"/>`);
}

// ---- state (Void++'s rules, fed by Ask X's passive stream watcher) ----
// 'wait' | 'rotate' | 'done' | 'ready' | 'error'
let kind = 'wait';
let streaming = false;
let finished = null; // 'done' | 'error' after a reply ends, until you move on

function composerText(doc) {
  for (const root of grokRoots(doc)) {
    const field = getComposer(root);
    if (field && /\S/.test(readValue(field).replace(/​/g, ''))) return true;
  }
  return false;
}

function hasConversation(doc) {
  return grokRoots(doc).some((root) => getMessages(root).length > 0);
}

export function nextKind({ streaming: live, finished: last, typed, conversation }) {
  if (live) return 'rotate';
  if (typed) return 'ready';
  if (last && conversation !== false) return last;
  return 'wait';
}

function apply(doc = app.doc) {
  const typed = composerText(doc);
  // Typing a new prompt, or starting over in an empty chat, moves on from
  // the finished state (as Void++ does when the input stops being empty).
  if (finished && !streaming && typed) finished = null;
  const conversation = grokRoots(doc).length ? hasConversation(doc) : null;
  if (finished && conversation === false) finished = null;
  const next = nextKind({ streaming, finished, typed, conversation });
  if (next !== kind) kind = next;
  paint(doc);
}

function paintButton(doc) {
  const style = settings.store.buttonStyle;
  const value = style !== 'none' && KIND_COLOR[kind] ? kind : '';
  for (const drawer of doc.querySelectorAll(DRAWER)) {
    // Only the minimised drawer is "the Grok button"; while it is open its
    // header holds X's own controls (history, expand, new chat, collapse),
    // which must never be recoloured.
    if (value && !getComposer(drawer)) {
      if (drawer.getAttribute(STATE) !== value) drawer.setAttribute(STATE, value);
      if (drawer.getAttribute(STYLE) !== style) drawer.setAttribute(STYLE, style);
    } else {
      drawer.removeAttribute(STATE);
      drawer.removeAttribute(STYLE);
    }
  }
}

function paintFavicon(doc) {
  const href = settings.store.favicon ? iconFor(settings.store.faviconStyle, kind) : '';
  let link = doc.getElementById(ICON_ID);
  if (!href) { link?.remove(); return; }
  const head = doc.head;
  if (!head) return;
  if (!link) {
    link = doc.createElement('link');
    link.id = ICON_ID;
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.setAttribute('sizes', 'any');
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  // The browser uses the last icon link; keep ours last even if X adds one.
  if (head.lastElementChild !== link) head.appendChild(link);
}

function paint(doc) {
  paintButton(doc);
  paintFavicon(doc);
}

export function onStream(detail, doc = app.doc) {
  if (detail.phase === 'start') { streaming = true; finished = null; }
  else {
    streaming = false;
    finished = detail.cancelled ? null : (detail.ok === false ? 'error' : 'done');
  }
  apply(doc);
}

export function chatState() {
  return kind;
}

let offStreams = null;
let offGrok = null;
let headObserver = null;
const onInput = (event) => { if (event.target?.closest?.('[data-testid="GrokDrawer"], main')) apply(); };

// The collapsed drawer (the Grok button) in each of Void++'s styles. Only
// CSS on X's elements plus pseudo-elements; nothing is inserted into X's DOM.
const EMOJI = { rotate: '🔄', done: '✔️', ready: '👍', error: '🚫' };
// The single Grok mark inside the minimised drawer's one button. One :is()
// so a state prefix scopes both forms: as a bare list, the second form
// matched in every state and hid the closed drawer's icon.
const MARK = ':is([data-testid="GrokDrawerHeader"] > button:only-child > svg, button[data-testid="GrokDrawerHeader"] > svg)';
const sel = (style, k, tail = '') => `${DRAWER}[${STYLE}="${style}"][${STATE}="${k}"]${tail}`;
// The badge glyphs are drawn around (50, 50); crop the SVG to that corner.
const glyphUrl = (k, c) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="37 37 26 26"><circle cx="50" cy="50" r="12.5" fill="#000"/><circle cx="50" cy="50" r="10.5" fill="${c}"/>${glyph(k)}</svg>`)}")`;
export const BUTTON_CSS = Object.entries(KIND_COLOR).map(([k, c]) => [
  `${sel('hole', k)} ${MARK}{color:${c}!important;fill:${c}!important;transition:color .2s,fill .2s}`,
  `${sel('bg', k)} > div:first-child{background-color:${c}!important}`,
  `${sel('bg', k)} ${MARK}{color:#fff!important;fill:#fff!important}`,
  `${sel('dot', k, '::after')},${sel('badge', k, '::after')},${sel('original', k, '::after')}{content:"";position:absolute;z-index:2;pointer-events:none}`,
  `${sel('dot', k, '::after')}{top:6px;right:6px;width:10px;height:10px;border-radius:50%;background:${c};box-shadow:0 0 0 2px #000}`,
  `${sel('badge', k, '::after')}{top:3px;right:3px;width:18px;height:18px;background:${glyphUrl(k, c)} center/contain no-repeat}`,
  `${sel('original', k)} ${MARK}{opacity:0!important}`,
  `${sel('original', k, '::after')}{content:"${EMOJI[k]}";inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1}`
].join('')).join('')
  + `${DRAWER}[${STYLE}="hole"][${STATE}="rotate"] ${MARK},${DRAWER}[${STYLE}="bg"][${STATE}="rotate"] > div:first-child,${DRAWER}[${STYLE}="dot"][${STATE}="rotate"]::after{animation:askx-grok-pulse 1.2s ease-in-out infinite}`
  + '@keyframes askx-grok-pulse{0%,100%{opacity:1}50%{opacity:.45}}'
  + `@media (prefers-reduced-motion: reduce){${DRAWER}[${STATE}] *,${DRAWER}[${STATE}]::after{animation:none!important}}`;
const CSS = BUTTON_CSS;

export default definePlugin({
  name: 'GrokState',
  description: 'Grok 的状态显示在 Grok 按钮上（小窗收起时）：回复中蓝、完成绿、待发送黄、出错红，样式和 Void++ 一致可选（默认 Grok 标志变色）。可选在 X 标签页图标上加状态点（默认关闭，不替换 X 图标）。',
  icon: ICONS.tabIcon,
  tags: ['notifications'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    kind = 'wait';
    streaming = false;
    finished = null;
    addStyle(doc, STYLE_ID, CSS);
    offStreams = watchStreams(doc, (detail) => onStream(detail, doc));
    offGrok = watchGrok(doc, () => apply(doc));
    doc.addEventListener('input', onInput, true);
    // X swaps its own icon link (unread counts); stay last when it does.
    headObserver = new doc.defaultView.MutationObserver(() => { if (doc.getElementById(ICON_ID)) paintFavicon(doc); });
    if (doc.head) headObserver.observe(doc.head, { childList: true });
    apply(doc);
  },
  onSettingsChange: () => paint(app.doc),
  stop() {
    const doc = app.doc;
    offStreams?.();
    offGrok?.();
    offStreams = null;
    offGrok = null;
    headObserver?.disconnect();
    headObserver = null;
    doc.removeEventListener('input', onInput, true);
    doc.getElementById(ICON_ID)?.remove();
    doc.getElementById(STYLE_ID)?.remove();
    for (const el of doc.querySelectorAll(`[${STATE}]`)) { el.removeAttribute(STATE); el.removeAttribute(STYLE); }
    kind = 'wait';
  }
});
