import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { createPluginManager } from '../src/api/plugins.js';
import { app } from '../src/app.js';
import { getMessages, messageList } from '../src/grok.js';
import { buildRequest, toolbarButtons } from '../src/plugins/askGrok.js';
import { findComposerBox, rgbOf } from '../src/plugins/composerOpacity.js';
import { findGreeting, nextIndex, paint as paintGreeting, parsePhrases } from '../src/plugins/customGreeting.js';
import { targetHeight } from '../src/plugins/drawerHeight.js';
import { css as scrollbarCss } from '../src/plugins/grokScrollbars.js';
import { mark as markSideScroll } from '../src/plugins/noSideScroll.js';
import { chatState, iconFor, nextKind, onStream as faviconStream } from '../src/plugins/grokState.js';
import { CSS as voiceCss } from '../src/plugins/noVoiceMode.js';
import { hideIn as hideGrokCom } from '../src/plugins/noGrokComLink.js';
import { findDomains, hrefFor } from '../src/plugins/betterLinks.js';
import { menuItemFor, modelButton } from '../src/plugins/modelChips.js';
import { findFollowUps, hideAll as hideFollowUps } from '../src/plugins/hideFollowUps.js';
import { findPrivateLabels } from '../src/plugins/incognito.js';
import { check as retryCheck, findRetry, resetRetry } from '../src/plugins/autoRetry.js';
import { ALL_PLUGINS } from '../src/plugins/index.js';
import { decorate as renderMarkdown, looksLikeMarkdown, undecorate as unrenderMarkdown } from '../src/plugins/markdown.js';
import { entries as historyEntries, pushEntry, step as historyStep } from '../src/plugins/inputHistory.js';
import { navMessages } from '../src/plugins/messageNavigator.js';
import { isAway, onStreamEnd } from '../src/plugins/responseNotification.js';
import { badgeState, onStream } from '../src/plugins/statusBadge.js';
import { handleEntry, isReplyUrl, simulateStream, watchStreams } from '../src/streamWatch.js';

const USER = (text) => `<div class="col" style="display:flex;align-items:flex-end"><div style="display:flex;align-items:flex-start"><div class="bubble" style="background-color: rgb(32, 35, 39)"><div dir="ltr" class="mine">${text}</div></div></div></div>`;
const GROK = (text) => `<div class="reply"><div dir="ltr" class="grok">${text}</div><button aria-label="Copy text"></button></div>`;

const windows = [];
test.after(() => { for (const w of windows) w.close(); });

function drawerPage(rows, { open = true, url = 'https://x.com/home', visible = false } = {}) {
  const composer = open ? '<div class="box" style="background-color: rgb(32, 35, 39); border-radius: 24px"><textarea placeholder="Ask anything"></textarea></div>' : '';
  const header = open ? '<div data-testid="GrokDrawerHeader"><button aria-label="Collapse"></button></div>' : '<button data-testid="GrokDrawerHeader" aria-label="Grok"></button>';
  const dom = new JSDOM(`<!doctype html><body><div id="layers"><div data-testid="GrokDrawer" style="position:relative">${header}
    <div class="scroll" style="overflow-y:auto"><div class="list"><div></div>${rows.join('')}<div></div></div></div>${composer}
  </div></div></body>`, { url, pretendToBeVisual: visible });
  windows.push(dom.window);
  app.doc = dom.window.document;
  return dom.window.document;
}

function setupManager(doc) {
  let stored = null;
  for (const p of ALL_PLUGINS) p.started = false;
  const manager = createPluginManager({ read: () => stored, write: (_, v) => { stored = v; } });
  app.manager = manager;
  app.doc = doc;
  for (const p of ALL_PLUGINS) manager.register(p);
  return manager;
}

test('scrollbars: thin and track-less, scoped to Grok only', () => {
  const css = scrollbarCss({ width: 'thin' });
  assert.match(css, /scrollbar-width:thin/);
  assert.match(css, /transparent/);
  assert.ok(css.includes('[data-testid="GrokDrawer"]'), 'the drawer');
  assert.ok(css.includes('html[data-askx-grok-page]'), 'the /i/grok page, behind its flag');
  assert.ok(!/(^|[},])\s*(html|body|\*)\s*\{/.test(css), 'never a bare page-wide rule');
  assert.match(scrollbarCss({ width: 'none' }), /scrollbar-width:none/);
});

