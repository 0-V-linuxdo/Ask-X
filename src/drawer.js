// Everything that touches X's Grok drawer: open it, start a new chat, switch
// Private Chat, write the prompt, optionally send.

import { appendPrompt } from './text.js';
import { xLabels } from './x-strings.js';

export const DRAWER = '[data-testid="GrokDrawer"]';
const HEADER = '[data-testid="GrokDrawerHeader"]';
const PAD = '​';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, { timeout = 2_000, step = 50 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() >= end) return null;
    await sleep(step);
  }
}

export function getDrawer(doc = document) {
  return doc.querySelector(`#layers ${DRAWER}`) || doc.querySelector(DRAWER);
}

function usable(el) {
  return Boolean(el)
    && !el.disabled
    && el.getAttribute('aria-disabled') !== 'true'
    && el.getAttribute('aria-hidden') !== 'true';
}

// Grok's main input box. Editing a sent message opens a second text box
// inside the conversation, above the main one; the main box is the last
// input field in the drawer, so take the last one.
export function getComposer(drawer) {
  if (!drawer) return null;
  const fields = [...drawer.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].filter(usable);
  return fields[fields.length - 1] || null;
}

export function findButton(drawer, names) {
  if (!drawer) return null;
  const wanted = names.map((n) => n.toLowerCase());
  return [...drawer.querySelectorAll('button, [role="button"]')].find((el) => {
    const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
    return label && wanted.includes(label) && usable(el);
  }) || null;
}

// Grok tints the ghost icon with the accent colour while Private Chat is on.
// The legacy header has no aria-pressed, so compare the icon colour with the
// button's own text colour; the newer header does expose aria-pressed.
export function isPrivateOn(drawer, labels = xLabels()) {
  const button = findButton(drawer, labels.privateChat);
  if (button) {
    const pressed = button.getAttribute('aria-pressed');
    if (pressed === 'true' || pressed === 'false') return pressed === 'true';
    const icon = button.querySelector('svg');
    const view = drawer.ownerDocument.defaultView;
    const base = button.firstElementChild || button;
    if (icon && view?.getComputedStyle) {
      const iconColor = view.getComputedStyle(icon).color;
      const textColor = view.getComputedStyle(base).color;
      if (iconColor && textColor) return iconColor !== textColor;
    }
  }
  const text = drawer?.textContent || '';
  return labels.privateNotice.some((notice) => text.includes(notice));
}

export async function openDrawer(doc = document, timeout = 2_500) {
  let drawer = getDrawer(doc);
  if (!drawer) return null;
  if (getComposer(drawer)) return drawer;
  // Only use the drawer's own header: the sidebar /i/grok link would
  // navigate away to the full-page Grok.
  // The header is a <button> when the drawer is fully closed and a <div>
  // wrapping a <button> when it is collapsed to a bar.
  const header = drawer.querySelector(HEADER);
  const opener = header?.matches('button') ? header : header?.querySelector('button') || drawer.querySelector('button');
  opener?.click();
  return waitFor(() => {
    drawer = getDrawer(doc);
    return getComposer(drawer) ? drawer : null;
  }, { timeout });
}

export async function startNewChat(drawer, labels = xLabels()) {
  const button = findButton(drawer, labels.newChat);
  if (!button) return { changed: false };
  button.click();
  const ok = await waitFor(() => !findButton(drawer, labels.newChat) && getComposer(drawer), { timeout: 2_500 });
  return { changed: true, ok: Boolean(ok) };
}

export async function setPrivate(drawer, wanted, labels = xLabels()) {
  if (isPrivateOn(drawer, labels) === wanted) return { ok: true, changed: false };
  const button = findButton(drawer, labels.privateChat);
  if (!button) return { ok: false, changed: false };
  button.click();
  const ok = await waitFor(() => isPrivateOn(drawer, labels) === wanted, { timeout: 1_500 });
  return { ok: Boolean(ok), changed: true };
}

export function readValue(el) {
  if ('value' in el && typeof el.value === 'string') return el.value;
  // Rich editors (X's newer drawer uses Lexical) keep lines as <p>/<br>, so
  // innerText is the only way to get the newlines back; drop the editor's
  // own trailing line break.
  const text = typeof el.innerText === 'string' && el.isConnected ? el.innerText : el.textContent || '';
  return text.replace(/\n$/u, '');
}

export function writeTextarea(el, value) {
  const view = el.ownerDocument.defaultView;
  const proto = el instanceof view.HTMLTextAreaElement ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  const InputEvt = typeof view.InputEvent === 'function' ? view.InputEvent : view.Event;
  el.dispatchEvent(new InputEvt('input', { bubbles: true, inputType: 'insertText', data: value }));
  el.dispatchEvent(new view.Event('change', { bubbles: true }));
}

