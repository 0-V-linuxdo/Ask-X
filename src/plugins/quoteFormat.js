import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { ICONS } from '../icons.js';
import { DEFAULT_TEMPLATE } from '../text.js';

const settings = definePluginSettings({
  template: {
    type: OptionType.STRING,
    multiline: true,
    label: '引用模板',
    description: '占位符：{text} 原文、{quote} 每行加 > 的原文、{url} 推文链接、{author} 作者。整行占位符都为空时，该行连同其后一个空行一起省略。',
    default: DEFAULT_TEMPLATE
  }
});

export default definePlugin({
  name: 'QuoteFormat',
  description: '自定义写进 Grok 的引用格式。关闭时用默认格式“来源：链接 + > 原文”。',
  icon: ICONS.textQuote,
  tags: ['composer'],
  enabledByDefault: true,
  settings,
  askOrder: 30,
  onAsk(ctx) {
    ctx.template = settings.store.template;
  }
});
