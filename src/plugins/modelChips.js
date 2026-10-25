// One-click model icons (Auto / Fast / Expert; name on hover) in Grok's input bar, like
// Void++'s BetterModeSelect pinned chips. The chips are Ask X's own
// floating element laid over the place of X's model button (which keeps
// that place, hidden or shifted, so the text never runs under the chips). Choosing one opens X's own model menu out of
// sight and picks the item there, so X does the switching.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { getComposer } from '../drawer.js';
import { frameThrottle, grokRoots } from '../grok.js';
import { addStyle, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';
import { pageTheme } from '../theme.js';

export const MODES = ['Auto', 'Fast', 'Expert'];

// The same pictures as X's own model menu: rocket, lightning bolt, bulb.
const icon = (body) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const MODE_ICONS = {
  Auto: icon('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'),
  Fast: icon('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  Expert: icon('<path d="M15 14c.2-1 .7-1.7 1.5-2.5A4.6 4.6 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>')
};
const BAR = 'askx-model-chips';
const STYLE_ID = 'askx-model-chips-style';
const HIDE_MENU = 'data-askx-hide-model-menu';
const HIDE_BUTTON = 'data-askx-hide-model-button';
const GAP = 6;

const settings = definePluginSettings({
  Auto: { type: OptionType.BOOLEAN, label: '显示 Auto', description: '固定显示 Auto 按钮。', default: true },
  Fast: { type: OptionType.BOOLEAN, label: '显示 Fast', description: '固定显示 Fast 按钮。', default: true },
  Expert: { type: OptionType.BOOLEAN, label: '显示 Expert', description: '固定显示 Expert 按钮。', default: true },
  hideMenuButton: {
    type: OptionType.BOOLEAN,
    label: '隐藏原模型菜单按钮',
    description: '用快捷按钮替代输入框右侧 X 原来的模型菜单按钮（小窗里放不下两者时更整齐）。',
    default: true
  }
});

const CSS = `
.${BAR} { position: fixed; z-index: 2147483000; display: flex; gap: 3px; align-items: center; pointer-events: auto; }
.${BAR}[hidden] { display: none !important; }
.${BAR} button { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 9999px; color: var(--chip-fg); background: transparent; cursor: pointer; }
.${BAR} button svg { display: block; pointer-events: none; }
.${BAR} button:hover { background: var(--chip-hover); }
.${BAR} button[aria-pressed="true"] { color: var(--chip-on-fg); background: var(--chip-on-bg); border-color: var(--chip-on-bg); }
.${BAR}[data-theme="dark"] { --chip-fg: #e7e9ea; --chip-line: #3e4144; --chip-hover: rgba(231,233,234,.1); --chip-on-fg: #1d9bf0; --chip-on-bg: rgba(29,155,240,.15); }
.${BAR}[data-theme="light"] { --chip-fg: #0f1419; --chip-line: #cfd9de; --chip-hover: rgba(15,20,25,.08); --chip-on-fg: #1d9bf0; --chip-on-bg: rgba(29,155,240,.12); }
html[${HIDE_MENU}] [role="menu"] { opacity: 0 !important; pointer-events: none !important; }
[${HIDE_BUTTON}="replace"] { visibility: hidden !important; width: var(--askx-chips-w) !important; min-width: 0 !important; padding: 0 !important; border: 0 !important; overflow: hidden !important; }
[${HIDE_BUTTON}="before"] { margin-left: calc(var(--askx-chips-w) + ${GAP}px) !important; }
`;

// X's model button: its aria-label is the current mode's name.
export function modelButton(root) {
  return [...root.querySelectorAll('button')].find((b) => MODES.includes((b.getAttribute('aria-label') || '').trim())) || null;
}

export function currentMode(root) {
  return modelButton(root)?.getAttribute('aria-label')?.trim() || '';
}

// The menu item for a mode: by its name, else by position (Auto, Fast, Expert).
export function menuItemFor(menu, mode) {
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  return items.find((i) => (i.textContent || '').trim().startsWith(mode)) || items[MODES.indexOf(mode)] || null;
}

const sleep = (view, ms) => new Promise((r) => view.setTimeout(r, ms));

let busy = false;
export async function chooseMode(root, mode) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const button = modelButton(root);
  if (!button || busy || currentMode(root) === mode) return currentMode(root) === mode;
  busy = true;
  doc.documentElement.setAttribute(HIDE_MENU, '');
  try {
    button.click();
    let menu = null;
    for (let i = 0; i < 20 && !menu; i += 1) { await sleep(view, 25); menu = doc.querySelector('[role="menu"]'); }
    const item = menu && menuItemFor(menu, mode);
    if (item) item.click();
    else if (menu) doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(view, 60);
    return currentMode(root) === mode;
  } finally {
    doc.documentElement.removeAttribute(HIDE_MENU);
    busy = false;
  }
}

let bar = null;

// Sheets and dialogs open in X's #layers portal, outside Grok, and slide in:
// look again once the slide has finished. #layers may mount after start.
function watchLayers(doc) {
  if (layers) return;
  const host = doc.getElementById('layers');
  if (!host) return;
  const view = doc.defaultView;
  const now = frameThrottle(view, () => render(doc));
  let timer = 0;
  layers = new view.MutationObserver(() => {
    now();
    view.clearTimeout(timer);
    timer = view.setTimeout(() => render(doc), 400);
  });
  layers.observe(host, { childList: true, subtree: true });
  layers.cancel = () => { now.cancel(); view.clearTimeout(timer); };
}

function render(doc) {
  watchLayers(doc);
  const root = grokRoots(doc).find((r) => getComposer(r) && modelButton(r));
  const button = root && modelButton(root);
  const shown = MODES.filter((m) => settings.store[m]);
  // Whenever the chips are not shown, X's own model button must be: never
  // leave it hidden with nothing in its place.
  const giveBack = () => {
    if (bar) bar.hidden = true;
    for (const el of doc.querySelectorAll(`[${HIDE_BUTTON}]`)) { el.removeAttribute(HIDE_BUTTON); el.style.removeProperty('--askx-chips-w'); }
  };
  if (!button || !shown.length) { giveBack(); return; }
  if (!bar) {
    bar = doc.createElement('div');
    bar.className = BAR;
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Grok 模型');
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    doc.body.appendChild(bar);
  }
  bar.dataset.theme = pageTheme(doc);
  if (bar.dataset.modes !== shown.join()) {
    bar.dataset.modes = shown.join();
    bar.textContent = '';
    for (const mode of shown) {
      const chip = doc.createElement('button');
      chip.type = 'button';
      chip.innerHTML = MODE_ICONS[mode];
      chip.dataset.mode = mode;
      chip.title = mode;
      chip.setAttribute('aria-label', mode);
      chip.addEventListener('click', () => { const r = grokRoots(doc).find((x) => modelButton(x)); if (r) void chooseMode(r, mode).then(() => render(doc)); });
      bar.appendChild(chip);
    }
  }
  const now = currentMode(root);
  for (const chip of bar.children) chip.setAttribute('aria-pressed', String(chip.dataset.mode === now));
  // X's model button gives up its place in the input bar to the chips, so
  // the text field never runs underneath them: hidden but kept in the layout
  // at the chips' width, or (when it stays visible) pushed right by that
  // width. The chips then sit exactly on that reserved space.
  bar.hidden = false;
  const width = bar.offsetWidth;
  const mode = settings.store.hideMenuButton ? 'replace' : 'before';
  if (button.getAttribute(HIDE_BUTTON) !== mode) button.setAttribute(HIDE_BUTTON, mode);
  if (button.style.getPropertyValue('--askx-chips-w') !== `${width}px`) button.style.setProperty('--askx-chips-w', `${width}px`);
  const own = button.getBoundingClientRect();
  // X itself has hidden its button (e.g. while switching chats): no slot.
  if (!own.width || !own.height) { giveBack(); return; }
  const right = mode === 'replace' ? own.right : own.left - GAP;
  const left = Math.round(right - width);
  const top = Math.round(own.top + own.height / 2 - bar.offsetHeight / 2);
  bar.style.left = `${left}px`;
  bar.style.top = `${top}px`;
  // The chips float above the page, so step aside when X lays something
  // over the input box (the History sheet on /i/grok, a dialog…).
  bar.hidden = isCovered(doc, root, left + bar.offsetWidth / 2, top + bar.offsetHeight / 2);
}

export function isCovered(doc, root, x, y) {
  if (typeof doc.elementsFromPoint !== 'function') return false;
  const hit = doc.elementsFromPoint(x, y).find((el) => !el.closest(`.${BAR}`));
  return Boolean(hit) && !root.contains(hit);
}

let stop = null;
let onScroll = null;
let layers = null;

export default definePlugin({
  name: 'ModelChips',
  description: '在 Grok 输入框里放 Auto / Fast / Expert 图标按钮（悬停显示名称），一点就切换模型，不用每次打开模型菜单；可选隐藏原菜单按钮（移植自 void++）。',
  icon: ICONS.zap,
  tags: ['composer'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    addStyle(doc, STYLE_ID, CSS);
    stop = watchGrok(doc, render);
    onScroll = () => render(doc);
    doc.defaultView.addEventListener('resize', onScroll);
    doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
    render(doc);
  },
  onSettingsChange: () => render(app.doc),
  stop() {
    const doc = app.doc;
    stop?.();
    stop = null;
    doc.defaultView.removeEventListener('resize', onScroll);
    doc.removeEventListener('scroll', onScroll, { capture: true });
    layers?.disconnect();
    layers?.cancel();
    layers = null;
    bar?.remove();
    bar = null;
    for (const el of doc.querySelectorAll(`[${HIDE_BUTTON}]`)) { el.removeAttribute(HIDE_BUTTON); el.style.removeProperty('--askx-chips-w'); }
    doc.getElementById(STYLE_ID)?.remove();
  }
});
