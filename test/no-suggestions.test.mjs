import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { app } from '../src/app.js';
import { findSuggestionRows, hideSuggestions } from '../src/plugins/noSuggestions.js';

// Shape of X's drawer body: greeting, composer (with labelled controls and an
// unlabelled attach button), then either the suggestion row or, in Private
// Chat, a disclaimer.
function drawer(extra) {
  const dom = new JSDOM(`<!doctype html><body><div id="layers"><div data-testid="GrokDrawer">
    <div><button aria-label="Private Chat"></button><button aria-label="Collapse"></button></div>
    <div class="body">
      <div class="greeting">How can I help you today?</div>
      <div class="composer"><textarea placeholder="Ask anything"></textarea>
        <div class="controls"><button></button><button aria-label="Expert">Expert</button><button aria-label="Enter voice mode"></button></div>
      </div>
      ${extra}
    </div>
  </div></div></body>`);
  app.doc = dom.window.document;
  return dom.window.document;
}

test('hides only the suggestion row', () => {
  const doc = drawer('<div class="suggestions"><button>Create Videos</button><button>Create Images</button><button>Edit Image</button><input type="file"><button>Latest News</button></div>');
  assert.equal(hideSuggestions(doc), 1);
  assert.ok(doc.querySelector('.suggestions').hasAttribute('data-askx-no-suggestions'));
  assert.equal(doc.querySelectorAll('[data-askx-no-suggestions]').length, 1);
});

test('leaves the composer controls and the Private Chat disclaimer alone', () => {
  const doc = drawer('<div class="disclaimer">This chat won’t appear in your history.</div>');
  assert.deepEqual(findSuggestionRows(doc.querySelector('[data-testid="GrokDrawer"]')), []);
  assert.equal(hideSuggestions(doc), 0);
});

test('hides the suggestion row on the full /i/grok page too', () => {
  const dom = new JSDOM(`<!doctype html><body><main>
    <div><button aria-label="Chat history">History</button><button aria-label="Private">Private</button></div>
    <div class="composer"><textarea placeholder="Ask anything"></textarea>
      <div class="controls"><button></button><button aria-label="Expert">Expert</button></div>
    </div>
    <div class="suggestions"><button>Create Videos</button><button>Create Images</button><button>Latest News</button></div>
  </main></body>`, { url: 'https://x.com/i/grok' });
  const doc = dom.window.document;
  app.doc = doc;
  assert.equal(hideSuggestions(doc), 1);
  assert.ok(doc.querySelector('.suggestions').hasAttribute('data-askx-no-suggestions'));
  assert.ok(!doc.querySelector('.controls').hasAttribute('data-askx-no-suggestions'));
});

test('leaves main alone on other X pages', () => {
  const dom = new JSDOM(`<!doctype html><body><main>
    <div><textarea></textarea></div>
    <div><button>Follow</button><button>Subscribe</button></div>
  </main></body>`, { url: 'https://x.com/home' });
  app.doc = dom.window.document;
  assert.equal(hideSuggestions(dom.window.document), 0);
});

test('NoLinkAccounts hides only the Link accounts control, only on /i/grok', async () => {
  const { CSS } = await import('../src/plugins/noLinkAccounts.js');
  const html = (flag) => `<!doctype html><html ${flag}><head><style>${CSS}</style></head><body><main>
    <button aria-label="Chat history">History</button><button aria-label="Private">Private</button>
    <button aria-label="Link accounts" id="link"><svg><path d="M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0L9.88 7.05"/></svg></button>
  </main></body></html>`;
  const page = new JSDOM(html('data-askx-grok-page'), { pretendToBeVisual: true }).window;
  assert.equal(page.getComputedStyle(page.document.getElementById('link')).display, 'none');
  assert.notEqual(page.getComputedStyle(page.document.querySelector('[aria-label="Private"]')).display, 'none');
  const other = new JSDOM(html(''), { pretendToBeVisual: true }).window;
  assert.notEqual(other.getComputedStyle(other.document.getElementById('link')).display, 'none');
});

test('message rows never include button or link labels', async () => {
  const { getMessages } = await import('../src/grok.js');
  const dom = new JSDOM(`<!doctype html><body><main><div><button style="background:#333;display:flex;align-items:flex-end"><div style="display:flex;align-items:flex-end"><div style="background:#1d9bf0"><div dir="ltr">Private</div></div></div></button></div></main></body>`, { url: 'https://x.com/i/grok' });
  assert.deepEqual(getMessages(dom.window.document.querySelector('main')), []);
});
