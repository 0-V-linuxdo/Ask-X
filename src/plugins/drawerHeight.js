// Height of the Grok drawer. X opens it at a size of its own choosing (about
// half the window for an empty chat). The default preset fills the whole right
// sidebar: top to bottom of the window and past both of its side edges, raised above
// X's floating Chat button. "Custom" only changes the height and keeps X's
// bottom edge.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { getComposer, getDrawer } from '../drawer.js';
import { frameThrottle, touchesGrok } from '../grok.js';
import { ICONS } from '../icons.js';

const MARK = 'data-askx-height';
const STYLE_ID = 'askx-drawer-height';
const LAYER = 'data-askx-height-layer';
const TOP_GAP = 8;
const EDGE_GAP = 8; // left and right of the full sidebar
const FULL_V_GAP = 0; // above and below it: flush with the window

const settings = definePluginSettings({
  preset: {
    type: OptionType.SELECT,
    label: '弹窗高度',
    description: '“完整侧边栏”从窗口顶部一直到底部；“X 默认”不做改动。',
    options: [
      { value: 'sidebar', label: '完整侧边栏' },
      { value: 'custom', label: '自定义' },
      { value: 'x', label: 'X 默认' }
    ],
    default: 'sidebar'
  },
  height: {
    type: OptionType.SLIDER,
    label: '自定义高度（px）',
    description: '选“自定义”时使用；超过窗口时自动缩到窗口高度。',
    min: 300,
    max: 1600,
    default: 640
  }
});

// Target height in px, or 0 to leave X's own size. `drawerBottom` is where X
// puts the bottom edge; the full sidebar runs to the bottom of the window.
export function targetHeight({ preset, height }, drawerBottom, viewHeight = drawerBottom) {
  const room = Math.max(0, Math.round(drawerBottom - TOP_GAP));
  if (preset === 'sidebar') return Math.max(0, Math.round(viewHeight - 2 * FULL_V_GAP));
  if (preset === 'custom') return Math.min(room, Math.max(300, Math.round(height)));
  return 0;
}

// The drawer's own positioned container, a sibling of the Chat button's.
function layerOf(drawer) {
  return drawer.parentElement?.parentElement || null;
}

function clear(drawer) {
  drawer.removeAttribute(MARK);
  for (const prop of ['--askx-drawer-h', '--askx-drawer-shift', '--askx-drawer-mr', '--askx-drawer-w']) drawer.style.removeProperty(prop);
  layerOf(drawer)?.removeAttribute(LAYER);
}

let observer = null;
let schedule = null;
let onResize = null;
let settle = 0;
let unwatch = null;
let sizeObserver = null;
let watchSizes = null;

export function apply(doc = app.doc) {
  const drawer = getDrawer(doc);
  if (!drawer) return 0;
  const open = Boolean(getComposer(drawer));
  const view = doc.defaultView;
  const store = settings.store;
  const rect = drawer.getBoundingClientRect();
  // Undo our own downward shift to get the bottom edge X chose.
  const shifted = parseFloat(drawer.style.getPropertyValue('--askx-drawer-shift')) || 0;
  const bottom = rect.bottom - shifted;
  const h = open ? targetHeight(store, bottom, view.innerHeight) : 0;
  if (!h) {
    if (drawer.hasAttribute(MARK)) clear(drawer);
    return 0;
  }
  const full = store.preset === 'sidebar';
  const set = (prop, value) => { if (drawer.style.getPropertyValue(prop) !== value) drawer.style.setProperty(prop, value); };
  set('--askx-drawer-h', `${h}px`);
  if (full) {
    // Measure where the drawer actually is now and move it by the
    // difference, so it lands flush with the top whatever X changed in the
    // meantime (window height, zoom, X's own layout).
    const now = drawer.getBoundingClientRect();
    if (drawer.hasAttribute(MARK)) set('--askx-drawer-shift', `${Math.round(shifted + FULL_V_GAP - now.top)}px`);
    else set('--askx-drawer-shift', `${Math.round(view.innerHeight - FULL_V_GAP - bottom)}px`);
  } else {
    set('--askx-drawer-shift', '0px');
  }
  set('--askx-drawer-mr', full ? `${EDGE_GAP}px` : '');
  // Wide enough to cover the sidebar column's left edge as well.
  const side = full ? doc.querySelector('[data-testid="sidebarColumn"]')?.getBoundingClientRect() : null;
  const right = doc.documentElement.clientWidth - EDGE_GAP;
  set('--askx-drawer-w', side?.width ? `${Math.round(right - (side.left - EDGE_GAP))}px` : '');
  if (!drawer.hasAttribute(MARK)) {
    drawer.setAttribute(MARK, '');
    // Now that the new size applies, correct the position once more.
    if (full) schedule?.();
  }
  const layer = layerOf(drawer);
  if (layer) {
    if (full && !layer.hasAttribute(LAYER)) layer.setAttribute(LAYER, '');
    else if (!full && layer.hasAttribute(LAYER)) layer.removeAttribute(LAYER);
  }
  return h;
}

