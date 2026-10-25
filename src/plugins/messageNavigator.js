// Port of Void++'s BetterNavigator for X's Grok: a slim rail of ticks on the
// right edge of the conversation, one per message (short for yours, long for
// Grok's), with the one you are reading highlighted. Hovering the rail opens
// an outline of the whole chat; click a line or a tick to jump there.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { DRAWER } from '../drawer.js';
import { activeIndex, frameThrottle, getMessages, grokRoots, jumpTo, overlaidAt, scrollerOf, timeThrottle, touchesGrok, touchesLayers, viewportOf } from '../grok.js';
import { ICONS } from '../icons.js';
import { startMessageKeys, stopMessageKeys } from '../messageKeys.js';
import { watchTheme } from '../theme.js';

const RAIL = 'askx-msgnav';
const STYLE_ID = 'askx-nav-style';

const settings = definePluginSettings({
  showAssistant: {
    type: OptionType.BOOLEAN,
    label: '包含 Grok 的回复',
    description: '导航里同时列出 Grok 的回复，而不只是你的消息。',
    default: true
  },
  jumpEffect: {
    type: OptionType.SELECT,
    label: '跳转效果',
    description: '跳到某条消息后是否高亮它。',
    options: [
      { value: 'border', label: '高亮边框' },
      { value: 'none', label: '无' }
    ],
    default: 'border'
  }
});

const rails = new Map(); // root -> { rail, ticks, panel, items }
let observer = null;
let schedule = null;
let reposition = null;
let stopTheme = null;
let theme = 'dark';

export function navMessages(root) {
  const all = getMessages(root);
  return settings.store.showAssistant ? all : all.filter((m) => m.role === 'user');
}

function makeRail(doc, root) {
  const rail = doc.createElement('div');
  rail.className = RAIL;
  rail.dataset.theme = theme;
  rail.dataset.surface = root.matches(DRAWER) ? 'drawer' : 'page';
  const ticks = doc.createElement('div');
  ticks.className = `${RAIL}-ticks`;
  const panel = doc.createElement('div');
  panel.className = `${RAIL}-menu`;
  const meta = doc.createElement('div');
  meta.className = `${RAIL}-meta`;
  const list = doc.createElement('ul');
  list.className = `${RAIL}-list`;
  list.setAttribute('aria-label', '消息导航');
  panel.append(meta, list);
  rail.append(panel, ticks);
  const entry = { rail, ticks, panel, meta, list, items: [], key: '' };
  const jump = (i) => {
    const m = entry.items[i];
    if (m) jumpTo(m, { effect: settings.store.jumpEffect });
  };
  rail.addEventListener('click', (event) => {
    const hit = event.target.closest('[data-index]');
    if (!hit) return;
    event.preventDefault();
    jump(Number(hit.dataset.index));
  });
  doc.body.appendChild(rail);
  return entry;
}

function render(doc, entry, items) {
  const key = items.map((m) => `${m.role}:${m.text}`).join('\n');
  entry.items = items;
  if (key === entry.key) return;
  entry.key = key;
  entry.ticks.textContent = '';
  entry.list.textContent = '';
  entry.ticks.classList.toggle(`${RAIL}-dense`, items.length > 16);
  items.forEach((m, i) => {
    const tick = doc.createElement('button');
    tick.type = 'button';
    tick.className = `${RAIL}-tick ${RAIL}-tick-${m.role === 'user' ? 'user' : 'asst'}`;
    tick.dataset.index = String(i);
    tick.setAttribute('aria-label', `跳到第 ${i + 1} 条，共 ${items.length} 条`);
    entry.ticks.appendChild(tick);
    const li = doc.createElement('li');
    const line = doc.createElement('button');
    line.type = 'button';
    line.className = `${RAIL}-item`;
    line.dataset.index = String(i);
    const emoji = doc.createElement('span');
    emoji.className = `${RAIL}-emoji`;
    emoji.textContent = m.role === 'user' ? '❓' : '🤖';
    const label = doc.createElement('span');
    label.className = `${RAIL}-label`;
    label.textContent = m.text || '（无文字）';
    line.append(emoji, label);
    li.appendChild(line);
    entry.list.appendChild(li);
  });
}

