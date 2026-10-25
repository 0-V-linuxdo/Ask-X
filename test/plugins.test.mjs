import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { migrateLegacy } from '../src/api/migrate.js';
import { createPluginManager } from '../src/api/plugins.js';
import { app } from '../src/app.js';
import { buildRequest, toolbarButtons } from '../src/plugins/askGrok.js';
import { ALL_PLUGINS } from '../src/plugins/index.js';
import { describe as describeResult } from '../src/plugins/toasts.js';
import { openSettings } from '../src/ui/settingsModal.js';
import { iconUrlKind, isTintable } from '../src/iconLoader.js';

function setup(saved = null) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.com/home', pretendToBeVisual: true });
  let stored = saved;
  const storage = { read: () => stored, write: (_, v) => { stored = v; } };
  for (const p of ALL_PLUGINS) p.started = false;
  const manager = createPluginManager(storage);
  app.manager = manager;
  app.doc = dom.window.document;
  for (const p of ALL_PLUGINS) manager.register(p);
  return { dom, doc: dom.window.document, manager, stored: () => stored };
}

const sel = { text: 'hello', node: null };

test('every feature is its own plugin with void++-style defaults', () => {
  const { manager } = setup();
  const names = manager.order;
  assert.deepEqual(names, ['AskGrok', 'NewChat', 'Incognito', 'QuoteFormat', 'QuickPrompts', 'FollowUp', 'PostGrok', 'Markdown', 'UserQuotes', 'BetterLinks', 'PostTypography', 'CustomGreeting', 'DrawerHeight', 'ComposerOpacity', 'GrokScrollbars', 'NoSideScroll', 'ModelChips', 'MessageNavigator', 'InputHistory', 'ResponseNotification', 'CompleteToast', 'StatusBadge', 'GrokState', 'AutoRetry', 'Toasts', 'MenuCommands', 'NoSuggestions', 'HideFollowUps', 'NoVoiceMode', 'NoGrokComLink', 'NoLinkAccounts', 'Settings']);
  assert.ok(names.every((n) => manager.isEnabled(n)), 'all on by default');
  assert.equal(manager.toggle('AskGrok'), false, 'required plugins cannot be turned off');
  assert.equal(manager.isEnabled('AskGrok'), true);
});

test('defaults: main button asks in a new, non-private chat and never sends', () => {
  setup();
  const { plan } = buildRequest(sel, { id: 'ask' });
  assert.deepEqual(plan, { newChat: true, privateMode: 'off', writeMode: 'append', autoSend: false });
});

test('quick prompt buttons are icon-only by default, labels come back with the setting', () => {
  const { manager } = setup();
  const presets = () => toolbarButtons().filter((b) => b.id === 'preset');
  assert.ok(presets().every((b) => b.className.includes('askx-icon-only') && b.label));
  manager.mergePluginData('QuickPrompts', { showLabels: true });
  assert.ok(presets().every((b) => !b.className.includes('askx-icon-only')));
});

test('turning plugins off removes their behaviour and buttons', () => {
  const { manager } = setup();
  assert.deepEqual(toolbarButtons().map((b) => b.id), ['ask', 'private', 'preset', 'preset']);
  manager.toggle('NewChat');
  manager.toggle('Incognito');
  manager.toggle('QuickPrompts');
  assert.deepEqual(toolbarButtons().map((b) => b.id), ['ask']);
  const { plan } = buildRequest(sel, { id: 'ask' });
  assert.equal(plan.newChat, false);
  assert.equal(plan.privateMode, 'keep');
  assert.equal(plan.autoSend, false);
});

test('incognito plugin: ghost button goes private, the main button closes leftovers', () => {
  setup();
  assert.equal(buildRequest(sel, { id: 'private' }).plan.privateMode, 'on');
  assert.equal(buildRequest(sel, { id: 'ask', altKey: true }).plan.privateMode, 'off');
});

test('quick prompt overrides template, private and auto-send', () => {
  const { manager } = setup();
  manager.plugins.QuickPrompts.settings.set('presets', [{ name: '总结', template: 'T {quote}', private: true, autoSend: true }]);
  const ctx = buildRequest(sel, { id: 'preset', preset: 0 });
  assert.equal(ctx.template, 'T {quote}');
  assert.equal(ctx.plan.privateMode, 'on');
  assert.equal(ctx.plan.autoSend, true);
});