const tick = (view) => new Promise((resolve) => view.setTimeout(resolve, 0));

function selectIn(el, atEnd) {
  const doc = el.ownerDocument;
  const sel = doc.getSelection();
  const range = doc.createRange();
  range.selectNodeContents(el);
  if (atEnd) range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// Rich editors (Lexical, ProseMirror…) ignore direct DOM edits; a paste is
// what they all understand, and it keeps the line breaks. The editor reads
// the DOM selection on the next selectionchange, hence the tick.
async function pasteInto(el, text) {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  const before = readValue(el);
  let handled = false;
  try {
    const data = new view.DataTransfer();
    data.setData('text/plain', text);
    handled = !el.dispatchEvent(new view.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  } catch {}
  if (!handled || readValue(el) === before) {
    try { doc.execCommand?.('insertText', false, text); } catch {}
  }
}

export async function writeEditable(el, value) {
  const view = el.ownerDocument.defaultView;
  el.focus();
  const current = readValue(el);
  // Appending: put the caret at the end and paste only the new part, so the
  // draft already in the box is never retyped.
  if (current.trim() && value.startsWith(current)) {
    selectIn(el, true);
    await tick(view);
    await pasteInto(el, value.slice(current.length));
    return;
  }
  selectIn(el, false);
  await tick(view);
  if (current.trim()) {
    try { el.ownerDocument.execCommand?.('delete'); } catch {}
    await tick(view);
  }
  await pasteInto(el, value);
}

// Trailing newlines are stripped by Grok's composer, so a zero-width space
// keeps the cursor on a fresh line under the quote.
export function composeValue(existing, prompt, mode) {
  const body = prompt.replace(/\n+$/u, '');
  const tail = /\n\s*$/u.test(prompt) ? `\n\n${PAD}` : '';
  const text = `${body}${tail}`;
  return mode === 'replace' ? text : appendPrompt(existing, text);
}

export async function writePrompt(composer, prompt, mode = 'append', draft = readValue(composer)) {
  const next = composeValue(draft, prompt, mode);
  composer.focus();
  if (composer.tagName === 'TEXTAREA' || composer.tagName === 'INPUT') {
    writeTextarea(composer, next);
    try { composer.setSelectionRange(next.length, next.length); } catch {}
  } else {
    await writeEditable(composer, next);
  }
  return readValue(composer).includes(prompt.replace(/\n+$/u, '').split('\n')[0]);
}

export async function sendPrompt(drawer, labels = xLabels()) {
  const button = await waitFor(() => findButton(drawer, labels.send), { timeout: 1_500 });
  if (!button) return false;
  button.click();
  return true;
}

/**
 * @param {string} prompt fully rendered text
 * @param {{newChat:boolean, privateMode:'on'|'off'|'keep', writeMode:string, autoSend:boolean}} plan
 */
export async function askGrok(prompt, plan, doc = document) {
  const labels = xLabels();
  const drawer = await openDrawer(doc);
  if (!drawer) return { ok: false, reason: getDrawer(doc) ? 'not-ready' : 'no-drawer' };

  const notes = [];
  // Private Chat can only be switched on an empty conversation, so a private
  // request always starts a new chat even when "current chat" is selected.
  const needsEmpty = plan.newChat || (plan.privateMode !== 'keep' && isPrivateOn(drawer, labels) !== (plan.privateMode === 'on'));
  // Grok's New Chat wipes the composer; keep the draft so "append" holds.
  const draft = readValue(getComposer(drawer) || { textContent: '' });
  if (needsEmpty) {
    const result = await startNewChat(drawer, labels);
    if (result.changed && !result.ok) notes.push('new-chat-slow');
  }
  if (plan.privateMode !== 'keep') {
    const result = await setPrivate(drawer, plan.privateMode === 'on', labels);
    if (!result.ok) notes.push('private-unavailable');
  }

  const composer = getComposer(drawer);
  if (!composer) return { ok: false, reason: 'no-composer', notes };
  const current = readValue(composer);
  if (!(await writePrompt(composer, prompt, plan.writeMode, current.trim() ? current : draft))) return { ok: false, reason: 'write-failed', notes };

  let sent = false;
  if (plan.autoSend) {
    await sleep(120);
    sent = await sendPrompt(drawer, labels);
    if (!sent) notes.push('send-failed');
  }
  return { ok: true, sent, private: isPrivateOn(drawer, labels), notes, composer };
}
