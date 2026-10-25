// Required core plugin: the selection toolbar and writing into the Grok drawer.
// Every other feature hooks in through onAsk(ctx) or toolbarButtons().

import { emit } from '../api/events.js';
import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { askGrok, getComposer, sendPrompt, writePrompt } from '../drawer.js';
import { rootOf } from '../grok.js';
import { ICONS } from '../icons.js';
import { findPostSource } from '../source.js';
import { DEFAULT_TEMPLATE, cleanSelection, renderTemplate } from '../text.js';
import { createToolbar } from '../toolbar.js';

let toolbar = null;
let unsubscribe = null;
let busy = false;

// context: 'post' (text on X) or 'grok' (text inside a Grok reply). A button
// shows up only in the contexts it lists (default: posts only).
export function toolbarButtons(context = 'post') {
  const buttons = [];
  for (const plugin of app.manager.enabledPlugins()) {
    if (typeof plugin.toolbarButtons !== 'function') continue;
    for (const button of plugin.toolbarButtons(context)) {
      if ((button.contexts || ['post']).includes(context)) buttons.push({ ...button, plugin: plugin.name });
    }
  }
  return buttons.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

// Each enabled plugin may adjust the request; lower askOrder runs first.
export function buildRequest(selection, trigger) {
  const ctx = {
    selection,
    trigger,
    template: DEFAULT_TEMPLATE,
    maxLength: 2_000,
    plan: { newChat: false, privateMode: 'keep', writeMode: 'append', autoSend: false }
  };
  const hooks = app.manager.enabledPlugins()
    .filter((p) => typeof p.onAsk === 'function')
    .sort((a, b) => (a.askOrder ?? 50) - (b.askOrder ?? 50));
  for (const plugin of hooks) plugin.onAsk(ctx);
  // A follow-up always stays in the chat it was picked from.
  if (selection?.context === 'grok') {
    ctx.plan.newChat = false;
    ctx.plan.privateMode = 'keep';
  }
  return ctx;
}

export async function ask(selection, trigger = { id: 'ask' }) {
  if (busy) return null;
  const ctx = buildRequest(selection, trigger);
  const text = cleanSelection(selection?.text, ctx.maxLength);
  if (!text) {
    const result = { ok: false, reason: 'empty' };
    emit('askResult', { result, ctx });
    return result;
  }
  const source = findPostSource(selection.node);
  const prompt = renderTemplate(ctx.template, { text, url: source.url, author: source.author });
  busy = true;
  try {
    const result = selection.context === 'grok'
      ? await followUp(selection, prompt, ctx.plan)
      : await askGrok(prompt, ctx.plan, app.doc);
    if (result.ok && !result.sent) result.composer?.focus();
    emit('askResult', { result, ctx });
    return result;
  } catch (error) {
    console.error('[Ask X]', error);
    const result = { ok: false, reason: 'error' };
    emit('askResult', { result, ctx });
    return result;
  } finally {
    busy = false;
  }
}

// Writes into the composer of the Grok surface the text was picked from.
async function followUp(selection, prompt, plan) {
  const root = rootOf(selection.node, app.doc);
  const composer = getComposer(root);
  if (!composer) return { ok: false, reason: 'no-composer' };
  if (!(await writePrompt(composer, prompt, plan.writeMode))) return { ok: false, reason: 'write-failed' };
  let sent = false;
  const notes = [];
  if (plan.autoSend) {
    sent = await sendPrompt(root);
    if (!sent) notes.push('send-failed');
  }
  return { ok: true, sent, followUp: true, notes, composer };
}

export default definePlugin({
  name: 'AskGrok',
  description: '划词后弹出工具条，点引号把选中文字和推文链接写进 Grok 小窗。其他插件都挂在它上面。',
  icon: ICONS.quote,
  required: true,
  tags: ['composer'],
  askOrder: 0,
  toolbarButtons: () => [{ id: 'ask', label: '问 Grok', icon: ICONS.quote, className: 'askx-main', order: 0 }],
  start() {
    toolbar = createToolbar({
      getButtons: toolbarButtons,
      onAsk: (selection, button, event) => void ask(selection, { ...button, altKey: Boolean(event?.altKey) })
    });
    unsubscribe = app.manager.subscribe(() => toolbar?.rebuild());
  },
  stop() {
    unsubscribe?.();
    toolbar?.destroy();
    toolbar = null;
  }
});