function place(entry, root) {
  const items = entry.items;
  const scroller = items[0] ? scrollerOf(items[0].el) : null;
  if (!scroller || items.length < 2) { entry.rail.hidden = true; return; }
  const view = root.ownerDocument.defaultView;
  const box = root.getBoundingClientRect();
  const { top, bottom } = viewportOf(scroller);
  const list = items[0].el.parentElement.getBoundingClientRect();
  const right = entry.rail.dataset.surface === 'drawer' ? box.right - 4 : list.right + 28;
  const listRight = Math.min(right, view.innerWidth - 4);
  const height = Math.max(0, Math.min(bottom, box.bottom) - Math.max(top, box.top));
  if (height < 80) { entry.rail.hidden = true; return; }
  entry.rail.hidden = false;
  const railTop = Math.round(Math.max(top, box.top));
  entry.rail.style.top = `${railTop}px`;
  entry.rail.style.height = `${Math.round(height)}px`;
  entry.rail.style.left = `${Math.round(listRight - 40)}px`;
  // Step aside while X's History sheet or a dialog covers this spot.
  if (overlaidAt(root.ownerDocument, root, listRight - 8, railTop + height / 2, entry.rail)) { entry.rail.hidden = true; return; }
  const active = activeIndex(items, scroller);
  for (const node of entry.ticks.children) node.classList.toggle(`${RAIL}-current`, Number(node.dataset.index) === active);
  for (const node of entry.list.querySelectorAll('[data-index]')) node.classList.toggle(`${RAIL}-active`, Number(node.dataset.index) === active);
  const text = `${active + 1} / ${items.length}`;
  if (entry.meta.textContent !== text) entry.meta.textContent = text;
}

function placeAll() {
  for (const [root, entry] of rails) if (!entry.rail.hidden || entry.items.length) place(entry, root);
}

export function refresh(doc = app.doc) {
  const roots = new Set(grokRoots(doc));
  for (const [root, entry] of rails) {
    if (!roots.has(root) || !root.isConnected) { entry.rail.remove(); rails.delete(root); }
  }
  for (const root of roots) {
    const items = navMessages(root);
    let entry = rails.get(root);
    if (!items.length) { if (entry) entry.rail.hidden = true; continue; }
    if (!entry) { entry = makeRail(doc, root); rails.set(root, entry); }
    entry.rail.dataset.theme = theme;
    render(doc, entry, items);
    place(entry, root);
  }
  return rails.size;
}