test('no side scroll: only the Grok conversation scroller is marked', () => {
  const doc = drawerPage([USER('问'), GROK('答')]);
  assert.equal(markSideScroll(doc), 1);
  assert.ok(doc.querySelector('.scroll').hasAttribute('data-askx-no-xscroll'));
  assert.equal(doc.querySelectorAll('[data-askx-no-xscroll]').length, 1);
});

test('grok state: button tinted, tab icon untouched by default, X-based badge when on', () => {
  assert.equal(nextKind({ streaming: true, finished: 'done', typed: true }), 'rotate');
  assert.equal(nextKind({ streaming: false, finished: 'done', typed: true }), 'ready');
  assert.equal(nextKind({ streaming: false, finished: 'done', typed: false, conversation: null }), 'done');
  assert.equal(nextKind({ streaming: false, finished: 'error', typed: false }), 'error');
  assert.equal(nextKind({ streaming: false, finished: 'done', typed: false, conversation: false }), 'wait');
  assert.equal(iconFor('dot', 'wait'), '');
  const icon = decodeURIComponent(iconFor('dot', 'done'));
  assert.ok(icon.includes('M18.244 2.25'), "drawn on X's own logo");
  assert.ok(icon.includes('#22C55E'));
  assert.match(iconFor('badge', 'rotate'), /^data:image\/svg\+xml/);

  const doc = drawerPage([], { open: false });
  const manager = setupManager(doc);
  const xIcon = doc.createElement('link');
  xIcon.rel = 'icon';
  xIcon.href = 'https://abs.twimg.com/favicons/twitter.3.ico';
  doc.head.appendChild(xIcon);
  const drawer = doc.querySelector('[data-testid="GrokDrawer"]');
  faviconStream({ id: 1, phase: 'start' }, doc);
  assert.equal(chatState(), 'rotate');
  assert.equal(drawer.getAttribute('data-askx-grok-state'), 'rotate', 'the Grok button shows it');
  assert.equal(doc.getElementById('askx-chat-state-favicon'), null, 'tab icon untouched by default');
  manager.mergePluginData('GrokState', { favicon: true });
  faviconStream({ id: 1, phase: 'end', ok: true }, doc);
  assert.equal(chatState(), 'done');
  assert.equal(drawer.getAttribute('data-askx-grok-state'), 'done');
  assert.equal(doc.head.lastElementChild.id, 'askx-chat-state-favicon');
  faviconStream({ id: 2, phase: 'start' }, doc);
  faviconStream({ id: 2, phase: 'end', ok: true, cancelled: true }, doc);
  assert.equal(chatState(), 'wait');
  assert.equal(doc.getElementById('askx-chat-state-favicon'), null);
  assert.equal(drawer.hasAttribute('data-askx-grok-state'), false);
  assert.equal(xIcon.getAttribute('href'), 'https://abs.twimg.com/favicons/twitter.3.ico', "X's icon is never edited");
});

test('model menu: only "Go to grok.com" and its divider are hidden', () => {
  const dom = new JSDOM(`<!doctype html><body><div id="layers"><div role="menu"><div>
    <div role="menuitem">Auto</div><div role="menuitem">Fast</div><div role="menuitem">Expert</div>
    <div class="sep"></div><div role="menuitem" class="go"><span>Go to grok.com</span></div>
  </div></div><div role="menu"><div role="menuitem">Copy link</div></div></div></body>`);
  windows.push(dom.window);
  const doc = dom.window.document;
  assert.equal(hideGrokCom(doc), 1);
  assert.ok(doc.querySelector('.go').hasAttribute('data-askx-hidden-grokcom'));
  assert.ok(doc.querySelector('.sep').hasAttribute('data-askx-hidden-grokcom'));
  assert.equal(doc.querySelectorAll('[data-askx-hidden-grokcom]').length, 2, 'Auto / Fast / Expert and other menus untouched');
});

test('better links: bare domains found, emails and file names ignored', () => {
  const t = (s) => findDomains(s).map((d) => d.text);
  assert.deepEqual(t('官网是 pearltrees.com。'), ['pearltrees.com']);
  assert.deepEqual(t('see github.com/violentmonkey/violentmonkey, ok'), ['github.com/violentmonkey/violentmonkey']);
  assert.deepEqual(t('mail me at a@b.com or open main.js'), []);
  assert.equal(hrefFor('x.ai'), 'https://x.ai');
});

