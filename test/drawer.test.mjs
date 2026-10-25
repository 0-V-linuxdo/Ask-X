import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { askGrok, composeValue, isPrivateOn } from '../src/drawer.js';
import { resetLabelCache } from '../src/x-strings.js';

// A small model of X's legacy drawer header: Private Chat only while the
// conversation is empty, New Chat only once it has messages. Private Chat
// tints its icon blue when on.
function fakeX({ collapsed = false, hasConversation = false, isPrivate = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="layers"></div></body>', { url: 'https://x.com/bob/status/9', pretendToBeVisual: true });
  const { document: doc } = dom.window;
  const state = { collapsed, hasConversation, isPrivate, clicks: [], sent: null };
  const drawer = doc.createElement('div');
  drawer.dataset.testid = 'GrokDrawer';
  doc.getElementById('layers').appendChild(drawer);
  let draft = '';

  const btn = (label, onClick, iconColor) => {
    const b = doc.createElement('button');
    b.setAttribute('aria-label', label);
    b.innerHTML = `<div style="color: rgb(239, 243, 244)"><svg style="color: ${iconColor || 'rgb(239, 243, 244)'}"></svg></div>`;
    b.addEventListener('click', () => { state.clicks.push(label); onClick(); });
    return b;
  };

  function render() {
    const ta = drawer.querySelector('textarea');
    if (ta) draft = ta.value;
    drawer.textContent = '';
    if (state.collapsed) {
      const header = btn('Grok', () => { state.collapsed = false; setTimeout(render, 30); });
      header.dataset.testid = 'GrokDrawerHeader';
      drawer.appendChild(header);
      return;
    }
    if (!state.hasConversation) drawer.appendChild(btn('Private Chat', () => { state.isPrivate = !state.isPrivate; render(); }, state.isPrivate ? 'rgb(29, 155, 240)' : null));
    drawer.appendChild(btn('Chat history', () => {}));
    if (state.hasConversation) drawer.appendChild(btn('New Chat', () => { state.hasConversation = false; draft = ''; drawer.querySelector('textarea').value = ''; setTimeout(render, 30); }));
    const area = doc.createElement('textarea');
    area.setAttribute('placeholder', 'Ask anything');
    area.value = draft;
    drawer.appendChild(area);
    drawer.appendChild(btn('Grok something', () => { state.sent = drawer.querySelector('textarea').value; }));
  }
  render();
  return { dom, doc, drawer, state };
}

function useGlobals(dom) {
  const keys = ['window', 'document', 'HTMLTextAreaElement', 'HTMLInputElement'];
  const before = keys.map((k) => globalThis[k]);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  resetLabelCache();
  return () => keys.forEach((k, i) => { if (before[i] === undefined) delete globalThis[k]; else globalThis[k] = before[i]; });
}

const base = { newChat: true, privateMode: 'off', writeMode: 'append', autoSend: false };

test('default: clicks New Chat when a conversation is open, then writes', async () => {
  const x = fakeX({ hasConversation: true });
  const restore = useGlobals(x.dom);
  try {
    const result = await askGrok('>hi\n\n', base, x.doc);
    assert.equal(result.ok, true);
    assert.deepEqual(x.state.clicks, ['New Chat']);
    assert.equal(x.drawer.querySelector('textarea').value, '>hi\n\n​');
    assert.equal(result.private, false);
  } finally { restore(); }
});

test('a draft survives New Chat, which clears the composer', async () => {
  const x = fakeX({ hasConversation: true });
  const restore = useGlobals(x.dom);
  try {
    x.drawer.querySelector('textarea').value = 'my draft';
    const result = await askGrok('q', base, x.doc);
    assert.equal(result.ok, true);
    assert.deepEqual(x.state.clicks, ['New Chat']);
    assert.equal(x.drawer.querySelector('textarea').value, 'my draft\n\nq');
  } finally { restore(); }
});

test('collapsed drawer is opened through its own header', async () => {
  const x = fakeX({ collapsed: true });
  const restore = useGlobals(x.dom);
  try {
    const result = await askGrok('q', base, x.doc);
    assert.equal(result.ok, true);
    assert.deepEqual(x.state.clicks, ['Grok']);
  } finally { restore(); }
});

test('private request starts a new chat and turns Private Chat on', async () => {
  const x = fakeX({ hasConversation: true });
  const restore = useGlobals(x.dom);
  try {
    const result = await askGrok('q', { ...base, newChat: false, privateMode: 'on' }, x.doc);
    assert.equal(result.ok, true);
    assert.deepEqual(x.state.clicks, ['New Chat', 'Private Chat']);
    assert.equal(result.private, true);
    assert.equal(isPrivateOn(x.drawer), true);
  } finally { restore(); }
});

test('normal request switches a lingering Private Chat off', async () => {
  const x = fakeX({ isPrivate: true });
  const restore = useGlobals(x.dom);
  try {
    const result = await askGrok('q', base, x.doc);
    assert.equal(result.private, false);
    assert.deepEqual(x.state.clicks, ['Private Chat']);
  } finally { restore(); }
});

test('current-chat mode appends to the open conversation without New Chat', async () => {
  const x = fakeX({ hasConversation: true });
  const restore = useGlobals(x.dom);
  try {
    x.drawer.querySelector('textarea').value = 'draft';
    const result = await askGrok('q', { ...base, newChat: false, privateMode: 'keep' }, x.doc);
    assert.equal(result.ok, true);
    assert.deepEqual(x.state.clicks, []);
    assert.equal(x.drawer.querySelector('textarea').value, 'draft\n\nq');
  } finally { restore(); }
});

test('autoSend presses the send button', async () => {
  const x = fakeX();
  const restore = useGlobals(x.dom);
  try {
    const result = await askGrok('q', { ...base, autoSend: true }, x.doc);
    assert.equal(result.sent, true);
    assert.equal(x.state.sent, 'q');
  } finally { restore(); }
});

test('replace mode drops the draft', () => {
  assert.equal(composeValue('old', 'new\n\n', 'replace'), 'new\n\n​');
});

test('no drawer on the page reports no-drawer', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.com/i/grok' });
  const restore = useGlobals(dom);
  try {
    assert.deepEqual(await askGrok('q', base, dom.window.document), { ok: false, reason: 'no-drawer' });
  } finally { restore(); }
});
