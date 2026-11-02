import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { dismissIn, findNotNow } from '../src/plugins/noLinkPrompt.js';

// Shape of X's "One Grok, everywhere" modal in #layers.
function prompt(agree, notNow) {
  const dom = new JSDOM(`<!doctype html><body><div id="layers"><div role="dialog" aria-modal="true">
    <img src="https://abs.twimg.com/jf/grok/entry_hero.png">
    <p>One Grok, everywhere</p>
    <div class="actions"><button type="button"><p>${agree}</p></button><button type="button"><p>${notNow}</p></button><p>Terms</p></div>
    <button type="button"></button>
  </div></div></body>`);
  return dom.window.document;
}

test('presses Not now once, never Agree and continue', () => {
  const doc = prompt('Agree and continue', 'Not now');
  const [agree, notNow] = doc.querySelectorAll('.actions button');
  let pressed = '';
  agree.addEventListener('click', () => { pressed += 'agree'; });
  notNow.addEventListener('click', () => { pressed += 'not-now'; });
  assert.equal(dismissIn(doc), true);
  assert.equal(dismissIn(doc), false);
  assert.equal(pressed, 'not-now');
});

test('falls back to the button after Agree in other languages', () => {
  const doc = prompt('同意并继续', '不用了');
  assert.equal(findNotNow(doc).textContent, '不用了');
});

test('ignores other dialogs', () => {
  const dom = new JSDOM('<!doctype html><body><div id="layers"><div role="dialog"><button>Agree</button><button>Not now</button></div></div></body>');
  assert.equal(findNotNow(dom.window.document), null);
});

test('redirect target is read from the prompt URL, x.com only', async () => {
  const { redirectPath } = await import('../src/plugins/noLinkPrompt.js');
  const at = (href) => new URL(href);
  assert.equal(redirectPath(at('https://x.com/i/jf/grok/entry?redirect=https%3A%2F%2Fx.com%2Fi%2Fgrok')), '/i/grok');
  assert.equal(redirectPath(at('https://x.com/i/jf/grok/entry?redirect=https%3A%2F%2Fevil.com%2Fx')), null);
  assert.equal(redirectPath(at('https://x.com/home')), null);
});
