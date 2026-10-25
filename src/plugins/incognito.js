import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { grokRoots } from '../grok.js';
import { addStyle, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';
import { findComposerBox } from './composerOpacity.js';

const LABEL_MARK = 'data-askx-private-label';
const STYLE_ID = 'askx-private-compact';

const settings = definePluginSettings({
  icon: {
    type: OptionType.SELECT,
    label: '按钮图标',
    description: '划词工具条上无痕按钮用哪个图标。',
    options: [
      { value: 'native', label: 'X 原生' },
      { value: 'askx', label: 'Ask X' }
    ],
    default: 'native'
  },
  compactBadge: {
    type: OptionType.BOOLEAN,
    label: '输入框无痕标记只显示图标',
    description: 'Private Chat 时，Grok 输入框里的“Private”标记只留幽灵图标，悬停显示文字。关闭则保留文字。',
    default: true
  }
});

// X's "Private" badge in the input box: a label (not a button) holding a
// ghost icon and a short text. Its text is hidden; the badge keeps a tooltip.
export function findPrivateLabels(root) {
  // Only inside the main input box, never elsewhere in the drawer.
  const box = findComposerBox(root);
  if (!box) return [];
  const out = [];
  for (const span of box.querySelectorAll('span')) {
    const text = span.textContent.trim();
    if (!text || text.length > 16 || span.childElementCount || span.closest('button, [role="button"], textarea')) continue;
    const badge = span.parentElement?.parentElement;
    if (badge && box.contains(badge) && badge.querySelector('svg') && !badge.querySelector('button')) out.push({ span, badge, text });
  }
  return out;
}

function compact(doc) {
  const on = settings.store.compactBadge;
  const kept = new Set();
  for (const root of grokRoots(doc)) {
    for (const { span, badge, text } of findPrivateLabels(root)) {
      if (on) {
        kept.add(span);
        if (!span.hasAttribute(LABEL_MARK)) span.setAttribute(LABEL_MARK, '');
        if (badge.getAttribute('title') !== text) badge.setAttribute('title', text);
      } else if (span.hasAttribute(LABEL_MARK)) {
        badge.removeAttribute('title');
      }
    }
  }
  // A span that is no longer the badge's label (X reused it) shows again.
  for (const el of doc.querySelectorAll(`[${LABEL_MARK}]`)) if (!kept.has(el)) el.removeAttribute(LABEL_MARK);
}

let stopWatch = null;

export default definePlugin({
  name: 'Incognito',
  description: '划词工具条上的幽灵按钮：用 Grok 的 Private Chat（无痕）新对话提问。普通提问时会先关掉小窗里残留的无痕。输入框里的“Private”标记默认只显示图标。',
  icon: ICONS.ghost,
  tags: ['privacy'],
  enabledByDefault: true,
  settings,
  askOrder: 20,
  toolbarButtons: () => [{
    id: 'private',
    label: '无痕问 Grok',
    icon: settings.store.icon === 'askx' ? ICONS.ghost : ICONS.ghostNative,
    className: 'askx-ghost',
    order: 10
  }],
  onAsk(ctx) {
    ctx.plan.privateMode = ctx.trigger.id === 'private' ? 'on' : 'off';
  },
  start() {
    addStyle(app.doc, STYLE_ID, `[${LABEL_MARK}]{display:none!important}`);
    stopWatch = watchGrok(app.doc, compact);
  },
  onSettingsChange: () => compact(app.doc),
  stop() {
    stopWatch?.();
    stopWatch = null;
    app.doc.getElementById(STYLE_ID)?.remove();
    for (const el of app.doc.querySelectorAll(`[${LABEL_MARK}]`)) el.removeAttribute(LABEL_MARK);
  }
});
