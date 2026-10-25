// Hides the voice-mode button in Grok's input box (the round waveform button
// shown while the box is empty), like Void++'s NoDictation. CSS only, scoped
// to Grok; the send button that takes its place once you type stays.

import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { addStyle, GROK, watchGrok } from '../grokScope.js';
import { ICONS } from '../icons.js';

const STYLE_ID = 'askx-no-voice-mode';

// X's label in the languages Ask X has seen; matched case-insensitively.
export const VOICE_LABELS = ['Enter voice mode', 'Voice mode', '进入语音模式', '语音模式', '進入語音模式', '語音模式'];

export const CSS = VOICE_LABELS
  .map((label) => `${GROK} :is(button, [role="button"])[aria-label="${label}" i]`)
  .join(',') + '{display:none!important}';

let stop = null;

export default definePlugin({
  name: 'NoVoiceMode',
  description: '隐藏 Grok 输入框里的语音模式按钮（输入框为空时那个圆形声波按钮）。输入文字后出现的发送按钮不受影响。',
  icon: ICONS.micOff,
  tags: ['declutter'],
  enabledByDefault: true,
  start() {
    addStyle(app.doc, STYLE_ID, CSS);
    stop = watchGrok(app.doc);
  },
  stop() {
    stop?.();
    stop = null;
    app.doc.getElementById(STYLE_ID)?.remove();
  }
});
