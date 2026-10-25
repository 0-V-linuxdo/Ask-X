// Pick text inside a Grok reply (drawer or /i/grok) and quote it into the
// same chat to ask a follow-up, the way Void++ quotes passages on grok.com.
// The selection toolbar shows a 追问 button there; it never starts a new or
// private chat and never sends by itself.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { ICONS } from '../icons.js';

export const DEFAULT_FOLLOW_UP = '{quote}\n\n';

const settings = definePluginSettings({
  template: {
    type: OptionType.STRING,
    multiline: true,
    label: '追问模板',
    description: '占位符：{text} 原文、{quote} 每行加 > 的原文。写在输入框已有内容的后面。',
    default: DEFAULT_FOLLOW_UP
  }
});

export default definePlugin({
  name: 'FollowUp',
  description: '在 Grok 小窗（或 Grok 全页）里划选回复中的文字，点“追问”把它引用到当前对话的输入框，接着问。',
  icon: ICONS.followUp,
  tags: ['composer', 'messages'],
  enabledByDefault: true,
  settings,
  askOrder: 40,
  toolbarButtons: () => [{ id: 'follow-up', label: '追问', icon: ICONS.followUp, className: 'askx-main', contexts: ['grok'], order: 0 }],
  onAsk(ctx) {
    if (ctx.trigger.id === 'follow-up') ctx.template = settings.store.template;
  }
});