test('settings persist per plugin and invalid values fall back', () => {
  const first = setup();
  first.manager.plugins.QuoteFormat.settings.set('template', '   ');
  first.manager.plugins.QuoteFormat.settings.set('template', 'X {quote}');
  first.manager.toggle('Toasts');
  const second = setup(first.stored());
  assert.equal(second.manager.plugins.QuoteFormat.settings.store.template, 'X {quote}');
  assert.equal(second.manager.isEnabled('Toasts'), false);
  second.manager.plugins.QuoteFormat.settings.reset();
  assert.ok(second.manager.plugins.QuoteFormat.settings.store.template.includes('{url}'));
});

test('v1 flat settings migrate into plugins once', () => {
  const { manager } = setup();
  migrateLegacy({ openIn: 'current', privateMode: 'on', autoSend: true, writeMode: 'replace', template: 'T {text}', maxLength: 300, presets: [] }, manager);
  assert.equal(manager.isEnabled('NewChat'), false);
  assert.equal(manager.plugins.QuoteFormat.settings.store.template, 'T {text}');
  assert.deepEqual(manager.plugins.QuickPrompts.settings.store.presets, []);
  assert.equal(buildRequest(sel, { id: 'ask' }).plan.autoSend, false);
  assert.equal(migrateLegacy({ openIn: 'new' }, manager), false);
});

test('saved data of removed plugins and options is cleaned up', () => {
  const { manager, stored } = setup({
    plugins: {
      AutoSend: { enabled: true },
      ReplaceDraft: { enabled: true },
      NewChat: { keepDraft: false },
      Incognito: { alwaysPrivate: true, altClick: false, enabled: true },
      QuoteFormat: { maxLength: 300, template: 'K {quote}' },
      Toasts: { duration: 9 }
    },
    starred: ['AutoSend', 'NewChat'],
    pinned: ['ReplaceDraft']
  });
  assert.equal(manager.pruneUnknown(), true);
  assert.deepEqual(stored().plugins, { NewChat: {}, Incognito: { enabled: true }, QuoteFormat: { template: 'K {quote}' }, Toasts: {} });
  assert.deepEqual(stored().starred, ['NewChat']);
  assert.deepEqual(stored().pinned, []);
  assert.equal(manager.pruneUnknown(), false);
  assert.equal(buildRequest(sel, { id: 'ask' }).plan.privateMode, 'off');
});

test('toast text describes the result', () => {
  const ctx = { plan: { newChat: true } };
  assert.equal(describeResult({ result: { ok: true, private: false, notes: [] }, ctx }).text, '已写入 Grok 新对话。');
  assert.equal(describeResult({ result: { ok: true, private: true, notes: [] }, ctx }).kind, 'private');
  assert.equal(describeResult({ result: { ok: false, reason: 'no-drawer' }, ctx }).kind, 'error');
});

test('plugin page: cards, toggle, star → favorites, config dialog, search', () => {
  const { doc, manager } = setup();
  const ui = openSettings(manager, doc);
  const cards = () => [...doc.querySelectorAll('.askx-card')].map((c) => c.dataset.plugin);
  assert.equal(cards().length, 32);
  assert.deepEqual([...doc.querySelectorAll('.askx-card-required')].map((c) => c.dataset.plugin), ['AskGrok', 'Settings']);

  doc.querySelector('[data-plugin="Toasts"] [role="switch"]').click();
  assert.equal(manager.isEnabled('Toasts'), false);
  assert.ok(doc.querySelector('[data-plugin="AskGrok"] [role="switch"]').disabled);

  doc.querySelector('[data-plugin="Incognito"] .askx-card-btn').click();
  assert.deepEqual(manager.data.starred, ['Incognito']);
  [...doc.querySelectorAll('.askx-plugins-tab')].find((t) => t.textContent === '收藏').click();
  assert.deepEqual(cards(), ['Incognito']);

  [...doc.querySelectorAll('.askx-plugins-tab')].find((t) => t.textContent === '全部').click();
  const search = doc.querySelector('.askx-search');
  search.value = '幽灵';
  search.dispatchEvent(new doc.defaultView.Event('input'));
  assert.ok(cards().includes('Incognito'));
  assert.ok(!cards().includes('Toasts'));

  search.value = '';
  search.dispatchEvent(new doc.defaultView.Event('input'));
  assert.equal(doc.querySelector('[data-plugin="NewChat"] .askx-card-config'), null, 'no settings, no config button');
  search.value = '';
  search.dispatchEvent(new doc.defaultView.Event('input'));
  doc.querySelector('[data-plugin="QuoteFormat"] .askx-card-config').click();
  const dialog = doc.querySelector('.askx-dialog[aria-label="QuoteFormat"]');
  assert.ok(dialog);
  doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(doc.querySelector('.askx-dialog[aria-label="QuoteFormat"]'), null);
  assert.ok(doc.querySelector('.askx-settings-dialog'));
  ui.close();
});

