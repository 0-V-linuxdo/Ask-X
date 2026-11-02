// Takes over X's own Grok button on each post ("Grok actions", the Grok
// mark next to ⋯). X's button sends the post's link alone (Grok shows it as
// a post card and explains it in its own words); this plugin sends the same
// link followed by your own prompt (default 解释一下), through the drawer
// pipeline the selection toolbar uses (New Chat, Private Chat …). The post's
// text is not pasted: like X's button, the link is the context.
//
// The button is found by X's Grok mark, which X does not translate. X's
// handlers never see the press: it is stopped in the capture phase.

import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { app } from '../app.js';
import { addStyle } from '../grokScope.js';
import { ICONS } from '../icons.js';
import { findPostSource } from '../source.js';
import { ask } from './askGrok.js';

const POST = 'article[data-testid="tweet"]';
const POST_TEXT = '[data-testid="tweetText"]';
// Start of the path of X's Grok mark.
const GROK_MARK = 'M12.745 20.54l10.97-8.19';

const settings = definePluginSettings({
  prompt: {
    type: OptionType.STRING,
    multiline: true,
    label: '提示词',
    description: '跟在帖子链接后面的问题，比如“用中文解释一下”。帖子像 X 原生按钮一样以链接附上，不粘贴正文。',
    default: '解释一下'
  },
  tooltip: {
    type: OptionType.STRING,
    allowEmpty: true,
    label: '悬停提示',
    description: '鼠标停在按钮上时显示的文字，代替 X 的 “Explain this post”。留空则显示提示词。',
    default: ''
  },
  autoSend: {
    type: OptionType.BOOLEAN,
    label: '自动发送',
    description: '写入后直接发送，像 X 原来的按钮一样。关闭则只写入输入框。',
    default: true
  },
  private: {
    type: OptionType.BOOLEAN,
    label: '用无痕对话',
    description: '在 Grok 的 Private Chat 里提问。',
    default: false
  }
});

// X's Grok button inside a post, or null.
export function postGrokButton(target) {
  const button = target?.closest?.('button, [role="button"]');
  if (!button || !button.closest(POST)) return null;
  const path = button.querySelector('svg path');
  return path && (path.getAttribute('d') || '').startsWith(GROK_MARK) ? button : null;
}

// The post's own text (not a quoted post's); only used to tell an empty
// request from a real one. Read from a copy whose emoji
// images are turned back into their characters: innerText would break the
// line around every @mention and link, which X lays out as blocks.
export function postText(post) {
  const own = [...post.querySelectorAll(POST_TEXT)].find((el) => el.closest(POST) === post);
  if (!own) return '';
  const copy = own.cloneNode(true);
  for (const img of copy.querySelectorAll('img[alt]')) img.replaceWith(img.getAttribute('alt'));
  return copy.textContent.trim();
}

function swallow(event) {
  if (!postGrokButton(event.target)) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

function onClick(event) {
  if (!swallow(event)) return;
  const post = event.target.closest(POST);
  // A post without text (an image, a video) is asked about by its link.
  const text = postText(post) || findPostSource(post).url;
  void ask({ text, node: post, context: 'post' }, { id: 'post-grok' });
}

function onKey(event) {
  if ((event.key === 'Enter' || event.key === ' ') && postGrokButton(event.target)) onClick(event);
}

// X's own tooltip for the button keeps opening (in #layers); its text is
// hidden and the chosen words drawn in its place, so React's node stays as
// X rendered it.
const TIP_MARK = 'data-askx-tip';
const STYLE_ID = 'askx-post-grok';
const CSS = `[${TIP_MARK}]{font-size:0!important}`
  + `[${TIP_MARK}]::after{content:attr(${TIP_MARK});font-size:11px;line-height:12px;white-space:nowrap}`;

export function tooltipText() {
  const custom = String(settings.store.tooltip || '').trim();
  return custom || String(settings.store.prompt || '').trim().split('\n')[0];
}

let hovered = null;
let tips = null;

function onOver(event) {
  hovered = postGrokButton(event.target);
}

// A tooltip X just opened while our button is hovered: relabel it and keep
// it centred under the button.
function relabel(label) {
  const text = tooltipText();
  if (!text || !hovered?.matches(':hover')) return;
  const box = label.closest('[role="tooltip"]') || label.parentElement;
  const before = box.getBoundingClientRect().width;
  label.setAttribute(TIP_MARK, text);
  const after = box.getBoundingClientRect().width;
  const left = parseFloat(box.style.left);
  if (Number.isFinite(left) && before !== after) box.style.left = `${left + (before - after) / 2}px`;
}

function watchTips(doc) {
  const host = doc.getElementById('layers') || doc.body;
  tips = new doc.defaultView.MutationObserver((records) => {
    if (!hovered) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const label = node.matches('[data-testid="HoverLabel"]') ? node : node.querySelector('[data-testid="HoverLabel"]');
        if (label) relabel(label);
      }
    }
  });
  tips.observe(host, { childList: true, subtree: true });
}

const PRESS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend'];

export default definePlugin({
  name: 'PostGrok',
  description: '接管帖子右上角 X 自带的 Grok 按钮：点一下用你自己的提示词（默认“解释一下”）问 Grok 这条帖子，而不是 X 固定的问法；悬停提示也可以自定义；可选自动发送、无痕。',
  icon: ICONS.quote,
  tags: ['composer'],
  enabledByDefault: true,
  settings,
  // After QuickPrompts, so nothing else rewrites this request.
  askOrder: 95,
  onAsk(ctx) {
    if (ctx.trigger.id !== 'post-grok') return;
    // Like X's own button: the post's link is the whole context.
    const prompt = String(settings.store.prompt || '').trim();
    ctx.template = prompt ? `{url}\n\n${prompt}` : '{url}';
    ctx.plan.autoSend = Boolean(settings.store.autoSend);
    ctx.plan.privateMode = settings.store.private ? 'on' : 'off';
  },
  start() {
    const doc = app.doc;
    addStyle(doc, STYLE_ID, CSS);
    doc.addEventListener('pointerover', onOver, true);
    watchTips(doc);
    for (const type of PRESS) doc.addEventListener(type, swallow, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
  },
  stop() {
    const doc = app.doc;
    doc.removeEventListener('pointerover', onOver, true);
    tips?.disconnect();
    tips = null;
    hovered = null;
    doc.getElementById(STYLE_ID)?.remove();
    for (const el of doc.querySelectorAll(`[${TIP_MARK}]`)) el.removeAttribute(TIP_MARK);
    for (const type of PRESS) doc.removeEventListener(type, swallow, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKey, true);
  }
});