function reset(doc) {
  for (const el of doc.querySelectorAll(`[${MARK}]`)) clear(el);
  for (const el of doc.querySelectorAll(`[${LAYER}]`)) el.removeAttribute(LAYER);
}

export default definePlugin({
  name: 'DrawerHeight',
  description: '调整 Grok 小窗的高度。默认拉满整个右侧边栏，也可以自定义高度或保持 X 默认。',
  icon: ICONS.height,
  tags: ['appearance'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    const view = doc.defaultView;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      // The visible panel is an absolutely positioned child with an inline
      // min-height; stretch it to the new height too.
      // The full sidebar also moves it down to the window's bottom edge, out
      // to the sidebar's right edge, and lifts its container above the Chat
      // button's (they share one layer; X's menus and dialogs live elsewhere).
      style.textContent = `[${MARK}]{height:var(--askx-drawer-h)!important;max-height:none!important;top:var(--askx-drawer-shift,0px)!important}`
        + `[${MARK}][style*="--askx-drawer-mr"]{margin-right:var(--askx-drawer-mr)!important}`
        + `[${MARK}][style*="--askx-drawer-w"]{width:var(--askx-drawer-w)!important;max-width:none!important}`
        + `[${MARK}]>div:first-child{height:100%!important;min-height:100%!important;max-height:none!important}`
        + `[${LAYER}]{z-index:1!important}`;
      (doc.head || doc.documentElement).appendChild(style);
    }
    schedule = frameThrottle(view, () => apply(doc));
    apply(doc);
    observer = new view.MutationObserver((records) => { if (touchesGrok(records, doc)) { schedule(); watchSizes?.(); } });
    observer.observe(doc.body, { childList: true, subtree: true });
    // X moves the drawer's container itself (a translateY with a 200 ms
    // transition) after a resize and whenever the drawer's size changes.
    // Measuring mid-animation would chase a moving target, so correct when
    // the window changes and again when X's own movement has finished.
    onResize = () => {
      schedule();
      view.clearTimeout(settle);
      settle = view.setTimeout(() => apply(doc), 400);
    };
    const onMoved = (event) => { if (event.propertyName === 'transform' || event.propertyName === 'top') schedule(); };
    let watched = null;
    let watchedNodes = [];
    sizeObserver = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(() => onResize()) : null;
    watchSizes = () => {
      const drawer = getDrawer(doc);
      if (drawer === watched) return;
      watched = drawer;
      for (const node of watchedNodes) node.removeEventListener('transitionend', onMoved);
      watchedNodes = [];
      sizeObserver?.disconnect();
      if (!drawer) return;
      const layer = layerOf(drawer);
      for (let node = drawer.parentElement; node && node !== doc.body; node = node.parentElement) {
        node.addEventListener('transitionend', onMoved);
        watchedNodes.push(node);
        if (node === layer?.parentElement) break;
      }
      if (drawer.parentElement) sizeObserver?.observe(drawer.parentElement);
    };
    unwatch = () => { for (const node of watchedNodes) node.removeEventListener('transitionend', onMoved); watchedNodes = []; };
    watchSizes();
    view.addEventListener('resize', onResize);
    view.visualViewport?.addEventListener('resize', onResize);
  },
  onSettingsChange: () => apply(),
  stop() {
    observer?.disconnect();
    observer = null;
    const view = app.doc.defaultView;
    if (onResize) { view.removeEventListener('resize', onResize); view.visualViewport?.removeEventListener('resize', onResize); }
    view.clearTimeout(settle);
    unwatch?.();
    unwatch = null;
    sizeObserver?.disconnect();
    sizeObserver = null;
    watchSizes = null;
    onResize = null;
    schedule?.cancel();
    reset(app.doc);
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