test('opening the settings window or a plugin dialog focuses nothing', () => {
  const { doc, manager } = setup();
  const ui = openSettings(manager, doc);
  assert.equal(doc.activeElement, doc.body);
  doc.querySelector('[data-plugin="QuoteFormat"] .askx-card-config').click();
  assert.equal(doc.activeElement, doc.body);
  doc.querySelector('.askx-dialog[aria-label="QuoteFormat"] .askx-button-ghost').click();
  assert.equal(doc.activeElement, doc.body);
  ui.close();
});

test('quick prompt icons are URLs; old icon keys and missing icons migrate', () => {
  const { doc, manager } = setup({ plugins: { QuickPrompts: { presets: [
    { name: '解释', template: 'a {quote}' },
    { name: '总结', icon: 'list', template: 'b {quote}' },
    { name: '翻译', icon: '', template: 'c {quote}' },
    { name: '网络', icon: 'https://example.com/i.png', template: 'd {quote}' },
    { name: '坏的', icon: 'not a url', template: 'e {quote}' }
  ] } } });
  const icons = manager.plugins.QuickPrompts.settings.store.presets.map((p) => p.icon);
  assert.ok(icons[0].startsWith('data:image/svg+xml,'), 'default icon for 解释');
  assert.ok(icons[1].startsWith('data:image/svg+xml,') && decodeURIComponent(icons[1]).includes('M8 6h13'), 'legacy key -> data URL');
  assert.equal(icons[2], '');
  assert.equal(icons[3], 'https://example.com/i.png');
  assert.equal(icons[4], 'not a url', 'kept so the editor can show the error');

  const buttons = toolbarButtons().filter((b) => b.id === 'preset');
  assert.deepEqual(buttons.map((b) => Boolean(b.iconUrl)), [true, true, false, true, false]);

  openSettings(manager, doc);
  doc.querySelector('[data-plugin="QuickPrompts"] .askx-card-config').click();
  // List view: one compact row per prompt, no raw URLs on screen.
  assert.equal(doc.querySelectorAll('.askx-prompt-row').length, 5);
  assert.equal(doc.querySelectorAll('.askx-dialog[aria-label="QuickPrompts"] input').length, 0);
  // Edit the third prompt: icon URL is behind the icon button.
  doc.querySelectorAll('.askx-prompt-open')[2].click();
  assert.ok(doc.querySelector('.askx-dialog-editing'), 'plugin 重置 hidden while editing');
  doc.querySelector('.askx-icon-trigger').click();
  const url = doc.querySelector('.askx-icon-pop input');
  url.value = 'data:image/png;base64,iVBORw0KGgo=';
  [...doc.querySelectorAll('.askx-icon-pop .askx-button')].find((b) => b.textContent === '完成').click();
  assert.equal(doc.querySelector('.askx-icon-pop'), null);
  assert.equal(manager.plugins.QuickPrompts.settings.store.presets[2].icon, '', 'nothing saved before 保存');
  [...doc.querySelectorAll('.askx-form-actions .askx-button')].find((b) => b.textContent === '保存').click();
  assert.equal(manager.plugins.QuickPrompts.settings.store.presets[2].icon, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(doc.querySelectorAll('.askx-prompt-row').length, 5, 'back to the list');
});

test('icon URL kinds and tinting', () => {
  assert.equal(iconUrlKind(''), 'empty');
  assert.equal(iconUrlKind('https://a.b/c.svg'), 'http');
  assert.equal(iconUrlKind('data:image/png;base64,AAAA'), 'data');
  assert.equal(iconUrlKind('data:text/html,<b>'), 'invalid');
  assert.equal(iconUrlKind('javascript:alert(1)'), 'invalid');
  assert.equal(isTintable('data:image/svg+xml,' + encodeURIComponent('<svg stroke="currentColor"/>')), true);
  assert.equal(isTintable('data:image/png;base64,AAAA'), false);
});

test('default presets ship with data URL icons', () => {
  const { manager } = setup();
  assert.ok(manager.plugins.QuickPrompts.settings.store.presets.every((p) => p.icon.startsWith('data:image/svg+xml,')));
});

test('quick prompt editor: add with validation, cancel discards, delete removes', () => {
  const { doc, manager } = setup();
  openSettings(manager, doc);
  doc.querySelector('[data-plugin="QuickPrompts"] .askx-card-config').click();
  const store = () => manager.plugins.QuickPrompts.settings.store.presets;
  doc.querySelector('.askx-presets .askx-add').click();
  const save = [...doc.querySelectorAll('.askx-form-actions .askx-button')].find((b) => b.textContent === '保存');
  const name = doc.querySelector('.askx-form input[aria-label="名称"]');
  assert.equal(save.disabled, true, 'needs a name');
  name.value = '总结';
  name.dispatchEvent(new doc.defaultView.Event('input'));
  assert.equal(save.disabled, false);
  doc.querySelector('.askx-form [role="switch"][aria-label="无痕"]').click();
  save.click();
  assert.deepEqual(store().map((p) => [p.name, p.private]), [['解释', false], ['翻译', false], ['总结', true]]);
  assert.ok(doc.querySelectorAll('.askx-prompt-row')[2].textContent.includes('无痕'), 'badge on the row');

  doc.querySelectorAll('.askx-prompt-open')[0].click();
  const n = doc.querySelector('.askx-form input[aria-label="名称"]');
  n.value = '改名';
  n.dispatchEvent(new doc.defaultView.Event('input'));
  [...doc.querySelectorAll('.askx-form-actions .askx-button')].find((b) => b.textContent === '取消').click();
  assert.equal(store()[0].name, '解释', 'cancel discards');

  doc.querySelectorAll('.askx-prompt-row .askx-card-btn')[1].click();
  assert.deepEqual(store().map((p) => p.name), ['解释', '总结']);
});

test('PostGrok: the post button asks with your prompt after the quote, sends, never private by default', async () => {
  const { manager } = setup();
  const { postGrokButton, postText } = await import('../src/plugins/postGrok.js');
  const ctx = buildRequest({ text: 'hello', node: null, context: 'post' }, { id: 'post-grok' });
  assert.equal(ctx.template, '{url}\n\n解释一下');
  assert.equal(ctx.plan.autoSend, true);
  assert.equal(ctx.plan.privateMode, 'off');
  assert.equal(ctx.plan.newChat, true);
  manager.setEnabled?.('PostGrok', false);
  const doc = app.doc;
  doc.body.innerHTML = `<article data-testid="tweet"><div data-testid="tweetText">Bonjour <div style="display:inline-flex"><a href="/x">@x</a></div> ça va <img alt="🎷" src="e.svg"></div>
    <button aria-label="Grok actions" id="g"><svg><path d="M12.745 20.54l10.97-8.19c.539"/></svg></button>
    <button aria-label="More" id="m"><svg><path d="M3 12c0-1.1"/></svg></button></article>`;
  assert.equal(postGrokButton(doc.querySelector('#g path')), doc.getElementById('g'));
  assert.equal(postGrokButton(doc.getElementById('m')), null);
  assert.equal(postText(doc.querySelector('article')), 'Bonjour @x ça va 🎷');
});
