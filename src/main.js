import { migrateLegacy, LEGACY_KEY } from './api/migrate.js';
import { createPluginManager, defaultStorage } from './api/plugins.js';
import { app } from './app.js';
import { ALL_PLUGINS } from './plugins/index.js';
import { injectStyles } from './styles.js';

function boot() {
  if (document.documentElement.dataset.askx) return;
  document.documentElement.dataset.askx = 'on';
  const storage = defaultStorage();
  const manager = createPluginManager(storage);
  app.manager = manager;
  app.doc = document;
  for (const plugin of ALL_PLUGINS) manager.register(plugin);
  try { migrateLegacy(storage.read(LEGACY_KEY), manager); } catch {}
  manager.pruneUnknown();
  injectStyles();
  manager.startAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
