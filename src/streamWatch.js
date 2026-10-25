// Knows when Grok is writing a reply, even while the drawer is minimised
// (X unmounts the drawer's content then, so the page itself shows nothing).
//
// Strictly passive: nothing of X's is wrapped or patched (an earlier version
// wrapped window.fetch, which X's own code and bot checks must never see).
//   start — you send: Enter in a Grok input box, or a click on its send
//           button (both only observed, never intercepted);
//   end   — the browser's own resource timing reports that the reply
//           request finished: /2/grok/add_response.json (older Grok) or
//           grok.com's /rest/app-chat/conversations/<id>/responses.

import { findButton } from './drawer.js';
import { rootOf } from './grok.js';
import { xLabels } from './x-strings.js';

const EVENT = 'askx:grok-stream';
const REPLY_URL = /\/2\/grok\/add_response\.json|\/rest\/app-chat\/conversations\/(?:new|[^/?#]+\/responses)(?:[?#]|$)/;
const STALE_MS = 5 * 60_000;

export const isReplyUrl = (url) => REPLY_URL.test(String(url || ''));

const listeners = new Set();
const live = new Map(); // id -> started at
let seq = 0;
let installedOn = null;
let perf = null;

function emit(detail) {
  for (const fn of listeners) {
    try { fn(detail); } catch (error) { console.error('[Ask X] stream listener failed', error); }
  }
}

function start() {
  const now = Date.now();
  for (const [id, at] of live) if (now - at > STALE_MS) live.delete(id);
  const id = ++seq;
  live.set(id, now);
  emit({ id, phase: 'start' });
}

// One finished reply request (a resource timing entry, or a test event).
// Only a reply to something you sent in Grok counts: X's own Grok features on
// posts (translate, explain …) use the same request, and must not announce a
// finished reply.
export function handleEntry(entry) {
  if (!isReplyUrl(entry?.name)) return false;
  if (!live.size) return false;
  const status = entry.responseStatus || 0;
  const id = live.keys().next().value;
  live.delete(id);
  emit({ id, phase: 'end', ok: !status || status < 400 });
  return true;
}

function isComposer(el) {
  return Boolean(el && (el.tagName === 'TEXTAREA' || (el.isContentEditable && el.getAttribute?.('role') === 'textbox')) && rootOf(el, el.ownerDocument));
}

function hasText(el) {
  const text = el.tagName === 'TEXTAREA' ? el.value : el.textContent;
  return /\S/.test(String(text || '').replace(/​/g, ''));
}

function onKeyDown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing || event.keyCode === 229) return;
  const el = event.target;
  if (isComposer(el) && hasText(el)) start();
}

function onClick(event) {
  const button = event.target.closest?.('button, [role="button"]');
  const root = button && rootOf(button, button.ownerDocument);
  if (!root || button !== findButton(root, xLabels().send)) return;
  const field = root.querySelector('textarea, [contenteditable="true"][role="textbox"]');
  if (field && hasText(field)) start();
}

function onEvent(event) {
  let detail;
  try { detail = JSON.parse(event.detail); } catch { return; }
  if (detail?.phase === 'start') start();
  else if (detail?.phase === 'end') {
    if (!live.size) return;
    const id = live.keys().next().value;
    live.delete(id);
    emit({ id, phase: 'end', ok: detail.ok !== false });
  }
}

function install(doc) {
  const view = doc.defaultView;
  doc.addEventListener('keydown', onKeyDown, { capture: true, passive: true });
  doc.addEventListener('click', onClick, { capture: true, passive: true });
  doc.addEventListener(EVENT, onEvent);
  if (typeof view?.PerformanceObserver === 'function') {
    try {
      perf = new view.PerformanceObserver((list) => { for (const entry of list.getEntries()) handleEntry(entry); });
      perf.observe({ type: 'resource' });
    } catch (error) {
      console.warn('[Ask X] resource timing unavailable', error);
    }
  }
}

// A send that never produced a reply (the request was aborted, e.g. the chat
// was closed straight away): forget it without announcing a finished reply.
export function cancelAll() {
  if (!live.size) return false;
  const ids = [...live.keys()];
  live.clear();
  for (const id of ids) emit({ id, phase: 'end', ok: true, cancelled: true });
  return true;
}

export function isStreaming() {
  return live.size > 0;
}

// fn({ id, phase: 'start'|'end', ok }) — returns an unsubscribe function.
export function watchStreams(doc, fn) {
  if (installedOn !== doc) {
    installedOn = doc;
    install(doc);
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Used by tests and for checking the UI without sending a real message.
export function simulateStream(doc, detail) {
  doc.dispatchEvent(new doc.defaultView.CustomEvent(EVENT, { detail: JSON.stringify(detail) }));
}
