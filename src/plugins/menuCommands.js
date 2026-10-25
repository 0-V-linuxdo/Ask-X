import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { ICONS } from '../icons.js';
import { currentSelection } from '../toolbar.js';
import { ask } from './askGrok.js';

/* global GM_registerMenuCommand, GM_unregisterMenuCommand */
let ids = [];

export default definePlugin({
  name: 'MenuCommands',
  description: '在脚本管理器菜单里加“问 Grok（当前划词）”和“无痕问 Grok（当前划词）”，不用工具条也能提问。',
  icon: ICONS.command,
  tags: ['navigation'],
  enabledByDefault: true,
  start() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    const run = (trigger) => () => {
      const selection = currentSelection(app.doc.defaultView);
      void ask(selection || { text: '' }, trigger);
    };
    ids = [
      GM_registerMenuCommand('问 Grok（当前划词）', run({ id: 'ask' })),
      GM_registerMenuCommand('无痕问 Grok（当前划词）', run({ id: 'private' }))
    ];
  },
  stop() {
    if (typeof GM_unregisterMenuCommand === 'function') ids.forEach((id) => GM_unregisterMenuCommand(id));
    ids = [];
  }
});