test('auto retry: clicks the Retry in the last conversation row once, then cools down', async () => {
  const doc = drawerPage([USER('问'), '<div><span>Something went wrong, please refresh to reconnect or try again.</span><button class="retry">Retry</button></div>']);
  resetRetry();
  const drawer = doc.querySelector('[data-testid="GrokDrawer"]');
  assert.equal(findRetry(drawer), doc.querySelector('.retry'));
  assert.equal(retryCheck(doc, 100_000), 'scheduled');
  assert.equal(retryCheck(doc, 101_000), null, 'same failure is not retried twice');
  doc.querySelector('.retry').replaceWith(Object.assign(doc.createElement('button'), { textContent: 'Retry' }));
  assert.equal(retryCheck(doc, 102_000), 'cooldown', 'a new failure within a minute waits for you');
});

test('model chips: finds X\'s model button and the menu item for a mode', () => {
  const dom = new JSDOM(`<!doctype html><body><div data-testid="GrokDrawer"><button aria-label="Private Chat"></button><button aria-label="Expert">Expert</button></div>
    <div role="menu"><div role="menuitem">AutoChooses</div><div role="menuitem">FastQuick</div><div role="menuitem">ExpertThinks</div><div role="menuitem">Go to grok.com</div></div></body>`);
  windows.push(dom.window);
  const doc = dom.window.document;
  assert.equal(modelButton(doc.querySelector('[data-testid="GrokDrawer"]')).getAttribute('aria-label'), 'Expert');
  const menu = doc.querySelector('[role="menu"]');
  assert.equal(menuItemFor(menu, 'Fast').textContent, 'FastQuick');
  assert.equal(menuItemFor(menu, 'Auto').textContent, 'AutoChooses');
});

test('follow-up suggestions: the unlabelled question block after a reply action bar', () => {
  const reply = `<div class="reply"><div dir="ltr" class="grok">答</div>
    <div class="actions"><button aria-label="Regenerate"><svg></svg></button><button aria-label="Copy text"><svg></svg></button><button aria-label="Share"><svg></svg></button></div>
    <div class="followups"><div></div><button><svg></svg>如何安装</button><button><svg></svg>用英文介绍</button></div></div>`;
  const doc = drawerPage([USER('问'), reply]);
  const found = findFollowUps(doc.querySelector('[data-testid="GrokDrawer"]'));
  assert.deepEqual(found, [doc.querySelector('.followups')]);
});

test('follow-up suggestions: older replies hidden, the latest kept by default', () => {
  const reply = (n) => `<div class="reply"><div dir="ltr" class="grok">答${n}</div>
    <div class="actions"><button aria-label="Regenerate"><svg></svg></button><button aria-label="Copy text"><svg></svg></button><button aria-label="Share"><svg></svg></button></div>
    <div class="followups f${n}"><button><svg></svg>问题${n}</button></div></div>`;
  const doc = drawerPage([USER('一'), reply(1), USER('二'), reply(2)]);
  assert.equal(hideFollowUps(doc, true), 1);
  assert.ok(doc.querySelector('.f1').hasAttribute('data-askx-hidden-followups'));
  assert.ok(!doc.querySelector('.f2').hasAttribute('data-askx-hidden-followups'), 'latest kept');
  assert.equal(hideFollowUps(doc, false), 2);
  assert.ok(doc.querySelector('.f2').hasAttribute('data-askx-hidden-followups'));
});

test('private badge in the input box: text found, buttons and the conversation ignored', () => {
  const dom = new JSDOM(`<!doctype html><body><div data-testid="GrokDrawer"><div class="reply"><svg></svg><div><span>1 web page</span></div></div>
    <div class="box" style="background-color: rgb(32, 35, 39); border-radius: 24px"><textarea></textarea>
    <div class="row"><button><span>Expert</span></button><div class="badge"><svg></svg><div><span class="t">Private</span></div></div></div></div></div></body>`);
  windows.push(dom.window);
  const doc = dom.window.document;
  const labels = findPrivateLabels(doc.querySelector('[data-testid="GrokDrawer"]'));
  assert.deepEqual(labels.map((l) => l.text), ['Private']);
});

test('voice-mode button hidden inside Grok only', () => {
  assert.ok(voiceCss.includes('[data-testid="GrokDrawer"]'));
  assert.ok(voiceCss.includes('aria-label="Enter voice mode" i'));
  assert.match(voiceCss, /display:none!important/);
});

