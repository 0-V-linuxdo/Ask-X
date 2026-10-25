// Scrollbars inside Grok without the grey rail X draws: a thin rounded thumb
// on a transparent track, a little stronger while you hover the scroller.
// Only the Grok drawer and the /i/grok page; X's own scrollbars are untouched.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { addStyle, GROK, PAGE_FLAG, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';

const STYLE_ID = 'askx-grok-scrollbars';

const settings = definePluginSettings({
  width: {
    type: OptionType.SELECT,
    label: '粗细',
    description: '“细”是浏览器的细滚动条；“隐藏”不显示滚动条，仍可用滚轮和触控板滚动。',
    options: [
      { value: 'thin', label: '细' },
      { value: 'none', label: '隐藏' }
    ],
    default: 'thin'
  }
});

export function css({ width } = settings.store) {
  // Covers the surfaces themselves, everything inside them, and the page's
  // own scrollbar while /i/grok is open.
  const scope = `${GROK}, ${GROK} *, html[${PAGE_FLAG}]`;
  if (width === 'none') return `:is(${scope}){scrollbar-width:none!important}`;
  return `:is(${scope}){scrollbar-width:thin!important;scrollbar-color:rgba(128,134,139,.45) transparent!important}`
    + `:is(${scope}):hover{scrollbar-color:rgba(128,134,139,.7) transparent!important}`;
}

let stop = null;

export default definePlugin({
  name: 'GrokScrollbars',
  description: 'Grok 小窗和 Grok 页面里的滚动条去掉灰色导轨，只留一条细的圆角滑块，悬停时稍微加深。不影响 X 其他页面的滚动条。',
  icon: ICONS.scrollbar,
  tags: ['appearance'],
  enabledByDefault: true,
  settings,
  start() {
    addStyle(app.doc, STYLE_ID, css());
    stop = watchGrok(app.doc);
  },
  onSettingsChange: () => addStyle(app.doc, STYLE_ID, css()),
  stop() {
    stop?.();
    stop = null;
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
