import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from '../src/text.js';
import { findBold } from '../src/replyBold.js';
import { isLooseBody } from '../src/plugins/postTypography.js';

test('multi-paragraph selection stays one quote block', () => {
  assert.equal(renderTemplate('来源：{url}\n\n>{text}\n\n', { text: '一\n\n二', url: 'u' }), '来源：u\n\n>一\n>\n>二\n\n');
});

test('leftover bold after full-width punctuation is found', () => {
  const text = '**幸存者偏差（Survivorship Bias）**的定义 ** x ** a**b**';
  assert.deepEqual(findBold(text).map(({ start, end }) => text.slice(start, end)), ['**幸存者偏差（Survivorship Bias）**', '**b**']);
});

test('only loose body text is retyped', () => {
  assert.equal(isLooseBody(15.75, 27.56), true);
  assert.equal(isLooseBody(15.75, 20), false);
  assert.equal(isLooseBody(26, 32), false);
});