test('conversation rows: your messages and Grok replies in order', () => {
  const doc = drawerPage([USER('第一问'), GROK('第一答'), USER('第二问'), GROK('第二答')]);
  const drawer = doc.querySelector('[data-testid="GrokDrawer"]');
  assert.equal(messageList(drawer), doc.querySelector('.list'));
  const msgs = getMessages(drawer);
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.deepEqual(msgs.map((m) => m.text), ['第一问', '第一答', '第二问', '第二答']);
});

test('navigator lists Grok replies unless turned off', () => {
  const doc = drawerPage([USER('问'), GROK('答')]);
  const manager = setupManager(doc);
  const drawer = doc.querySelector('[data-testid="GrokDrawer"]');
  assert.equal(navMessages(drawer).length, 2);
  manager.mergePluginData('MessageNavigator', { showAssistant: false });
  assert.deepEqual(navMessages(drawer).map((m) => m.role), ['user']);
});

test('markdown: your messages render, Grok replies and plain text do not', () => {
  const doc = drawerPage([USER('# 标题\n**粗** 和 `code` 和 [链接](https://example.com)\n- 一\n- 二\n>引用行\n```js\nlet a = 1;\n```'), GROK('**不处理**'), USER('普通文字，没有格式')]);
  assert.equal(renderMarkdown(doc), 1);
  const original = doc.querySelector('.mine:not(.askx-um)');
  assert.ok(original.hasAttribute('data-askx-um-src'), 'X\u2019s node is only hidden, never edited');
  assert.ok(original.textContent.includes('**粗**'));
  const mine = doc.querySelector('.mine.askx-um');
  assert.equal(mine.querySelector('.askx-md-h1').textContent, '标题');
  assert.equal(mine.querySelector('strong').textContent, '粗');
  assert.equal(mine.querySelector('.askx-md-code').textContent, 'code');
  assert.equal(mine.querySelector('a').getAttribute('href'), 'https://example.com');
  assert.equal(mine.querySelectorAll('li').length, 2);
  assert.equal(mine.querySelector('pre').textContent, 'let a = 1;');
  assert.ok([...mine.querySelectorAll('.askx-md-p')].some((p) => p.textContent === '>引用行'), 'quote lines stay text for UserQuotes');
  assert.equal(doc.querySelector('.grok strong'), null);
  assert.equal(renderMarkdown(doc), 0, 'idempotent');
  unrenderMarkdown(doc);
  assert.equal(doc.querySelector('.askx-um'), null);
  assert.equal(original.hasAttribute('data-askx-um-src'), false);
});

