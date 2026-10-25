// Port of Void++'s ComposerOpacity: background opacity (and backdrop blur)
// of Grok's input box, in the drawer and on /i/grok.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { getComposer } from '../drawer.js';
import { grokRoots, timeThrottle, touchesGrok } from '../grok.js';
import { ICONS } from '../icons.js';

const MARK = 'data-askx-composer';
const STYLE_ID = 'askx-composer-opacity';

const settings = definePluginSettings({
  opacity: {
    type: OptionType.SLIDER,
    label: '不透明度',
    description: '输入框背景的不透明度，100 为完全不透明。',
    min: 0,
    max: 100,
    default: 100
  },
  blur: {
    type: OptionType.SLIDER,
    label: '背景模糊（px）',
    description: '不透明度低于 100 时，模糊输入框后面的内容。',
    min: 0,
    max: 40,
    default: 16
  }
});

const isClear = (bg) => !bg || bg === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg);

// The input box: the nearest ancestor of the text field that paints a
// rounded background.
export function findComposerBox(root) {
  const field = getComposer(root);
  if (!field) return null;
  const view = root.ownerDocument.defaultView;
  for (let node = field.parentElement; node && node !== root; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (!isClear(style.backgroundColor) && parseFloat(style.borderTopLeftRadius || style.borderRadius) > 0) return node;
  }
  return null;
}

export function rgbOf(color) {
  const m = String(color).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return m ? `${Math.round(m[1])}, ${Math.round(m[2])}, ${Math.round(m[3])}` : null;
}

let observer = null;
let schedule = null;

export function apply(doc = app.doc) {
  const { opacity, blur } = settings.store;
  let count = 0;
  for (const root of grokRoots(doc)) {
    const box = findComposerBox(root);
    if (!box) continue;
    if (!box.hasAttribute(MARK)) {
      const rgb = rgbOf(doc.defaultView.getComputedStyle(box).backgroundColor);
      if (!rgb) continue;
      box.style.setProperty('--askx-composer-rgb', rgb);
      box.setAttribute(MARK, '');
    }
    count += 1;
  }
  const style = doc.getElementById(STYLE_ID);
  if (style) {
    const alpha = Math.min(100, Math.max(0, opacity)) / 100;
    const frost = alpha < 1 && blur > 0 ? `-webkit-backdrop-filter:blur(${blur}px)!important;backdrop-filter:blur(${blur}px)!important;` : '';
    const text = alpha >= 1 ? '' : `[${MARK}]{background-color:rgba(var(--askx-composer-rgb),${alpha})!important;${frost}}`;
    if (style.textContent !== text) style.textContent = text;
  }
  return count;
}

export default definePlugin({
  name: 'ComposerOpacity',
  description: '调整 Grok 输入框背景的不透明度和模糊程度（移植自 void++）。',
  icon: ICONS.blend,
  tags: ['composer', 'appearance'],
  enabledByDefault: true,
  settings,
  start() {
    const doc = app.doc;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      (doc.head || doc.documentElement).appendChild(style);
    }
    schedule = timeThrottle(doc.defaultView, () => apply(doc), 200);
    apply(doc);
    observer = new doc.defaultView.MutationObserver((records) => { if (touchesGrok(records, doc)) schedule(); });
    observer.observe(doc.body, { childList: true, subtree: true });
  },
  onSettingsChange: () => apply(),
  stop() {
    observer?.disconnect();
    observer = null;
    schedule?.cancel();
    for (const box of app.doc.querySelectorAll(`[${MARK}]`)) {
      box.removeAttribute(MARK);
      box.style.removeProperty('--askx-composer-rgb');
    }
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
