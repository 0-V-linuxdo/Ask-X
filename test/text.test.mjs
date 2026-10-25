import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_TEMPLATE, appendPrompt, cleanSelection, renderTemplate } from '../src/text.js';
import { normalizePostUrl } from '../src/source.js';

test('cleanSelection keeps the old normalisation rules', () => {
  assert.equal(cleanSelection('  a  \r\n\r\n\r\n b\t\tc  '), 'a\n\n b c');
  assert.equal(cleanSelection('🤯💀 !!'), '');
  assert.equal(cleanSelection('x'.repeat(30), 10), 'x'.repeat(10));
});

test('default template reproduces the old quote format', () => {
  assert.equal(renderTemplate(DEFAULT_TEMPLATE, { text: 'hi', url: 'https://x.com/a/status/1' }), '来源：https://x.com/a/status/1\n\n>hi\n\n');
  assert.equal(renderTemplate(DEFAULT_TEMPLATE, { text: 'hi', url: '' }), '>hi\n\n');
});

test('{quote} prefixes every line and {author} fills in', () => {
  assert.equal(renderTemplate('@{author}\n{quote}\n问题', { text: 'a\nb', author: 'bob' }), '@bob\n>a\n>b\n问题');
  assert.equal(renderTemplate('@{author}\n\n{quote}', { text: 'a' }), '>a');
});

test('appendPrompt joins after a trimmed draft', () => {
  assert.equal(appendPrompt('draft \n​', 'q'), 'draft\n\nq');
  assert.equal(appendPrompt('', 'q'), 'q');
});

test('normalizePostUrl canonicalises X links', () => {
  assert.deepEqual(normalizePostUrl('/bob/status/42/photo/1?s=20'), { url: 'https://x.com/bob/status/42', author: 'bob' });
  assert.deepEqual(normalizePostUrl('https://twitter.com/i/web/status/7'), { url: 'https://x.com/i/status/7', author: '' });
  assert.equal(normalizePostUrl('https://example.com/bob/status/1'), null);
});
