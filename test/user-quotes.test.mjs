import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { app } from '../src/app.js';
import { decorate, decorateMutations, undecorate } from '../src/plugins/userQuotes.js';

// X's Grok message layout: a right-aligned column holding a filled bubble
// (your message) and a transparent block (Grok's reply).
function page() {
  const dom = new JSDOM(`<!doctype html><body><div id="layers"><div data-testid="GrokDrawer">
    <div class="col" style="display:flex;align-items:flex-end"><div style="display:flex;align-items:flex-start">
      <div class="bubble" style="background-color: rgb(32, 35, 39)"><div dir="ltr" class="mine"><span>来源：</span><span>https://x.com/a/status/1</span><span>&gt;Pearltrees

</span><span>这是啥?</span></div></div>
    </div></div>
    <div class="reply"><div dir="ltr" class="grok"><span>&gt; not a user quote</span></div></div>
  </div></div></body>`, { url: 'https://x.com/home' });
  app.doc = dom.window.document;
  return dom.window.document;
}

test('quote lines in your own messages get the left-bar block; Grok replies are untouched', () => {
  const doc = page();
  assert.equal(decorate(doc), 1);
  const q = doc.querySelector('.mine .askx-uq');
  assert.ok(q);
  assert.equal(q.querySelector('.askx-uq-mark').textContent, '>');
  assert.equal(q.textContent, '>Pearltrees');
  assert.equal(doc.querySelector('.grok .askx-uq'), null);
  assert.equal(decorate(doc), 0, 'idempotent');
});

test('undecorate restores the original text', () => {
  const doc = page();
  const before = doc.querySelector('.mine').textContent;
  decorate(doc);
  undecorate(doc);
  assert.equal(doc.querySelector('.mine').textContent, before);
  assert.equal(doc.querySelector('.askx-uq'), null);
});

test('multi-line quotes become one block per line', () => {
  const doc = page();
  doc.querySelector('.mine').innerHTML = '<span>&gt;line one\n&gt;line two\nquestion</span>';
  assert.equal(decorate(doc), 1);
  assert.deepEqual([...doc.querySelectorAll('.mine .askx-uq')].map((b) => b.textContent), ['>line one', '>line two']);
  assert.equal(doc.querySelector('.mine').textContent, '>line one\n>line two\nquestion', 'same text, so the same line breaks');
});

test('layout-neutral: quote spans are inline and keep every character', () => {
  const doc = page();
  const before = doc.querySelector('.mine').textContent;
  decorate(doc);
  assert.equal(doc.querySelector('.mine').textContent, before, 'no character removed or added');
  const q = doc.querySelector('.askx-uq');
  assert.equal(q.tagName, 'SPAN');
  assert.equal(q.querySelector('.askx-uq-mark').textContent, '>', 'the > stays in the text for copying');
});

test('new messages are decorated from the mutation records alone', () => {
  const doc = page();
  const bubble = doc.querySelector('.bubble');
  const fresh = doc.createElement('div');
  fresh.setAttribute('dir', 'ltr');
  fresh.className = 'fresh';
  fresh.textContent = '>new quote\n\nwhy?';
  bubble.appendChild(fresh);
  assert.equal(decorateMutations([{ type: 'childList', addedNodes: [fresh] }], doc), 1);
  assert.equal(doc.querySelector('.fresh .askx-uq').textContent, '>new quote');
  assert.equal(doc.querySelector('.mine .askx-uq'), null, 'untouched blocks are not rescanned');
  assert.equal(decorateMutations([{ type: 'characterData', target: doc.querySelector('.grok span').firstChild }], doc), 0, 'Grok replies ignored');
});
