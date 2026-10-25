import { on } from '../api/events.js';
import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { ICONS } from '../icons.js';

const DURATION_MS = 2_600;

const FAILURES = {
  empty: '没有可用的划词。',
  'no-drawer': '这个页面没有 Grok 小窗（Grok 全页里请直接输入）。',
  'not-ready': 'Grok 小窗没能展开，请稍后再试。',
  'no-composer': '找不到 Grok 输入框。',
  'write-failed': '无法写入 Grok 输入框。'
};

let off = null;
let timer = 0;

export function describe({ result, ctx }) {
  if (!result.ok) return { kind: 'error', text: FAILURES[result.reason] || '发送到 Grok 失败。' };
  const where = result.private ? '无痕对话' : (ctx.plan.newChat && !result.followUp ? '新对话' : '当前对话');
  let text = result.sent ? `已在${where}中发送给 Grok。` : `已写入 Grok ${where}。`;
  if (result.notes?.includes('private-unavailable')) text += '（无痕切换失败）';
  if (result.notes?.includes('send-failed')) text += '（自动发送失败，请手动发送）';
  return { kind: result.private ? 'private' : 'info', text };
}

// options: duration (ms, 0 = stays until closed), closable (× button),
// detail (a second, dimmer line), onClick (whole toast is clickable).
export function showToast(text, kind = 'info', doc = app.doc, { duration = DURATION_MS, closable = false, detail = '', onClick = null } = {}) {
  doc.querySelector('.askx-toast')?.remove();
  const node = doc.createElement('div');
  node.className = 'askx-toast';
  node.dataset.kind = kind;
  node.setAttribute('role', 'status');
  const title = doc.createElement('div');
  title.className = 'askx-toast-text';
  title.textContent = text;
  node.appendChild(title);
  if (detail) {
    const line = doc.createElement('div');
    line.className = 'askx-toast-detail';
    line.textContent = detail;
    node.appendChild(line);
  }
  if (closable) {
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'askx-toast-close';
    close.setAttribute('aria-label', '关闭');
    close.textContent = '×';
    close.addEventListener('click', (event) => { event.stopPropagation(); node.remove(); });
    node.appendChild(close);
    node.dataset.closable = 'true';
  }
  if (onClick) {
    node.style.cursor = 'pointer';
    node.addEventListener('click', () => { node.remove(); onClick(); });
  }
  doc.body.appendChild(node);
  clearTimeout(timer);
  if (duration > 0) timer = setTimeout(() => node.remove(), duration);
  return node;
}

export default definePlugin({
  name: 'Toasts',
  description: '在页面底部提示结果：写入了哪种对话、无痕是否生效、出了什么错。',
  icon: ICONS.bell,
  tags: ['notifications'],
  enabledByDefault: true,
  start() {
    off = on('askResult', (event) => {
      const { kind, text } = describe(event);
      showToast(text, kind);
    });
  },
  stop() {
    off?.();
    app.doc.querySelector('.askx-toast')?.remove();
  }
});