const CSS = `
.${RAIL} { position: fixed; z-index: 2147483000; width: 40px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; pointer-events: none; box-sizing: border-box;
  --nav-fg: #e7e9ea; --nav-fg2: #a3a7ab; --nav-fg3: rgba(113, 118, 123, 0.5); --nav-surface: #16181c; --nav-border: #2f3336; --nav-hover: rgba(255, 255, 255, 0.08);
  font: 400 14px/1.4 TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; letter-spacing: -0.2px; }
.${RAIL}[data-theme="light"] { --nav-fg: #0f1419; --nav-fg2: #536471; --nav-fg3: rgba(83, 100, 113, 0.5); --nav-surface: #fff; --nav-border: #eff3f4; --nav-hover: rgba(15, 20, 25, 0.06); }
.${RAIL}[hidden] { display: none; }
.${RAIL} *, .${RAIL} *::before, .${RAIL} *::after { box-sizing: border-box; }
.${RAIL}-ticks { display: flex; flex-direction: column; align-items: flex-end; flex: 0 0 auto; max-height: 100%; overflow: hidden; pointer-events: auto; scrollbar-width: none; }
.${RAIL}-tick { display: flex; align-items: center; justify-content: flex-end; width: 40px; flex: 0 0 auto; height: 12px; padding: 0 4px; margin: 0; border: 0; background: transparent; cursor: pointer; }
.${RAIL}-dense .${RAIL}-tick { height: 7.2px; }
.${RAIL}-tick::after { content: ""; display: block; height: 1px; width: 6px; border-radius: 9999px; background: var(--nav-fg3); transition: width 0.15s ease, background-color 0.15s ease, opacity 0.15s ease; }
.${RAIL}-tick-asst::after { width: 12px; }
.${RAIL}-tick.${RAIL}-current::after { width: 16px; background: var(--nav-fg); opacity: 1; }
.${RAIL}-tick:focus-visible { outline: none; }
.${RAIL}-tick:focus-visible::after { background: var(--nav-fg); }
.${RAIL}-menu { pointer-events: auto; position: absolute; top: 50%; right: calc(100% + 4px); z-index: 50; width: min(288px, 70vw); max-height: 100%; overflow: auto; padding: 6px;
  border: 1px solid var(--nav-border); border-radius: 20px; background: var(--nav-surface); color: var(--nav-fg);
  opacity: 0; visibility: hidden; transform: translate(8px, -50%); transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease; scrollbar-width: thin; }
.${RAIL}:hover .${RAIL}-menu, .${RAIL}:focus-within .${RAIL}-menu { opacity: 1; visibility: visible; transform: translate(0, -50%); }
.${RAIL}-meta { padding: 4px 10px 6px; color: var(--nav-fg2); font-size: 12px; line-height: 1.4; }
.${RAIL}-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.${RAIL}-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 6.4px 8px; margin: 0; border: 1px solid transparent; border-radius: 12px; background: transparent;
  color: var(--nav-fg2); font: inherit; text-align: start; cursor: pointer; }
.${RAIL}-item:hover, .${RAIL}-item:focus-visible { background: var(--nav-hover); color: var(--nav-fg); outline: none; }
.${RAIL}-item.${RAIL}-active { background: transparent; color: var(--nav-fg); border-color: var(--nav-border); }
.${RAIL}-item.${RAIL}-active:hover, .${RAIL}-item.${RAIL}-active:focus-visible { background: var(--nav-hover); }
.${RAIL}-emoji { flex: none; font-size: 16px; line-height: 1; }
.${RAIL}-label { overflow: hidden; min-width: 0; text-overflow: ellipsis; white-space: nowrap; }
[data-askx-flash] { outline: 2px solid currentColor; outline-offset: 4px; border-radius: 12px; }
@media (prefers-reduced-motion: reduce) { .${RAIL}-menu, .${RAIL}-tick::after { transition: none; } }
`;

function onScroll() { reposition?.(); }

export default definePlugin({
  name: 'MessageNavigator',
  description: '在 Grok 对话右侧加一条消息导航：每条消息一个刻度，正在看的那条高亮；鼠标移上去展开整段对话的目录，点一下跳过去。不在输入时，↑ ↓ 切换消息，Home / End 跳到首尾（移植自 void++ BetterNavigator）。',
  icon: ICONS.navigator,
  tags: ['navigation', 'messages'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    const view = doc.defaultView;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }
    stopTheme = watchTheme(doc, (t) => { theme = t; for (const { rail } of rails.values()) rail.dataset.theme = t; });
    schedule = timeThrottle(view, () => refresh(doc), 150);
    reposition = frameThrottle(view, placeAll);
    let settle = 0;
    observer = new view.MutationObserver((records) => {
      if (records.every((r) => r.target.closest?.(`.${RAIL}`))) return;
      if (touchesGrok(records, doc)) schedule();
      // Sheets slide in: look again once they have arrived.
      if (touchesLayers(records)) {
        reposition();
        view.clearTimeout(settle);
        settle = view.setTimeout(placeAll, 400);
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
    view.addEventListener('scroll', onScroll, true);
    view.addEventListener('resize', onScroll);
    refresh(doc);
    startMessageKeys(() => !settings.store.showAssistant);
  },
  onSettingsChange() {
    for (const entry of rails.values()) entry.key = '';
    refresh();
  },
  stop() {
    const view = app.doc.defaultView;
    observer?.disconnect();
    observer = null;
    view.removeEventListener('scroll', onScroll, true);
    view.removeEventListener('resize', onScroll);
    schedule?.cancel();
    reposition?.cancel();
    stopTheme?.();
    for (const { rail } of rails.values()) rail.remove();
    rails.clear();
    stopMessageKeys();
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
