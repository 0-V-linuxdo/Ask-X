import assert from 'node:assert/strict';
import test from 'node:test';

import { promptOnly, splitQuote } from '../src/plugins/inputHistory.js';

const BOX = '来源：https://x.com/308Greenfield/status/2116599420666196275\n\n>cribs\n\n解释一下';

test('history keeps only the prompt, not the source or the quote', () => {
  assert.equal(promptOnly(BOX, []), '解释一下');
  assert.equal(promptOnly('来源：https://x.com/a/status/1\n\n>line one\n>\n>line two\n\n', []), '', 'quote only: nothing to record');
  assert.equal(promptOnly('作者：@alice\n原文：hello there\n\n总结', [{ text: 'hello there', author: 'alice' }]), '总结');
  assert.equal(promptOnly('just a question\n> not mine', []), 'just a question');
});

test('browsing keeps the quote block at the top of the box', () => {
  assert.deepEqual(splitQuote(BOX, []), { head: '来源：https://x.com/308Greenfield/status/2116599420666196275\n\n>cribs\n\n', body: '解释一下' });
  assert.deepEqual(splitQuote('来源：https://x.com/a/status/1\n\n>cribs\n\n', []), { head: '来源：https://x.com/a/status/1\n\n>cribs\n\n', body: '' });
  assert.deepEqual(splitQuote('plain prompt', []), { head: '', body: 'plain prompt' });
});
