import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { BUTTON_CSS } from '../src/plugins/grokState.js';

// The closed drawer is one header <button> holding the Grok mark.
function closedDrawer(attrs = '') {
  const dom = new JSDOM(`<!doctype html><head><style>${BUTTON_CSS}</style></head><body>
    <div data-testid="GrokDrawer" ${attrs}><button data-testid="GrokDrawerHeader"><svg><path/></svg></button></div></body>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg');
  const hits = [...doc.styleSheets[0].cssRules]
    .filter((r) => r.selectorText && !r.selectorText.includes('::'))
    .filter((r) => { try { return svg.matches(r.selectorText); } catch { return false; } });
  return hits.map((r) => r.cssText);
}

test('no state: the closed drawer icon is left alone', () => {
  assert.deepEqual(closedDrawer(), []);
});

test('a state only styles the icon for its own style and state', () => {
  const hits = closedDrawer('data-askx-grok-style="hole" data-askx-grok-state="done"');
  assert.ok(hits.length >= 1);
  assert.ok(hits.every((css) => css.includes('[data-askx-grok-style="hole"][data-askx-grok-state="done"]')));
  assert.ok(!hits.some((css) => css.includes('opacity: 0')));
});
