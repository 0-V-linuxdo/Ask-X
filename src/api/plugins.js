// Plugin system: every Ask X feature is a plugin with its own on/off switch
// and its own settings, stored as plugins[Name] = { enabled, ...options }.
// The shape follows Void++: definePlugin / definePluginSettings / OptionType,
// required plugins that cannot be turned off, favourites and pins.

export const OptionType = Object.freeze({
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  SELECT: 'select',
  SLIDER: 'slider',
  COMPONENT: 'component'
});

export const STORAGE_KEY = 'askx.settings.v2';

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/* global GM_getValue, GM_setValue */
export function defaultStorage() {
  if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
    return { read: (key) => GM_getValue(key, null), write: (key, value) => GM_setValue(key, value) };
  }
  return {
    read: (key) => { try { return JSON.parse(globalThis.localStorage.getItem(key)); } catch { return null; } },
    write: (key, value) => { try { globalThis.localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };
}

function coerce(def, value) {
  switch (def.type) {
    case OptionType.BOOLEAN:
      return typeof value === 'boolean' ? value : undefined;
    case OptionType.SELECT:
      return def.options.some((o) => o.value === value) ? value : undefined;
    case OptionType.NUMBER:
    case OptionType.SLIDER: {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n)) return undefined;
      return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n));
    }
    case OptionType.STRING:
      return typeof value === 'string' && (def.allowEmpty || value.trim()) ? value : undefined;
    case OptionType.COMPONENT:
      return def.validate ? def.validate(value) : value;
    default:
      return undefined;
  }
}

export function definePluginSettings(def) {
  const settings = {
    def,
    pluginName: '',
    manager: null,
    get(key) {
      const saved = settings.manager?.pluginData(settings.pluginName)?.[key];
      const value = saved === undefined ? undefined : coerce(def[key], saved);
      return value === undefined ? clone(def[key].default) : value;
    },
    set(key, value) {
      const next = coerce(def[key], value);
      settings.manager?.mergePluginData(settings.pluginName, { [key]: next === undefined ? clone(def[key].default) : next });
    },
    reset() {
      settings.manager?.resetPluginData(settings.pluginName, Object.keys(def).filter((k) => !def[k].keepOnReset));
    }
  };
  settings.store = new Proxy({}, {
    get: (_, key) => (typeof key === 'string' && key in def ? settings.get(key) : undefined),
    set: (_, key, value) => { settings.set(key, value); return true; }
  });
  return settings;
}

export function definePlugin(plugin) {
  return { authors: ['0_V'], tags: [], enabledByDefault: false, ...plugin, started: false };
}

export function createPluginManager(storage = defaultStorage()) {
  let data = null;
  try { data = storage.read(STORAGE_KEY); } catch {}
  if (!data || typeof data !== 'object') data = {};
  data.plugins ??= {};
  data.starred ??= [];
  data.pinned ??= [];

  const plugins = {};
  const order = [];
  const listeners = new Set();

  const save = () => {
    try { storage.write(STORAGE_KEY, clone(data)); } catch {}
    for (const fn of listeners) fn();
  };

  const manager = {
    plugins,
    data,
    order,
    register(plugin) {
      plugins[plugin.name] = plugin;
      order.push(plugin.name);
      if (plugin.settings) {
        plugin.settings.pluginName = plugin.name;
        plugin.settings.manager = manager;
      }
      return plugin;
    },
    pluginData: (name) => data.plugins[name],
    mergePluginData(name, patch) {
      data.plugins[name] = { ...(data.plugins[name] || {}), ...patch };
      save();
      const plugin = plugins[name];
      if (plugin?.started && Object.keys(patch).some((k) => k !== 'enabled')) {
        try { plugin.onSettingsChange?.(); } catch (error) { console.error('[Ask X]', name, error); }
      }
    },
    resetPluginData(name, keys) {
      const current = data.plugins[name];
      if (!current) return;
      for (const key of keys) delete current[key];
      save();
      if (plugins[name]?.started) plugins[name].onSettingsChange?.();
    },
    isEnabled(name) {
      const plugin = plugins[name];
      if (!plugin) return false;
      if (plugin.required) return true;
      return data.plugins[name]?.enabled ?? plugin.enabledByDefault;
    },
    start(plugin) {
      if (plugin.started) return true;
      try {
        plugin.start?.();
        plugin.started = true;
      } catch (error) {
        console.error('[Ask X] failed to start', plugin.name, error);
      }
      return plugin.started;
    },
    stop(plugin) {
      if (!plugin.started) return;
      try { plugin.stop?.(); } catch (error) { console.error('[Ask X] failed to stop', plugin.name, error); }
      plugin.started = false;
    },
    startAll() {
      for (const name of order) if (manager.isEnabled(name)) manager.start(plugins[name]);
    },
    toggle(name) {
      const plugin = plugins[name];
      if (!plugin || plugin.required) return false;
      const next = !manager.isEnabled(name);
      data.plugins[name] = { ...(data.plugins[name] || {}), enabled: next };
      if (next) manager.start(plugin);
      else manager.stop(plugin);
      save();
      return next;
    },
    enabledPlugins: () => order.map((n) => plugins[n]).filter((p) => manager.isEnabled(p.name)),
    isStarred: (name) => data.starred.includes(name),
    isPinned: (name) => data.pinned.includes(name),
    toggleStar(name) {
      data.starred = manager.isStarred(name) ? data.starred.filter((n) => n !== name) : [...data.starred, name];
      save();
    },
    togglePin(name) {
      data.pinned = manager.isPinned(name) ? data.pinned.filter((n) => n !== name) : [...data.pinned, name];
      save();
    },
    // Drops saved data for plugins that no longer exist (e.g. a removed one).
    pruneUnknown() {
      const known = (name) => Boolean(plugins[name]);
      const stale = Object.keys(data.plugins).filter((name) => !known(name));
      const starred = data.starred.filter(known);
      const pinned = data.pinned.filter(known);
      // …and settings a plugin no longer has (e.g. removed options).
      const staleKeys = [];
      for (const [name, saved] of Object.entries(data.plugins)) {
        if (!known(name)) continue;
        const def = plugins[name].settings?.def || {};
        for (const key of Object.keys(saved)) if (key !== 'enabled' && !(key in def)) staleKeys.push([name, key]);
      }
      if (!stale.length && !staleKeys.length && starred.length === data.starred.length && pinned.length === data.pinned.length) return false;
      for (const name of stale) delete data.plugins[name];
      for (const [name, key] of staleKeys) delete data.plugins[name][key];
      data.starred = starred;
      data.pinned = pinned;
      save();
      return true;
    },
    resetAll() {
      for (const name of order) {
        const plugin = plugins[name];
        const was = manager.isEnabled(name);
        delete data.plugins[name];
        const now = manager.isEnabled(name);
        if (was && !now) manager.stop(plugin);
        if (!was && now) manager.start(plugin);
        if (plugin.started) plugin.onSettingsChange?.();
      }
      data.starred = [];
      data.pinned = [];
      save();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
  return manager;
}
