import { definePlugin } from '../api/plugins.js';
import { app } from '../app.js';
import { ICONS } from '../icons.js';
import { openSettings } from '../ui/settingsModal.js';

/* global GM_registerMenuCommand */
const open = () => openSettings(app.manager, app.doc);

export default definePlugin({
  name: 'Settings',
  description: 'Ask X 的设置界面：插件列表、开关和各插件的设置。从脚本管理器菜单“Ask X 设置”打开。',
  icon: ICONS.settings,
  required: true,
  tags: ['developer'],
  start() {
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Ask X 设置', open);
    app.doc.addEventListener('askx:settings', open);
  },
  stop() {
    app.doc.removeEventListener('askx:settings', open);
  }
});
