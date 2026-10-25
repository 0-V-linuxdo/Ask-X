import { definePlugin } from '../api/plugins.js';
import { ICONS } from '../icons.js';

export default definePlugin({
  name: 'NewChat',
  description: '每次提问前先点 Grok 小窗的 New Chat，在新对话里问，不接着旧对话。输入框里没发的草稿会带到新对话。',
  icon: ICONS.newChat,
  tags: ['chats'],
  enabledByDefault: true,
  askOrder: 10,
  onAsk(ctx) {
    ctx.plan.newChat = true;
  }
});