test('markdown never turns typed text into HTML', () => {
  const doc = drawerPage([USER('**hi** &lt;img src=x onerror=alert(1)&gt;')]);
  renderMarkdown(doc);
  const mine = doc.querySelector('.mine.askx-um');
  assert.equal(mine.querySelector('img'), null);
  assert.ok(mine.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.equal(looksLikeMarkdown('just text 2*3=6'), false);
  assert.equal(looksLikeMarkdown('some *emphasis* here'), true);
});

test('greeting: replaces the empty-chat title only, rotates, restores', () => {
  const dom = new JSDOM(`<!doctype html><body><div id="layers"><div data-testid="GrokDrawer"><div data-testid="GrokDrawerHeader"></div>
    <span><span class="hero" style="font-size: 26px">How can I help you today?</span></span>
    <div style="background-color: rgb(32, 35, 39); border-radius: 24px"><textarea placeholder="Ask anything"></textarea></div>
    <button><span style="font-size: 26px">not me</span></button>
  </div></div></body>`, { url: 'https://x.com/home' });
  windows.push(dom.window);
  const doc = dom.window.document;
  const manager = setupManager(doc);
  const drawer = doc.querySelector('[data-testid="GrokDrawer"]');
  assert.equal(findGreeting(drawer), doc.querySelector('.hero'));
  manager.mergePluginData('CustomGreeting', { phrases: '一\n二', placeholder: true });
  assert.equal(paintGreeting(doc), 1);
  assert.equal(doc.querySelector('.hero').getAttribute('data-askx-greet'), '一');
  assert.equal(doc.querySelector('textarea').getAttribute('placeholder'), '一');
  assert.equal(doc.querySelector('.hero').textContent, 'How can I help you today?', 'X text untouched, drawn by CSS');
  assert.deepEqual(parsePhrases(' a \n\n b '), ['a', 'b']);
  assert.equal(nextIndex(0, 3, 'sequential'), 1);
  assert.equal(nextIndex(2, 3, 'sequential'), 0);
  const rolls = [0.4, 0.4, 0.9];
  assert.equal(nextIndex(1, 3, 'random', () => rolls.shift()), 2, 'random never repeats the current phrase');
});

test('drawer height presets', () => {
  assert.equal(targetHeight({ preset: 'sidebar', height: 640 }, 846, 912), 912, 'full sidebar runs to the bottom of the window');
  assert.equal(targetHeight({ preset: 'custom', height: 500 }, 846), 500);
  assert.equal(targetHeight({ preset: 'custom', height: 1500 }, 846), 838);
  assert.equal(targetHeight({ preset: 'x', height: 640 }, 846), 0);
});

test('composer opacity finds the rounded input box', () => {
  const doc = drawerPage([]);
  assert.equal(findComposerBox(doc.querySelector('[data-testid="GrokDrawer"]')), doc.querySelector('.box'));
  assert.equal(rgbOf('rgb(32, 35, 39)'), '32, 35, 39');
  assert.equal(rgbOf('rgba(1, 2, 3, 0.5)'), '1, 2, 3');
});

test('follow-up: inside Grok the toolbar offers 追问 and presets, and stays in the current chat', () => {
  const doc = drawerPage([USER('问'), GROK('答')]);
  setupManager(doc);
  assert.deepEqual(toolbarButtons('grok').map((b) => b.id), ['follow-up', 'preset', 'preset']);
  assert.ok(!toolbarButtons('post').some((b) => b.id === 'follow-up'));
  const ctx = buildRequest({ text: 'x', node: doc.querySelector('.grok'), context: 'grok' }, { id: 'follow-up' });
  assert.equal(ctx.plan.newChat, false);
  assert.equal(ctx.plan.privateMode, 'keep');
  assert.equal(ctx.template, '{quote}\n\n');
});

test('status badge: streaming, then done until the drawer opens', () => {
  const doc = drawerPage([], { open: false });
  const manager = setupManager(doc);
  manager.mergePluginData('GrokState', { buttonStyle: 'none' }); // the corner dot is the chosen style
  onStream({ id: 1, phase: 'start' }, doc);
  const badge = () => doc.querySelector('.askx-status-dot');
  assert.equal(badge()?.dataset.state, 'streaming');
  onStream({ id: 1, phase: 'end', ok: true }, doc);
  assert.equal(badgeState(), 'done');
  assert.equal(badge()?.dataset.state, 'done');
  onStream({ id: 2, phase: 'start' }, doc);
  onStream({ id: 2, phase: 'end', ok: false }, doc);
  assert.equal(badge()?.dataset.state, 'error');
});

test('status badge: a dropped send clears instead of pulsing forever, and never notifies', () => {
  const doc = drawerPage([], { open: false });
  setupManager(doc);
  onStream({ id: 3, phase: 'start' }, doc);
  assert.equal(badgeState(), 'streaming');
  onStream({ id: 3, phase: 'end', ok: true, cancelled: true }, doc);
  assert.equal(badgeState(), 'idle');
  assert.equal(doc.querySelector('.askx-status-dot'), null);
  assert.equal(onStreamEnd({ id: 3, phase: 'end', ok: true, cancelled: true }, doc), null);
});

test('reply notification: toast + system notification when the drawer is minimised', () => {
  const doc = drawerPage([], { open: false, visible: true });
  setupManager(doc);
  const calls = [];
  globalThis.GM_notification = (opts) => calls.push(opts);
  try {
    assert.equal(isAway(doc), true);
    const done = onStreamEnd({ id: 1, phase: 'end', ok: true }, doc);
    assert.equal(done.toast, true);
    assert.equal(done.notification, true);
    assert.equal(calls[0].title, 'Grok');
    assert.ok(doc.querySelector('.askx-toast').textContent.includes('回复完成'));
    const open = drawerPage([USER('a')], { open: true, visible: true });
    setupManager(open);
    assert.equal(isAway(open), false);
    assert.deepEqual(onStreamEnd({ id: 2, phase: 'end', ok: true }, open), { sound: false, notification: false, toast: false });
  } finally {
    delete globalThis.GM_notification;
  }
});

test('replies are detected passively from resource timing, X\u2019s fetch is left alone', () => {
  const doc = drawerPage([]);
  const nativeFetch = doc.defaultView.fetch;
  const seen = [];
  const off = watchStreams(doc, (d) => seen.push(d));
  assert.equal(doc.defaultView.fetch, nativeFetch, 'fetch is not wrapped');
  assert.equal(isReplyUrl('https://grok.x.com/2/grok/add_response.json'), true);
  assert.equal(isReplyUrl('https://x.com/i/api/rest/app-chat/conversations/1aa6197b-ce9b/responses'), true);
  assert.equal(isReplyUrl('https://x.com/i/api/rest/app-chat/conversations/1aa6197b-ce9b/stop-inflight-responses'), false);
  assert.equal(isReplyUrl('https://x.com/i/api/rest/models'), false);
  assert.equal(handleEntry({ name: 'https://x.com/i/api/graphql/abc' }), false);
  // X's own Grok features (translate a post …) use the same request: with no
  // message sent in Grok, nothing is announced.
  assert.equal(handleEntry({ name: 'https://grok.x.com/2/grok/add_response.json', responseStatus: 200 }), false);
  simulateStream(doc, { phase: 'start' });
  assert.equal(handleEntry({ name: 'https://x.com/i/api/rest/app-chat/conversations/x/responses', responseStatus: 200 }), true);
  simulateStream(doc, { phase: 'start' });
  assert.equal(handleEntry({ name: 'https://grok.x.com/2/grok/add_response.json', responseStatus: 500 }), true);
  off();
  assert.deepEqual(seen.filter((d) => d.phase === 'end').map((d) => d.ok), [true, false]);
});

test('input history: sent prompts are stored once, ↑/↓ walk them and give the draft back', () => {
  const doc = drawerPage([]);
  const manager = setupManager(doc);
  assert.equal(pushEntry('第一条', 0), true);
  assert.equal(pushEntry('第一条', 500), false, 'Enter + send click count once');
  pushEntry('第二条\u200B  ', 10_000);
  assert.deepEqual(historyEntries(), ['第一条', '第二条']);
  const area = doc.querySelector('textarea');
  area.value = '没写完的草稿';
  assert.equal(historyStep(area, true), true);
  assert.equal(area.value, '第二条');
  historyStep(area, true);
  assert.equal(area.value, '第一条');
  assert.equal(historyStep(area, true), true, 'oldest: key swallowed, stays');
  assert.equal(area.value, '第一条');
  historyStep(area, false);
  historyStep(area, false);
  assert.equal(area.value, '没写完的草稿');
  manager.mergePluginData('InputHistory', { maxEntries: 10 });
  for (let i = 0; i < 15; i += 1) pushEntry(`p${i}`, 20_000 + i * 3_000);
  assert.equal(historyEntries().length, 10);
  manager.plugins.InputHistory.settings.reset();
  assert.equal(historyEntries().length, 10, 'resetting settings keeps the history');
});

test('greeting: in the newer drawer the whole animated <h1> is replaced, not one word', () => {
  const dom = new JSDOM(`<!doctype html><body><div id="layers"><div data-testid="GrokDrawer"><div data-testid="GrokDrawerHeader"></div>
    <h1 style="font-size: 23px"><span><span aria-hidden="true"><span>What</span><span class="grok-rolling-swap" style="width: 908px"><span>should we explore?</span></span></span></span></h1>
    <div style="background-color: rgb(0, 0, 0); border-radius: 43px"><div contenteditable="true" role="textbox" aria-label="Ask anything"><p><br></p></div></div>
  </div></div></body>`, { url: 'https://x.com/home' });
  windows.push(dom.window);
  const doc = dom.window.document;
  const manager = setupManager(doc);
  manager.mergePluginData('CustomGreeting', { phrases: '你好' });
  assert.equal(findGreeting(doc.querySelector('[data-testid="GrokDrawer"]')), doc.querySelector('h1'));
  assert.equal(paintGreeting(doc), 1);
  assert.equal(doc.querySelector('h1').getAttribute('data-askx-greet'), '你好');
});

test('incognito button uses the native X ghost by default, the Ask X ghost on request', async () => {
  const doc = drawerPage([]);
  const manager = setupManager(doc);
  const { ICONS } = await import('../src/icons.js');
  const ghost = () => toolbarButtons('post').find((b) => b.id === 'private').icon;
  assert.equal(ghost(), ICONS.ghostNative);
  manager.mergePluginData('Incognito', { icon: 'askx' });
  assert.equal(ghost(), ICONS.ghost);
});
