// ==UserScript==
// @name         Ask X
// @namespace    0_V userscripts/Ask X
// @version      1.21.4
// @update-log   [20261025] v1.21.4 - Updates now come from github.com/0-V-linuxdo/Ask-X (@updateURL / @downloadURL). PostGrok: the hover tooltip on X's Grok button is yours to set (empty = your prompt).
// @description  Select text on X and ask Grok in the side drawer: opens a new chat by default, can use Private Chat, with a customizable quote template and quick-prompt buttons.
// @updateURL    https://raw.githubusercontent.com/0-V-linuxdo/Ask-X/main/Ask%20X.user.js
// @downloadURL  https://raw.githubusercontent.com/0-V-linuxdo/Ask-X/main/Ask%20X.user.js
// @match        https://x.com/*
// @match        https://www.x.com/*
// @match        https://mobile.x.com/*
// @match        https://m.x.com/*
// @match        https://twitter.com/*
// @match        https://www.twitter.com/*
// @match        https://mobile.twitter.com/*
// @match        https://m.twitter.com/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      *
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%231d9bf0%22%20stroke-width%3D%222.2%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%207h6v6c0%203-1.6%204.8-4.5%205.5%22%2F%3E%3Cpath%20d%3D%22M14%207h6v6c0%203-1.6%204.8-4.5%205.5%22%2F%3E%3C%2Fsvg%3E
// ==/UserScript==
(() => {
  // src/api/migrate.js
  var LEGACY_KEY = "askx.settings.v1";
  function migrateLegacy(legacy, manager) {
    if (!legacy || typeof legacy !== "object" || manager.data.migratedV1) return false;
    const set = (name, patch) => manager.mergePluginData(name, patch);
    if (legacy.openIn === "current") set("NewChat", { enabled: false });
    if (typeof legacy.template === "string" && legacy.template.trim()) set("QuoteFormat", { template: legacy.template });
    if (Array.isArray(legacy.presets)) set("QuickPrompts", { presets: legacy.presets });
    manager.data.migratedV1 = true;
    manager.mergePluginData("Settings", {});
    return true;
  }

  // src/api/plugins.js
  var OptionType = Object.freeze({
    STRING: "string",
    NUMBER: "number",
    BOOLEAN: "boolean",
    SELECT: "select",
    SLIDER: "slider",
    COMPONENT: "component"
  });
  var STORAGE_KEY = "askx.settings.v2";
  var clone = (value) => value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
  function defaultStorage() {
    if (typeof GM_getValue === "function" && typeof GM_setValue === "function") {
      return { read: (key) => GM_getValue(key, null), write: (key, value) => GM_setValue(key, value) };
    }
    return {
      read: (key) => {
        try {
          return JSON.parse(globalThis.localStorage.getItem(key));
        } catch {
          return null;
        }
      },
      write: (key, value) => {
        try {
          globalThis.localStorage.setItem(key, JSON.stringify(value));
        } catch {
        }
      }
    };
  }
  function coerce(def, value) {
    switch (def.type) {
      case OptionType.BOOLEAN:
        return typeof value === "boolean" ? value : void 0;
      case OptionType.SELECT:
        return def.options.some((o) => o.value === value) ? value : void 0;
      case OptionType.NUMBER:
      case OptionType.SLIDER: {
        const n = Math.round(Number(value));
        if (!Number.isFinite(n)) return void 0;
        return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n));
      }
      case OptionType.STRING:
        return typeof value === "string" && (def.allowEmpty || value.trim()) ? value : void 0;
      case OptionType.COMPONENT:
        return def.validate ? def.validate(value) : value;
      default:
        return void 0;
    }
  }
  function definePluginSettings(def) {
    const settings22 = {
      def,
      pluginName: "",
      manager: null,
      get(key) {
        const saved = settings22.manager?.pluginData(settings22.pluginName)?.[key];
        const value = saved === void 0 ? void 0 : coerce(def[key], saved);
        return value === void 0 ? clone(def[key].default) : value;
      },
      set(key, value) {
        const next = coerce(def[key], value);
        settings22.manager?.mergePluginData(settings22.pluginName, { [key]: next === void 0 ? clone(def[key].default) : next });
      },
      reset() {
        settings22.manager?.resetPluginData(settings22.pluginName, Object.keys(def).filter((k) => !def[k].keepOnReset));
      }
    };
    settings22.store = new Proxy({}, {
      get: (_, key) => typeof key === "string" && key in def ? settings22.get(key) : void 0,
      set: (_, key, value) => {
        settings22.set(key, value);
        return true;
      }
    });
    return settings22;
  }
  function definePlugin(plugin) {
    return { authors: ["0_V"], tags: [], enabledByDefault: false, ...plugin, started: false };
  }
  function createPluginManager(storage = defaultStorage()) {
    let data = null;
    try {
      data = storage.read(STORAGE_KEY);
    } catch {
    }
    if (!data || typeof data !== "object") data = {};
    data.plugins ?? (data.plugins = {});
    data.starred ?? (data.starred = []);
    data.pinned ?? (data.pinned = []);
    const plugins = {};
    const order = [];
    const listeners2 = /* @__PURE__ */ new Set();
    const save = () => {
      try {
        storage.write(STORAGE_KEY, clone(data));
      } catch {
      }
      for (const fn of listeners2) fn();
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
        data.plugins[name] = { ...data.plugins[name] || {}, ...patch };
        save();
        const plugin = plugins[name];
        if (plugin?.started && Object.keys(patch).some((k) => k !== "enabled")) {
          try {
            plugin.onSettingsChange?.();
          } catch (error) {
            console.error("[Ask X]", name, error);
          }
        }
      },
      resetPluginData(name, keys) {
        const current2 = data.plugins[name];
        if (!current2) return;
        for (const key of keys) delete current2[key];
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
          console.error("[Ask X] failed to start", plugin.name, error);
        }
        return plugin.started;
      },
      stop(plugin) {
        if (!plugin.started) return;
        try {
          plugin.stop?.();
        } catch (error) {
          console.error("[Ask X] failed to stop", plugin.name, error);
        }
        plugin.started = false;
      },
      startAll() {
        for (const name of order) if (manager.isEnabled(name)) manager.start(plugins[name]);
      },
      toggle(name) {
        const plugin = plugins[name];
        if (!plugin || plugin.required) return false;
        const next = !manager.isEnabled(name);
        data.plugins[name] = { ...data.plugins[name] || {}, enabled: next };
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
        const staleKeys = [];
        for (const [name, saved] of Object.entries(data.plugins)) {
          if (!known(name)) continue;
          const def = plugins[name].settings?.def || {};
          for (const key of Object.keys(saved)) if (key !== "enabled" && !(key in def)) staleKeys.push([name, key]);
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
        listeners2.add(fn);
        return () => listeners2.delete(fn);
      }
    };
    return manager;
  }

  // src/app.js
  var app = {
    manager: null,
    doc: typeof document !== "undefined" ? document : null
  };

  // src/api/events.js
  var handlers = /* @__PURE__ */ new Map();
  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, /* @__PURE__ */ new Set());
    handlers.get(type).add(fn);
    return () => handlers.get(type)?.delete(fn);
  }
  function emit(type, payload) {
    for (const fn of handlers.get(type) || []) {
      try {
        fn(payload);
      } catch (error) {
        console.error("[Ask X] event handler failed", type, error);
      }
    }
  }

  // src/text.js
  var HAS_WORD = /[\p{L}\p{N}]/u;
  var DEFAULT_TEMPLATE = "来源：{url}\n\n>{text}\n\n";
  function cleanSelection(raw, maxLength = 2e3) {
    let text = String(raw ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/u, "").replace(/[ \t]{2,}/g, " ")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!HAS_WORD.test(text)) return "";
    const limit = Number(maxLength);
    if (Number.isFinite(limit) && limit > 0 && text.length > limit) text = text.slice(0, limit);
    return text;
  }
  function quoteLines(text) {
    return text.split("\n").map((line) => `>${line}`).join("\n");
  }
  function renderTemplate(template, values) {
    const source = String(template || DEFAULT_TEMPLATE);
    const fields = {
      text: values.text || "",
      quote: values.text ? quoteLines(values.text) : "",
      url: values.url || "",
      author: values.author || ""
    };
    const lines = source.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const keys = [...line.matchAll(/\{(text|quote|url|author)\}/g)].map((m) => m[1]);
      if (keys.length && keys.every((key) => !fields[key])) {
        if (lines[i + 1] === "") i += 1;
        continue;
      }
      const quoted = /^(\s*>+\s?)\{text\}/.exec(line);
      if (quoted && fields.text.includes("\n")) {
        const prefix = quoted[1];
        const body = fields.text.split("\n").map((l, j) => j ? `${prefix}${l}` : l).join("\n");
        out.push(line.replace("{text}", body).replace(/\{(text|quote|url|author)\}/g, (_, key) => fields[key]));
        continue;
      }
      out.push(line.replace(/\{(text|quote|url|author)\}/g, (_, key) => fields[key]));
    }
    return out.join("\n");
  }
  function appendPrompt(existing, prompt) {
    const head = String(existing || "").replace(/[\s​]+$/u, "");
    return head ? `${head}

${prompt}` : prompt;
  }

  // src/x-strings.js
  var X_KEYS = {
    newChat: "ica55d24",
    privateChat: "d285710e",
    privateNotice: "c590ddd2",
    send: "b5df32b0"
  };
  var FALLBACK = {
    newChat: ["New Chat", "新聊天", "新对话", "新建聊天"],
    privateChat: ["Private Chat", "私密聊天", "隐私聊天", "私人聊天"],
    privateNotice: ["This chat won’t appear in your history"],
    send: ["Grok something", "Grok 一下", "Send", "发送"]
  };
  var cache = null;
  var scannedAt = 0;
  var RESCAN_MS = 3e5;
  function pageWindow() {
    return typeof unsafeWindow !== "undefined" ? unsafeWindow : globalThis;
  }
  function readFromChunks(win) {
    const found = {};
    const chunkKey = Object.keys(win).find((key) => key.startsWith("webpackChunk"));
    const chunks = chunkKey ? win[chunkKey] : null;
    if (!Array.isArray(chunks)) return found;
    const wanted = Object.entries(X_KEYS);
    for (const chunk of chunks) {
      const modules = chunk?.[1];
      if (!modules) continue;
      for (const id of Object.keys(modules)) {
        let src;
        try {
          src = String(modules[id]);
        } catch {
          continue;
        }
        if (!src.includes(X_KEYS.newChat) && !src.includes(X_KEYS.privateChat)) continue;
        for (const [name, key] of wanted) {
          if (found[name]) continue;
          const m = new RegExp(`\\("${key}",\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(src);
          if (m) {
            try {
              found[name] = JSON.parse(`"${m[1]}"`);
            } catch {
              found[name] = m[1];
            }
          }
        }
        if (wanted.every(([name]) => found[name])) return found;
      }
    }
    return found;
  }
  var partial = null;
  function xLabels(win = pageWindow()) {
    if (cache) return cache;
    if (partial && Date.now() - scannedAt < RESCAN_MS) return partial;
    scannedAt = Date.now();
    let found = {};
    try {
      found = readFromChunks(win);
    } catch {
    }
    const labels = {};
    for (const name of Object.keys(X_KEYS)) {
      labels[name] = [...new Set([found[name], ...FALLBACK[name]].filter(Boolean))];
    }
    if (found.newChat && found.privateChat) cache = labels;
    else partial = labels;
    return labels;
  }

  // src/drawer.js
  var DRAWER = '[data-testid="GrokDrawer"]';
  var HEADER = '[data-testid="GrokDrawerHeader"]';
  var PAD = "​";
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(check2, { timeout = 2e3, step: step3 = 50 } = {}) {
    const end = Date.now() + timeout;
    for (; ; ) {
      const value = check2();
      if (value) return value;
      if (Date.now() >= end) return null;
      await sleep(step3);
    }
  }
  function getDrawer(doc = document) {
    return doc.querySelector(`#layers ${DRAWER}`) || doc.querySelector(DRAWER);
  }
  function usable(el2) {
    return Boolean(el2) && !el2.disabled && el2.getAttribute("aria-disabled") !== "true" && el2.getAttribute("aria-hidden") !== "true";
  }
  function getComposer(drawer) {
    if (!drawer) return null;
    const fields = [...drawer.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].filter(usable);
    return fields[fields.length - 1] || null;
  }
  function findButton(drawer, names) {
    if (!drawer) return null;
    const wanted = names.map((n) => n.toLowerCase());
    return [...drawer.querySelectorAll('button, [role="button"]')].find((el2) => {
      const label3 = (el2.getAttribute("aria-label") || "").trim().toLowerCase();
      return label3 && wanted.includes(label3) && usable(el2);
    }) || null;
  }
  function isPrivateOn(drawer, labels = xLabels()) {
    const button = findButton(drawer, labels.privateChat);
    if (button) {
      const pressed = button.getAttribute("aria-pressed");
      if (pressed === "true" || pressed === "false") return pressed === "true";
      const icon2 = button.querySelector("svg");
      const view = drawer.ownerDocument.defaultView;
      const base = button.firstElementChild || button;
      if (icon2 && view?.getComputedStyle) {
        const iconColor = view.getComputedStyle(icon2).color;
        const textColor = view.getComputedStyle(base).color;
        if (iconColor && textColor) return iconColor !== textColor;
      }
    }
    const text = drawer?.textContent || "";
    return labels.privateNotice.some((notice) => text.includes(notice));
  }
  async function openDrawer(doc = document, timeout = 2500) {
    let drawer = getDrawer(doc);
    if (!drawer) return null;
    if (getComposer(drawer)) return drawer;
    const header = drawer.querySelector(HEADER);
    const opener = header?.matches("button") ? header : header?.querySelector("button") || drawer.querySelector("button");
    opener?.click();
    return waitFor(() => {
      drawer = getDrawer(doc);
      return getComposer(drawer) ? drawer : null;
    }, { timeout });
  }
  async function startNewChat(drawer, labels = xLabels()) {
    const button = findButton(drawer, labels.newChat);
    if (!button) return { changed: false };
    button.click();
    const ok = await waitFor(() => !findButton(drawer, labels.newChat) && getComposer(drawer), { timeout: 2500 });
    return { changed: true, ok: Boolean(ok) };
  }
  async function setPrivate(drawer, wanted, labels = xLabels()) {
    if (isPrivateOn(drawer, labels) === wanted) return { ok: true, changed: false };
    const button = findButton(drawer, labels.privateChat);
    if (!button) return { ok: false, changed: false };
    button.click();
    const ok = await waitFor(() => isPrivateOn(drawer, labels) === wanted, { timeout: 1500 });
    return { ok: Boolean(ok), changed: true };
  }
  function readValue(el2) {
    if ("value" in el2 && typeof el2.value === "string") return el2.value;
    const text = typeof el2.innerText === "string" && el2.isConnected ? el2.innerText : el2.textContent || "";
    return text.replace(/\n$/u, "");
  }
  function writeTextarea(el2, value) {
    const view = el2.ownerDocument.defaultView;
    const proto = el2 instanceof view.HTMLTextAreaElement ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el2, value);
    const InputEvt = typeof view.InputEvent === "function" ? view.InputEvent : view.Event;
    el2.dispatchEvent(new InputEvt("input", { bubbles: true, inputType: "insertText", data: value }));
    el2.dispatchEvent(new view.Event("change", { bubbles: true }));
  }
  var tick = (view) => new Promise((resolve) => view.setTimeout(resolve, 0));
  function selectIn(el2, atEnd2) {
    const doc = el2.ownerDocument;
    const sel2 = doc.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(el2);
    if (atEnd2) range.collapse(false);
    sel2.removeAllRanges();
    sel2.addRange(range);
  }
  async function pasteInto(el2, text) {
    const doc = el2.ownerDocument;
    const view = doc.defaultView;
    const before = readValue(el2);
    let handled = false;
    try {
      const data = new view.DataTransfer();
      data.setData("text/plain", text);
      handled = !el2.dispatchEvent(new view.ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    } catch {
    }
    if (!handled || readValue(el2) === before) {
      try {
        doc.execCommand?.("insertText", false, text);
      } catch {
      }
    }
  }
  async function writeEditable(el2, value) {
    const view = el2.ownerDocument.defaultView;
    el2.focus();
    const current2 = readValue(el2);
    if (current2.trim() && value.startsWith(current2)) {
      selectIn(el2, true);
      await tick(view);
      await pasteInto(el2, value.slice(current2.length));
      return;
    }
    selectIn(el2, false);
    await tick(view);
    if (current2.trim()) {
      try {
        el2.ownerDocument.execCommand?.("delete");
      } catch {
      }
      await tick(view);
    }
    await pasteInto(el2, value);
  }
  function composeValue(existing, prompt, mode) {
    const body = prompt.replace(/\n+$/u, "");
    const tail = /\n\s*$/u.test(prompt) ? `

${PAD}` : "";
    const text = `${body}${tail}`;
    return mode === "replace" ? text : appendPrompt(existing, text);
  }
  async function writePrompt(composer, prompt, mode = "append", draft2 = readValue(composer)) {
    const next = composeValue(draft2, prompt, mode);
    composer.focus();
    if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
      writeTextarea(composer, next);
      try {
        composer.setSelectionRange(next.length, next.length);
      } catch {
      }
    } else {
      await writeEditable(composer, next);
    }
    return readValue(composer).includes(prompt.replace(/\n+$/u, "").split("\n")[0]);
  }
  async function sendPrompt(drawer, labels = xLabels()) {
    const button = await waitFor(() => findButton(drawer, labels.send), { timeout: 1500 });
    if (!button) return false;
    button.click();
    return true;
  }
  async function askGrok(prompt, plan, doc = document) {
    const labels = xLabels();
    const drawer = await openDrawer(doc);
    if (!drawer) return { ok: false, reason: getDrawer(doc) ? "not-ready" : "no-drawer" };
    const notes = [];
    const needsEmpty = plan.newChat || plan.privateMode !== "keep" && isPrivateOn(drawer, labels) !== (plan.privateMode === "on");
    const draft2 = readValue(getComposer(drawer) || { textContent: "" });
    if (needsEmpty) {
      const result = await startNewChat(drawer, labels);
      if (result.changed && !result.ok) notes.push("new-chat-slow");
    }
    if (plan.privateMode !== "keep") {
      const result = await setPrivate(drawer, plan.privateMode === "on", labels);
      if (!result.ok) notes.push("private-unavailable");
    }
    const composer = getComposer(drawer);
    if (!composer) return { ok: false, reason: "no-composer", notes };
    const current2 = readValue(composer);
    if (!await writePrompt(composer, prompt, plan.writeMode, current2.trim() ? current2 : draft2)) return { ok: false, reason: "write-failed", notes };
    let sent = false;
    if (plan.autoSend) {
      await sleep(120);
      sent = await sendPrompt(drawer, labels);
      if (!sent) notes.push("send-failed");
    }
    return { ok: true, sent, private: isPrivateOn(drawer, labels), notes, composer };
  }

  // src/grok.js
  function onGrokPage(doc) {
    try {
      return /^\/i\/grok/.test(doc.defaultView?.location?.pathname || "");
    } catch {
      return false;
    }
  }
  function isDrawerOpen(doc) {
    return Boolean(getComposer(getDrawer(doc)));
  }
  function grokRoots(doc) {
    const roots3 = [];
    const drawer = getDrawer(doc);
    if (drawer && getComposer(drawer)) roots3.push(drawer);
    if (onGrokPage(doc)) {
      const main = doc.querySelector("main");
      if (main) roots3.push(main);
    }
    return roots3;
  }
  function rootOf(node2, doc = node2?.ownerDocument) {
    const el2 = node2?.nodeType === 1 ? node2 : node2?.parentElement;
    if (!el2 || !doc) return null;
    const drawer = el2.closest(DRAWER);
    if (drawer) return drawer;
    if (onGrokPage(doc)) return el2.closest("main");
    return null;
  }
  var clear = (bg) => !bg || bg === "transparent" || /rgba\(0, 0, 0, 0\)/.test(bg);
  function isUserMessage(textBlock) {
    if (textBlock.closest('button, [role="button"], a')) return false;
    const view = textBlock.ownerDocument.defaultView;
    for (let node2 = textBlock.parentElement, depth = 0; node2 && depth < 2; node2 = node2.parentElement, depth += 1) {
      if (clear(view.getComputedStyle(node2).backgroundColor)) continue;
      const column = node2.parentElement?.parentElement;
      const align = column ? view.getComputedStyle(node2.parentElement).alignItems : "";
      const outer = column ? view.getComputedStyle(column).alignItems : "";
      return align === "flex-end" || outer === "flex-end";
    }
    return false;
  }
  function userBlocks(root) {
    return [...root.querySelectorAll("div[dir]")].filter((b) => b.textContent.trim() && !b.closest('textarea, [contenteditable="true"], .askx-um') && isUserMessage(b));
  }
  function messageList(root) {
    const first = root && userBlocks(root)[0];
    if (!first) return null;
    let row2 = first;
    while (row2.parentElement && row2.parentElement !== root && row2.parentElement.children.length < 3) row2 = row2.parentElement;
    return row2.parentElement && row2.parentElement !== root ? row2.parentElement : null;
  }
  var NOISE = /^(thoughts?|thinking|思考|想法|已思考.*|thought for .*)$/i;
  function summarize(row2, role, max = 60) {
    const scope = role === "user" ? userBlocks(row2)[0] || row2 : row2;
    const lines = (scope.innerText ?? scope.textContent ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const text = lines.filter((l) => !NOISE.test(l)).join(" ").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }
  function getMessages(root) {
    const list = messageList(root);
    if (!list) return [];
    const users2 = new Set(userBlocks(list));
    const out = [];
    for (const row2 of list.children) {
      if (!row2.textContent.trim()) continue;
      const role = [...users2].some((b) => row2.contains(b)) ? "user" : "assistant";
      out.push({ el: row2, role, text: summarize(row2, role) });
    }
    return out;
  }
  function scrollerOf(el2) {
    const doc = el2.ownerDocument;
    const view = doc.defaultView;
    for (let node2 = el2.parentElement; node2 && node2 !== doc.body; node2 = node2.parentElement) {
      const { overflowY } = view.getComputedStyle(node2);
      if (/(auto|scroll)/.test(overflowY) && node2.scrollHeight > node2.clientHeight + 1) return node2;
    }
    return doc.scrollingElement || doc.documentElement;
  }
  function viewportOf(scroller) {
    const doc = scroller.ownerDocument;
    if (scroller === doc.scrollingElement || scroller === doc.documentElement) {
      return { top: 0, bottom: doc.defaultView.innerHeight };
    }
    const r = scroller.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  }
  function activeIndex(messages, scroller) {
    if (!messages.length) return -1;
    const { top, bottom } = viewportOf(scroller);
    const line = top + (bottom - top) * 0.3;
    let idx = 0;
    messages.forEach((m, i) => {
      if (m.el.getBoundingClientRect().top <= line) idx = i;
    });
    return idx;
  }
  function jumpTo(message, { effect = "border", smooth = true } = {}) {
    const el2 = message.el;
    const scroller = scrollerOf(el2);
    const doc = el2.ownerDocument;
    const isDoc = scroller === doc.scrollingElement || scroller === doc.documentElement;
    const offset = isDoc ? 64 : 12;
    const delta = el2.getBoundingClientRect().top - viewportOf(scroller).top - offset;
    const target = Math.max(0, scroller.scrollTop + delta);
    try {
      scroller.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
    } catch {
      scroller.scrollTop = target;
    }
    if (effect === "border") {
      el2.setAttribute("data-askx-flash", "");
      doc.defaultView.setTimeout(() => el2.removeAttribute("data-askx-flash"), 1200);
    }
  }
  function overlaidAt(doc, root, x, y, own) {
    if (typeof doc.elementsFromPoint !== "function") return false;
    const top = doc.elementsFromPoint(x, y).find((el2) => !own?.contains(el2));
    return Boolean(top) && Boolean(top.closest("#layers")) && !root.contains(top);
  }
  function touchesLayers(records) {
    return records.some((r) => {
      const el2 = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      return Boolean(el2?.closest("#layers")) && !el2.closest(DRAWER);
    });
  }
  function isTypingTarget(node2) {
    const el2 = node2?.nodeType === 1 ? node2 : node2?.parentElement;
    return Boolean(el2?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'));
  }
  function frameThrottle(view, fn) {
    let pending2 = 0;
    const run = () => {
      pending2 = 0;
      fn();
    };
    const schedule7 = () => {
      if (!pending2) pending2 = (view.requestAnimationFrame || ((f) => view.setTimeout(f, 16)))(run);
    };
    schedule7.cancel = () => {
      if (pending2) (view.cancelAnimationFrame || view.clearTimeout)(pending2);
      pending2 = 0;
    };
    return schedule7;
  }
  function timeThrottle(view, fn, ms = 150) {
    let timer3 = 0;
    let last2 = 0;
    const run = () => {
      timer3 = 0;
      last2 = Date.now();
      fn();
    };
    const schedule7 = () => {
      if (timer3) return;
      timer3 = view.setTimeout(run, Math.max(0, last2 + ms - Date.now()));
    };
    schedule7.cancel = () => {
      if (timer3) view.clearTimeout(timer3);
      timer3 = 0;
    };
    return schedule7;
  }
  function touchesGrok(records, doc) {
    const page = onGrokPage(doc);
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!target) continue;
      if (target.closest(DRAWER) || page && target.closest("main")) return true;
      for (const node2 of record.addedNodes) {
        if (node2.nodeType === 1 && (node2.matches(DRAWER) || node2.querySelector(DRAWER))) return true;
      }
      for (const node2 of record.removedNodes) {
        if (node2.nodeType === 1 && (node2.matches(DRAWER) || node2.querySelector(DRAWER))) return true;
      }
    }
    return false;
  }

  // src/icons.js
  var svg = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  var ICONS = {
    quote: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="currentColor"><path d="M4 6h6.5v6.2c0 3.6-1.9 5.8-5.6 6.6l-.9-1.9c2.1-.6 3.2-1.9 3.3-3.9H4z"/><path d="M13.5 6H20v6.2c0 3.6-1.9 5.8-5.6 6.6l-.9-1.9c2.1-.6 3.2-1.9 3.3-3.9h-3.3z"/></svg>',
    ghost: svg('<path d="M5 20V10a7 7 0 0 1 14 0v10l-2.4-1.6L14.3 20 12 18.4 9.7 20l-2.3-1.6z"/><circle cx="9.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="14.5" cy="10.5" r=".6" fill="currentColor"/>'),
    // X's own Private Chat ghost (from the Grok drawer header), without its
    // masks so the ids never clash with X's copy on the page.
    ghostNative: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><ellipse cx="8.334" cy="8.541" rx="1.042" ry="1.458" fill="currentColor"/><ellipse cx="11.667" cy="8.541" rx="1.042" ry="1.458" fill="currentColor"/><path d="M10 3.333c-6.667 0-3.27 5.601-7.5 7.5 0 1.374 1.17 1.25 1.608 2.308.367.886-.545 2.658-.775 3.525h3.334L10 17.5l3.333-.834h3.334c-.315-1.066-.993-2.38-.771-3.521.227-1.172 1.604-.86 1.604-2.312-4.23-1.899-.833-7.5-7.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.333" stroke-linejoin="round"/></svg>',
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    chevron: svg('<path d="M6 9l6 6 6-6"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    newChat: svg('<path d="M12 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M18 15v6M15 18h6"/>'),
    textQuote: svg('<path d="M17 6H3M21 12H8M21 18H8M3 12v6"/>'),
    send: svg('<path d="M14.5 21.5 22 2 2.5 9.5l8 3z"/><path d="M22 2 10.5 12.5"/>'),
    replace: svg('<path d="M14 4h6v6h-6zM4 14h6v6H4z"/><path d="M4 10V7a3 3 0 0 1 3-3h3M20 14v3a3 3 0 0 1-3 3h-3"/>'),
    zap: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    command: svg('<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>'),
    settings: svg('<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'),
    plug: svg('<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>'),
    info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
    star: svg('<path d="M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7a2 2 0 0 0 1.6 1.2l5.2.7a.5.5 0 0 1 .3.9l-3.8 3.7a2 2 0 0 0-.6 1.9l.9 5.1a.5.5 0 0 1-.8.6l-4.6-2.5a2 2 0 0 0-2 0L5.4 21a.5.5 0 0 1-.8-.6l.9-5.1a2 2 0 0 0-.6-1.9L1.2 9.8a.5.5 0 0 1 .3-.9l5.2-.7a2 2 0 0 0 1.6-1.2z"/>'),
    pin: svg('<path d="M12 17v5M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'),
    eyeOff: svg('<path d="M10.7 5.1A10.8 10.8 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>'),
    userQuotes: svg('<path d="M21 6H8"/><path d="M21 12H8"/><path d="M3 6v6"/><path d="M21 18H3"/>'),
    greeting: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'),
    markdown: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 15V9l3 3 3-3v6M15 12l2 3 2-3M17 9v6"/>'),
    height: svg('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>'),
    bellRing: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0M4 2C2.8 3.7 2 5.7 2 8M22 8c0-2.3-.8-4.3-2-6"/>'),
    badge: svg('<rect x="3" y="6" width="15" height="15" rx="3"/><circle cx="18" cy="6" r="3" fill="currentColor"/>'),
    blend: svg('<circle cx="9" cy="9" r="7"/><circle cx="15" cy="15" r="7"/>'),
    followUp: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>'),
    navigator: svg('<path d="M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>'),
    arrows: svg('<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>'),
    history: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>'),
    copy: svg('<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
    cornerDownLeft: svg('<path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>'),
    scrollbar: svg('<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M15 7v5"/>'),
    wrap: svg('<path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4"/><path d="m16 16-2 2 2 2M3 18h7"/>'),
    tabIcon: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="17" cy="15" r="2" fill="currentColor"/>'),
    micOff: svg('<path d="M12 19v3M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M19 10v2a7 7 0 0 1-.3 2M5 10v2a7 7 0 0 0 11.8 5.1M2 2l20 20"/>'),
    linkOff: svg('<path d="M9 17H7A5 5 0 0 1 7 7M15 7h2a5 5 0 0 1 4 8M8 12h4M2 2l20 20"/>'),
    retry: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
    type: svg('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'),
    sliders: svg('<path d="M14 17H5M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>')
  };
  ICONS.starFilled = ICONS.star.replace('fill="none"', 'fill="currentColor"');
  ICONS.pinFilled = ICONS.pin.replace('fill="none"', 'fill="currentColor"');

  // src/source.js
  var POST = 'article[data-testid="tweet"]';
  var X_HOSTS = /^(?:www\.|mobile\.|m\.)?(?:x|twitter)\.com$/i;
  var USER_STATUS = /^\/(\w{1,15})\/status\/(\d+)/;
  var ANON_STATUS = /^\/i\/(?:web\/)?status\/(\d+)/;
  function asElement(node2) {
    if (!node2) return null;
    return node2.nodeType === 1 ? node2 : node2.parentElement;
  }
  function normalizePostUrl(href, base = "https://x.com/") {
    let url;
    try {
      url = new URL(String(href || ""), base);
    } catch {
      return null;
    }
    if (!X_HOSTS.test(url.hostname)) return null;
    const user = USER_STATUS.exec(url.pathname);
    if (user) return { url: `https://x.com/${user[1]}/status/${user[2]}`, author: user[1] };
    const anon = ANON_STATUS.exec(url.pathname);
    if (anon) return { url: `https://x.com/i/status/${anon[1]}`, author: "" };
    return null;
  }
  function findPostSource(node2, doc = asElement(node2)?.ownerDocument || document) {
    const base = doc.defaultView?.location?.href || "https://x.com/";
    const post = asElement(node2)?.closest(POST);
    if (post) {
      for (const link2 of post.querySelectorAll('a[href*="/status/"]')) {
        if (link2.closest(POST) !== post) continue;
        const hit = normalizePostUrl(link2.getAttribute("href"), base);
        if (hit) return hit;
      }
    }
    return normalizePostUrl(base, base) || { url: "", author: "" };
  }

  // src/iconLoader.js
  var CACHE_KEY = "askx.iconCache.v1";
  var MAX_BYTES = 512 * 1024;
  var MAX_ENTRIES = 40;
  var memory = /* @__PURE__ */ new Map();
  var HTTP = /^https?:\/\/[^\s]+$/i;
  var DATA = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*,/i;
  function iconUrlKind(value) {
    const v = String(value || "").trim();
    if (!v) return "empty";
    if (DATA.test(v)) return "data";
    if (HTTP.test(v)) return "http";
    return "invalid";
  }
  function isTintable(dataUrl) {
    if (!/^data:image\/svg\+xml/i.test(dataUrl)) return false;
    try {
      const body = dataUrl.includes(";base64,") ? atob(dataUrl.split(",")[1]) : decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
      return body.includes("currentColor");
    } catch {
      return false;
    }
  }
  function readCache() {
    try {
      return typeof GM_getValue === "function" ? GM_getValue(CACHE_KEY, {}) || {} : {};
    } catch {
      return {};
    }
  }
  function writeCache(url, dataUrl) {
    if (typeof GM_setValue !== "function") return;
    try {
      const cache2 = readCache();
      delete cache2[url];
      cache2[url] = dataUrl;
      const keys = Object.keys(cache2);
      for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete cache2[key];
      GM_setValue(CACHE_KEY, cache2);
    } catch {
    }
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read-failed"));
      reader.readAsDataURL(blob);
    });
  }
  function download(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "blob",
          timeout: 15e3,
          anonymous: true,
          onload: (res) => res.status >= 200 && res.status < 300 && res.response ? resolve(res.response) : reject(new Error(`http-${res.status}`)),
          onerror: () => reject(new Error("network")),
          ontimeout: () => reject(new Error("timeout"))
        });
      });
    }
    return fetch(url, { mode: "cors", credentials: "omit" }).then((res) => {
      if (!res.ok) throw new Error(`http-${res.status}`);
      return res.blob();
    });
  }
  function decodes(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => img.naturalWidth || img.width ? resolve() : reject(new Error("empty"));
      img.onerror = () => reject(new Error("decode"));
      img.src = dataUrl;
    });
  }
  async function resolveIcon(value) {
    const url = String(value || "").trim();
    const kind2 = iconUrlKind(url);
    if (kind2 === "empty") return "";
    if (kind2 === "invalid") throw new Error("invalid");
    if (memory.has(url)) return memory.get(url);
    const job = (async () => {
      let dataUrl = kind2 === "data" ? url : readCache()[url];
      if (!dataUrl) {
        const blob = await download(url);
        if (blob.size > MAX_BYTES) throw new Error("too-large");
        if (blob.type && !/^image\//i.test(blob.type)) throw new Error("not-image");
        dataUrl = await blobToDataUrl(blob);
        if (!/^data:image\//i.test(dataUrl)) dataUrl = dataUrl.replace(/^data:[^;,]*/, "data:image/png");
        await decodes(dataUrl);
        writeCache(url, dataUrl);
      } else {
        await decodes(dataUrl);
      }
      return dataUrl;
    })();
    memory.set(url, job);
    job.catch(() => memory.delete(url));
    return job;
  }
  function paintIcon(holder, value) {
    holder.textContent = "";
    holder.style.removeProperty("-webkit-mask-image");
    holder.style.removeProperty("mask-image");
    holder.classList.remove("askx-icon-mask");
    const kind2 = iconUrlKind(value);
    if (kind2 === "empty") {
      holder.dataset.state = "empty";
      return Promise.resolve("empty");
    }
    holder.dataset.state = "loading";
    const token = Symbol("paint");
    holder._askxPaint = token;
    return resolveIcon(value).then((dataUrl) => {
      if (holder._askxPaint !== token) return "stale";
      if (isTintable(dataUrl)) {
        holder.classList.add("askx-icon-mask");
        const css5 = `url("${dataUrl.replace(/"/g, "%22")}")`;
        holder.style.setProperty("-webkit-mask-image", css5);
        holder.style.setProperty("mask-image", css5);
      } else {
        const img = holder.ownerDocument.createElement("img");
        img.alt = "";
        img.src = dataUrl;
        holder.appendChild(img);
      }
      holder.dataset.state = "ok";
      return "ok";
    }, (error) => {
      if (holder._askxPaint !== token) return "stale";
      holder.dataset.state = "error";
      holder.dataset.error = error.message;
      return "error";
    });
  }

  // src/theme.js
  function pageTheme(doc = document) {
    const root = doc.documentElement;
    const named = (root.getAttribute("data-theme") || "").toLowerCase();
    if (named === "light") return "light";
    if (named === "dark" || named === "dim") return "dark";
    const view = doc.defaultView;
    const scheme = (root.style.colorScheme || view?.getComputedStyle?.(root)?.colorScheme || "").toLowerCase();
    if (scheme.includes("dark")) return "dark";
    if (scheme.includes("light")) return "light";
    const bg = view?.getComputedStyle?.(doc.body || root)?.backgroundColor || "";
    const rgb = bg.match(/\d+(\.\d+)?/g);
    if (rgb && rgb.length >= 3 && (rgb.length < 4 || Number(rgb[3]) > 0)) {
      const [r, g, b] = rgb.map(Number);
      return (r * 299 + g * 587 + b * 114) / 1e3 > 128 ? "light" : "dark";
    }
    return view?.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
  }
  function watchTheme(doc, apply4) {
    const run = () => apply4(pageTheme(doc));
    run();
    const view = doc.defaultView;
    const observer10 = typeof view?.MutationObserver === "function" ? new view.MutationObserver(run) : null;
    observer10?.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    if (doc.body) observer10?.observe(doc.body, { attributes: true, attributeFilter: ["style", "class"] });
    const media = view?.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", run);
    return () => {
      observer10?.disconnect();
      media?.removeEventListener?.("change", run);
    };
  }

  // src/toolbar.js
  var ROOT_CLASS = "askx-bar";
  var SKIP = [
    `.${ROOT_CLASS}`,
    ".askx-toast",
    ".askx-layer",
    '[data-testid="GrokDrawerHeader"]',
    "#x-reply-blocker-ui",
    ".xrb-rule-dialog",
    "input",
    "textarea",
    "select",
    '[contenteditable="true"]'
  ].join(",");
  function asElement2(node2) {
    if (!node2) return null;
    return node2.nodeType === 1 ? node2 : node2.parentElement;
  }
  function currentSelection(win = window) {
    const doc = win.document;
    const sel2 = win.getSelection?.();
    if (!sel2 || sel2.isCollapsed || !sel2.rangeCount) return null;
    const text = sel2.toString();
    if (!/[\p{L}\p{N}]/u.test(text)) return null;
    const range = sel2.getRangeAt(0);
    const el2 = asElement2(range.commonAncestorContainer);
    if (!el2 || !doc.contains(el2) || el2.closest(SKIP)) return null;
    const rect = range.getBoundingClientRect();
    if (!rect || !rect.width && !rect.height) return null;
    const context = rootOf(el2, doc) ? "grok" : "post";
    return { text, node: range.commonAncestorContainer, rect, context };
  }
  function createToolbar({ getButtons, onAsk, win = window }) {
    const doc = win.document;
    const bar2 = doc.createElement("div");
    bar2.className = ROOT_CLASS;
    bar2.setAttribute("role", "toolbar");
    bar2.hidden = true;
    (doc.body || doc.documentElement).appendChild(bar2);
    let buttons = [];
    let builtFor = "post";
    let current2 = null;
    let lastPicked = "";
    let quietUntil = 0;
    let timer3 = 0;
    function build2(context = builtFor) {
      builtFor = context;
      buttons = getButtons(context);
      bar2.textContent = "";
      buttons.forEach((def, index2) => {
        const el2 = doc.createElement("button");
        el2.type = "button";
        el2.className = `askx-btn ${def.className || ""}`.trim();
        el2.title = def.label;
        el2.setAttribute("aria-label", def.label);
        el2.dataset.index = String(index2);
        if (def.icon) el2.innerHTML = def.icon;
        else {
          if (def.iconUrl) {
            const icon2 = doc.createElement("span");
            icon2.className = "askx-btn-icon";
            el2.appendChild(icon2);
            void paintIcon(icon2, def.iconUrl);
          }
          const text = doc.createElement("span");
          text.className = "askx-btn-label";
          text.textContent = def.text || def.label;
          el2.appendChild(text);
        }
        for (const [key, value] of Object.entries(def.data || {})) el2.dataset[key] = value;
        bar2.appendChild(el2);
      });
    }
    function hide() {
      current2 = null;
      bar2.hidden = true;
    }
    function place2(rect) {
      bar2.hidden = false;
      const w = bar2.offsetWidth || 40;
      const h = bar2.offsetHeight || 36;
      const left = Math.min(win.innerWidth - w - 8, Math.max(8, rect.left));
      let top = rect.top - h - 8;
      if (top < 8) top = Math.min(win.innerHeight - h - 8, rect.bottom + 8);
      bar2.style.left = `${Math.round(left)}px`;
      bar2.style.top = `${Math.round(top)}px`;
    }
    function refresh2() {
      const sel2 = currentSelection(win);
      if (sel2 && sel2.context !== builtFor) build2(sel2.context);
      if (!sel2 || !buttons.length) {
        hide();
        if (Date.now() > quietUntil) lastPicked = "";
        return;
      }
      if (lastPicked && sel2.text === lastPicked && Date.now() <= quietUntil) {
        hide();
        return;
      }
      lastPicked = "";
      current2 = sel2;
      place2(sel2.rect);
    }
    let dragging = false;
    const KEY_PAUSE_MS = 350;
    function schedule7(event) {
      if (event?.target?.closest?.(`.${ROOT_CLASS}`)) return;
      win.clearTimeout(timer3);
      if (event?.type === "selectionchange" || event?.type === "keyup") {
        if (dragging) return;
        timer3 = win.setTimeout(refresh2, KEY_PAUSE_MS);
        return;
      }
      timer3 = win.setTimeout(refresh2, 0);
    }
    function onDown(event) {
      if (event.button !== 0 || event.target?.closest?.(`.${ROOT_CLASS}`)) return;
      dragging = true;
      win.clearTimeout(timer3);
      hide();
    }
    function onUp(event) {
      dragging = false;
      schedule7(event);
    }
    bar2.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    bar2.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target || !current2) return;
      event.preventDefault();
      event.stopPropagation();
      const picked = current2;
      lastPicked = picked.text;
      quietUntil = Date.now() + 2e3;
      hide();
      try {
        win.getSelection()?.removeAllRanges();
      } catch {
      }
      onAsk(picked, buttons[Number(target.dataset.index)], event);
    });
    const stopTheme2 = watchTheme(doc, (theme2) => {
      bar2.dataset.theme = theme2;
    });
    build2();
    doc.addEventListener("mousedown", onDown, true);
    doc.addEventListener("mouseup", onUp);
    doc.addEventListener("keyup", schedule7);
    doc.addEventListener("selectionchange", schedule7);
    win.addEventListener("scroll", hide, true);
    win.addEventListener("resize", hide);
    return {
      element: bar2,
      rebuild: () => build2(),
      refresh: refresh2,
      hide,
      destroy() {
        win.clearTimeout(timer3);
        stopTheme2();
        doc.removeEventListener("mousedown", onDown, true);
        doc.removeEventListener("mouseup", onUp);
        doc.removeEventListener("keyup", schedule7);
        doc.removeEventListener("selectionchange", schedule7);
        win.removeEventListener("scroll", hide, true);
        win.removeEventListener("resize", hide);
        bar2.remove();
      }
    };
  }

  // src/plugins/askGrok.js
  var toolbar = null;
  var unsubscribe = null;
  var busy = false;
  function toolbarButtons(context = "post") {
    const buttons = [];
    for (const plugin of app.manager.enabledPlugins()) {
      if (typeof plugin.toolbarButtons !== "function") continue;
      for (const button of plugin.toolbarButtons(context)) {
        if ((button.contexts || ["post"]).includes(context)) buttons.push({ ...button, plugin: plugin.name });
      }
    }
    return buttons.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }
  function buildRequest(selection, trigger) {
    const ctx2 = {
      selection,
      trigger,
      template: DEFAULT_TEMPLATE,
      maxLength: 2e3,
      plan: { newChat: false, privateMode: "keep", writeMode: "append", autoSend: false }
    };
    const hooks = app.manager.enabledPlugins().filter((p) => typeof p.onAsk === "function").sort((a, b) => (a.askOrder ?? 50) - (b.askOrder ?? 50));
    for (const plugin of hooks) plugin.onAsk(ctx2);
    if (selection?.context === "grok") {
      ctx2.plan.newChat = false;
      ctx2.plan.privateMode = "keep";
    }
    return ctx2;
  }
  async function ask(selection, trigger = { id: "ask" }) {
    if (busy) return null;
    const ctx2 = buildRequest(selection, trigger);
    const text = cleanSelection(selection?.text, ctx2.maxLength);
    if (!text) {
      const result = { ok: false, reason: "empty" };
      emit("askResult", { result, ctx: ctx2 });
      return result;
    }
    const source = findPostSource(selection.node);
    const prompt = renderTemplate(ctx2.template, { text, url: source.url, author: source.author });
    busy = true;
    try {
      const result = selection.context === "grok" ? await followUp(selection, prompt, ctx2.plan) : await askGrok(prompt, ctx2.plan, app.doc);
      if (result.ok && !result.sent) result.composer?.focus();
      emit("askResult", { result, ctx: ctx2 });
      return result;
    } catch (error) {
      console.error("[Ask X]", error);
      const result = { ok: false, reason: "error" };
      emit("askResult", { result, ctx: ctx2 });
      return result;
    } finally {
      busy = false;
    }
  }
  async function followUp(selection, prompt, plan) {
    const root = rootOf(selection.node, app.doc);
    const composer = getComposer(root);
    if (!composer) return { ok: false, reason: "no-composer" };
    if (!await writePrompt(composer, prompt, plan.writeMode)) return { ok: false, reason: "write-failed" };
    let sent = false;
    const notes = [];
    if (plan.autoSend) {
      sent = await sendPrompt(root);
      if (!sent) notes.push("send-failed");
    }
    return { ok: true, sent, followUp: true, notes, composer };
  }
  var askGrok_default = definePlugin({
    name: "AskGrok",
    description: "划词后弹出工具条，点引号把选中文字和推文链接写进 Grok 小窗。其他插件都挂在它上面。",
    icon: ICONS.quote,
    required: true,
    tags: ["composer"],
    askOrder: 0,
    toolbarButtons: () => [{ id: "ask", label: "问 Grok", icon: ICONS.quote, className: "askx-main", order: 0 }],
    start() {
      toolbar = createToolbar({
        getButtons: toolbarButtons,
        onAsk: (selection, button, event) => void ask(selection, { ...button, altKey: Boolean(event?.altKey) })
      });
      unsubscribe = app.manager.subscribe(() => toolbar?.rebuild());
    },
    stop() {
      unsubscribe?.();
      toolbar?.destroy();
      toolbar = null;
    }
  });

  // src/grokScope.js
  var PAGE_FLAG = "data-askx-grok-page";
  var GROK = `:is(${DRAWER}, html[${PAGE_FLAG}] main)`;
  var users = /* @__PURE__ */ new Set();
  var observer = null;
  var schedule = null;
  var lastPage = null;
  function sync(doc) {
    const page = onGrokPage(doc);
    if (page !== lastPage) {
      lastPage = page;
      doc.documentElement.toggleAttribute(PAGE_FLAG, page);
    }
    for (const fn of users) {
      try {
        fn(doc);
      } catch (error) {
        console.error("[Ask X] grok scope update failed", error);
      }
    }
  }
  function watchGrok(doc, onChange = () => {
  }) {
    users.add(onChange);
    if (!observer) {
      const view = doc.defaultView;
      schedule = timeThrottle(view, () => sync(doc), 120);
      observer = new view.MutationObserver((records) => {
        if (onGrokPage(doc) !== lastPage || touchesGrok(records, doc)) schedule();
      });
      observer.observe(doc.body, { childList: true, subtree: true });
    }
    sync(doc);
    return () => {
      users.delete(onChange);
      if (users.size) return;
      observer?.disconnect();
      observer = null;
      schedule?.cancel();
      schedule = null;
      lastPage = null;
      doc.documentElement.removeAttribute(PAGE_FLAG);
    };
  }
  function addStyle(doc, id, css5) {
    let style = doc.getElementById(id);
    if (!style) {
      style = doc.createElement("style");
      style.id = id;
      (doc.head || doc.documentElement).appendChild(style);
    }
    if (style.textContent !== css5) style.textContent = css5;
    return style;
  }

  // src/plugins/toasts.js
  var DURATION_MS = 2600;
  var FAILURES = {
    empty: "没有可用的划词。",
    "no-drawer": "这个页面没有 Grok 小窗（Grok 全页里请直接输入）。",
    "not-ready": "Grok 小窗没能展开，请稍后再试。",
    "no-composer": "找不到 Grok 输入框。",
    "write-failed": "无法写入 Grok 输入框。"
  };
  var off = null;
  var timer = 0;
  function describe({ result, ctx: ctx2 }) {
    if (!result.ok) return { kind: "error", text: FAILURES[result.reason] || "发送到 Grok 失败。" };
    const where = result.private ? "无痕对话" : ctx2.plan.newChat && !result.followUp ? "新对话" : "当前对话";
    let text = result.sent ? `已在${where}中发送给 Grok。` : `已写入 Grok ${where}。`;
    if (result.notes?.includes("private-unavailable")) text += "（无痕切换失败）";
    if (result.notes?.includes("send-failed")) text += "（自动发送失败，请手动发送）";
    return { kind: result.private ? "private" : "info", text };
  }
  function showToast(text, kind2 = "info", doc = app.doc, { duration = DURATION_MS, closable = false, detail = "", onClick: onClick6 = null } = {}) {
    doc.querySelector(".askx-toast")?.remove();
    const node2 = doc.createElement("div");
    node2.className = "askx-toast";
    node2.dataset.kind = kind2;
    node2.setAttribute("role", "status");
    const title = doc.createElement("div");
    title.className = "askx-toast-text";
    title.textContent = text;
    node2.appendChild(title);
    if (detail) {
      const line = doc.createElement("div");
      line.className = "askx-toast-detail";
      line.textContent = detail;
      node2.appendChild(line);
    }
    if (closable) {
      const close = doc.createElement("button");
      close.type = "button";
      close.className = "askx-toast-close";
      close.setAttribute("aria-label", "关闭");
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        node2.remove();
      });
      node2.appendChild(close);
      node2.dataset.closable = "true";
    }
    if (onClick6) {
      node2.style.cursor = "pointer";
      node2.addEventListener("click", () => {
        node2.remove();
        onClick6();
      });
    }
    doc.body.appendChild(node2);
    clearTimeout(timer);
    if (duration > 0) timer = setTimeout(() => node2.remove(), duration);
    return node2;
  }
  var toasts_default = definePlugin({
    name: "Toasts",
    description: "在页面底部提示结果：写入了哪种对话、无痕是否生效、出了什么错。",
    icon: ICONS.bell,
    tags: ["notifications"],
    enabledByDefault: true,
    start() {
      off = on("askResult", (event) => {
        const { kind: kind2, text } = describe(event);
        showToast(text, kind2);
      });
    },
    stop() {
      off?.();
      app.doc.querySelector(".askx-toast")?.remove();
    }
  });

  // src/plugins/autoRetry.js
  var settings = definePluginSettings({
    delay: {
      type: OptionType.SLIDER,
      label: "等待秒数",
      description: "出错后等几秒再自动重试。",
      min: 1,
      max: 10,
      default: 2
    }
  });
  var RETRY_LABELS = ["Retry", "Try again", "重试", "再试一次", "重新尝试", "重新整理"];
  var COOLDOWN_MS = 6e4;
  var tried = /* @__PURE__ */ new WeakSet();
  var lastAuto = -Infinity;
  var pending = 0;
  var label = (el2) => (el2.getAttribute("aria-label") || el2.textContent || "").trim().toLowerCase();
  function findRetry(root) {
    const list = messageList(root);
    const last2 = list?.lastElementChild;
    if (!last2) return null;
    const wanted = RETRY_LABELS.map((l) => l.toLowerCase());
    for (let row2 = last2; row2; row2 = row2.previousElementSibling) {
      if (!row2.textContent.trim()) continue;
      return [...row2.querySelectorAll('button, [role="button"]')].find((b) => wanted.includes(label(b)) && !b.disabled) || null;
    }
    return null;
  }
  function check(doc = app.doc, now = Date.now()) {
    for (const root of grokRoots(doc)) {
      const button = findRetry(root);
      if (!button || tried.has(button)) continue;
      tried.add(button);
      if (now - lastAuto < COOLDOWN_MS) return "cooldown";
      lastAuto = now;
      const view = doc.defaultView;
      view.clearTimeout(pending);
      pending = view.setTimeout(() => {
        if (!button.isConnected) return;
        button.click();
        showToast("Grok 回复出错，已自动重试一次。", "info", doc);
      }, Math.max(1, settings.store.delay) * 1e3);
      return "scheduled";
    }
    return null;
  }
  var stop = null;
  var autoRetry_default = definePlugin({
    name: "AutoRetry",
    description: "Grok 回复出错（Something went wrong）时，自动点一次 X 自带的 Retry。每次出错只重试一次，一分钟内最多一次（移植自 void++）。",
    icon: ICONS.retry,
    tags: ["chats"],
    enabledByDefault: true,
    settings,
    start() {
      stop = watchGrok(app.doc, (doc) => check(doc));
    },
    stop() {
      stop?.();
      stop = null;
      app.doc.defaultView.clearTimeout(pending);
    }
  });

  // src/plugins/betterLinks.js
  var HIGHLIGHT = "askx-bare-link";
  var VISITED = "askx-bare-link-visited";
  var MAX_VISITED = 500;
  var settings2 = definePluginSettings({
    visitedColor: {
      type: OptionType.BOOLEAN,
      label: "已访问链接变色",
      description: "点过的域名链接改用紫色显示（移植自 void++）。",
      default: true
    }
  });
  function visitedList() {
    const list = app.manager?.pluginData?.("BetterLinks")?.visited;
    return Array.isArray(list) ? list : [];
  }
  function markVisited(href) {
    const list = visitedList().filter((h) => h !== href);
    list.push(href);
    app.manager?.mergePluginData?.("BetterLinks", { visited: list.slice(-MAX_VISITED) });
  }
  var STYLE_ID = "askx-better-links";
  var TLDS = "com|org|net|io|ai|dev|app|co|me|gg|tv|xyz|info|edu|gov|so|sh|tech|site|wiki|page|link|cn|jp|kr|uk|de|fr|ru|us|ca|au|in|eu|hk|tw|sg";
  var DOMAIN = new RegExp(`(?<![@\\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?![\\w-])(?:/[^\\s，。、；：！？）)」』"'<>]*)?`, "gi");
  var SKIP2 = 'a, code, pre, textarea, [contenteditable="true"], button, .askx-um';
  function findDomains(text) {
    const out = [];
    for (const m of text.matchAll(DOMAIN)) {
      const value = m[0].replace(/[.,:;!?]+$/u, "");
      out.push({ index: m.index, text: value });
    }
    return out;
  }
  function hrefFor(text) {
    return /^https?:\/\//i.test(text) ? text : `https://${text}`;
  }
  function textNodes(root) {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, 4, {
      acceptNode: (n) => n.nodeValue && n.nodeValue.includes(".") && !n.parentElement?.closest(SKIP2) ? 1 : 3
    });
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }
  function collect(doc = app.doc) {
    const found = [];
    for (const root of grokRoots(doc)) {
      const list = messageList(root);
      if (!list) continue;
      for (const node2 of textNodes(list)) {
        for (const { index: index2, text } of findDomains(node2.nodeValue)) {
          const range = doc.createRange();
          range.setStart(node2, index2);
          range.setEnd(node2, index2 + text.length);
          found.push({ range, href: hrefFor(text) });
        }
      }
    }
    return found;
  }
  var links = [];
  function paint(doc) {
    links = collect(doc);
    const view = doc.defaultView;
    if (!view.CSS?.highlights || typeof view.Highlight !== "function") return;
    const visited = settings2.store.visitedColor ? new Set(visitedList()) : /* @__PURE__ */ new Set();
    const fresh = links.filter((l) => !visited.has(l.href)).map((l) => l.range);
    const seen2 = links.filter((l) => visited.has(l.href)).map((l) => l.range);
    if (fresh.length) view.CSS.highlights.set(HIGHLIGHT, new view.Highlight(...fresh));
    else view.CSS.highlights.delete(HIGHLIGHT);
    if (seen2.length) view.CSS.highlights.set(VISITED, new view.Highlight(...seen2));
    else view.CSS.highlights.delete(VISITED);
  }
  function linkAt(doc, x, y) {
    const pos = doc.caretPositionFromPoint?.(x, y);
    const node2 = pos ? pos.offsetNode : doc.caretRangeFromPoint?.(x, y)?.startContainer;
    const offset = pos ? pos.offset : doc.caretRangeFromPoint?.(x, y)?.startOffset;
    if (!node2 || node2.nodeType !== 3) return null;
    return links.find(({ range }) => range.startContainer === node2 && offset >= range.startOffset && offset <= range.endOffset && (() => {
      const r = range.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    })()) || null;
  }
  var inGrok = (target) => Boolean(target?.closest?.('[data-testid="GrokDrawer"], html[data-askx-grok-page] main'));
  function onClick(event) {
    if (event.button !== 0 || !links.length || !inGrok(event.target)) return;
    const doc = event.target.ownerDocument;
    if (doc.defaultView.getSelection?.()?.toString()) return;
    const hit = linkAt(doc, event.clientX, event.clientY);
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    doc.defaultView.open(hit.href, "_blank", "noopener");
    markVisited(hit.href);
    paint(doc);
  }
  var lastCursor = null;
  function onMove(event) {
    const host = links.length ? event.target.closest?.('[data-testid="GrokDrawer"], html[data-askx-grok-page] main') : null;
    const over = Boolean(host && linkAt(event.target.ownerDocument, event.clientX, event.clientY));
    if (over && host) {
      host.style.cursor = "pointer";
      lastCursor = host;
    } else if (lastCursor) {
      lastCursor.style.removeProperty("cursor");
      lastCursor = null;
    }
  }
  var stop2 = null;
  var betterLinks_default = definePlugin({
    name: "BetterLinks",
    description: "Grok 回复里只写了域名的地方（如 pearltrees.com）变成可点击的链接，在新标签页打开。不改动 X 的消息内容（移植自 void++）。",
    icon: ICONS.link,
    tags: ["messages"],
    enabledByDefault: true,
    settings: settings2,
    onSettingsChange: () => paint(app.doc),
    start() {
      const doc = app.doc;
      addStyle(doc, STYLE_ID, `::highlight(${HIGHLIGHT}){color:rgb(29,155,240);text-decoration:underline;text-underline-offset:2px}::highlight(${VISITED}){color:rgb(149,117,205);text-decoration:underline;text-underline-offset:2px}`);
      stop2 = watchGrok(doc, paint);
      doc.addEventListener("click", onClick, true);
      doc.addEventListener("mousemove", onMove, { passive: true });
    },
    stop() {
      const doc = app.doc;
      stop2?.();
      stop2 = null;
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("mousemove", onMove);
      doc.defaultView.CSS?.highlights?.delete(HIGHLIGHT);
      doc.defaultView.CSS?.highlights?.delete(VISITED);
      doc.getElementById(STYLE_ID)?.remove();
      lastCursor?.style.removeProperty("cursor");
      lastCursor = null;
      links = [];
    }
  });

  // src/streamWatch.js
  var EVENT = "askx:grok-stream";
  var REPLY_URL = /\/2\/grok\/add_response\.json|\/rest\/app-chat\/conversations\/(?:new|[^/?#]+\/responses)(?:[?#]|$)/;
  var STALE_MS = 5 * 6e4;
  var isReplyUrl = (url) => REPLY_URL.test(String(url || ""));
  var listeners = /* @__PURE__ */ new Set();
  var live = /* @__PURE__ */ new Map();
  var seq = 0;
  var installedOn = null;
  var perf = null;
  function emit2(detail) {
    for (const fn of listeners) {
      try {
        fn(detail);
      } catch (error) {
        console.error("[Ask X] stream listener failed", error);
      }
    }
  }
  function start() {
    const now = Date.now();
    for (const [id2, at] of live) if (now - at > STALE_MS) live.delete(id2);
    const id = ++seq;
    live.set(id, now);
    emit2({ id, phase: "start" });
  }
  function handleEntry(entry) {
    if (!isReplyUrl(entry?.name)) return false;
    if (!live.size) return false;
    const status = entry.responseStatus || 0;
    const id = live.keys().next().value;
    live.delete(id);
    emit2({ id, phase: "end", ok: !status || status < 400 });
    return true;
  }
  function isComposer(el2) {
    return Boolean(el2 && (el2.tagName === "TEXTAREA" || el2.isContentEditable && el2.getAttribute?.("role") === "textbox") && rootOf(el2, el2.ownerDocument));
  }
  function hasText(el2) {
    const text = el2.tagName === "TEXTAREA" ? el2.value : el2.textContent;
    return /\S/.test(String(text || "").replace(/​/g, ""));
  }
  function onKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    const el2 = event.target;
    if (isComposer(el2) && hasText(el2)) start();
  }
  function onClick2(event) {
    const button = event.target.closest?.('button, [role="button"]');
    const root = button && rootOf(button, button.ownerDocument);
    if (!root || button !== findButton(root, xLabels().send)) return;
    const field3 = root.querySelector('textarea, [contenteditable="true"][role="textbox"]');
    if (field3 && hasText(field3)) start();
  }
  function onEvent(event) {
    let detail;
    try {
      detail = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (detail?.phase === "start") start();
    else if (detail?.phase === "end") {
      if (!live.size) return;
      const id = live.keys().next().value;
      live.delete(id);
      emit2({ id, phase: "end", ok: detail.ok !== false });
    }
  }
  function install(doc) {
    const view = doc.defaultView;
    doc.addEventListener("keydown", onKeyDown, { capture: true, passive: true });
    doc.addEventListener("click", onClick2, { capture: true, passive: true });
    doc.addEventListener(EVENT, onEvent);
    if (typeof view?.PerformanceObserver === "function") {
      try {
        perf = new view.PerformanceObserver((list) => {
          for (const entry of list.getEntries()) handleEntry(entry);
        });
        perf.observe({ type: "resource" });
      } catch (error) {
        console.warn("[Ask X] resource timing unavailable", error);
      }
    }
  }
  function cancelAll() {
    if (!live.size) return false;
    const ids2 = [...live.keys()];
    live.clear();
    for (const id of ids2) emit2({ id, phase: "end", ok: true, cancelled: true });
    return true;
  }
  function isStreaming() {
    return live.size > 0;
  }
  function watchStreams(doc, fn) {
    if (installedOn !== doc) {
      installedOn = doc;
      install(doc);
    }
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // src/plugins/grokState.js
  var ICON_ID = "askx-chat-state-favicon";
  var STYLE_ID2 = "askx-grok-state";
  var STATE = "data-askx-grok-state";
  var STYLE = "data-askx-grok-style";
  var settings3 = definePluginSettings({
    buttonStyle: {
      type: OptionType.SELECT,
      label: "Grok 按钮样式",
      description: "小窗收起后 Grok 按钮怎样显示状态（回复中蓝、完成绿、待发送黄、出错红），样式和 Void++ 一致，只用其中一种。选“不显示”时由 StatusBadge 的角标圆点接管。",
      options: [
        { value: "hole", label: "Grok 标志变色" },
        { value: "bg", label: "背景变色" },
        { value: "dot", label: "彩色圆点" },
        { value: "badge", label: "徽标 + 符号" },
        { value: "original", label: "只用表情" },
        { value: "none", label: "不显示" }
      ],
      default: "hole"
    },
    favicon: {
      type: OptionType.BOOLEAN,
      label: "标签页图标显示状态",
      description: "在 X 自己的图标右下角加一个彩色状态点。空闲时恢复 X 原图标。",
      default: false
    },
    faviconStyle: {
      type: OptionType.SELECT,
      label: "标签页图标样式",
      description: "状态点的样式。",
      options: [
        { value: "dot", label: "彩色圆点" },
        { value: "badge", label: "徽标 + 符号" }
      ],
      default: "dot"
    }
  });
  function tintsButton() {
    return Boolean(app.manager?.isEnabled?.("GrokState") && settings3.store.buttonStyle !== "none");
  }
  var KIND_COLOR = { rotate: "#3B82F6", done: "#22C55E", ready: "#F59E0B", error: "#EF4444" };
  var X_MARK = "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
  var xTile = () => `<rect width="64" height="64" rx="12" fill="#000"/><g transform="translate(12 12) scale(1.6667)" fill="#fff"><path d="${X_MARK}"/></g>`;
  var svgData = (inner) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${inner}</svg>`)}`;
  function glyph(kind2) {
    if (kind2 === "rotate") return '<g transform="translate(50 50)"><g><path d="M0-6.1 A6.1 6.1 0 1 1 -5.3 3.05" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.85s" repeatCount="indefinite"/></g></g>';
    if (kind2 === "done") return '<path d="M45 50.2 L48.6 53.8 L55.2 46" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
    if (kind2 === "ready") return '<path d="M50 55V45M45.2 49.8 50 45l4.8 4.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    return '<path d="M45.8 45.8 54.2 54.2M54.2 45.8 45.8 54.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
  }
  function iconFor(style, kind2) {
    const color = KIND_COLOR[kind2];
    if (!color) return "";
    if (style === "badge") return svgData(`${xTile()}<circle cx="50" cy="50" r="13" fill="#000"/><circle cx="50" cy="50" r="10.5" fill="${color}"/>${glyph(kind2)}`);
    return svgData(`${xTile()}<circle cx="51" cy="51" r="11.5" fill="#000"/><circle cx="51" cy="51" r="8.5" fill="${color}"/>`);
  }
  var kind = "wait";
  var streaming = false;
  var finished = null;
  function composerText(doc) {
    for (const root of grokRoots(doc)) {
      const field3 = getComposer(root);
      if (field3 && /\S/.test(readValue(field3).replace(/​/g, ""))) return true;
    }
    return false;
  }
  function hasConversation(doc) {
    return grokRoots(doc).some((root) => getMessages(root).length > 0);
  }
  function nextKind({ streaming: live2, finished: last2, typed, conversation }) {
    if (live2) return "rotate";
    if (typed) return "ready";
    if (last2 && conversation !== false) return last2;
    return "wait";
  }
  function apply(doc = app.doc) {
    const typed = composerText(doc);
    if (finished && !streaming && typed) finished = null;
    const conversation = grokRoots(doc).length ? hasConversation(doc) : null;
    if (finished && conversation === false) finished = null;
    const next = nextKind({ streaming, finished, typed, conversation });
    if (next !== kind) kind = next;
    paint2(doc);
  }
  function paintButton(doc) {
    const style = settings3.store.buttonStyle;
    const value = style !== "none" && KIND_COLOR[kind] ? kind : "";
    for (const drawer of doc.querySelectorAll(DRAWER)) {
      if (value && !getComposer(drawer)) {
        if (drawer.getAttribute(STATE) !== value) drawer.setAttribute(STATE, value);
        if (drawer.getAttribute(STYLE) !== style) drawer.setAttribute(STYLE, style);
      } else {
        drawer.removeAttribute(STATE);
        drawer.removeAttribute(STYLE);
      }
    }
  }
  function paintFavicon(doc) {
    const href = settings3.store.favicon ? iconFor(settings3.store.faviconStyle, kind) : "";
    let link2 = doc.getElementById(ICON_ID);
    if (!href) {
      link2?.remove();
      return;
    }
    const head = doc.head;
    if (!head) return;
    if (!link2) {
      link2 = doc.createElement("link");
      link2.id = ICON_ID;
      link2.rel = "icon";
      link2.type = "image/svg+xml";
      link2.setAttribute("sizes", "any");
    }
    if (link2.getAttribute("href") !== href) link2.setAttribute("href", href);
    if (head.lastElementChild !== link2) head.appendChild(link2);
  }
  function paint2(doc) {
    paintButton(doc);
    paintFavicon(doc);
  }
  function onStream(detail, doc = app.doc) {
    if (detail.phase === "start") {
      streaming = true;
      finished = null;
    } else {
      streaming = false;
      finished = detail.cancelled ? null : detail.ok === false ? "error" : "done";
    }
    apply(doc);
  }
  var offStreams = null;
  var offGrok = null;
  var headObserver = null;
  var onInput = (event) => {
    if (event.target?.closest?.('[data-testid="GrokDrawer"], main')) apply();
  };
  var EMOJI = { rotate: "🔄", done: "✔️", ready: "👍", error: "🚫" };
  var MARK = ':is([data-testid="GrokDrawerHeader"] > button:only-child > svg, button[data-testid="GrokDrawerHeader"] > svg)';
  var sel = (style, k, tail = "") => `${DRAWER}[${STYLE}="${style}"][${STATE}="${k}"]${tail}`;
  var glyphUrl = (k, c) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="37 37 26 26"><circle cx="50" cy="50" r="12.5" fill="#000"/><circle cx="50" cy="50" r="10.5" fill="${c}"/>${glyph(k)}</svg>`)}")`;
  var BUTTON_CSS = Object.entries(KIND_COLOR).map(([k, c]) => [
    `${sel("hole", k)} ${MARK}{color:${c}!important;fill:${c}!important;transition:color .2s,fill .2s}`,
    `${sel("bg", k)} > div:first-child{background-color:${c}!important}`,
    `${sel("bg", k)} ${MARK}{color:#fff!important;fill:#fff!important}`,
    `${sel("dot", k, "::after")},${sel("badge", k, "::after")},${sel("original", k, "::after")}{content:"";position:absolute;z-index:2;pointer-events:none}`,
    `${sel("dot", k, "::after")}{top:6px;right:6px;width:10px;height:10px;border-radius:50%;background:${c};box-shadow:0 0 0 2px #000}`,
    `${sel("badge", k, "::after")}{top:3px;right:3px;width:18px;height:18px;background:${glyphUrl(k, c)} center/contain no-repeat}`,
    `${sel("original", k)} ${MARK}{opacity:0!important}`,
    `${sel("original", k, "::after")}{content:"${EMOJI[k]}";inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1}`
  ].join("")).join("") + `${DRAWER}[${STYLE}="hole"][${STATE}="rotate"] ${MARK},${DRAWER}[${STYLE}="bg"][${STATE}="rotate"] > div:first-child,${DRAWER}[${STYLE}="dot"][${STATE}="rotate"]::after{animation:askx-grok-pulse 1.2s ease-in-out infinite}@keyframes askx-grok-pulse{0%,100%{opacity:1}50%{opacity:.45}}@media (prefers-reduced-motion: reduce){${DRAWER}[${STATE}] *,${DRAWER}[${STATE}]::after{animation:none!important}}`;
  var CSS = BUTTON_CSS;
  var grokState_default = definePlugin({
    name: "GrokState",
    description: "Grok 的状态显示在 Grok 按钮上（小窗收起时）：回复中蓝、完成绿、待发送黄、出错红，样式和 Void++ 一致可选（默认 Grok 标志变色）。可选在 X 标签页图标上加状态点（默认关闭，不替换 X 图标）。",
    icon: ICONS.tabIcon,
    tags: ["notifications"],
    enabledByDefault: true,
    settings: settings3,
    start() {
      const doc = app.doc;
      kind = "wait";
      streaming = false;
      finished = null;
      addStyle(doc, STYLE_ID2, CSS);
      offStreams = watchStreams(doc, (detail) => onStream(detail, doc));
      offGrok = watchGrok(doc, () => apply(doc));
      doc.addEventListener("input", onInput, true);
      headObserver = new doc.defaultView.MutationObserver(() => {
        if (doc.getElementById(ICON_ID)) paintFavicon(doc);
      });
      if (doc.head) headObserver.observe(doc.head, { childList: true });
      apply(doc);
    },
    onSettingsChange: () => paint2(app.doc),
    stop() {
      const doc = app.doc;
      offStreams?.();
      offGrok?.();
      offStreams = null;
      offGrok = null;
      headObserver?.disconnect();
      headObserver = null;
      doc.removeEventListener("input", onInput, true);
      doc.getElementById(ICON_ID)?.remove();
      doc.getElementById(STYLE_ID2)?.remove();
      for (const el2 of doc.querySelectorAll(`[${STATE}]`)) {
        el2.removeAttribute(STATE);
        el2.removeAttribute(STYLE);
      }
      kind = "wait";
    }
  });

  // src/plugins/completeToast.js
  var settings4 = definePluginSettings({
    keep: {
      type: OptionType.BOOLEAN,
      label: "一直显示",
      description: "“回复完成”提示不自动消失，点 × 或打开 Grok 小窗才关闭。",
      default: true
    },
    seconds: {
      type: OptionType.SLIDER,
      label: "显示秒数",
      description: "关闭“一直显示”时，提示停留的秒数。",
      min: 2,
      max: 30,
      default: 8
    },
    preview: {
      type: OptionType.BOOLEAN,
      label: "回复预览",
      description: "在提示里显示回复开头的一小段（小窗展开着才能读到）。",
      default: true
    }
  });
  var PREVIEW_CHARS = 80;
  var THINKING = /^(thoughts?|thinking…?|thought for .*|思考中?…?|已思考.*|想了.*)$/i;
  function replyPreview(doc = app.doc, max = PREVIEW_CHARS) {
    for (const root of grokRoots(doc)) {
      const last2 = getMessages(root).filter((m) => m.role === "assistant").pop();
      if (!last2) continue;
      const text = (last2.el.innerText || last2.el.textContent || "").split("\n").map((l) => l.trim()).filter((l) => l && !THINKING.test(l)).join(" ").replace(/\s+/g, " ").trim();
      if (text) return text.length > max ? `${text.slice(0, max)}…` : text;
    }
    return "";
  }
  function toastOptions(doc = app.doc) {
    if (!app.manager?.isEnabled?.("CompleteToast")) return null;
    const { keep, seconds, preview } = settings4.store;
    return {
      duration: keep ? 0 : Math.max(2, seconds) * 1e3,
      closable: true,
      detail: preview ? replyPreview(doc) : "",
      // Shown even with the tab in the background, so it is there on return.
      whileHidden: keep
    };
  }
  var stopWatch = null;
  var wasOpen = false;
  var completeToast_default = definePlugin({
    name: "CompleteToast",
    description: "Grok“回复完成”的页面提示一直显示，直到点 × 或打开小窗；还能显示回复开头的一小段（移植自 void++）。",
    icon: ICONS.bellRing,
    tags: ["notifications"],
    enabledByDefault: true,
    settings: settings4,
    start() {
      wasOpen = isDrawerOpen(app.doc);
      stopWatch = watchGrok(app.doc, (doc) => {
        const open2 = isDrawerOpen(doc);
        if (open2 && !wasOpen) doc.querySelector(".askx-toast[data-reply-done]")?.remove();
        wasOpen = open2;
      });
    },
    stop() {
      stopWatch?.();
      stopWatch = null;
    }
  });

  // src/plugins/composerOpacity.js
  var MARK2 = "data-askx-composer";
  var STYLE_ID3 = "askx-composer-opacity";
  var settings5 = definePluginSettings({
    opacity: {
      type: OptionType.SLIDER,
      label: "不透明度",
      description: "输入框背景的不透明度，100 为完全不透明。",
      min: 0,
      max: 100,
      default: 100
    },
    blur: {
      type: OptionType.SLIDER,
      label: "背景模糊（px）",
      description: "不透明度低于 100 时，模糊输入框后面的内容。",
      min: 0,
      max: 40,
      default: 16
    }
  });
  var isClear = (bg) => !bg || bg === "transparent" || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg);
  function findComposerBox(root) {
    const field3 = getComposer(root);
    if (!field3) return null;
    const view = root.ownerDocument.defaultView;
    for (let node2 = field3.parentElement; node2 && node2 !== root; node2 = node2.parentElement) {
      const style = view.getComputedStyle(node2);
      if (!isClear(style.backgroundColor) && parseFloat(style.borderTopLeftRadius || style.borderRadius) > 0) return node2;
    }
    return null;
  }
  function rgbOf(color) {
    const m = String(color).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    return m ? `${Math.round(m[1])}, ${Math.round(m[2])}, ${Math.round(m[3])}` : null;
  }
  var observer2 = null;
  var schedule2 = null;
  function apply2(doc = app.doc) {
    const { opacity, blur } = settings5.store;
    let count = 0;
    for (const root of grokRoots(doc)) {
      const box = findComposerBox(root);
      if (!box) continue;
      if (!box.hasAttribute(MARK2)) {
        const rgb = rgbOf(doc.defaultView.getComputedStyle(box).backgroundColor);
        if (!rgb) continue;
        box.style.setProperty("--askx-composer-rgb", rgb);
        box.setAttribute(MARK2, "");
      }
      count += 1;
    }
    const style = doc.getElementById(STYLE_ID3);
    if (style) {
      const alpha = Math.min(100, Math.max(0, opacity)) / 100;
      const frost = alpha < 1 && blur > 0 ? `-webkit-backdrop-filter:blur(${blur}px)!important;backdrop-filter:blur(${blur}px)!important;` : "";
      const text = alpha >= 1 ? "" : `[${MARK2}]{background-color:rgba(var(--askx-composer-rgb),${alpha})!important;${frost}}`;
      if (style.textContent !== text) style.textContent = text;
    }
    return count;
  }
  var composerOpacity_default = definePlugin({
    name: "ComposerOpacity",
    description: "调整 Grok 输入框背景的不透明度和模糊程度（移植自 void++）。",
    icon: ICONS.blend,
    tags: ["composer", "appearance"],
    enabledByDefault: true,
    settings: settings5,
    start() {
      const doc = app.doc;
      if (!doc.getElementById(STYLE_ID3)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID3;
        (doc.head || doc.documentElement).appendChild(style);
      }
      schedule2 = timeThrottle(doc.defaultView, () => apply2(doc), 200);
      apply2(doc);
      observer2 = new doc.defaultView.MutationObserver((records) => {
        if (touchesGrok(records, doc)) schedule2();
      });
      observer2.observe(doc.body, { childList: true, subtree: true });
    },
    onSettingsChange: () => apply2(),
    stop() {
      observer2?.disconnect();
      observer2 = null;
      schedule2?.cancel();
      for (const box of app.doc.querySelectorAll(`[${MARK2}]`)) {
        box.removeAttribute(MARK2);
        box.style.removeProperty("--askx-composer-rgb");
      }
      app.doc.getElementById(STYLE_ID3)?.remove();
    }
  });

  // src/plugins/customGreeting.js
  var MARK3 = "data-askx-greet";
  var PH_MARK = "data-askx-greet-ph";
  var STYLE_ID4 = "askx-greeting";
  var MIN_FONT = 20;
  var DEFAULT_PHRASES = [
    "今天想弄明白点什么？",
    "划一段文字，问问 Grok。",
    "好问题，值得一个好答案。"
  ].join("\n");
  var settings6 = definePluginSettings({
    phrases: {
      type: OptionType.STRING,
      multiline: true,
      allowEmpty: true,
      label: "问候语",
      description: "每行一句。留空则保留 Grok 自己的问候语。",
      default: DEFAULT_PHRASES
    },
    mode: {
      type: OptionType.SELECT,
      label: "切换时机",
      description: "什么时候换下一句。",
      options: [
        { value: "refresh", label: "每次新对话" },
        { value: "interval", label: "定时切换" },
        { value: "manual", label: "点击问候语" }
      ],
      default: "refresh"
    },
    order: {
      type: OptionType.SELECT,
      label: "顺序",
      description: "按列表顺序还是随机挑一句。",
      options: [
        { value: "sequential", label: "顺序" },
        { value: "random", label: "随机" }
      ],
      default: "sequential"
    },
    intervalSec: {
      type: OptionType.SLIDER,
      label: "切换间隔（秒）",
      description: "“定时切换”时每隔多少秒换一句。",
      min: 1,
      max: 3600,
      default: 10
    },
    placeholder: {
      type: OptionType.BOOLEAN,
      label: "替换输入框提示",
      description: "同时把输入框里的灰色提示（Ask anything）换成当前这句问候语。",
      default: false
    }
  });
  function parsePhrases(raw) {
    return String(raw ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  }
  var observer3 = null;
  var timer2 = 0;
  var index = -1;
  var schedule3 = null;
  var shownOnce = false;
  var seen = /* @__PURE__ */ new WeakSet();
  function phrases() {
    return parsePhrases(settings6.store.phrases);
  }
  function nextIndex(current2, count, order, random = Math.random) {
    if (count <= 1) return 0;
    if (order === "random") {
      let next = current2;
      while (next === current2) next = Math.floor(random() * count);
      return next;
    }
    return (current2 + 1) % count;
  }
  function current() {
    const list = phrases();
    if (!list.length) return "";
    if (index < 0 || index >= list.length) index = 0;
    return list[index];
  }
  function rotate() {
    const list = phrases();
    index = nextIndex(index, list.length, settings6.store.order);
    paint3();
  }
  function findGreeting(root) {
    if (getMessages(root).length) return null;
    const view = root.ownerDocument.defaultView;
    const composer = getComposer(root);
    for (const el2 of root.querySelectorAll("span, h1, h2, div[dir]")) {
      if (el2.childElementCount || !el2.textContent.trim()) continue;
      if (composer && (el2.contains(composer) || composer.contains(el2))) continue;
      if (el2.closest('button, [role="button"], a')) continue;
      if (parseFloat(view.getComputedStyle(el2).fontSize) < MIN_FONT) continue;
      const heading = el2.closest("h1, h2, h3");
      return heading && root.contains(heading) ? heading : el2;
    }
    return null;
  }
  function css() {
    return `[${MARK3}]{font-size:0!important;white-space:normal!important}[${MARK3}]>*{display:none!important}[${MARK3}]::after{content:attr(${MARK3});display:inline-block;max-width:100%;font-size:var(--askx-greet-size,26px);line-height:1.3;white-space:normal;overflow-wrap:anywhere;text-wrap:balance}[${MARK3}][data-askx-greet-click]{cursor:pointer}`;
  }
  function clearMarks(doc) {
    for (const el2 of doc.querySelectorAll(`[${MARK3}]`)) {
      el2.removeAttribute(MARK3);
      el2.removeAttribute("data-askx-greet-click");
      el2.style.removeProperty("--askx-greet-size");
    }
    for (const el2 of doc.querySelectorAll(`[${PH_MARK}]`)) {
      el2.setAttribute("placeholder", el2.getAttribute(PH_MARK));
      el2.removeAttribute(PH_MARK);
    }
  }
  function onClick3(event) {
    if (settings6.store.mode !== "manual") return;
    if (!event.target.closest?.(`[${MARK3}]`)) return;
    event.preventDefault();
    rotate();
  }
  function paint3(doc = app.doc) {
    const text = current();
    let painted = 0;
    const titles = /* @__PURE__ */ new Set();
    for (const root of grokRoots(doc)) {
      const title = findGreeting(root);
      if (title && text) {
        titles.add(title);
        if (!seen.has(title)) {
          seen.add(title);
          if (shownOnce && settings6.store.mode === "refresh") index = nextIndex(index, phrases().length, settings6.store.order);
          shownOnce = true;
        }
        const phrase = current();
        if (!title.hasAttribute(MARK3)) title.style.setProperty("--askx-greet-size", doc.defaultView.getComputedStyle(title).fontSize);
        if (title.getAttribute(MARK3) !== phrase) title.setAttribute(MARK3, phrase);
        if (settings6.store.mode === "manual") title.setAttribute("data-askx-greet-click", "");
        else title.removeAttribute("data-askx-greet-click");
        painted += 1;
      }
      const composer = getComposer(root);
      if (composer && composer.tagName === "TEXTAREA") {
        if (settings6.store.placeholder && text) {
          if (!composer.hasAttribute(PH_MARK)) composer.setAttribute(PH_MARK, composer.getAttribute("placeholder") || "");
          if (composer.getAttribute("placeholder") !== current()) composer.setAttribute("placeholder", current());
        } else if (composer.hasAttribute(PH_MARK)) {
          composer.setAttribute("placeholder", composer.getAttribute(PH_MARK));
          composer.removeAttribute(PH_MARK);
        }
      }
    }
    for (const el2 of doc.querySelectorAll(`[${MARK3}]`)) {
      if (titles.has(el2)) continue;
      el2.removeAttribute(MARK3);
      el2.removeAttribute("data-askx-greet-click");
      el2.style.removeProperty("--askx-greet-size");
    }
    return painted;
  }
  function restartTimer() {
    const view = app.doc.defaultView;
    view.clearInterval(timer2);
    timer2 = 0;
    if (settings6.store.mode === "interval") timer2 = view.setInterval(rotate, Math.max(1, settings6.store.intervalSec) * 1e3);
  }
  var customGreeting_default = definePlugin({
    name: "CustomGreeting",
    description: "把 Grok 空对话的问候语（How can I help you today?）换成你自己的句子，可以每次新对话、定时或点击时轮换（移植自 void++）。",
    icon: ICONS.greeting,
    tags: ["appearance"],
    enabledByDefault: true,
    settings: settings6,
    start() {
      const doc = app.doc;
      if (!doc.getElementById(STYLE_ID4)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID4;
        style.textContent = css();
        (doc.head || doc.documentElement).appendChild(style);
      }
      index = settings6.store.order === "random" ? nextIndex(-1, phrases().length, "random") : 0;
      shownOnce = false;
      schedule3 = timeThrottle(doc.defaultView, () => paint3(doc), 100);
      paint3(doc);
      observer3 = new doc.defaultView.MutationObserver((records) => {
        if (touchesGrok(records, doc)) schedule3();
      });
      observer3.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["placeholder"] });
      doc.addEventListener("click", onClick3, true);
      restartTimer();
    },
    onSettingsChange() {
      clearMarks(app.doc);
      restartTimer();
      paint3(app.doc);
    },
    stop() {
      observer3?.disconnect();
      observer3 = null;
      schedule3?.cancel();
      app.doc.defaultView.clearInterval(timer2);
      app.doc.removeEventListener("click", onClick3, true);
      clearMarks(app.doc);
      app.doc.getElementById(STYLE_ID4)?.remove();
    }
  });

  // src/plugins/drawerHeight.js
  var MARK4 = "data-askx-height";
  var STYLE_ID5 = "askx-drawer-height";
  var LAYER = "data-askx-height-layer";
  var TOP_GAP = 8;
  var EDGE_GAP = 8;
  var FULL_V_GAP = 0;
  var settings7 = definePluginSettings({
    preset: {
      type: OptionType.SELECT,
      label: "弹窗高度",
      description: "“完整侧边栏”从窗口顶部一直到底部；“X 默认”不做改动。",
      options: [
        { value: "sidebar", label: "完整侧边栏" },
        { value: "custom", label: "自定义" },
        { value: "x", label: "X 默认" }
      ],
      default: "sidebar"
    },
    height: {
      type: OptionType.SLIDER,
      label: "自定义高度（px）",
      description: "选“自定义”时使用；超过窗口时自动缩到窗口高度。",
      min: 300,
      max: 1600,
      default: 640
    }
  });
  function targetHeight({ preset, height }, drawerBottom, viewHeight = drawerBottom) {
    const room = Math.max(0, Math.round(drawerBottom - TOP_GAP));
    if (preset === "sidebar") return Math.max(0, Math.round(viewHeight - 2 * FULL_V_GAP));
    if (preset === "custom") return Math.min(room, Math.max(300, Math.round(height)));
    return 0;
  }
  function layerOf(drawer) {
    return drawer.parentElement?.parentElement || null;
  }
  function clear2(drawer) {
    drawer.removeAttribute(MARK4);
    for (const prop of ["--askx-drawer-h", "--askx-drawer-shift", "--askx-drawer-mr", "--askx-drawer-w"]) drawer.style.removeProperty(prop);
    layerOf(drawer)?.removeAttribute(LAYER);
  }
  var observer4 = null;
  var schedule4 = null;
  var onResize = null;
  var settle = 0;
  var unwatch = null;
  var sizeObserver = null;
  var watchSizes = null;
  function apply3(doc = app.doc) {
    const drawer = getDrawer(doc);
    if (!drawer) return 0;
    const open2 = Boolean(getComposer(drawer));
    const view = doc.defaultView;
    const store = settings7.store;
    const rect = drawer.getBoundingClientRect();
    const shifted = parseFloat(drawer.style.getPropertyValue("--askx-drawer-shift")) || 0;
    const bottom = rect.bottom - shifted;
    const h = open2 ? targetHeight(store, bottom, view.innerHeight) : 0;
    if (!h) {
      if (drawer.hasAttribute(MARK4)) clear2(drawer);
      return 0;
    }
    const full = store.preset === "sidebar";
    const set = (prop, value) => {
      if (drawer.style.getPropertyValue(prop) !== value) drawer.style.setProperty(prop, value);
    };
    set("--askx-drawer-h", `${h}px`);
    if (full) {
      const now = drawer.getBoundingClientRect();
      if (drawer.hasAttribute(MARK4)) set("--askx-drawer-shift", `${Math.round(shifted + FULL_V_GAP - now.top)}px`);
      else set("--askx-drawer-shift", `${Math.round(view.innerHeight - FULL_V_GAP - bottom)}px`);
    } else {
      set("--askx-drawer-shift", "0px");
    }
    set("--askx-drawer-mr", full ? `${EDGE_GAP}px` : "");
    const side = full ? doc.querySelector('[data-testid="sidebarColumn"]')?.getBoundingClientRect() : null;
    const right = doc.documentElement.clientWidth - EDGE_GAP;
    set("--askx-drawer-w", side?.width ? `${Math.round(right - (side.left - EDGE_GAP))}px` : "");
    if (!drawer.hasAttribute(MARK4)) {
      drawer.setAttribute(MARK4, "");
      if (full) schedule4?.();
    }
    const layer = layerOf(drawer);
    if (layer) {
      if (full && !layer.hasAttribute(LAYER)) layer.setAttribute(LAYER, "");
      else if (!full && layer.hasAttribute(LAYER)) layer.removeAttribute(LAYER);
    }
    return h;
  }
  function reset(doc) {
    for (const el2 of doc.querySelectorAll(`[${MARK4}]`)) clear2(el2);
    for (const el2 of doc.querySelectorAll(`[${LAYER}]`)) el2.removeAttribute(LAYER);
  }
  var drawerHeight_default = definePlugin({
    name: "DrawerHeight",
    description: "调整 Grok 小窗的高度。默认拉满整个右侧边栏，也可以自定义高度或保持 X 默认。",
    icon: ICONS.height,
    tags: ["appearance"],
    enabledByDefault: true,
    settings: settings7,
    start() {
      const doc = app.doc;
      const view = doc.defaultView;
      if (!doc.getElementById(STYLE_ID5)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID5;
        style.textContent = `[${MARK4}]{height:var(--askx-drawer-h)!important;max-height:none!important;top:var(--askx-drawer-shift,0px)!important}[${MARK4}][style*="--askx-drawer-mr"]{margin-right:var(--askx-drawer-mr)!important}[${MARK4}][style*="--askx-drawer-w"]{width:var(--askx-drawer-w)!important;max-width:none!important}[${MARK4}]>div:first-child{height:100%!important;min-height:100%!important;max-height:none!important}[${LAYER}]{z-index:1!important}`;
        (doc.head || doc.documentElement).appendChild(style);
      }
      schedule4 = frameThrottle(view, () => apply3(doc));
      apply3(doc);
      observer4 = new view.MutationObserver((records) => {
        if (touchesGrok(records, doc)) {
          schedule4();
          watchSizes?.();
        }
      });
      observer4.observe(doc.body, { childList: true, subtree: true });
      onResize = () => {
        schedule4();
        view.clearTimeout(settle);
        settle = view.setTimeout(() => apply3(doc), 400);
      };
      const onMoved = (event) => {
        if (event.propertyName === "transform" || event.propertyName === "top") schedule4();
      };
      let watched = null;
      let watchedNodes = [];
      sizeObserver = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(() => onResize()) : null;
      watchSizes = () => {
        const drawer = getDrawer(doc);
        if (drawer === watched) return;
        watched = drawer;
        for (const node2 of watchedNodes) node2.removeEventListener("transitionend", onMoved);
        watchedNodes = [];
        sizeObserver?.disconnect();
        if (!drawer) return;
        const layer = layerOf(drawer);
        for (let node2 = drawer.parentElement; node2 && node2 !== doc.body; node2 = node2.parentElement) {
          node2.addEventListener("transitionend", onMoved);
          watchedNodes.push(node2);
          if (node2 === layer?.parentElement) break;
        }
        if (drawer.parentElement) sizeObserver?.observe(drawer.parentElement);
      };
      unwatch = () => {
        for (const node2 of watchedNodes) node2.removeEventListener("transitionend", onMoved);
        watchedNodes = [];
      };
      watchSizes();
      view.addEventListener("resize", onResize);
      view.visualViewport?.addEventListener("resize", onResize);
    },
    onSettingsChange: () => apply3(),
    stop() {
      observer4?.disconnect();
      observer4 = null;
      const view = app.doc.defaultView;
      if (onResize) {
        view.removeEventListener("resize", onResize);
        view.visualViewport?.removeEventListener("resize", onResize);
      }
      view.clearTimeout(settle);
      unwatch?.();
      unwatch = null;
      sizeObserver?.disconnect();
      sizeObserver = null;
      watchSizes = null;
      onResize = null;
      schedule4?.cancel();
      reset(app.doc);
      app.doc.getElementById(STYLE_ID5)?.remove();
    }
  });

  // src/plugins/followUp.js
  var DEFAULT_FOLLOW_UP = "{quote}\n\n";
  var settings8 = definePluginSettings({
    template: {
      type: OptionType.STRING,
      multiline: true,
      label: "追问模板",
      description: "占位符：{text} 原文、{quote} 每行加 > 的原文。写在输入框已有内容的后面。",
      default: DEFAULT_FOLLOW_UP
    }
  });
  var followUp_default = definePlugin({
    name: "FollowUp",
    description: "在 Grok 小窗（或 Grok 全页）里划选回复中的文字，点“追问”把它引用到当前对话的输入框，接着问。",
    icon: ICONS.followUp,
    tags: ["composer", "messages"],
    enabledByDefault: true,
    settings: settings8,
    askOrder: 40,
    toolbarButtons: () => [{ id: "follow-up", label: "追问", icon: ICONS.followUp, className: "askx-main", contexts: ["grok"], order: 0 }],
    onAsk(ctx2) {
      if (ctx2.trigger.id === "follow-up") ctx2.template = settings8.store.template;
    }
  });

  // src/plugins/grokScrollbars.js
  var STYLE_ID6 = "askx-grok-scrollbars";
  var settings9 = definePluginSettings({
    width: {
      type: OptionType.SELECT,
      label: "粗细",
      description: "“细”是浏览器的细滚动条；“隐藏”不显示滚动条，仍可用滚轮和触控板滚动。",
      options: [
        { value: "thin", label: "细" },
        { value: "none", label: "隐藏" }
      ],
      default: "thin"
    }
  });
  function css2({ width } = settings9.store) {
    const scope = `${GROK}, ${GROK} *, html[${PAGE_FLAG}]`;
    if (width === "none") return `:is(${scope}){scrollbar-width:none!important}`;
    return `:is(${scope}){scrollbar-width:thin!important;scrollbar-color:rgba(128,134,139,.45) transparent!important}:is(${scope}):hover{scrollbar-color:rgba(128,134,139,.7) transparent!important}`;
  }
  var stop3 = null;
  var grokScrollbars_default = definePlugin({
    name: "GrokScrollbars",
    description: "Grok 小窗和 Grok 页面里的滚动条去掉灰色导轨，只留一条细的圆角滑块，悬停时稍微加深。不影响 X 其他页面的滚动条。",
    icon: ICONS.scrollbar,
    tags: ["appearance"],
    enabledByDefault: true,
    settings: settings9,
    start() {
      addStyle(app.doc, STYLE_ID6, css2());
      stop3 = watchGrok(app.doc);
    },
    onSettingsChange: () => addStyle(app.doc, STYLE_ID6, css2()),
    stop() {
      stop3?.();
      stop3 = null;
      app.doc.getElementById(STYLE_ID6)?.remove();
    }
  });

  // src/plugins/hideFollowUps.js
  var MARK5 = "data-askx-hidden-followups";
  var STYLE_ID7 = "askx-hide-followups";
  var settings10 = definePluginSettings({
    keepLatest: {
      type: OptionType.BOOLEAN,
      label: "保留最新消息的猜你想问",
      description: "只隐藏较早回复下的建议问题，最新一条回复下的照常显示。",
      default: true
    }
  });
  var buttonsOf = (el2) => [...el2.querySelectorAll('button, [role="button"]')];
  function isActionBar(el2) {
    const buttons = buttonsOf(el2);
    return buttons.length >= 3 && !el2.textContent.trim() && buttons.every((b) => b.getAttribute("aria-label"));
  }
  function isFollowUpBlock(el2) {
    const buttons = buttonsOf(el2);
    return buttons.length >= 1 && buttons.every((b) => !b.getAttribute("aria-label") && b.querySelector("svg") && b.textContent.trim()) && Boolean(el2.previousElementSibling && isActionBar(el2.previousElementSibling));
  }
  function findFollowUps(root) {
    const list = messageList(root);
    if (!list) return [];
    const out = [];
    for (const bar2 of list.querySelectorAll("div")) {
      if (!isActionBar(bar2)) continue;
      const next = bar2.nextElementSibling;
      if (next && isFollowUpBlock(next)) out.push(next);
    }
    return out;
  }
  function hideAll(doc = app.doc, keepLatest = settings10.store.keepLatest) {
    const hidden = /* @__PURE__ */ new Set();
    for (const root of grokRoots(doc)) {
      const blocks = findFollowUps(root);
      const keep = keepLatest ? blocks[blocks.length - 1] : null;
      for (const block of blocks) if (block !== keep) hidden.add(block);
    }
    for (const block of hidden) if (!block.hasAttribute(MARK5)) block.setAttribute(MARK5, "");
    for (const el2 of doc.querySelectorAll(`[${MARK5}]`)) if (!hidden.has(el2)) el2.removeAttribute(MARK5);
    return hidden.size;
  }
  var stop4 = null;
  var hideFollowUps_default = definePlugin({
    name: "HideFollowUps",
    description: "隐藏 Grok 回复下方的“猜你想问”建议问题；默认保留最新一条回复下的。关闭插件时这些问题照常显示（并由 NoSideScroll 自动换行）。",
    icon: ICONS.eyeOff,
    tags: ["declutter"],
    enabledByDefault: true,
    settings: settings10,
    onSettingsChange: () => hideAll(app.doc),
    start() {
      addStyle(app.doc, STYLE_ID7, `[${MARK5}]{display:none!important}`);
      stop4 = watchGrok(app.doc, hideAll);
    },
    stop() {
      stop4?.();
      stop4 = null;
      app.doc.getElementById(STYLE_ID7)?.remove();
      for (const el2 of app.doc.querySelectorAll(`[${MARK5}]`)) el2.removeAttribute(MARK5);
    }
  });

  // src/replyBold.js
  var VIEW = "askx-rb";
  var SOURCE = "data-askx-rb-src";
  var STYLE_ID8 = "askx-reply-bold-style";
  var SKIP3 = 'code, pre, textarea, [contenteditable="true"], .askx-um, .askx-rb';
  var PAIR = /\*\*(?=\S)([^*\n]+?)\*\*/g;
  function findBold(text) {
    const out = [];
    for (const m of String(text).matchAll(PAIR)) {
      if (/\s$/.test(m[1])) continue;
      out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  }
  function boldTextNode(doc, node2) {
    const text = node2.nodeValue;
    const pairs = findBold(text);
    if (!pairs.length) return false;
    const frag = doc.createDocumentFragment();
    let at = 0;
    for (const { start: start2, end } of pairs) {
      if (start2 > at) frag.appendChild(doc.createTextNode(text.slice(at, start2)));
      const strong = doc.createElement("strong");
      strong.textContent = text.slice(start2 + 2, end - 2);
      frag.appendChild(strong);
      at = end;
    }
    if (at < text.length) frag.appendChild(doc.createTextNode(text.slice(at)));
    node2.parentNode.replaceChild(frag, node2);
    return true;
  }
  function textNodesWithPairs(doc, el2) {
    const walker = doc.createTreeWalker(el2, 4, {
      acceptNode: (n) => n.nodeValue.includes("**") && !n.parentElement?.closest(SKIP3) && findBold(n.nodeValue).length ? 1 : 3
    });
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }
  function blockOf(doc, node2, stop11) {
    for (let e = node2.parentElement; e && e !== stop11; e = e.parentElement) {
      if (doc.defaultView.getComputedStyle(e).display !== "inline") return e;
    }
    return null;
  }
  var viewFor = (block) => {
    const next = block.nextElementSibling;
    return next?.classList.contains(VIEW) && next.dataset.src === block.dataset.askxRbId ? next : null;
  };
  var nextId = 1;
  function redraw(doc, block) {
    const text = block.textContent;
    let view = viewFor(block);
    if (view && view.dataset.text === text) return;
    view?.remove();
    view = block.cloneNode(true);
    view.removeAttribute(SOURCE);
    view.removeAttribute("data-askx-rb-id");
    for (const n of view.querySelectorAll("[id]")) n.removeAttribute("id");
    view.removeAttribute("id");
    let changed = false;
    for (const n of textNodesWithPairs(doc, view)) changed = boldTextNode(doc, n) || changed;
    if (!changed) {
      block.removeAttribute(SOURCE);
      return;
    }
    view.classList.add(VIEW);
    if (!block.dataset.askxRbId) block.dataset.askxRbId = String(nextId++);
    view.dataset.src = block.dataset.askxRbId;
    view.dataset.text = text;
    block.after(view);
    block.setAttribute(SOURCE, "");
  }
  function paint4(doc) {
    const blocks = /* @__PURE__ */ new Set();
    for (const root of grokRoots(doc)) {
      for (const { el: el2, role } of getMessages(root)) {
        if (role !== "assistant") continue;
        for (const n of textNodesWithPairs(doc, el2)) {
          const block = blockOf(doc, n, el2);
          if (block) blocks.add(block);
        }
        for (const b of el2.querySelectorAll(`[${SOURCE}]`)) blocks.add(b);
      }
    }
    for (const block of blocks) redraw(doc, block);
    for (const view of doc.querySelectorAll(`.${VIEW}`)) {
      const prev = view.previousElementSibling;
      if (!prev || prev.dataset.askxRbId !== view.dataset.src || !prev.hasAttribute(SOURCE)) view.remove();
    }
  }
  var stop5 = null;
  function startReplyBold(doc) {
    addStyle(doc, STYLE_ID8, `[${SOURCE}]{display:none!important}.${VIEW} strong{font-weight:700}`);
    stop5 = watchGrok(doc, paint4);
    paint4(doc);
  }
  function stopReplyBold(doc) {
    stop5?.();
    stop5 = null;
    for (const view of doc.querySelectorAll(`.${VIEW}`)) view.remove();
    for (const el2 of doc.querySelectorAll(`[${SOURCE}]`)) el2.removeAttribute(SOURCE);
    doc.getElementById(STYLE_ID8)?.remove();
  }

  // src/userMessages.js
  var VIEW2 = "askx-um";
  var SOURCE2 = "data-askx-um-src";
  var STYLE_ID9 = "askx-user-messages";
  var OBSERVE = { childList: true, subtree: true, characterData: true };
  var transforms = /* @__PURE__ */ new Map();
  var sourceOf = /* @__PURE__ */ new WeakMap();
  var observer5 = null;
  var observedDoc = null;
  function roots(doc) {
    const list = [...doc.querySelectorAll(DRAWER)];
    if (onGrokPage(doc)) {
      const main = doc.querySelector("main");
      if (main) list.push(main);
    }
    return list;
  }
  var isView = (el2) => Boolean(el2?.closest?.(`.${VIEW2}`));
  function viewFor2(block) {
    const next = block.nextElementSibling;
    return next?.classList.contains(VIEW2) && sourceOf.get(next) === block ? next : null;
  }
  function build(doc, block, text) {
    const el2 = block.cloneNode(true);
    el2.removeAttribute("id");
    for (const n of el2.querySelectorAll("[id]")) n.removeAttribute("id");
    el2.removeAttribute(SOURCE2);
    el2.classList.add(VIEW2);
    let changed = false;
    for (const t of [...transforms.values()].sort((a, b) => a.order - b.order)) {
      try {
        changed = t.apply(doc, el2, text) || changed;
      } catch (error) {
        console.error("[Ask X] message transform failed", error);
      }
    }
    return changed ? el2 : null;
  }
  function unhide(block) {
    block.removeAttribute(SOURCE2);
    viewFor2(block)?.remove();
  }
  function refreshBlock(doc, block) {
    if (isView(block) || block.closest('textarea, [contenteditable="true"]')) return 0;
    if (!isUserMessage(block)) return 0;
    const text = block.textContent;
    const current2 = viewFor2(block);
    if (current2 && current2.dataset.text === text) return 0;
    const next = transforms.size ? build(doc, block, text) : null;
    if (!next) {
      if (current2 || block.hasAttribute(SOURCE2)) unhide(block);
      return 0;
    }
    next.dataset.text = text;
    sourceOf.set(next, block);
    if (current2) current2.replaceWith(next);
    else block.after(next);
    block.setAttribute(SOURCE2, "");
    return 1;
  }
  function sweep(scope) {
    for (const view of scope.querySelectorAll(`.${VIEW2}`)) {
      const block = sourceOf.get(view);
      if (!block || !block.isConnected || block.nextElementSibling !== view) view.remove();
    }
  }
  function refreshAll(doc = app.doc) {
    let count = 0;
    for (const root of roots(doc)) {
      sweep(root);
      for (const block of root.querySelectorAll("div[dir]")) count += refreshBlock(doc, block);
    }
    return count;
  }
  function refreshFromMutations(records, doc = app.doc) {
    const blocks = /* @__PURE__ */ new Set();
    const scopes = /* @__PURE__ */ new Set();
    const consider = (node2) => {
      const el2 = node2?.nodeType === 1 ? node2 : node2?.parentElement;
      if (!el2 || isView(el2)) return;
      const root = rootOf(el2, doc);
      if (!root) {
        if (node2.nodeType === 1 && (node2.matches?.(DRAWER) || node2.querySelector?.(DRAWER))) {
          for (const r of roots(doc)) for (const b of r.querySelectorAll("div[dir]")) blocks.add(b);
        }
        return;
      }
      scopes.add(root);
      const own = el2.closest("div[dir]");
      if (own) blocks.add(own);
      if (node2.nodeType === 1) for (const inner of node2.querySelectorAll("div[dir]")) blocks.add(inner);
    };
    for (const record of records) {
      if (record.type === "characterData") consider(record.target);
      else {
        for (const added of record.addedNodes) consider(added);
        if (record.removedNodes?.length) {
          const root = rootOf(record.target, doc);
          if (root) scopes.add(root);
        }
      }
    }
    for (const scope of scopes) sweep(scope);
    let count = 0;
    for (const block of blocks) if (block.isConnected) count += refreshBlock(doc, block);
    return count;
  }
  function restoreAll(doc) {
    for (const view of doc.querySelectorAll(`.${VIEW2}`)) view.remove();
    for (const block of doc.querySelectorAll(`[${SOURCE2}]`)) block.removeAttribute(SOURCE2);
  }
  function watcher(doc) {
    const mo = new doc.defaultView.MutationObserver((records) => {
      mo.disconnect();
      try {
        refreshFromMutations(records, doc);
      } finally {
        if (observer5 === mo && doc.body) mo.observe(doc.body, OBSERVE);
      }
    });
    mo.observe(doc.body, OBSERVE);
    return mo;
  }
  function ensureObserver() {
    const doc = app.doc;
    if (observer5 && observedDoc !== doc) {
      observer5.disconnect();
      observer5 = null;
    }
    if (transforms.size && !observer5) {
      observedDoc = doc;
      if (!doc.getElementById(STYLE_ID9)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID9;
        style.textContent = `[${SOURCE2}]{display:none!important}`;
        (doc.head || doc.documentElement).appendChild(style);
      }
      observer5 = watcher(doc);
    } else if (!transforms.size && observer5) {
      observer5.disconnect();
      observer5 = null;
      doc.getElementById(STYLE_ID9)?.remove();
    }
  }
  function setTransform(name, transform3) {
    if (transform3) transforms.set(name, transform3);
    else transforms.delete(name);
    const doc = app.doc;
    restoreAll(doc);
    ensureObserver();
    return transforms.size ? refreshAll(doc) : 0;
  }

  // src/plugins/markdown.js
  var DONE = "data-askx-md";
  var STYLE_ID10 = "askx-markdown";
  var HINT = /(^|\n)(#{1,6}\s|\s*[-*+]\s+\S|\s*\d+[.)]\s+\S|```|(?:-{3,}|\*{3,}|_{3,})\s*(\n|$))|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|(^|[\s(])\*[^*\s][^*\n]*\*(?=$|[\s).,!?:;])|(^|[\s(])_[^_\s][^_\n]*_(?=$|[\s).,!?:;])/;
  function looksLikeMarkdown(text) {
    return HINT.test(String(text || ""));
  }
  var INLINE = [
    { re: /`([^`\n]+)`/, make: (doc, m) => node(doc, "code", "askx-md-code", [doc.createTextNode(m[1])]) },
    { re: /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/, make: (doc, m) => link(doc, m[2], m[1]) },
    { re: /(\*\*|__)([^\n]+?)\1/, make: (doc, m) => node(doc, "strong", "", inline(doc, m[2])) },
    { re: /~~([^~\n]+)~~/, make: (doc, m) => node(doc, "s", "", inline(doc, m[1])) },
    { re: /(^|[\s(])\*([^*\s][^*\n]*?)\*(?=$|[\s).,!?:;，。！？：；])/, lead: true, make: (doc, m) => node(doc, "em", "", inline(doc, m[2])) },
    { re: /(^|[\s(])_([^_\s][^_\n]*?)_(?=$|[\s).,!?:;，。！？：；])/, lead: true, make: (doc, m) => node(doc, "em", "", inline(doc, m[2])) },
    { re: /https?:\/\/[^\s<>"'）)]+[^\s<>"'）).,!?:;，。！？：；]/, make: (doc, m) => link(doc, m[0], m[0]) }
  ];
  function node(doc, tag, cls, children = []) {
    const el2 = doc.createElement(tag);
    if (cls) el2.className = cls;
    for (const child of children) el2.appendChild(child);
    return el2;
  }
  function link(doc, href, text) {
    const a = node(doc, "a", "askx-md-link", [doc.createTextNode(text)]);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }
  function inline(doc, text) {
    const out = [];
    let rest = String(text);
    while (rest) {
      let best = null;
      for (const rule of INLINE) {
        const m = rule.re.exec(rest);
        if (!m) continue;
        const start2 = m.index + (rule.lead ? m[1].length : 0);
        if (!best || start2 < best.start) best = { rule, m, start: start2, end: m.index + m[0].length };
      }
      if (!best) {
        out.push(doc.createTextNode(rest));
        break;
      }
      if (best.start) out.push(doc.createTextNode(rest.slice(0, best.start)));
      out.push(best.rule.make(doc, best.m));
      rest = rest.slice(best.end);
    }
    return out;
  }
  function render(doc, text) {
    const frag = doc.createDocumentFragment();
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    let para = [];
    const flush = () => {
      if (!para.length) return;
      const p = node(doc, "div", "askx-md-p");
      para.forEach((line, i) => {
        if (i) p.appendChild(doc.createTextNode("\n"));
        if (line.startsWith(">")) p.appendChild(doc.createTextNode(line));
        else for (const n of inline(doc, line)) p.appendChild(n);
      });
      frag.appendChild(p);
      para = [];
    };
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const fence = /^\s*```(.*)$/.exec(line);
      if (fence) {
        flush();
        const body = [];
        for (i += 1; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i += 1) body.push(lines[i]);
        const pre = node(doc, "pre", "askx-md-pre", [node(doc, "code", "", [doc.createTextNode(body.join("\n"))])]);
        if (fence[1].trim()) pre.dataset.lang = fence[1].trim();
        frag.appendChild(pre);
        continue;
      }
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        flush();
        frag.appendChild(node(doc, "div", `askx-md-h askx-md-h${heading[1].length}`, inline(doc, heading[2])));
        continue;
      }
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flush();
        frag.appendChild(node(doc, "hr", "askx-md-hr"));
        continue;
      }
      const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (item) {
        flush();
        const ordered = /\d/.test(item[1]);
        const list = node(doc, ordered ? "ol" : "ul", "askx-md-list");
        if (ordered) list.start = parseInt(item[1], 10) || 1;
        for (; i < lines.length; i += 1) {
          const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
          if (!m || /\d/.test(m[1]) !== ordered) {
            i -= 1;
            break;
          }
          list.appendChild(node(doc, "li", "", inline(doc, m[2])));
        }
        frag.appendChild(list);
        continue;
      }
      if (!line.trim()) {
        flush();
        continue;
      }
      para.push(line);
    }
    flush();
    return frag;
  }
  var transform = {
    order: 10,
    apply(doc, el2, text) {
      if (!looksLikeMarkdown(text)) return false;
      el2.textContent = "";
      el2.appendChild(render(doc, text));
      el2.setAttribute(DONE, "");
      return true;
    }
  };
  var CSS2 = `
[${DONE}] .askx-md-p { white-space: pre-wrap; }
[${DONE}] .askx-md-p + .askx-md-p, [${DONE}] .askx-md-p + .askx-md-list, [${DONE}] .askx-md-list + .askx-md-p,
[${DONE}] .askx-md-pre + *, [${DONE}] * + .askx-md-pre, [${DONE}] .askx-md-h + *, [${DONE}] * + .askx-md-h { margin-top: 0.6em; }
[${DONE}] .askx-md-h { font-weight: 700; line-height: 1.3; }
[${DONE}] .askx-md-h1 { font-size: 1.35em; } [${DONE}] .askx-md-h2 { font-size: 1.22em; } [${DONE}] .askx-md-h3 { font-size: 1.1em; }
[${DONE}] .askx-md-list { margin: 0; padding-left: 1.4em; white-space: normal; }
[${DONE}] .askx-md-list li + li { margin-top: 0.2em; }
[${DONE}] .askx-md-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; padding: 0.1em 0.35em; border-radius: 4px; background: rgba(127, 127, 127, 0.22); }
[${DONE}] .askx-md-pre { margin: 0; padding: 10px 12px; border-radius: 8px; background: rgba(0, 0, 0, 0.28); overflow-x: auto; white-space: pre; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; line-height: 1.5; }
[${DONE}] .askx-md-link { color: rgb(29, 155, 240); text-decoration: none; }
[${DONE}] .askx-md-link:hover { text-decoration: underline; }
[${DONE}] .askx-md-hr { border: 0; border-top: 1px solid rgba(127, 127, 127, 0.4); margin: 0.6em 0; }
`;
  var stopRescan = null;
  var markdown_default = definePlugin({
    name: "Markdown",
    description: "像 grok.com 一样把你发给 Grok 的消息按 Markdown 显示：标题、粗体、斜体、删除线、代码、代码块、列表、链接和分隔线；Grok 回复里漏渲染的 **粗体** 也补上（不改动 X 的消息内容）。",
    icon: ICONS.markdown,
    tags: ["messages"],
    enabledByDefault: true,
    start() {
      const doc = app.doc;
      if (!doc.getElementById(STYLE_ID10)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID10;
        style.textContent = CSS2;
        (doc.head || doc.documentElement).appendChild(style);
      }
      setTransform("markdown", transform);
      stopRescan = watchGrok(doc, (d) => refreshAll(d));
      startReplyBold(doc);
    },
    stop() {
      stopRescan?.();
      stopRescan = null;
      stopReplyBold(app.doc);
      setTransform("markdown", null);
      app.doc.getElementById(STYLE_ID10)?.remove();
    }
  });

  // src/ui/dom.js
  function el(doc, tag, attrs = {}, children = []) {
    const node2 = doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "text") node2.textContent = value;
      else if (key === "html") node2.innerHTML = value;
      else if (key.startsWith("on")) node2.addEventListener(key.slice(2), value);
      else if (value !== false && value != null) node2.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children) if (child) node2.appendChild(child);
    return node2;
  }

  // src/ui/controls.js
  function createSwitch(doc, checked, onChange, { label: label3, disabled } = {}) {
    const sw = el(doc, "button", { type: "button", role: "switch", class: "askx-switch", "aria-label": label3 || null, disabled: Boolean(disabled) }, [
      el(doc, "span", { class: "askx-switch-thumb" })
    ]);
    const set = (value) => {
      sw.setAttribute("aria-checked", String(value));
      sw.dataset.state = value ? "checked" : "unchecked";
    };
    set(Boolean(checked));
    sw.addEventListener("click", (event) => {
      event.stopPropagation();
      if (sw.disabled) return;
      const next = sw.getAttribute("aria-checked") !== "true";
      set(next);
      onChange(next);
    });
    return sw;
  }
  function createSelect(doc, options, value, onChange, layer, { className = "" } = {}) {
    const text = el(doc, "span", { class: "askx-select-value" });
    const trigger = el(doc, "button", { type: "button", role: "combobox", class: `askx-select ${className}`.trim(), "aria-expanded": "false", "aria-haspopup": "listbox" }, [
      text,
      el(doc, "span", { class: "askx-select-chevron", html: ICONS.chevron })
    ]);
    const setValue = (v) => {
      trigger.dataset.value = String(v);
      text.textContent = (options.find((o) => String(o.value) === String(v)) || options[0]).label;
    };
    setValue(value);
    let menu = null;
    const close = () => {
      menu?.remove();
      menu = null;
      trigger.setAttribute("aria-expanded", "false");
    };
    const open2 = () => {
      menu = el(doc, "div", { role: "listbox", class: "askx-select-content" }, options.map((o) => {
        const selected = String(o.value) === trigger.dataset.value;
        return el(doc, "div", {
          role: "option",
          class: "askx-select-item",
          "aria-selected": String(selected),
          "data-state": selected ? "checked" : "unchecked",
          onclick: () => {
            setValue(o.value);
            close();
            onChange(o.value);
          }
        }, [el(doc, "span", { text: o.label }), selected ? el(doc, "span", { class: "askx-select-check", html: ICONS.check }) : null]);
      }));
      layer.appendChild(menu);
      const box = trigger.getBoundingClientRect();
      const view = doc.defaultView;
      menu.style.minWidth = `${Math.max(128, Math.round(box.width))}px`;
      const left = Math.min(box.left, view.innerWidth - menu.offsetWidth - 8);
      let top = box.bottom + 4;
      if (top + menu.offsetHeight > view.innerHeight - 8) top = box.top - menu.offsetHeight - 4;
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      trigger.setAttribute("aria-expanded", "true");
    };
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (menu) close();
      else {
        layer.dispatchEvent(new doc.defaultView.Event("askx-close-popups"));
        open2();
      }
    });
    layer.addEventListener("askx-close-popups", close);
    return trigger;
  }
  function createTextArea(doc, value, onChange, { rows = 4, placeholder = "", label: label3 } = {}) {
    const area = el(doc, "textarea", { rows, spellcheck: "false", placeholder, class: "askx-textarea", "aria-label": label3 || null });
    area.value = value;
    area.addEventListener("change", () => onChange(area));
    return el(doc, "div", { class: "askx-textarea-wrap" }, [area]);
  }
  function createSlider(doc, value, { min, max }, onChange) {
    const wrap = el(doc, "div", { class: "askx-slider-row" });
    const rail = el(doc, "div", { class: "askx-slider-rail" }, [el(doc, "div", { class: "askx-slider-fill" }), el(doc, "div", { class: "askx-slider-thumb" })]);
    const input = el(doc, "input", { type: "range", min, max, step: 1, class: "askx-slider" });
    const out = el(doc, "span", { class: "askx-slider-value" });
    const paint6 = (n) => {
      const pct = max === min ? 100 : (n - min) / (max - min) * 100;
      rail.firstChild.style.width = `${pct}%`;
      rail.lastChild.style.left = `${pct}%`;
      out.textContent = String(n);
    };
    input.value = value;
    paint6(Number(value));
    input.addEventListener("input", () => {
      paint6(Number(input.value));
      onChange(Number(input.value));
    });
    wrap.append(el(doc, "div", { class: "askx-slider-wrap" }, [rail, input]), out);
    return wrap;
  }

  // src/ui/gutter.js
  function keepEdges(list, gutter) {
    const apply4 = () => {
      const bar2 = list.offsetWidth - list.clientWidth;
      list.style.paddingRight = `${Math.max(0, gutter - bar2)}px`;
    };
    apply4();
    const view = list.ownerDocument.defaultView;
    if (typeof view?.ResizeObserver === "function") {
      const ro = new view.ResizeObserver(apply4);
      ro.observe(list);
      for (const child of list.children) ro.observe(child);
    }
    return apply4;
  }

  // src/ui/presetEditor.js
  var ICON_ERRORS = {
    invalid: "请填写 https:// 图片地址或 data:image/… URL。",
    "not-image": "这个地址返回的不是图片。",
    "too-large": "图片太大（上限 512 KB）。"
  };
  function iconErrorText(code) {
    if (!code) return "";
    const http = /^http-(\d+)$/.exec(code);
    return ICON_ERRORS[code] || (http ? `图片地址返回错误（HTTP ${http[1]}），请换一个地址。` : "图标加载失败，请检查地址是否能打开。");
  }
  function iconBox(doc, url, cls) {
    const box = el(doc, "span", { class: cls, "aria-hidden": "true" });
    const holder = el(doc, "span", { class: "askx-icon-holder" });
    box.appendChild(holder);
    const paint6 = (value) => {
      box.dataset.state = iconUrlKind(value) === "empty" ? "empty" : "loading";
      return paintIcon(holder, value).then((state2) => {
        if (state2 !== "stale") box.dataset.state = holder.dataset.state;
        return holder.dataset;
      });
    };
    void paint6(url);
    return { box, paint: paint6 };
  }
  function iconPicker(doc, layer, value, onChange) {
    let current2 = value;
    const preview = iconBox(doc, current2, "askx-icon-preview");
    const trigger = el(doc, "button", { type: "button", class: "askx-icon-trigger", "aria-haspopup": "dialog", "aria-expanded": "false" }, [
      preview.box,
      el(doc, "span", { class: "askx-icon-trigger-text" })
    ]);
    const label3 = () => {
      const kind2 = iconUrlKind(current2);
      trigger.querySelector(".askx-icon-trigger-text").textContent = kind2 === "empty" ? "添加图标" : kind2 === "data" ? "已设置（data URL）" : "已设置（图片地址）";
    };
    label3();
    let pop = null;
    const close = () => {
      pop?.remove();
      pop = null;
      trigger.setAttribute("aria-expanded", "false");
    };
    const open2 = () => {
      const input = el(doc, "input", { class: "askx-input", placeholder: "https://… 或 data:image/…", "aria-label": "图标 URL", spellcheck: "false" });
      input.value = current2;
      const big = iconBox(doc, current2, "askx-icon-preview askx-icon-preview-lg");
      const error = el(doc, "p", { class: "askx-icon-error", role: "status", hidden: true });
      let timer3 = 0;
      const check2 = () => big.paint(input.value.trim()).then((data) => {
        const bad = data.state === "error";
        input.classList.toggle("askx-input-error", bad);
        error.hidden = !bad;
        error.textContent = bad ? iconErrorText(data.error) : "";
      });
      input.addEventListener("input", () => {
        clearTimeout(timer3);
        timer3 = setTimeout(check2, 350);
      });
      const apply4 = (next) => {
        current2 = next;
        label3();
        void preview.paint(current2);
        onChange(current2);
        close();
      };
      pop = el(doc, "div", { class: "askx-select-content askx-icon-pop", role: "dialog", "aria-label": "图标" }, [
        el(doc, "div", { class: "askx-field-label", text: "图标 URL" }),
        el(doc, "div", { class: "askx-icon-pop-row" }, [big.box, input]),
        error,
        el(doc, "p", { class: "askx-label-desc", text: "支持 https 图片地址或 data:image URL。外站图片会通过脚本管理器下载并缓存。" }),
        el(doc, "div", { class: "askx-icon-pop-actions" }, [
          el(doc, "button", { type: "button", class: "askx-button askx-button-ghost", text: "移除图标", onclick: () => apply4("") }),
          el(doc, "button", { type: "button", class: "askx-button askx-button-primary", text: "完成", onclick: () => apply4(input.value.trim()) })
        ])
      ]);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply4(input.value.trim());
        }
      });
      layer.appendChild(pop);
      void check2();
      const box = trigger.getBoundingClientRect();
      const view = doc.defaultView;
      let top = box.bottom + 6;
      if (top + pop.offsetHeight > view.innerHeight - 8) top = box.top - pop.offsetHeight - 6;
      pop.style.left = `${Math.round(Math.min(box.left, view.innerWidth - pop.offsetWidth - 8))}px`;
      pop.style.top = `${Math.round(top)}px`;
      trigger.setAttribute("aria-expanded", "true");
    };
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (pop) close();
      else {
        layer.dispatchEvent(new doc.defaultView.Event("askx-close-popups"));
        open2();
      }
    });
    layer.addEventListener("askx-close-popups", close);
    return { element: trigger, get value() {
      return current2;
    } };
  }
  function badge(doc, text) {
    return el(doc, "span", { class: "askx-badge", text });
  }
  function oneLine(template) {
    return String(template || "").replace(/\s+/g, " ").trim();
  }
  function createPresetEditor(doc, settings22, key, layer) {
    const root = el(doc, "div", { class: "askx-presets" });
    const setEditing = (on2) => root.closest(".askx-dialog")?.classList.toggle("askx-dialog-editing", on2);
    function showList() {
      setEditing(false);
      root.textContent = "";
      const presets = settings22.get(key);
      const list = el(doc, "div", { class: "askx-prompt-list", role: "list" });
      presets.forEach((preset, index2) => {
        const remove = el(doc, "button", {
          type: "button",
          class: "askx-card-btn",
          title: "删除",
          "aria-label": `删除 ${preset.name}`,
          html: ICONS.trash,
          onclick: (e) => {
            e.stopPropagation();
            const next = settings22.get(key).filter((_, i) => i !== index2);
            settings22.set(key, next);
            showList();
          }
        });
        const row2 = el(doc, "div", { class: "askx-prompt-row", role: "listitem" }, [
          el(doc, "button", { type: "button", class: "askx-prompt-open", "aria-label": `编辑 ${preset.name}`, onclick: () => showEditor(index2) }, [
            iconBox(doc, preset.icon, "askx-prompt-icon").box,
            el(doc, "span", { class: "askx-prompt-text" }, [
              el(doc, "span", { class: "askx-prompt-name" }, [
                el(doc, "span", { text: preset.name }),
                preset.private ? badge(doc, "无痕") : null,
                preset.autoSend ? badge(doc, "自动发送") : null
              ]),
              el(doc, "span", { class: "askx-prompt-preview", text: oneLine(preset.template) })
            ]),
            el(doc, "span", { class: "askx-prompt-chevron", html: ICONS.chevron })
          ]),
          remove
        ]);
        list.appendChild(row2);
      });
      if (!presets.length) list.appendChild(el(doc, "p", { class: "askx-empty askx-empty-sm", text: "还没有快捷提问。" }));
      root.append(list, el(doc, "button", {
        type: "button",
        class: "askx-button askx-button-secondary askx-add",
        html: `${ICONS.plus}<span>添加快捷提问</span>`,
        onclick: () => showEditor(-1)
      }));
    }
    function showEditor(index2) {
      setEditing(true);
      const presets = settings22.get(key);
      const draft2 = index2 >= 0 ? { ...presets[index2] } : { name: "", icon: "", template: "{quote}\n\n", private: false, autoSend: false };
      root.textContent = "";
      const name = el(doc, "input", { class: "askx-input", placeholder: "例如：总结", maxlength: 12, "aria-label": "名称" });
      name.value = draft2.name;
      const picker = iconPicker(doc, layer, draft2.icon || "", (value) => {
        draft2.icon = value;
      });
      const template = createTextArea(doc, draft2.template, () => {
      }, { rows: 5, label: "提问模板", placeholder: "{quote}\n\n你的问题" });
      const area = template.querySelector("textarea");
      const save = el(doc, "button", { type: "button", class: "askx-button askx-button-primary", text: "保存" });
      const sync2 = () => {
        save.disabled = !name.value.trim() || !area.value.trim();
      };
      name.addEventListener("input", sync2);
      area.addEventListener("input", sync2);
      sync2();
      const field3 = (labelText, control, hint) => el(doc, "div", { class: "askx-form-field" }, [
        el(doc, "div", { class: "askx-label-title", text: labelText }),
        control,
        hint ? el(doc, "div", { class: "askx-label-desc", text: hint }) : null
      ]);
      const option = (title, desc, prop) => el(doc, "div", { class: "askx-row" }, [
        el(doc, "div", { class: "askx-label" }, [
          el(doc, "div", { class: "askx-label-title", text: title }),
          el(doc, "div", { class: "askx-label-desc", text: desc })
        ]),
        createSwitch(doc, draft2[prop], (v) => {
          draft2[prop] = v;
        }, { label: title })
      ]);
      save.addEventListener("click", () => {
        const next = { ...draft2, name: name.value.trim(), template: area.value };
        const list = settings22.get(key);
        if (index2 >= 0) list[index2] = next;
        else list.push(next);
        settings22.set(key, list);
        showList();
      });
      root.append(
        el(doc, "button", { type: "button", class: "askx-back", html: `${ICONS.chevron}<span>快捷提问</span>`, onclick: showList }),
        el(doc, "div", { class: "askx-form" }, [
          field3("名称", name),
          field3("图标", picker.element, "可选。显示在工具条按钮的名字前面。"),
          field3("提问模板", template, "占位符：{quote} 带 > 的原文、{text} 原文、{url} 推文链接、{author} 作者。"),
          el(doc, "div", { class: "askx-form-field" }, [
            el(doc, "div", { class: "askx-label-title", text: "选项" }),
            option("无痕", "用 Grok 的 Private Chat 新对话提问。", "private"),
            option("自动发送", "写入后直接发送。适合问题已经写好的提问，例如翻译。", "autoSend")
          ])
        ]),
        el(doc, "div", { class: "askx-form-actions" }, [
          el(doc, "button", { type: "button", class: "askx-button askx-button-secondary", text: "取消", onclick: showList }),
          save
        ])
      );
    }
    showList();
    return root;
  }

  // src/ui/pluginDialog.js
  function label2(doc, title, description) {
    return el(doc, "div", { class: "askx-label" }, [
      el(doc, "div", { class: "askx-label-title", text: title }),
      description ? el(doc, "div", { class: "askx-label-desc", text: description }) : null
    ]);
  }
  var row = (doc, def, control) => el(doc, "div", { class: "askx-row" }, [label2(doc, def.label, def.description), control]);
  var stacked = (doc, def, control) => el(doc, "div", { class: "askx-stacked" }, [label2(doc, def.label, def.description), control]);
  function field(doc, settings22, key, def, layer) {
    const value = settings22.get(key);
    switch (def.type) {
      case OptionType.BOOLEAN:
        return row(doc, def, createSwitch(doc, value, (v) => settings22.set(key, v), { label: def.label }));
      case OptionType.SELECT:
        return row(doc, def, createSelect(doc, def.options, value, (v) => settings22.set(key, v), layer));
      case OptionType.NUMBER: {
        const input = el(doc, "input", { type: "number", min: def.min, max: def.max, class: "askx-input askx-number", "aria-label": def.label });
        input.value = value;
        input.addEventListener("change", () => {
          settings22.set(key, input.value);
          input.value = settings22.get(key);
        });
        return row(doc, def, input);
      }
      case OptionType.SLIDER:
        return stacked(doc, def, createSlider(doc, value, def, (v) => settings22.set(key, v)));
      case OptionType.STRING:
        if (def.multiline) {
          return stacked(doc, def, createTextArea(doc, value, (area) => {
            settings22.set(key, area.value);
            area.value = settings22.get(key);
          }, { label: def.label }));
        }
        {
          const input = el(doc, "input", { type: "text", class: "askx-input", placeholder: def.placeholder || "", spellcheck: "false", "aria-label": def.label });
          input.value = value;
          input.addEventListener("change", () => {
            settings22.set(key, input.value);
            input.value = settings22.get(key);
          });
          return stacked(doc, def, input);
        }
      case OptionType.COMPONENT:
        if (def.component === "presets") return stacked(doc, def, createPresetEditor(doc, settings22, key, layer));
        if (typeof def.component === "function") return (def.stacked ? stacked : row)(doc, def, def.component(doc, layer));
        return null;
      default:
        return null;
    }
  }
  function confirmDialog(doc, layer, { title, description, confirmText, onConfirm }) {
    const close = () => box.remove();
    const box = el(doc, "div", { class: "askx-overlay askx-overlay-nested", "data-askx-modal": "", onmousedown: (e) => {
      if (e.target === box) close();
    } }, [
      el(doc, "div", { class: "askx-dialog askx-dialog-sm", role: "alertdialog", "aria-modal": "true", "aria-label": title }, [
        el(doc, "div", { class: "askx-dialog-header" }, [
          el(doc, "h2", { class: "askx-dialog-title", text: title }),
          el(doc, "p", { class: "askx-dialog-desc", text: description })
        ]),
        el(doc, "div", { class: "askx-dialog-footer" }, [
          el(doc, "button", { type: "button", class: "askx-button askx-button-secondary", text: "取消", onclick: close }),
          el(doc, "button", { type: "button", class: "askx-button askx-button-danger", text: confirmText, onclick: () => {
            close();
            onConfirm();
          } })
        ])
      ])
    ]);
    layer.appendChild(box);
    return close;
  }
  function openPluginDialog(doc, layer, plugin) {
    const settings22 = plugin.settings;
    const entries2 = settings22 ? Object.entries(settings22.def).filter(([, d]) => !d.hidden) : [];
    const list = el(doc, "div", { class: "askx-settings-list" });
    const render4 = () => {
      list.textContent = "";
      if (!entries2.length) list.appendChild(el(doc, "p", { class: "askx-paragraph", text: "这个插件没有可调的设置。" }));
      for (const [key, def] of entries2) {
        const node2 = field(doc, settings22, key, def, layer);
        if (node2) list.appendChild(node2);
      }
    };
    render4();
    const close = () => box.remove();
    const dialog = el(doc, "div", { class: "askx-dialog", role: "dialog", "aria-modal": "true", "aria-label": plugin.name }, [
      el(doc, "button", { type: "button", class: "askx-icon-btn askx-dialog-close", "aria-label": "关闭", title: "关闭", html: ICONS.close, onclick: close }),
      el(doc, "div", { class: "askx-dialog-header" }, [
        el(doc, "h2", { class: "askx-dialog-title", text: plugin.name }),
        el(doc, "p", { class: "askx-dialog-desc", text: plugin.description })
      ]),
      el(doc, "div", { class: "askx-separator", role: "separator" }),
      el(doc, "div", { class: "askx-field" }, [
        el(doc, "div", { class: "askx-field-label", text: "作者" }),
        el(doc, "p", { class: "askx-paragraph", text: plugin.authors.join(", ") })
      ]),
      el(doc, "div", { class: "askx-field askx-settings" }, [
        el(doc, "div", { class: "askx-field-label", text: "设置" }),
        list
      ]),
      entries2.length ? el(doc, "div", { class: "askx-dialog-footer" }, [
        el(doc, "button", {
          type: "button",
          class: "askx-button askx-button-ghost",
          text: "重置",
          onclick: () => confirmDialog(doc, layer, {
            title: "重置设置",
            description: `把 ${plugin.name} 的设置恢复为默认值？此操作无法撤销。`,
            confirmText: "重置",
            onConfirm: () => {
              settings22.reset();
              render4();
            }
          })
        })
      ]) : null
    ]);
    const box = el(doc, "div", { class: "askx-overlay askx-overlay-nested", "data-askx-modal": "", onmousedown: (e) => {
      if (e.target === box) close();
    } }, [dialog]);
    layer.appendChild(box);
    keepEdges(list, 24);
    return { element: box, close };
  }

  // src/plugins/inputHistory.js
  var MAX_MIN = 10;
  var MAX_MAX = 500;
  var DEDUPE_MS = 2e3;
  var HUD = "askx-ih-hud";
  var STYLE_ID11 = "askx-input-history";
  var cleanList = (value) => Array.isArray(value) ? value.filter((x) => typeof x === "string" && x.trim()) : void 0;
  var settings11 = definePluginSettings({
    maxEntries: {
      type: OptionType.SLIDER,
      label: "最多保存条数",
      description: "超出后丢掉最早的。",
      min: MAX_MIN,
      max: MAX_MAX,
      default: 100
    },
    skipPrivate: {
      type: OptionType.BOOLEAN,
      label: "无痕对话不记录",
      description: "在 Private Chat 里发的内容不存进历史。",
      default: true
    },
    history: {
      type: OptionType.COMPONENT,
      stacked: true,
      label: "历史记录",
      description: "保存在本机的脚本管理器里。可以搜索、复制和删除。",
      component: (doc, layer) => historyPanel(doc, layer)
    },
    entries: {
      type: OptionType.COMPONENT,
      hidden: true,
      keepOnReset: true,
      validate: cleanList,
      default: []
    }
  });
  var cursor = -1;
  var draft = "";
  var shown = null;
  var field2 = null;
  var recent = /* @__PURE__ */ new Map();
  var normalize = (text) => String(text ?? "").replace(/​/g, "").replace(/\r\n?/g, "\n").replace(/\s+$/u, "");
  function entries() {
    return settings11.store.entries;
  }
  function pushEntry(text, now = Date.now()) {
    const value = normalize(text);
    if (!value.trim()) return false;
    if (recent.has(value) && now - recent.get(value) < DEDUPE_MS) return false;
    recent.set(value, now);
    if (recent.size > 20) recent.delete(recent.keys().next().value);
    const list = entries().filter((e) => e !== value);
    list.push(value);
    const max = Math.min(MAX_MAX, Math.max(MAX_MIN, settings11.store.maxEntries));
    settings11.store.entries = list.slice(-max);
    return true;
  }
  function removeEntry(index2) {
    settings11.store.entries = entries().filter((_, i) => i !== index2);
  }
  function isComposer2(target) {
    if (!target || !rootOf(target, target.ownerDocument)) return false;
    return target.tagName === "TEXTAREA" || target.isContentEditable && target.getAttribute("role") === "textbox";
  }
  var writing = false;
  function placeCaret(area, atStart2) {
    if (area.tagName === "TEXTAREA") {
      const pos = atStart2 ? 0 : area.value.length;
      try {
        area.setSelectionRange(pos, pos);
      } catch {
      }
      return;
    }
    const doc = area.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(area);
    range.collapse(atStart2);
    const sel2 = doc.getSelection();
    sel2.removeAllRanges();
    sel2.addRange(range);
  }
  function setText(area, text, caretAtStart) {
    shown = text;
    if (area.tagName === "TEXTAREA") {
      writeTextarea(area, text);
      placeCaret(area, caretAtStart);
      return;
    }
    writing = true;
    void writeEditable(area, text).finally(() => {
      writing = false;
      placeCaret(area, caretAtStart);
    });
  }
  function stopBrowsing() {
    cursor = -1;
    shown = null;
    hideHud();
  }
  function step(area, older) {
    const list = entries();
    if (!list.length) return false;
    if (cursor < 0) {
      if (!older) return false;
      draft = readValue(area);
      cursor = list.length;
    }
    const next = older ? cursor - 1 : cursor + 1;
    if (next < 0) return true;
    if (next >= list.length) {
      setText(area, draft, false);
      stopBrowsing();
      return true;
    }
    cursor = next;
    field2 = area;
    setText(area, list[next], older);
    showHud(area, `${next + 1} / ${list.length}`);
    return true;
  }
  function restoreDraft(area) {
    setText(area, draft, false);
    stopBrowsing();
  }
  function aroundCaret(area, before) {
    const doc = area.ownerDocument;
    const sel2 = doc.getSelection();
    if (!sel2 || !sel2.rangeCount || !sel2.isCollapsed || !area.contains(sel2.anchorNode)) return null;
    const range = doc.createRange();
    range.selectNodeContents(area);
    if (before) range.setEnd(sel2.anchorNode, sel2.anchorOffset);
    else range.setStart(sel2.anchorNode, sel2.anchorOffset);
    return range.toString();
  }
  function atStart(area) {
    if (area.tagName === "TEXTAREA") return area.selectionStart === 0 && area.selectionEnd === 0;
    const text = aroundCaret(area, true);
    return text !== null && !text.replace(/\u200B/g, "");
  }
  function atEnd(area) {
    if (area.tagName === "TEXTAREA") {
      const n = area.value.length;
      return area.selectionStart === n && area.selectionEnd === n;
    }
    const text = aroundCaret(area, false);
    return text !== null && !text.replace(/[\u200B\n]/g, "");
  }
  function skip(area) {
    if (!settings11.store.skipPrivate) return false;
    const root = rootOf(area);
    return Boolean(root && isPrivateOn(root));
  }
  function capture(area) {
    if (!skip(area)) pushEntry(readValue(area));
    stopBrowsing();
  }
  function onKeyDown2(event) {
    const area = event.target;
    if (!isComposer2(area) || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && cursor >= 0 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      restoreDraft(area);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      capture(area);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (event.shiftKey || event.metaKey || event.ctrlKey) return;
    const older = event.key === "ArrowUp";
    const empty = !readValue(area).trim();
    const edge = older ? atStart(area) || empty : atEnd(area) && cursor >= 0;
    if (!event.altKey && !edge) return;
    if (!step(area, older)) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function onInput2(event) {
    if (writing || cursor < 0 || !isComposer2(event.target)) return;
    if (readValue(event.target) !== shown) stopBrowsing();
  }
  function onClick4(event) {
    const button = event.target.closest?.('button, [role="button"]');
    if (!button) return;
    const root = rootOf(button, app.doc);
    if (!root) return;
    const send = findButton(root, xLabels().send);
    if (button !== send) return;
    const area = root.querySelector('textarea, [contenteditable="true"][role="textbox"]');
    if (area) capture(area);
  }
  function showHud(area, text) {
    const doc = area.ownerDocument;
    let hud = doc.querySelector(`.${HUD}`);
    if (!hud) {
      hud = el(doc, "button", { type: "button", class: HUD, title: "浏览输入历史", onmousedown: (e) => e.preventDefault(), onclick: () => openPicker(doc) });
      doc.body.appendChild(hud);
    }
    hud.textContent = text;
    hud.dataset.theme = pageTheme(doc);
    const box = area.getBoundingClientRect();
    hud.style.top = `${Math.round(box.top - 26)}px`;
    hud.style.left = `${Math.round(box.right - 64)}px`;
  }
  function onFocusOut(event) {
    if (event.target === field2 && !event.relatedTarget?.closest?.(`.${HUD}`)) hideHud();
  }
  function hideHud() {
    app.doc?.querySelector(`.${HUD}`)?.remove();
  }
  function historyPanel(doc, layer, { onUse } = {}) {
    const root = el(doc, "div", { class: "askx-ih-panel" });
    const search = el(doc, "input", { type: "text", class: "askx-input", placeholder: "搜索历史", "aria-label": "搜索历史" });
    const count = el(doc, "span", { class: "askx-label-desc" });
    const clear3 = el(doc, "button", {
      type: "button",
      class: "askx-button askx-button-secondary",
      text: "清空历史",
      onclick: () => confirmDialog(doc, layer, {
        title: "清空输入历史",
        description: "删除所有保存的提问？此操作无法撤销。",
        confirmText: "清空",
        onConfirm: () => {
          settings11.store.entries = [];
          render4();
        }
      })
    });
    const list = el(doc, "div", { class: "askx-ih-list" });
    const render4 = () => {
      const all = entries();
      const needle = search.value.trim().toLowerCase();
      const rows = all.map((text, index2) => ({ text, index: index2 })).filter((r) => !needle || r.text.toLowerCase().includes(needle)).reverse();
      search.hidden = !all.length;
      clear3.disabled = !all.length;
      count.textContent = needle ? `${rows.length} 条匹配` : `共 ${all.length} 条`;
      list.textContent = "";
      if (!rows.length) {
        list.appendChild(el(doc, "p", { class: "askx-paragraph askx-ih-empty", text: all.length ? "没有匹配的记录。" : "还没有保存的提问。" }));
        return;
      }
      for (const r of rows) {
        const body = el(doc, "span", { class: "askx-ih-body", text: r.text });
        const main = el(doc, "div", { class: "askx-ih-main", role: "button", tabindex: "0", title: "展开 / 收起", onclick: () => item.classList.toggle("askx-ih-open") });
        main.appendChild(body);
        const actions = [
          onUse ? el(doc, "button", { type: "button", class: "askx-card-btn", title: "使用", "aria-label": "使用", html: ICONS.cornerDownLeft, onclick: () => onUse(r.text, r.index) }) : null,
          el(doc, "button", { type: "button", class: "askx-card-btn", title: "复制", "aria-label": "复制", html: ICONS.copy, onclick: () => {
            try {
              void doc.defaultView.navigator.clipboard.writeText(r.text);
            } catch {
            }
          } }),
          el(doc, "button", { type: "button", class: "askx-card-btn", title: "删除", "aria-label": "删除", html: ICONS.trash, onclick: () => {
            removeEntry(r.index);
            render4();
          } })
        ];
        const item = el(doc, "div", { class: "askx-ih-item" }, [
          el(doc, "span", { class: "askx-ih-index", text: String(r.index + 1) }),
          main,
          el(doc, "div", { class: "askx-ih-actions" }, actions)
        ]);
        list.appendChild(item);
      }
    };
    search.addEventListener("input", render4);
    root.append(search, el(doc, "div", { class: "askx-ih-meta" }, [count, clear3]), list);
    render4();
    return root;
  }
  function openPicker(doc) {
    const area = field2;
    doc.querySelector(".askx-layer")?.remove();
    const layer = el(doc, "div", { class: "askx-layer", "data-theme": pageTheme(doc) });
    const close = () => {
      layer.remove();
      doc.removeEventListener("keydown", onKey2, true);
    };
    const onKey2 = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      const modals = layer.querySelectorAll("[data-askx-modal]");
      if (modals.length > 1) modals[modals.length - 1].remove();
      else close();
    };
    const use = (text, index2) => {
      close();
      if (!area?.isConnected) return;
      if (cursor < 0) draft = readValue(area);
      cursor = index2;
      setText(area, text, false);
      area.focus();
      showHud(area, `${index2 + 1} / ${entries().length}`);
    };
    const dialog = el(doc, "div", { class: "askx-dialog", role: "dialog", "aria-modal": "true", "aria-label": "输入历史" }, [
      el(doc, "button", { type: "button", class: "askx-icon-btn askx-dialog-close", "aria-label": "关闭", title: "关闭", html: ICONS.close, onclick: close }),
      el(doc, "div", { class: "askx-dialog-header" }, [
        el(doc, "h2", { class: "askx-dialog-title", text: "输入历史" }),
        el(doc, "p", { class: "askx-dialog-desc", text: "点一条展开全文，点“使用”放回输入框。" })
      ]),
      el(doc, "div", { class: "askx-separator", role: "separator" }),
      historyPanel(doc, layer, { onUse: use })
    ]);
    const box = el(doc, "div", { class: "askx-overlay", "data-askx-modal": "", onmousedown: (e) => {
      if (e.target === box) close();
    } }, [dialog]);
    layer.appendChild(box);
    layer.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") e.stopPropagation();
    });
    doc.body.appendChild(layer);
    doc.addEventListener("keydown", onKey2, true);
  }
  var CSS3 = `
.${HUD} { position: fixed; z-index: 2147483000; min-width: 56px; padding: 2px 10px; border: 1px solid rgba(113, 118, 123, 0.5); border-radius: 9999px;
  background: rgba(0, 0, 0, 0.85); color: #e7e9ea; font: 500 12px/18px TwitterChirp, -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; text-align: center; }
.${HUD}[data-theme="light"] { background: rgba(255, 255, 255, 0.92); color: #0f1419; }
.${HUD}:hover { border-color: #1d9bf0; }
.askx-ih-panel { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.askx-ih-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.askx-ih-list { display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto; }
.askx-ih-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 4px 6px 8px; border-radius: 10px; }
.askx-ih-item:hover { background: var(--askx-d-hover); }
.askx-ih-index { flex: 0 0 auto; min-width: 20px; color: var(--askx-d-muted); font-size: 12px; line-height: 20px; text-align: right; }
.askx-ih-main { flex: 1 1 auto; min-width: 0; cursor: pointer; }
.askx-ih-body { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 20px; }
.askx-ih-open .askx-ih-body { display: block; -webkit-line-clamp: unset; }
.askx-ih-actions { display: flex; flex: 0 0 auto; gap: 2px; }
.askx-ih-empty { color: var(--askx-d-muted); }
`;
  var inputHistory_default = definePlugin({
    name: "InputHistory",
    description: "在 Grok 输入框里用 ↑ ↓ 调出以前发过的提问，像终端一样；Esc 恢复草稿，点计数可以搜索和挑选历史（移植自 void++）。",
    icon: ICONS.history,
    tags: ["composer"],
    enabledByDefault: true,
    settings: settings11,
    start() {
      const doc = app.doc;
      if (!doc.getElementById(STYLE_ID11)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID11;
        style.textContent = CSS3;
        (doc.head || doc.documentElement).appendChild(style);
      }
      doc.addEventListener("keydown", onKeyDown2, true);
      doc.addEventListener("input", onInput2, true);
      doc.addEventListener("click", onClick4, true);
      doc.addEventListener("focusout", onFocusOut, true);
    },
    stop() {
      const doc = app.doc;
      doc.removeEventListener("keydown", onKeyDown2, true);
      doc.removeEventListener("input", onInput2, true);
      doc.removeEventListener("click", onClick4, true);
      doc.removeEventListener("focusout", onFocusOut, true);
      stopBrowsing();
      doc.getElementById(STYLE_ID11)?.remove();
    }
  });

  // src/messageKeys.js
  var onlyUserFn = () => false;
  var overDrawer = false;
  var last = { root: null, idx: -1, at: 0 };
  function onPointer(event) {
    const drawer = getDrawer(app.doc);
    overDrawer = Boolean(drawer && event.target instanceof app.doc.defaultView.Node && drawer.contains(event.target));
  }
  function targetRoot(doc = app.doc) {
    const roots3 = grokRoots(doc);
    const drawer = getDrawer(doc);
    const inDrawer = roots3.find((r) => r === drawer);
    if (inDrawer && (overDrawer || drawer.contains(doc.activeElement))) return inDrawer;
    if (onGrokPage(doc)) return roots3.find((r) => r !== drawer) || null;
    return null;
  }
  function step2(root, key, { meta = false, onlyUser = onlyUserFn() } = {}) {
    const all = getMessages(root);
    const messages = onlyUser ? all.filter((m) => m.role === "user") : all;
    if (!messages.length) return -1;
    if (meta) {
      const scroller = scrollerOf(messages[0].el);
      const top = key === "ArrowUp" ? 0 : scroller.scrollHeight;
      try {
        scroller.scrollTo({ top, behavior: "smooth" });
      } catch {
        scroller.scrollTop = top;
      }
      return key === "ArrowUp" ? 0 : messages.length - 1;
    }
    let idx;
    if (key === "Home") idx = 0;
    else if (key === "End") idx = messages.length - 1;
    else {
      const scroller = scrollerOf(messages[0].el);
      const recent2 = last.root === root && Date.now() - last.at < 700 && last.idx < messages.length;
      const current2 = recent2 ? last.idx : activeIndex(messages, scroller);
      const head = messages[current2].el.getBoundingClientRect().top;
      const viewTop = scroller === app.doc.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
      if (key === "ArrowUp") idx = !recent2 && head < viewTop - 8 ? current2 : current2 - 1;
      else idx = current2 + 1;
    }
    idx = Math.max(0, Math.min(messages.length - 1, idx));
    jumpTo(messages[idx], { effect: "none" });
    last = { root, idx, at: Date.now() };
    return idx;
  }
  function onKeyDown3(event) {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    if (event.altKey || event.shiftKey) return;
    if (isTypingTarget(event.target) || isTypingTarget(app.doc.activeElement)) return;
    if (event.target.closest?.('.askx-layer, [role="menu"], [role="listbox"], [role="dialog"]')) return;
    const root = targetRoot();
    if (!root) return;
    const meta = (event.metaKey || event.ctrlKey) && (event.key === "ArrowUp" || event.key === "ArrowDown");
    if ((event.metaKey || event.ctrlKey) && !meta) return;
    if (step2(root, event.key, { meta }) < 0) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function startMessageKeys(onlyUser = () => false) {
    onlyUserFn = onlyUser;
    app.doc.addEventListener("keydown", onKeyDown3, true);
    app.doc.addEventListener("pointerover", onPointer, true);
  }
  function stopMessageKeys() {
    app.doc.removeEventListener("keydown", onKeyDown3, true);
    app.doc.removeEventListener("pointerover", onPointer, true);
    overDrawer = false;
  }

  // src/plugins/messageNavigator.js
  var RAIL = "askx-msgnav";
  var STYLE_ID12 = "askx-nav-style";
  var settings12 = definePluginSettings({
    showAssistant: {
      type: OptionType.BOOLEAN,
      label: "包含 Grok 的回复",
      description: "导航里同时列出 Grok 的回复，而不只是你的消息。",
      default: true
    },
    jumpEffect: {
      type: OptionType.SELECT,
      label: "跳转效果",
      description: "跳到某条消息后是否高亮它。",
      options: [
        { value: "border", label: "高亮边框" },
        { value: "none", label: "无" }
      ],
      default: "border"
    }
  });
  var rails = /* @__PURE__ */ new Map();
  var observer6 = null;
  var schedule5 = null;
  var reposition = null;
  var stopTheme = null;
  var theme = "dark";
  function navMessages(root) {
    const all = getMessages(root);
    return settings12.store.showAssistant ? all : all.filter((m) => m.role === "user");
  }
  function makeRail(doc, root) {
    const rail = doc.createElement("div");
    rail.className = RAIL;
    rail.dataset.theme = theme;
    rail.dataset.surface = root.matches(DRAWER) ? "drawer" : "page";
    const ticks = doc.createElement("div");
    ticks.className = `${RAIL}-ticks`;
    const panel = doc.createElement("div");
    panel.className = `${RAIL}-menu`;
    const meta = doc.createElement("div");
    meta.className = `${RAIL}-meta`;
    const list = doc.createElement("ul");
    list.className = `${RAIL}-list`;
    list.setAttribute("aria-label", "消息导航");
    panel.append(meta, list);
    rail.append(panel, ticks);
    const entry = { rail, ticks, panel, meta, list, items: [], key: "" };
    const jump = (i) => {
      const m = entry.items[i];
      if (m) jumpTo(m, { effect: settings12.store.jumpEffect });
    };
    rail.addEventListener("click", (event) => {
      const hit = event.target.closest("[data-index]");
      if (!hit) return;
      event.preventDefault();
      jump(Number(hit.dataset.index));
    });
    doc.body.appendChild(rail);
    return entry;
  }
  function render2(doc, entry, items) {
    const key = items.map((m) => `${m.role}:${m.text}`).join("\n");
    entry.items = items;
    if (key === entry.key) return;
    entry.key = key;
    entry.ticks.textContent = "";
    entry.list.textContent = "";
    entry.ticks.classList.toggle(`${RAIL}-dense`, items.length > 16);
    items.forEach((m, i) => {
      const tick2 = doc.createElement("button");
      tick2.type = "button";
      tick2.className = `${RAIL}-tick ${RAIL}-tick-${m.role === "user" ? "user" : "asst"}`;
      tick2.dataset.index = String(i);
      tick2.setAttribute("aria-label", `跳到第 ${i + 1} 条，共 ${items.length} 条`);
      entry.ticks.appendChild(tick2);
      const li = doc.createElement("li");
      const line = doc.createElement("button");
      line.type = "button";
      line.className = `${RAIL}-item`;
      line.dataset.index = String(i);
      const emoji = doc.createElement("span");
      emoji.className = `${RAIL}-emoji`;
      emoji.textContent = m.role === "user" ? "❓" : "🤖";
      const label3 = doc.createElement("span");
      label3.className = `${RAIL}-label`;
      label3.textContent = m.text || "（无文字）";
      line.append(emoji, label3);
      li.appendChild(line);
      entry.list.appendChild(li);
    });
  }
  function place(entry, root) {
    const items = entry.items;
    const scroller = items[0] ? scrollerOf(items[0].el) : null;
    if (!scroller || items.length < 2) {
      entry.rail.hidden = true;
      return;
    }
    const view = root.ownerDocument.defaultView;
    const box = root.getBoundingClientRect();
    const { top, bottom } = viewportOf(scroller);
    const list = items[0].el.parentElement.getBoundingClientRect();
    const right = entry.rail.dataset.surface === "drawer" ? box.right - 4 : list.right + 28;
    const listRight = Math.min(right, view.innerWidth - 4);
    const height = Math.max(0, Math.min(bottom, box.bottom) - Math.max(top, box.top));
    if (height < 80) {
      entry.rail.hidden = true;
      return;
    }
    entry.rail.hidden = false;
    const railTop = Math.round(Math.max(top, box.top));
    entry.rail.style.top = `${railTop}px`;
    entry.rail.style.height = `${Math.round(height)}px`;
    entry.rail.style.left = `${Math.round(listRight - 40)}px`;
    if (overlaidAt(root.ownerDocument, root, listRight - 8, railTop + height / 2, entry.rail)) {
      entry.rail.hidden = true;
      return;
    }
    const active = activeIndex(items, scroller);
    for (const node2 of entry.ticks.children) node2.classList.toggle(`${RAIL}-current`, Number(node2.dataset.index) === active);
    for (const node2 of entry.list.querySelectorAll("[data-index]")) node2.classList.toggle(`${RAIL}-active`, Number(node2.dataset.index) === active);
    const text = `${active + 1} / ${items.length}`;
    if (entry.meta.textContent !== text) entry.meta.textContent = text;
  }
  function placeAll() {
    for (const [root, entry] of rails) if (!entry.rail.hidden || entry.items.length) place(entry, root);
  }
  function refresh(doc = app.doc) {
    const roots3 = new Set(grokRoots(doc));
    for (const [root, entry] of rails) {
      if (!roots3.has(root) || !root.isConnected) {
        entry.rail.remove();
        rails.delete(root);
      }
    }
    for (const root of roots3) {
      const items = navMessages(root);
      let entry = rails.get(root);
      if (!items.length) {
        if (entry) entry.rail.hidden = true;
        continue;
      }
      if (!entry) {
        entry = makeRail(doc, root);
        rails.set(root, entry);
      }
      entry.rail.dataset.theme = theme;
      render2(doc, entry, items);
      place(entry, root);
    }
    return rails.size;
  }
  var CSS4 = `
.${RAIL} { position: fixed; z-index: 2147483000; width: 40px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; pointer-events: none; box-sizing: border-box;
  --nav-fg: #e7e9ea; --nav-fg2: #a3a7ab; --nav-fg3: rgba(113, 118, 123, 0.5); --nav-surface: #16181c; --nav-border: #2f3336; --nav-hover: rgba(255, 255, 255, 0.08);
  font: 400 14px/1.4 TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; letter-spacing: -0.2px; }
.${RAIL}[data-theme="light"] { --nav-fg: #0f1419; --nav-fg2: #536471; --nav-fg3: rgba(83, 100, 113, 0.5); --nav-surface: #fff; --nav-border: #eff3f4; --nav-hover: rgba(15, 20, 25, 0.06); }
.${RAIL}[hidden] { display: none; }
.${RAIL} *, .${RAIL} *::before, .${RAIL} *::after { box-sizing: border-box; }
.${RAIL}-ticks { display: flex; flex-direction: column; align-items: flex-end; flex: 0 0 auto; max-height: 100%; overflow: hidden; pointer-events: auto; scrollbar-width: none; }
.${RAIL}-tick { display: flex; align-items: center; justify-content: flex-end; width: 40px; flex: 0 0 auto; height: 12px; padding: 0 4px; margin: 0; border: 0; background: transparent; cursor: pointer; }
.${RAIL}-dense .${RAIL}-tick { height: 7.2px; }
.${RAIL}-tick::after { content: ""; display: block; height: 1px; width: 6px; border-radius: 9999px; background: var(--nav-fg3); transition: width 0.15s ease, background-color 0.15s ease, opacity 0.15s ease; }
.${RAIL}-tick-asst::after { width: 12px; }
.${RAIL}-tick.${RAIL}-current::after { width: 16px; background: var(--nav-fg); opacity: 1; }
.${RAIL}-tick:focus-visible { outline: none; }
.${RAIL}-tick:focus-visible::after { background: var(--nav-fg); }
.${RAIL}-menu { pointer-events: auto; position: absolute; top: 50%; right: calc(100% + 4px); z-index: 50; width: min(288px, 70vw); max-height: 100%; overflow: auto; padding: 6px;
  border: 1px solid var(--nav-border); border-radius: 20px; background: var(--nav-surface); color: var(--nav-fg);
  opacity: 0; visibility: hidden; transform: translate(8px, -50%); transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease; scrollbar-width: thin; }
.${RAIL}:hover .${RAIL}-menu, .${RAIL}:focus-within .${RAIL}-menu { opacity: 1; visibility: visible; transform: translate(0, -50%); }
.${RAIL}-meta { padding: 4px 10px 6px; color: var(--nav-fg2); font-size: 12px; line-height: 1.4; }
.${RAIL}-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.${RAIL}-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 6.4px 8px; margin: 0; border: 1px solid transparent; border-radius: 12px; background: transparent;
  color: var(--nav-fg2); font: inherit; text-align: start; cursor: pointer; }
.${RAIL}-item:hover, .${RAIL}-item:focus-visible { background: var(--nav-hover); color: var(--nav-fg); outline: none; }
.${RAIL}-item.${RAIL}-active { background: transparent; color: var(--nav-fg); border-color: var(--nav-border); }
.${RAIL}-item.${RAIL}-active:hover, .${RAIL}-item.${RAIL}-active:focus-visible { background: var(--nav-hover); }
.${RAIL}-emoji { flex: none; font-size: 16px; line-height: 1; }
.${RAIL}-label { overflow: hidden; min-width: 0; text-overflow: ellipsis; white-space: nowrap; }
[data-askx-flash] { outline: 2px solid currentColor; outline-offset: 4px; border-radius: 12px; }
@media (prefers-reduced-motion: reduce) { .${RAIL}-menu, .${RAIL}-tick::after { transition: none; } }
`;
  function onScroll() {
    reposition?.();
  }
  var messageNavigator_default = definePlugin({
    name: "MessageNavigator",
    description: "在 Grok 对话右侧加一条消息导航：每条消息一个刻度，正在看的那条高亮；鼠标移上去展开整段对话的目录，点一下跳过去。不在输入时，↑ ↓ 切换消息，Home / End 跳到首尾（移植自 void++ BetterNavigator）。",
    icon: ICONS.navigator,
    tags: ["navigation", "messages"],
    enabledByDefault: true,
    settings: settings12,
    start() {
      const doc = app.doc;
      const view = doc.defaultView;
      if (!doc.getElementById(STYLE_ID12)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID12;
        style.textContent = CSS4;
        (doc.head || doc.documentElement).appendChild(style);
      }
      stopTheme = watchTheme(doc, (t) => {
        theme = t;
        for (const { rail } of rails.values()) rail.dataset.theme = t;
      });
      schedule5 = timeThrottle(view, () => refresh(doc), 150);
      reposition = frameThrottle(view, placeAll);
      let settle2 = 0;
      observer6 = new view.MutationObserver((records) => {
        if (records.every((r) => r.target.closest?.(`.${RAIL}`))) return;
        if (touchesGrok(records, doc)) schedule5();
        if (touchesLayers(records)) {
          reposition();
          view.clearTimeout(settle2);
          settle2 = view.setTimeout(placeAll, 400);
        }
      });
      observer6.observe(doc.body, { childList: true, subtree: true, characterData: true });
      view.addEventListener("scroll", onScroll, true);
      view.addEventListener("resize", onScroll);
      refresh(doc);
      startMessageKeys(() => !settings12.store.showAssistant);
    },
    onSettingsChange() {
      for (const entry of rails.values()) entry.key = "";
      refresh();
    },
    stop() {
      const view = app.doc.defaultView;
      observer6?.disconnect();
      observer6 = null;
      view.removeEventListener("scroll", onScroll, true);
      view.removeEventListener("resize", onScroll);
      schedule5?.cancel();
      reposition?.cancel();
      stopTheme?.();
      for (const { rail } of rails.values()) rail.remove();
      rails.clear();
      stopMessageKeys();
      app.doc.getElementById(STYLE_ID12)?.remove();
    }
  });

  // src/plugins/modelChips.js
  var MODES = ["Auto", "Fast", "Expert"];
  var icon = (body) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  var MODE_ICONS = {
    Auto: icon('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'),
    Fast: icon('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    Expert: icon('<path d="M15 14c.2-1 .7-1.7 1.5-2.5A4.6 4.6 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>')
  };
  var BAR = "askx-model-chips";
  var STYLE_ID13 = "askx-model-chips-style";
  var HIDE_MENU = "data-askx-hide-model-menu";
  var HIDE_BUTTON = "data-askx-hide-model-button";
  var GAP = 6;
  var settings13 = definePluginSettings({
    Auto: { type: OptionType.BOOLEAN, label: "显示 Auto", description: "固定显示 Auto 按钮。", default: true },
    Fast: { type: OptionType.BOOLEAN, label: "显示 Fast", description: "固定显示 Fast 按钮。", default: true },
    Expert: { type: OptionType.BOOLEAN, label: "显示 Expert", description: "固定显示 Expert 按钮。", default: true },
    hideMenuButton: {
      type: OptionType.BOOLEAN,
      label: "隐藏原模型菜单按钮",
      description: "用快捷按钮替代输入框右侧 X 原来的模型菜单按钮（小窗里放不下两者时更整齐）。",
      default: true
    }
  });
  var CSS5 = `
.${BAR} { position: fixed; z-index: 2147483000; display: flex; gap: 3px; align-items: center; pointer-events: auto; }
.${BAR}[hidden] { display: none !important; }
.${BAR} button { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 9999px; color: var(--chip-fg); background: transparent; cursor: pointer; }
.${BAR} button svg { display: block; pointer-events: none; }
.${BAR} button:hover { background: var(--chip-hover); }
.${BAR} button[aria-pressed="true"] { color: var(--chip-on-fg); background: var(--chip-on-bg); border-color: var(--chip-on-bg); }
.${BAR}[data-theme="dark"] { --chip-fg: #e7e9ea; --chip-line: #3e4144; --chip-hover: rgba(231,233,234,.1); --chip-on-fg: #1d9bf0; --chip-on-bg: rgba(29,155,240,.15); }
.${BAR}[data-theme="light"] { --chip-fg: #0f1419; --chip-line: #cfd9de; --chip-hover: rgba(15,20,25,.08); --chip-on-fg: #1d9bf0; --chip-on-bg: rgba(29,155,240,.12); }
html[${HIDE_MENU}] [role="menu"] { opacity: 0 !important; pointer-events: none !important; }
[${HIDE_BUTTON}="replace"] { visibility: hidden !important; width: var(--askx-chips-w) !important; min-width: 0 !important; padding: 0 !important; border: 0 !important; overflow: hidden !important; }
[${HIDE_BUTTON}="before"] { margin-left: calc(var(--askx-chips-w) + ${GAP}px) !important; }
`;
  function modelButton(root) {
    return [...root.querySelectorAll("button")].find((b) => MODES.includes((b.getAttribute("aria-label") || "").trim())) || null;
  }
  function currentMode(root) {
    return modelButton(root)?.getAttribute("aria-label")?.trim() || "";
  }
  function menuItemFor(menu, mode) {
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    return items.find((i) => (i.textContent || "").trim().startsWith(mode)) || items[MODES.indexOf(mode)] || null;
  }
  var sleep2 = (view, ms) => new Promise((r) => view.setTimeout(r, ms));
  var busy2 = false;
  async function chooseMode(root, mode) {
    const doc = root.ownerDocument;
    const view = doc.defaultView;
    const button = modelButton(root);
    if (!button || busy2 || currentMode(root) === mode) return currentMode(root) === mode;
    busy2 = true;
    doc.documentElement.setAttribute(HIDE_MENU, "");
    try {
      button.click();
      let menu = null;
      for (let i = 0; i < 20 && !menu; i += 1) {
        await sleep2(view, 25);
        menu = doc.querySelector('[role="menu"]');
      }
      const item = menu && menuItemFor(menu, mode);
      if (item) item.click();
      else if (menu) doc.dispatchEvent(new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep2(view, 60);
      return currentMode(root) === mode;
    } finally {
      doc.documentElement.removeAttribute(HIDE_MENU);
      busy2 = false;
    }
  }
  var bar = null;
  function watchLayers(doc) {
    if (layers) return;
    const host = doc.getElementById("layers");
    if (!host) return;
    const view = doc.defaultView;
    const now = frameThrottle(view, () => render3(doc));
    let timer3 = 0;
    layers = new view.MutationObserver(() => {
      now();
      view.clearTimeout(timer3);
      timer3 = view.setTimeout(() => render3(doc), 400);
    });
    layers.observe(host, { childList: true, subtree: true });
    layers.cancel = () => {
      now.cancel();
      view.clearTimeout(timer3);
    };
  }
  function render3(doc) {
    watchLayers(doc);
    const root = grokRoots(doc).find((r) => getComposer(r) && modelButton(r));
    const button = root && modelButton(root);
    const shown2 = MODES.filter((m) => settings13.store[m]);
    const giveBack = () => {
      if (bar) bar.hidden = true;
      for (const el2 of doc.querySelectorAll(`[${HIDE_BUTTON}]`)) {
        el2.removeAttribute(HIDE_BUTTON);
        el2.style.removeProperty("--askx-chips-w");
      }
    };
    if (!button || !shown2.length) {
      giveBack();
      return;
    }
    if (!bar) {
      bar = doc.createElement("div");
      bar.className = BAR;
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", "Grok 模型");
      bar.addEventListener("mousedown", (e) => e.preventDefault());
      doc.body.appendChild(bar);
    }
    bar.dataset.theme = pageTheme(doc);
    if (bar.dataset.modes !== shown2.join()) {
      bar.dataset.modes = shown2.join();
      bar.textContent = "";
      for (const mode2 of shown2) {
        const chip = doc.createElement("button");
        chip.type = "button";
        chip.innerHTML = MODE_ICONS[mode2];
        chip.dataset.mode = mode2;
        chip.title = mode2;
        chip.setAttribute("aria-label", mode2);
        chip.addEventListener("click", () => {
          const r = grokRoots(doc).find((x) => modelButton(x));
          if (r) void chooseMode(r, mode2).then(() => render3(doc));
        });
        bar.appendChild(chip);
      }
    }
    const now = currentMode(root);
    for (const chip of bar.children) chip.setAttribute("aria-pressed", String(chip.dataset.mode === now));
    bar.hidden = false;
    const width = bar.offsetWidth;
    const mode = settings13.store.hideMenuButton ? "replace" : "before";
    if (button.getAttribute(HIDE_BUTTON) !== mode) button.setAttribute(HIDE_BUTTON, mode);
    if (button.style.getPropertyValue("--askx-chips-w") !== `${width}px`) button.style.setProperty("--askx-chips-w", `${width}px`);
    const own = button.getBoundingClientRect();
    if (!own.width || !own.height) {
      giveBack();
      return;
    }
    const right = mode === "replace" ? own.right : own.left - GAP;
    const left = Math.round(right - width);
    const top = Math.round(own.top + own.height / 2 - bar.offsetHeight / 2);
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
    bar.hidden = isCovered(doc, root, left + bar.offsetWidth / 2, top + bar.offsetHeight / 2);
  }
  function isCovered(doc, root, x, y) {
    if (typeof doc.elementsFromPoint !== "function") return false;
    const hit = doc.elementsFromPoint(x, y).find((el2) => !el2.closest(`.${BAR}`));
    return Boolean(hit) && !root.contains(hit);
  }
  var stop6 = null;
  var onScroll2 = null;
  var layers = null;
  var modelChips_default = definePlugin({
    name: "ModelChips",
    description: "在 Grok 输入框里放 Auto / Fast / Expert 图标按钮（悬停显示名称），一点就切换模型，不用每次打开模型菜单；可选隐藏原菜单按钮（移植自 void++）。",
    icon: ICONS.zap,
    tags: ["composer"],
    enabledByDefault: true,
    settings: settings13,
    start() {
      const doc = app.doc;
      addStyle(doc, STYLE_ID13, CSS5);
      stop6 = watchGrok(doc, render3);
      onScroll2 = () => render3(doc);
      doc.defaultView.addEventListener("resize", onScroll2);
      doc.addEventListener("scroll", onScroll2, { capture: true, passive: true });
      render3(doc);
    },
    onSettingsChange: () => render3(app.doc),
    stop() {
      const doc = app.doc;
      stop6?.();
      stop6 = null;
      doc.defaultView.removeEventListener("resize", onScroll2);
      doc.removeEventListener("scroll", onScroll2, { capture: true });
      layers?.disconnect();
      layers?.cancel();
      layers = null;
      bar?.remove();
      bar = null;
      for (const el2 of doc.querySelectorAll(`[${HIDE_BUTTON}]`)) {
        el2.removeAttribute(HIDE_BUTTON);
        el2.style.removeProperty("--askx-chips-w");
      }
      doc.getElementById(STYLE_ID13)?.remove();
    }
  });

  // src/plugins/responseNotification.js
  var settings14 = definePluginSettings({
    sound: {
      type: OptionType.BOOLEAN,
      label: "提示音",
      description: "回复结束时播放提示音。",
      default: true
    },
    soundUrl: {
      type: OptionType.STRING,
      allowEmpty: true,
      label: "自定义提示音",
      description: "音频地址（https 或 data URL）。留空使用内置提示音。",
      placeholder: "https://example.com/done.mp3",
      default: ""
    },
    preview: {
      type: OptionType.COMPONENT,
      label: "试听",
      description: "播放一次当前的提示音。",
      component: (doc) => el(doc, "button", { type: "button", class: "askx-button askx-button-secondary", text: "试听", onclick: () => {
        unlock();
        void playSound();
      } })
    },
    browserNotification: {
      type: OptionType.BOOLEAN,
      label: "系统通知",
      description: "回复结束时弹出系统通知，点通知回到 X 并展开 Grok 小窗。",
      default: true
    },
    toast: {
      type: OptionType.BOOLEAN,
      label: "页面提示",
      description: "页面可见但 Grok 小窗收起时，在页面底部提示“Grok 回复完成”，点一下展开小窗。",
      default: true
    },
    onlyWhenAway: {
      type: OptionType.BOOLEAN,
      label: "仅在看不到回复时提醒",
      description: "标签页在后台或小窗已收起时才响铃和弹通知。",
      default: true
    }
  });
  var ctx = null;
  var off2 = null;
  var buffers = /* @__PURE__ */ new Map();
  function audio() {
    const view = app.doc.defaultView;
    const Ctx = view.AudioContext || view.webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx || ctx.state === "closed") {
      try {
        ctx = new Ctx();
      } catch {
        ctx = null;
      }
    }
    return ctx;
  }
  function unlock() {
    const c = audio();
    if (c && c.state === "suspended") void c.resume().catch(() => {
    });
  }
  function chime(c) {
    const now = c.currentTime;
    [[880, 0], [1318.5, 0.12]].forEach(([freq, at]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(1e-4, now + at);
      gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(1e-4, now + at + 0.6);
      osc.connect(gain).connect(c.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.65);
    });
  }
  function fetchBytes(url) {
    if (url.startsWith("data:")) {
      const bin = atob(url.slice(url.indexOf(",") + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return Promise.resolve(bytes.buffer);
    }
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("no GM_xmlhttpRequest"));
        return;
      }
      GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType: "arraybuffer",
        timeout: 15e3,
        onload: (r) => r.status >= 200 && r.status < 300 ? resolve(r.response) : reject(new Error(`HTTP ${r.status}`)),
        onerror: () => reject(new Error("network")),
        ontimeout: () => reject(new Error("timeout"))
      });
    });
  }
  async function playSound() {
    const c = audio();
    if (!c) return false;
    if (c.state === "suspended") {
      try {
        await c.resume();
      } catch {
      }
    }
    const url = settings14.store.soundUrl.trim();
    if (!url) {
      chime(c);
      return true;
    }
    try {
      let buf = buffers.get(url);
      if (!buf) {
        buf = await c.decodeAudioData((await fetchBytes(url)).slice(0));
        buffers.set(url, buf);
      }
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = 0.5;
      src.buffer = buf;
      src.connect(gain).connect(c.destination);
      src.start();
    } catch (error) {
      console.info("[Ask X] custom sound failed, using the built-in chime", error);
      chime(c);
    }
    return true;
  }
  var reveal = () => {
    try {
      app.doc.defaultView.focus();
    } catch {
    }
    void openDrawer(app.doc);
  };
  function isAway(doc = app.doc) {
    if (doc.hidden || doc.visibilityState === "hidden") return true;
    return !onGrokPage(doc) && !isDrawerOpen(doc);
  }
  function onStreamEnd(detail, doc = app.doc) {
    if (detail.phase !== "end" || detail.ok === false || detail.cancelled) return null;
    const away = isAway(doc);
    const done = { sound: false, notification: false, toast: false };
    const extra = toastOptions(doc);
    if (settings14.store.toast && away && (!doc.hidden || extra?.whileHidden)) {
      const toast = showToast("Grok 回复完成，点这里查看。", "info", doc, { ...extra || {}, onClick: reveal });
      toast.dataset.replyDone = "";
      done.toast = true;
    }
    if (settings14.store.onlyWhenAway && !away) return done;
    if (settings14.store.sound) {
      void playSound();
      done.sound = true;
    }
    if (settings14.store.browserNotification && typeof GM_notification === "function") {
      GM_notification({ title: "Grok", text: "回复完成。", silent: true, onclick: reveal });
      done.notification = true;
    }
    return done;
  }
  var responseNotification_default = definePlugin({
    name: "ResponseNotification",
    description: "Grok 回复结束时提醒你：提示音、系统通知，小窗收起时还有页面提示（移植自 void++）。",
    icon: ICONS.bellRing,
    tags: ["notifications"],
    enabledByDefault: true,
    settings: settings14,
    start() {
      const doc = app.doc;
      doc.addEventListener("pointerdown", unlock, true);
      doc.addEventListener("keydown", unlock, true);
      off2 = watchStreams(doc, (detail) => onStreamEnd(detail, doc));
    },
    stop() {
      off2?.();
      off2 = null;
      app.doc.removeEventListener("pointerdown", unlock, true);
      app.doc.removeEventListener("keydown", unlock, true);
    }
  });

  // src/plugins/statusBadge.js
  var BADGE = "askx-status-dot";
  var STYLE_ID14 = "askx-badge-style";
  var settings15 = definePluginSettings({
    showStreaming: {
      type: OptionType.BOOLEAN,
      label: "回复中",
      description: "Grok 正在回复时显示闪动的蓝点。",
      default: true
    },
    showDone: {
      type: OptionType.BOOLEAN,
      label: "有新回复",
      description: "回复完成后显示绿点，直到你展开小窗。",
      default: true
    },
    showError: {
      type: OptionType.BOOLEAN,
      label: "出错",
      description: "回复失败时显示红点。",
      default: true
    }
  });
  var state = "idle";
  var startedAt = 0;
  var SHOW_UP_MS = 8e3;
  var off3 = null;
  var observer7 = null;
  var schedule6 = null;
  function visibleState(s = state, opts = settings15.store) {
    if (s === "streaming" && opts.showStreaming) return "streaming";
    if (s === "done" && opts.showDone) return "done";
    if (s === "error" && opts.showError) return "error";
    return "";
  }
  function paint5(doc = app.doc) {
    const drawer = getDrawer(doc);
    const open2 = isDrawerOpen(doc);
    if (open2 && (state === "done" || state === "error")) state = "idle";
    if (open2 && state === "streaming" && drawer && Date.now() - startedAt > SHOW_UP_MS && !getMessages(drawer).length) {
      state = "idle";
      cancelAll();
    }
    const show = drawer && !open2 && !tintsButton() ? visibleState() : "";
    let badge2 = drawer?.querySelector(`:scope > .${BADGE}`);
    for (const stray of doc.querySelectorAll(`.${BADGE}`)) if (stray !== badge2) stray.remove();
    if (!show) {
      badge2?.remove();
      return "";
    }
    if (!badge2) {
      badge2 = doc.createElement("span");
      badge2.className = BADGE;
      badge2.setAttribute("aria-hidden", "true");
      drawer.appendChild(badge2);
    }
    if (badge2.dataset.state !== show) badge2.dataset.state = show;
    badge2.title = { streaming: "Grok 正在回复", done: "Grok 回复完成", error: "Grok 回复失败" }[show];
    return show;
  }
  function onStream2(detail, doc = app.doc) {
    if (detail.phase === "start") {
      state = "streaming";
      startedAt = Date.now();
    } else if (detail.cancelled) state = "idle";
    else if (!isStreaming()) state = detail.ok === false ? "error" : isDrawerOpen(doc) ? "idle" : "done";
    paint5(doc);
  }
  var CSS6 = `
.${BADGE} { position: absolute !important; top: 6px; right: 6px; display: block !important; box-sizing: border-box !important; width: 10px !important; height: 10px !important; min-width: 0 !important; padding: 0 !important; margin: 0 !important; flex: none !important; border-radius: 50%; z-index: 2; pointer-events: none; box-shadow: 0 0 0 2px var(--askx-badge-ring, #000); }
.${BADGE}[data-state="streaming"] { background: #1d9bf0; animation: askx-badge-pulse 1.2s ease-in-out infinite; }
.${BADGE}[data-state="done"] { background: #00ba7c; }
.${BADGE}[data-state="error"] { background: #f4212e; }
@keyframes askx-badge-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.8); } }
@media (prefers-reduced-motion: reduce) { .${BADGE}[data-state="streaming"] { animation: none; } }
`;
  var statusBadge_default = definePlugin({
    name: "StatusBadge",
    description: "Grok 小窗收起时，在小窗按钮右上角用圆点显示状态：蓝点闪动表示正在回复，绿点表示有新回复，红点表示出错。GrokState 的“Grok 按钮变色”开启时不显示，两者只用其一。",
    icon: ICONS.badge,
    tags: ["notifications"],
    enabledByDefault: true,
    settings: settings15,
    start() {
      const doc = app.doc;
      if (!doc.getElementById(STYLE_ID14)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID14;
        style.textContent = CSS6;
        (doc.head || doc.documentElement).appendChild(style);
      }
      state = isStreaming() ? "streaming" : "idle";
      schedule6 = timeThrottle(doc.defaultView, () => paint5(doc), 100);
      off3 = watchStreams(doc, (detail) => onStream2(detail, doc));
      observer7 = new doc.defaultView.MutationObserver((records) => {
        if (touchesGrok(records, doc)) schedule6();
      });
      observer7.observe(doc.body, { childList: true, subtree: true });
      paint5(doc);
    },
    onSettingsChange: () => paint5(),
    stop() {
      off3?.();
      off3 = null;
      observer7?.disconnect();
      observer7 = null;
      schedule6?.cancel();
      for (const badge2 of app.doc.querySelectorAll(`.${BADGE}`)) badge2.remove();
      app.doc.getElementById(STYLE_ID14)?.remove();
    }
  });

  // src/plugins/incognito.js
  var LABEL_MARK = "data-askx-private-label";
  var STYLE_ID15 = "askx-private-compact";
  var settings16 = definePluginSettings({
    icon: {
      type: OptionType.SELECT,
      label: "按钮图标",
      description: "划词工具条上无痕按钮用哪个图标。",
      options: [
        { value: "native", label: "X 原生" },
        { value: "askx", label: "Ask X" }
      ],
      default: "native"
    },
    compactBadge: {
      type: OptionType.BOOLEAN,
      label: "输入框无痕标记只显示图标",
      description: "Private Chat 时，Grok 输入框里的“Private”标记只留幽灵图标，悬停显示文字。关闭则保留文字。",
      default: true
    }
  });
  function findPrivateLabels(root) {
    const box = findComposerBox(root);
    if (!box) return [];
    const out = [];
    for (const span of box.querySelectorAll("span")) {
      const text = span.textContent.trim();
      if (!text || text.length > 16 || span.childElementCount || span.closest('button, [role="button"], textarea')) continue;
      const badge2 = span.parentElement?.parentElement;
      if (badge2 && box.contains(badge2) && badge2.querySelector("svg") && !badge2.querySelector("button")) out.push({ span, badge: badge2, text });
    }
    return out;
  }
  function compact(doc) {
    const on2 = settings16.store.compactBadge;
    const kept = /* @__PURE__ */ new Set();
    for (const root of grokRoots(doc)) {
      for (const { span, badge: badge2, text } of findPrivateLabels(root)) {
        if (on2) {
          kept.add(span);
          if (!span.hasAttribute(LABEL_MARK)) span.setAttribute(LABEL_MARK, "");
          if (badge2.getAttribute("title") !== text) badge2.setAttribute("title", text);
        } else if (span.hasAttribute(LABEL_MARK)) {
          badge2.removeAttribute("title");
        }
      }
    }
    for (const el2 of doc.querySelectorAll(`[${LABEL_MARK}]`)) if (!kept.has(el2)) el2.removeAttribute(LABEL_MARK);
  }
  var stopWatch2 = null;
  var incognito_default = definePlugin({
    name: "Incognito",
    description: "划词工具条上的幽灵按钮：用 Grok 的 Private Chat（无痕）新对话提问。普通提问时会先关掉小窗里残留的无痕。输入框里的“Private”标记默认只显示图标。",
    icon: ICONS.ghost,
    tags: ["privacy"],
    enabledByDefault: true,
    settings: settings16,
    askOrder: 20,
    toolbarButtons: () => [{
      id: "private",
      label: "无痕问 Grok",
      icon: settings16.store.icon === "askx" ? ICONS.ghost : ICONS.ghostNative,
      className: "askx-ghost",
      order: 10
    }],
    onAsk(ctx2) {
      ctx2.plan.privateMode = ctx2.trigger.id === "private" ? "on" : "off";
    },
    start() {
      addStyle(app.doc, STYLE_ID15, `[${LABEL_MARK}]{display:none!important}`);
      stopWatch2 = watchGrok(app.doc, compact);
    },
    onSettingsChange: () => compact(app.doc),
    stop() {
      stopWatch2?.();
      stopWatch2 = null;
      app.doc.getElementById(STYLE_ID15)?.remove();
      for (const el2 of app.doc.querySelectorAll(`[${LABEL_MARK}]`)) el2.removeAttribute(LABEL_MARK);
    }
  });

  // src/plugins/menuCommands.js
  var ids = [];
  var menuCommands_default = definePlugin({
    name: "MenuCommands",
    description: "在脚本管理器菜单里加“问 Grok（当前划词）”和“无痕问 Grok（当前划词）”，不用工具条也能提问。",
    icon: ICONS.command,
    tags: ["navigation"],
    enabledByDefault: true,
    start() {
      if (typeof GM_registerMenuCommand !== "function") return;
      const run = (trigger) => () => {
        const selection = currentSelection(app.doc.defaultView);
        void ask(selection || { text: "" }, trigger);
      };
      ids = [
        GM_registerMenuCommand("问 Grok（当前划词）", run({ id: "ask" })),
        GM_registerMenuCommand("无痕问 Grok（当前划词）", run({ id: "private" }))
      ];
    },
    stop() {
      if (typeof GM_unregisterMenuCommand === "function") ids.forEach((id) => GM_unregisterMenuCommand(id));
      ids = [];
    }
  });

  // src/plugins/newChat.js
  var newChat_default = definePlugin({
    name: "NewChat",
    description: "每次提问前先点 Grok 小窗的 New Chat，在新对话里问，不接着旧对话。输入框里没发的草稿会带到新对话。",
    icon: ICONS.newChat,
    tags: ["chats"],
    enabledByDefault: true,
    askOrder: 10,
    onAsk(ctx2) {
      ctx2.plan.newChat = true;
    }
  });

  // src/plugins/noGrokComLink.js
  var MARK6 = "data-askx-hidden-grokcom";
  var STYLE_ID16 = "askx-no-grokcom";
  var LINK_TEXT = /grok\.com/i;
  function divider(item) {
    const prev = item.previousElementSibling;
    return prev && !prev.childElementCount && !prev.textContent.trim() ? prev : null;
  }
  function hideIn(root) {
    let count = 0;
    for (const item of root.querySelectorAll('[role="menu"] [role="menuitem"]')) {
      if (item.hasAttribute(MARK6) || !LINK_TEXT.test(item.textContent || "")) continue;
      item.setAttribute(MARK6, "");
      divider(item)?.setAttribute(MARK6, "");
      count += 1;
    }
    return count;
  }
  var observer8 = null;
  var noGrokComLink_default = definePlugin({
    name: "NoGrokComLink",
    description: "隐藏 Grok 模型菜单（Auto / Fast / Expert）最下面的 “Go to grok.com” 和它上面的分隔线，其余选项不变。",
    icon: ICONS.linkOff,
    tags: ["declutter"],
    enabledByDefault: true,
    start() {
      const doc = app.doc;
      if (!doc.getElementById(STYLE_ID16)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID16;
        style.textContent = `[${MARK6}]{display:none!important}`;
        (doc.head || doc.documentElement).appendChild(style);
      }
      hideIn(doc);
      observer8 = new doc.defaultView.MutationObserver((records) => {
        for (const record of records) {
          for (const node2 of record.addedNodes) {
            if (node2.nodeType !== 1) continue;
            const menu = node2.closest('[role="menu"]');
            if (menu) hideIn(menu.parentElement || menu);
            else if (node2.querySelector('[role="menu"]')) hideIn(node2);
          }
        }
      });
      observer8.observe(doc.getElementById("layers") || doc.body, { childList: true, subtree: true });
    },
    stop() {
      observer8?.disconnect();
      observer8 = null;
      app.doc.getElementById(STYLE_ID16)?.remove();
      for (const el2 of app.doc.querySelectorAll(`[${MARK6}]`)) el2.removeAttribute(MARK6);
    }
  });

  // src/plugins/noLinkAccounts.js
  var STYLE_ID17 = "askx-no-link-accounts";
  var CHAIN_ICON = "M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0";
  var LINK_LABELS = ["Link accounts", "关联账号", "連結帳號"];
  var CSS7 = `html[${PAGE_FLAG}] main :is(button, [role="button"]):is(${LINK_LABELS.map((label3) => `[aria-label="${label3}" i]`).join(", ")}, :has(svg path[d^="${CHAIN_ICON}"])){display:none!important}`;
  var stop7 = null;
  var noLinkAccounts_default = definePlugin({
    name: "NoLinkAccounts",
    description: "隐藏 Grok 全页（x.com/i/grok）右上角的“Link accounts”连接提示：空对话时的按钮和对话里的链条图标。",
    icon: ICONS.linkOff,
    tags: ["declutter"],
    enabledByDefault: true,
    start() {
      addStyle(app.doc, STYLE_ID17, CSS7);
      stop7 = watchGrok(app.doc);
    },
    stop() {
      stop7?.();
      stop7 = null;
      app.doc.getElementById(STYLE_ID17)?.remove();
    }
  });

  // src/plugins/postGrok.js
  var POST2 = 'article[data-testid="tweet"]';
  var POST_TEXT = '[data-testid="tweetText"]';
  var GROK_MARK = "M12.745 20.54l10.97-8.19";
  var settings17 = definePluginSettings({
    prompt: {
      type: OptionType.STRING,
      multiline: true,
      label: "提示词",
      description: "跟在帖子链接后面的问题，比如“用中文解释一下”。帖子像 X 原生按钮一样以链接附上，不粘贴正文。",
      default: "解释一下"
    },
    tooltip: {
      type: OptionType.STRING,
      allowEmpty: true,
      label: "悬停提示",
      description: "鼠标停在按钮上时显示的文字，代替 X 的 “Explain this post”。留空则显示提示词。",
      default: ""
    },
    autoSend: {
      type: OptionType.BOOLEAN,
      label: "自动发送",
      description: "写入后直接发送，像 X 原来的按钮一样。关闭则只写入输入框。",
      default: true
    },
    private: {
      type: OptionType.BOOLEAN,
      label: "用无痕对话",
      description: "在 Grok 的 Private Chat 里提问。",
      default: false
    }
  });
  function postGrokButton(target) {
    const button = target?.closest?.('button, [role="button"]');
    if (!button || !button.closest(POST2)) return null;
    const path = button.querySelector("svg path");
    return path && (path.getAttribute("d") || "").startsWith(GROK_MARK) ? button : null;
  }
  function postText(post) {
    const own = [...post.querySelectorAll(POST_TEXT)].find((el2) => el2.closest(POST2) === post);
    if (!own) return "";
    const copy = own.cloneNode(true);
    for (const img of copy.querySelectorAll("img[alt]")) img.replaceWith(img.getAttribute("alt"));
    return copy.textContent.trim();
  }
  function swallow(event) {
    if (!postGrokButton(event.target)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }
  function onClick5(event) {
    if (!swallow(event)) return;
    const post = event.target.closest(POST2);
    const text = postText(post) || findPostSource(post).url;
    void ask({ text, node: post, context: "post" }, { id: "post-grok" });
  }
  function onKey(event) {
    if ((event.key === "Enter" || event.key === " ") && postGrokButton(event.target)) onClick5(event);
  }
  var TIP_MARK = "data-askx-tip";
  var STYLE_ID18 = "askx-post-grok";
  var CSS8 = `[${TIP_MARK}]{font-size:0!important}[${TIP_MARK}]::after{content:attr(${TIP_MARK});font-size:11px;line-height:12px;white-space:nowrap}`;
  function tooltipText() {
    const custom = String(settings17.store.tooltip || "").trim();
    return custom || String(settings17.store.prompt || "").trim().split("\n")[0];
  }
  var hovered = null;
  var tips = null;
  function onOver(event) {
    hovered = postGrokButton(event.target);
  }
  function relabel(label3) {
    const text = tooltipText();
    if (!text || !hovered?.matches(":hover")) return;
    const box = label3.closest('[role="tooltip"]') || label3.parentElement;
    const before = box.getBoundingClientRect().width;
    label3.setAttribute(TIP_MARK, text);
    const after = box.getBoundingClientRect().width;
    const left = parseFloat(box.style.left);
    if (Number.isFinite(left) && before !== after) box.style.left = `${left + (before - after) / 2}px`;
  }
  function watchTips(doc) {
    const host = doc.getElementById("layers") || doc.body;
    tips = new doc.defaultView.MutationObserver((records) => {
      if (!hovered) return;
      for (const record of records) {
        for (const node2 of record.addedNodes) {
          if (node2.nodeType !== 1) continue;
          const label3 = node2.matches('[data-testid="HoverLabel"]') ? node2 : node2.querySelector('[data-testid="HoverLabel"]');
          if (label3) relabel(label3);
        }
      }
    });
    tips.observe(host, { childList: true, subtree: true });
  }
  var PRESS = ["pointerdown", "mousedown", "pointerup", "mouseup", "touchstart", "touchend"];
  var postGrok_default = definePlugin({
    name: "PostGrok",
    description: "接管帖子右上角 X 自带的 Grok 按钮：点一下用你自己的提示词（默认“解释一下”）问 Grok 这条帖子，而不是 X 固定的问法；悬停提示也可以自定义；可选自动发送、无痕。",
    icon: ICONS.quote,
    tags: ["composer"],
    enabledByDefault: true,
    settings: settings17,
    // After QuickPrompts, so nothing else rewrites this request.
    askOrder: 95,
    onAsk(ctx2) {
      if (ctx2.trigger.id !== "post-grok") return;
      const prompt = String(settings17.store.prompt || "").trim();
      ctx2.template = prompt ? `{url}

${prompt}` : "{url}";
      ctx2.plan.autoSend = Boolean(settings17.store.autoSend);
      ctx2.plan.privateMode = settings17.store.private ? "on" : "off";
    },
    start() {
      const doc = app.doc;
      addStyle(doc, STYLE_ID18, CSS8);
      doc.addEventListener("pointerover", onOver, true);
      watchTips(doc);
      for (const type of PRESS) doc.addEventListener(type, swallow, true);
      doc.addEventListener("click", onClick5, true);
      doc.addEventListener("keydown", onKey, true);
    },
    stop() {
      const doc = app.doc;
      doc.removeEventListener("pointerover", onOver, true);
      tips?.disconnect();
      tips = null;
      hovered = null;
      doc.getElementById(STYLE_ID18)?.remove();
      for (const el2 of doc.querySelectorAll(`[${TIP_MARK}]`)) el2.removeAttribute(TIP_MARK);
      for (const type of PRESS) doc.removeEventListener(type, swallow, true);
      doc.removeEventListener("click", onClick5, true);
      doc.removeEventListener("keydown", onKey, true);
    }
  });

  // src/plugins/noSideScroll.js
  var STYLE_ID19 = "askx-no-side-scroll";
  var MARK7 = "data-askx-no-xscroll";
  var CSS9 = `[${MARK7}]{overflow-x:hidden!important}[${MARK7}] button{max-width:100%;min-width:0}[${MARK7}] button *{white-space:normal!important;overflow-wrap:anywhere;min-width:0}`;
  function findScrollers(root) {
    const view = root.ownerDocument.defaultView;
    const out = [];
    for (let el2 = messageList(root); el2 && root.contains(el2); el2 = el2.parentElement) {
      if (/(auto|scroll)/.test(view.getComputedStyle(el2).overflowY)) out.push(el2);
      if (el2 === root) break;
    }
    if (!out.length && messageList(root)) out.push(root);
    return out;
  }
  function mark(doc = app.doc) {
    let count = 0;
    for (const root of grokRoots(doc)) {
      for (const el2 of findScrollers(root)) {
        if (!el2.hasAttribute(MARK7)) el2.setAttribute(MARK7, "");
        count += 1;
      }
    }
    return count;
  }
  var stop8 = null;
  var noSideScroll_default = definePlugin({
    name: "NoSideScroll",
    description: "Grok 回复下面的建议问题太长时会把小窗撑宽、出现横向滚动条。这个插件让建议问题自动换行，Grok 对话区不再横向滚动；代码块仍可左右滚动。",
    icon: ICONS.wrap,
    tags: ["appearance"],
    enabledByDefault: true,
    start() {
      addStyle(app.doc, STYLE_ID19, CSS9);
      stop8 = watchGrok(app.doc, (doc) => mark(doc));
    },
    stop() {
      stop8?.();
      stop8 = null;
      app.doc.getElementById(STYLE_ID19)?.remove();
      for (const el2 of app.doc.querySelectorAll(`[${MARK7}]`)) el2.removeAttribute(MARK7);
    }
  });

  // src/plugins/postTypography.js
  var MARK8 = "data-askx-post-text";
  var STYLE_ID20 = "askx-post-typography";
  var settings18 = definePluginSettings({
    fullPage: {
      type: OptionType.BOOLEAN,
      label: "Grok 全页也生效",
      description: "在 x.com/i/grok 全页里同样使用帖子字号和行距。关闭则只影响小窗。",
      default: true
    }
  });
  function roots2(doc) {
    const out = [];
    const drawer = doc.querySelector(DRAWER);
    if (drawer) out.push(drawer);
    if (settings18.store.fullPage && doc.documentElement.hasAttribute(PAGE_FLAG)) {
      const main = doc.querySelector("main");
      if (main) out.push(main);
    }
    return out;
  }
  function css3() {
    const scope = settings18.store.fullPage ? `:is(${DRAWER}, html[${PAGE_FLAG}] main)` : DRAWER;
    return `${scope} [${MARK8}]{font-size:15px!important;line-height:20px!important}`;
  }
  function isLooseBody(fontSize, lineHeight) {
    return fontSize >= 14.5 && fontSize <= 16.5 && lineHeight / fontSize >= 1.5;
  }
  function hasOwnText(el2) {
    for (const n of el2.childNodes) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
      if (n.nodeType === 1 && n.classList.contains("askx-uq")) return true;
    }
    return false;
  }
  function markAll(doc = app.doc) {
    let count = 0;
    for (const root of roots2(doc)) count += markList(doc, messageList(root));
    return count;
  }
  function markList(doc, list) {
    if (!list) return 0;
    const view = doc.defaultView;
    let count = 0;
    for (const el2 of list.querySelectorAll("span, div, p, li")) {
      if (el2.hasAttribute(MARK8)) {
        count += 1;
        continue;
      }
      if (!hasOwnText(el2) || el2.closest("pre, code, h1, h2, h3, h4, h5, h6")) continue;
      let target = null;
      for (let e = el2; e && e !== list; e = e.parentElement) {
        const s = view.getComputedStyle(e);
        if (!isLooseBody(parseFloat(s.fontSize), parseFloat(s.lineHeight))) break;
        target = e;
      }
      if (target && !target.hasAttribute(MARK8)) {
        target.setAttribute(MARK8, "");
        count += 1;
      }
    }
    return count;
  }
  var stop9 = null;
  var postTypography_default = definePlugin({
    name: "PostTypography",
    description: "Grok 里的消息文字改用和 X 帖子一样的字号与行距（15px / 20px），不再有过大的行距和段距；小窗和 Grok 全页都生效，全页可单独关闭。",
    icon: ICONS.type,
    tags: ["messages"],
    enabledByDefault: true,
    settings: settings18,
    start() {
      const doc = app.doc;
      addStyle(doc, STYLE_ID20, css3());
      stop9 = watchGrok(doc, markAll);
      markAll(doc);
    },
    onSettingsChange() {
      const doc = app.doc;
      addStyle(doc, STYLE_ID20, css3());
      if (!settings18.store.fullPage) for (const el2 of doc.querySelectorAll(`main [${MARK8}]`)) el2.removeAttribute(MARK8);
      markAll(doc);
    },
    stop() {
      const doc = app.doc;
      stop9?.();
      stop9 = null;
      doc.getElementById(STYLE_ID20)?.remove();
      for (const el2 of doc.querySelectorAll(`[${MARK8}]`)) el2.removeAttribute(MARK8);
    }
  });

  // src/plugins/noVoiceMode.js
  var STYLE_ID21 = "askx-no-voice-mode";
  var VOICE_LABELS = ["Enter voice mode", "Voice mode", "进入语音模式", "语音模式", "進入語音模式", "語音模式"];
  var CSS10 = VOICE_LABELS.map((label3) => `${GROK} :is(button, [role="button"])[aria-label="${label3}" i]`).join(",") + "{display:none!important}";
  var stop10 = null;
  var noVoiceMode_default = definePlugin({
    name: "NoVoiceMode",
    description: "隐藏 Grok 输入框里的语音模式按钮（输入框为空时那个圆形声波按钮）。输入文字后出现的发送按钮不受影响。",
    icon: ICONS.micOff,
    tags: ["declutter"],
    enabledByDefault: true,
    start() {
      addStyle(app.doc, STYLE_ID21, CSS10);
      stop10 = watchGrok(app.doc);
    },
    stop() {
      stop10?.();
      stop10 = null;
      app.doc.getElementById(STYLE_ID21)?.remove();
    }
  });

  // src/plugins/noSuggestions.js
  var MARK9 = "data-askx-no-suggestions";
  var observer9 = null;
  function isSuggestionRow(node2, composer) {
    if (node2.contains(composer) || node2.querySelector('textarea, [contenteditable="true"]')) return false;
    const buttons = [...node2.querySelectorAll('button, [role="button"]')];
    return buttons.length >= 2 && buttons.every((b) => !b.hasAttribute("aria-label") && b.textContent.trim());
  }
  function findSuggestionRows(root) {
    const composer = getComposer(root);
    if (!composer) return [];
    for (let node2 = composer; node2 && node2.parentElement && node2 !== root; node2 = node2.parentElement) {
      const siblings = [...node2.parentElement.children];
      const rows = siblings.slice(siblings.indexOf(node2) + 1).filter((s) => isSuggestionRow(s, composer));
      if (rows.length) return rows;
    }
    return [];
  }
  function hideSuggestions(doc = app.doc) {
    const rows = /* @__PURE__ */ new Set();
    for (const root of grokRoots(doc)) for (const row2 of findSuggestionRows(root)) rows.add(row2);
    for (const row2 of rows) if (!row2.hasAttribute(MARK9)) row2.setAttribute(MARK9, "");
    for (const el2 of doc.querySelectorAll(`[${MARK9}]`)) if (!rows.has(el2)) el2.removeAttribute(MARK9);
    return rows.size;
  }
  function onMutations(records) {
    if (!touchesGrok(records, app.doc)) return;
    observer9.disconnect();
    try {
      hideSuggestions();
    } finally {
      observer9.observe(app.doc.body, { childList: true, subtree: true });
    }
  }
  var noSuggestions_default = definePlugin({
    name: "NoSuggestions",
    description: "隐藏 Grok 输入框下面那排功能提示按钮（Create Videos、Create Images、Edit Image、Latest News 等），小窗和 Grok 全页都生效。",
    icon: ICONS.eyeOff,
    tags: ["declutter"],
    enabledByDefault: true,
    start() {
      const doc = app.doc;
      if (!doc.getElementById("askx-no-suggestions")) {
        const style = doc.createElement("style");
        style.id = "askx-no-suggestions";
        style.textContent = `[${MARK9}] { display: none !important; }`;
        (doc.head || doc.documentElement).appendChild(style);
      }
      hideSuggestions();
      observer9 = new doc.defaultView.MutationObserver(onMutations);
      observer9.observe(doc.body, { childList: true, subtree: true });
    },
    stop() {
      observer9?.disconnect();
      observer9 = null;
      app.doc.getElementById("askx-no-suggestions")?.remove();
      for (const node2 of app.doc.querySelectorAll(`[${MARK9}]`)) node2.removeAttribute(MARK9);
    }
  });

  // src/presetIcons.js
  var svg2 = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  var PRESET_ICONS = {
    lightbulb: { label: "解释", svg: svg2('<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>') },
    languages: { label: "翻译", svg: svg2('<path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>') },
    list: { label: "总结", svg: svg2('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>') },
    help: { label: "提问", svg: svg2('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>') },
    search: { label: "查证", svg: svg2('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>') },
    sparkles: { label: "润色", svg: svg2('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>') },
    message: { label: "评论", svg: svg2('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') },
    book: { label: "背景", svg: svg2('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>') },
    code: { label: "代码", svg: svg2('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>') },
    pen: { label: "改写", svg: svg2('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>') },
    check: { label: "核对", svg: svg2('<path d="M20 6 9 17l-5-5"/>') },
    alert: { label: "风险", svg: svg2('<path d="m10.3 3.9-8.2 14A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-3.1l-8.2-14a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>') },
    link: { label: "来源", svg: svg2('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>') },
    smile: { label: "有趣", svg: svg2('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>') },
    chart: { label: "数据", svg: svg2('<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>') },
    zap: { label: "快速", svg: svg2('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>') }
  };
  var svgDataUrl = (markup) => `data:image/svg+xml,${encodeURIComponent(markup)}`;
  function legacyIconUrl(key) {
    return PRESET_ICONS[key] ? svgDataUrl(PRESET_ICONS[key].svg) : "";
  }
  var DEFAULT_PRESET_ICON = { 解释: legacyIconUrl("lightbulb"), 翻译: legacyIconUrl("languages") };

  // src/plugins/quickPrompts.js
  var MAX_ICON_LENGTH = 4e5;
  function cleanIcon(raw, name) {
    if (raw === void 0) return DEFAULT_PRESET_ICON[name] || "";
    const value = String(raw).trim();
    if (value in PRESET_ICONS) return legacyIconUrl(value);
    return value.length > MAX_ICON_LENGTH ? "" : value;
  }
  function cleanPreset(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name || "").trim().slice(0, 12);
    const template = String(raw.template || "");
    if (!name || !template.trim()) return null;
    const icon2 = cleanIcon(raw.icon, name);
    return { name, icon: icon2, template, private: Boolean(raw.private), autoSend: Boolean(raw.autoSend) };
  }
  var settings19 = definePluginSettings({
    presets: {
      type: OptionType.COMPONENT,
      component: "presets",
      label: "快捷提问",
      description: "划词工具条上额外的按钮。点一条可以编辑它的名称、图标、提问模板和选项。",
      validate: (value) => Array.isArray(value) ? value.map(cleanPreset).filter(Boolean).slice(0, 8) : void 0,
      default: [
        { name: "解释", icon: DEFAULT_PRESET_ICON.解释, template: "{url}\n\n{quote}\n\n解释一下这段话。", private: false, autoSend: false },
        { name: "翻译", icon: DEFAULT_PRESET_ICON.翻译, template: "{quote}\n\n翻译成中文。", private: false, autoSend: false }
      ]
    },
    showLabels: {
      type: OptionType.BOOLEAN,
      label: "显示文字",
      description: "按钮上除了图标再显示名称。关闭时只显示图标，悬停可看名称；没有图标的按钮仍显示文字。",
      default: false
    }
  });
  var quickPrompts_default = definePlugin({
    name: "QuickPrompts",
    description: "在划词工具条上加“解释”“翻译”这类一键提问按钮，每个按钮有自己的图标和提问模板。",
    icon: ICONS.zap,
    tags: ["composer"],
    enabledByDefault: true,
    settings: settings19,
    // Runs last so a preset's own template, private and auto-send win.
    askOrder: 90,
    // Inside Grok (follow-up) only the non-private presets make sense: a
    // private chat would have to start over.
    toolbarButtons: () => settings19.store.presets.map((preset, index2) => ({
      id: "preset",
      label: `${preset.name}${preset.private ? "（无痕）" : ""}`,
      text: preset.name,
      iconUrl: iconUrlKind(preset.icon) === "invalid" ? "" : preset.icon,
      className: settings19.store.showLabels ? "askx-prompt" : "askx-prompt askx-icon-only",
      data: preset.private ? { private: "true" } : {},
      preset: index2,
      contexts: preset.private ? ["post"] : ["post", "grok"],
      order: 20 + index2
    })),
    onAsk(ctx2) {
      if (ctx2.trigger.id !== "preset") return;
      const preset = settings19.store.presets[ctx2.trigger.preset];
      if (!preset) return;
      ctx2.template = preset.template;
      ctx2.plan.autoSend = preset.autoSend;
      if (preset.private) ctx2.plan.privateMode = "on";
    }
  });

  // src/plugins/quoteFormat.js
  var settings20 = definePluginSettings({
    template: {
      type: OptionType.STRING,
      multiline: true,
      label: "引用模板",
      description: "占位符：{text} 原文、{quote} 每行加 > 的原文、{url} 推文链接、{author} 作者。整行占位符都为空时，该行连同其后一个空行一起省略。",
      default: DEFAULT_TEMPLATE
    }
  });
  var quoteFormat_default = definePlugin({
    name: "QuoteFormat",
    description: "自定义写进 Grok 的引用格式。关闭时用默认格式“来源：链接 + > 原文”。",
    icon: ICONS.textQuote,
    tags: ["composer"],
    enabledByDefault: true,
    settings: settings20,
    askOrder: 30,
    onAsk(ctx2) {
      ctx2.template = settings20.store.template;
    }
  });

  // src/meta-info.js
  var META = { name: "Ask X", version: "1.21.4", release: "20261025" };

  // src/ui/settingsModal.js
  var CATEGORIES = [
    { id: "favorites", label: "收藏" },
    { id: "all", label: "全部" },
    { id: "composer", label: "输入框" },
    { id: "appearance", label: "外观" },
    { id: "messages", label: "消息" },
    { id: "chats", label: "对话" },
    { id: "privacy", label: "隐私" },
    { id: "notifications", label: "通知" },
    { id: "navigation", label: "导航" },
    { id: "declutter", label: "精简" },
    { id: "developer", label: "开发" }
  ];
  var FILTERS = [
    { value: "all", label: "全部" },
    { value: "enabled", label: "已启用" },
    { value: "disabled", label: "已停用" }
  ];
  function pluginCard(doc, manager, plugin, onConfig, onChange) {
    const enabled = manager.isEnabled(plugin.name);
    const starred = manager.isStarred(plugin.name);
    const pinned = manager.isPinned(plugin.name);
    const iconButton = (icon2, labelText, cls, onclick) => el(doc, "button", {
      type: "button",
      class: `askx-card-btn ${cls}`,
      title: labelText,
      "aria-label": labelText,
      html: icon2,
      onclick: (e) => {
        e.stopPropagation();
        onclick();
      }
    });
    const spacer = () => el(doc, "span", { class: "askx-card-btn askx-card-spacer", "aria-hidden": "true" });
    const controls = [
      iconButton(starred ? ICONS.starFilled : ICONS.star, starred ? "取消收藏" : "收藏", starred ? "askx-active" : "", () => {
        manager.toggleStar(plugin.name);
        onChange();
      }),
      plugin.required ? spacer() : iconButton(pinned ? ICONS.pinFilled : ICONS.pin, pinned ? "取消置顶" : "置顶", pinned ? "askx-active" : "", () => {
        manager.togglePin(plugin.name);
        onChange();
      }),
      plugin.settings ? iconButton(ICONS.sliders, "设置", "askx-card-config", () => onConfig(plugin)) : spacer(),
      createSwitch(doc, enabled, () => {
        manager.toggle(plugin.name);
        onChange();
      }, { label: `启用 ${plugin.name}`, disabled: plugin.required })
    ];
    return el(doc, "div", { class: `askx-card${plugin.required ? " askx-card-required" : ""}`, "data-plugin": plugin.name }, [
      el(doc, "div", { class: "askx-card-body" }, [
        el(doc, "div", { class: "askx-card-head" }, [
          el(doc, "div", { class: "askx-card-name" }, [
            el(doc, "span", { class: "askx-card-icon", html: plugin.icon || ICONS.plug }),
            el(doc, "span", { class: "askx-card-title", text: plugin.name, title: plugin.name }),
            plugin.required ? el(doc, "span", { class: "askx-card-badge", title: "Ask X 运行必需的插件", html: ICONS.info }) : null
          ]),
          el(doc, "div", { class: "askx-card-controls" }, controls)
        ]),
        el(doc, "div", { class: "askx-card-desc", text: plugin.description })
      ]),
      el(doc, "div", { class: "askx-card-separator" }),
      el(doc, "div", { class: "askx-card-footer" }, [el(doc, "span", { class: "askx-card-author", text: plugin.authors.join(", ") })])
    ]);
  }
  function pluginsTab(doc, manager, layer) {
    const all = manager.order.map((n) => manager.plugins[n]);
    const state2 = {
      category: manager.data.starred.length ? "favorites" : "all",
      search: "",
      filter: "all"
    };
    const root = el(doc, "div", { class: "askx-tab askx-plugins" });
    const tabs = el(doc, "div", { class: "askx-plugins-tabs", role: "tablist" });
    const list = el(doc, "div", { class: "askx-plugins-list" });
    const search = el(doc, "input", { type: "text", class: "askx-input askx-search", placeholder: `搜索 ${all.length} 个插件…`, "aria-label": "搜索插件" });
    search.addEventListener("input", () => {
      state2.search = search.value;
      renderList();
    });
    const filter = createSelect(doc, FILTERS, state2.filter, (v) => {
      state2.filter = v;
      renderList();
    }, layer, { className: "askx-filter" });
    const inCategory = (p) => {
      if (state2.category === "favorites") return manager.isStarred(p.name);
      if (state2.category === "all") return true;
      return p.tags.includes(state2.category);
    };
    const visibleTabs = () => CATEGORIES.filter((c) => c.id === "favorites" || c.id === "all" || all.some((p) => p.tags.includes(c.id)));
    function renderTabs() {
      tabs.textContent = "";
      for (const c of visibleTabs()) {
        tabs.appendChild(el(doc, "button", {
          type: "button",
          role: "tab",
          class: `askx-plugins-tab${state2.category === c.id ? " askx-plugins-tab-active" : ""}`,
          "aria-selected": String(state2.category === c.id),
          text: c.label,
          onclick: () => {
            state2.category = c.id;
            renderTabs();
            renderList();
          }
        }));
      }
    }
    function renderList() {
      const q = state2.search.trim().toLowerCase();
      const match = (p) => inCategory(p) && (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) && (state2.filter === "all" || state2.filter === "enabled" === manager.isEnabled(p.name));
      const byPin = (a, b) => Number(manager.isPinned(b.name)) - Number(manager.isPinned(a.name));
      const user = all.filter((p) => !p.required && match(p)).sort(byPin);
      const required = all.filter((p) => p.required && match(p));
      const card = (p) => pluginCard(doc, manager, p, (plugin) => openPluginDialog(doc, layer, plugin), renderList);
      list.textContent = "";
      if (user.length) list.appendChild(el(doc, "div", { class: "askx-grid" }, user.map(card)));
      if (required.length) {
        if (user.length) list.appendChild(el(doc, "div", { class: "askx-separator" }));
        list.appendChild(el(doc, "div", { class: "askx-grid" }, required.map(card)));
      }
      fitList?.();
      if (!user.length && !required.length) {
        const hint = q ? "没有匹配的插件。" : state2.category === "favorites" ? "还没有收藏。点插件上的星标收藏到这里。" : "这个分类下没有插件。";
        list.appendChild(el(doc, "p", { class: "askx-empty", text: hint }));
      }
    }
    let fitList = null;
    renderTabs();
    renderList();
    root.append(
      el(doc, "div", { class: "askx-tab-header" }, [
        el(doc, "h2", { class: "askx-tab-title", text: "插件" }),
        el(doc, "span", { class: "askx-tab-info", title: "开关功能，点调节图标设置插件。改动即时生效。", html: ICONS.info })
      ]),
      tabs,
      el(doc, "div", { class: "askx-search-bar" }, [search, filter]),
      list
    );
    queueMicrotask(() => {
      fitList = keepEdges(list, 20);
    });
    return root;
  }
  function aboutTab(doc, manager, layer, rerender) {
    return el(doc, "div", { class: "askx-tab askx-about" }, [
      el(doc, "div", { class: "askx-tab-header" }, [el(doc, "h2", { class: "askx-tab-title", text: "关于" })]),
      el(doc, "p", { class: "askx-paragraph", text: `${META.name} · v${META.version} · ${META.release}` }),
      el(doc, "p", { class: "askx-paragraph", text: "在 X 上划词问 Grok 小窗。每个功能都是一个插件，可单独开关和设置。" }),
      el(doc, "div", { class: "askx-about-actions" }, [
        el(doc, "button", {
          type: "button",
          class: "askx-button askx-button-secondary",
          text: "重置全部设置",
          onclick: () => confirmDialog(doc, layer, {
            title: "重置全部设置",
            description: "恢复所有插件的开关和设置为默认值，并清空收藏和置顶？此操作无法撤销。",
            confirmText: "重置",
            onConfirm: () => {
              manager.resetAll();
              rerender();
            }
          })
        })
      ])
    ]);
  }
  function openSettings(manager, doc = document, { tab = "plugins" } = {}) {
    doc.querySelector(".askx-layer")?.remove();
    const layer = el(doc, "div", { class: "askx-layer", "data-theme": pageTheme(doc) });
    const pane = el(doc, "div", { class: "askx-pane" });
    let current2 = tab;
    const navItem = (id, text, icon2) => el(doc, "button", {
      type: "button",
      class: `askx-nav-item${current2 === id ? " askx-nav-item-active" : ""}`,
      "data-tab": id,
      html: `${icon2}<span>${text}</span>`,
      onclick: () => show(id)
    });
    const nav = el(doc, "nav", { class: "askx-nav", "aria-label": "Ask X 设置" });
    function show(id) {
      current2 = id;
      nav.textContent = "";
      nav.append(
        el(doc, "div", { class: "askx-nav-group", text: "Ask X" }),
        navItem("plugins", "插件", ICONS.plug),
        navItem("about", "关于", ICONS.info)
      );
      pane.textContent = "";
      pane.appendChild(id === "about" ? aboutTab(doc, manager, layer, () => show("about")) : pluginsTab(doc, manager, layer));
    }
    const close = () => {
      layer.remove();
      doc.removeEventListener("keydown", onKey2, true);
    };
    const onKey2 = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (layer.querySelector(".askx-select-content")) {
        layer.dispatchEvent(new doc.defaultView.Event("askx-close-popups"));
        return;
      }
      const modals = layer.querySelectorAll("[data-askx-modal]");
      if (modals.length) modals[modals.length - 1].remove();
      else close();
    };
    const dialog = el(doc, "div", { class: "askx-settings-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Ask X 设置" }, [
      nav,
      el(doc, "div", { class: "askx-main" }, [
        el(doc, "button", { type: "button", class: "askx-icon-btn askx-dialog-close", "aria-label": "关闭", title: "关闭", html: ICONS.close, onclick: close }),
        pane
      ])
    ]);
    const overlay = el(doc, "div", { class: "askx-overlay", onmousedown: (e) => {
      if (e.target === overlay) close();
    } }, [dialog]);
    layer.appendChild(overlay);
    layer.addEventListener("mousedown", (e) => {
      if (!e.target.closest(".askx-select-content, .askx-select, .askx-icon-trigger")) layer.dispatchEvent(new doc.defaultView.Event("askx-close-popups"));
    });
    layer.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") e.stopPropagation();
    });
    show(tab);
    doc.body.appendChild(layer);
    doc.addEventListener("keydown", onKey2, true);
    return { element: layer, close, show };
  }

  // src/plugins/settings.js
  var open = () => openSettings(app.manager, app.doc);
  var settings_default = definePlugin({
    name: "Settings",
    description: "Ask X 的设置界面：插件列表、开关和各插件的设置。从脚本管理器菜单“Ask X 设置”打开。",
    icon: ICONS.settings,
    required: true,
    tags: ["developer"],
    start() {
      if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand("Ask X 设置", open);
      app.doc.addEventListener("askx:settings", open);
    },
    stop() {
      app.doc.removeEventListener("askx:settings", open);
    }
  });

  // src/plugins/userQuotes.js
  var QUOTE = "askx-uq";
  var MARK10 = "askx-uq-mark";
  var STYLE_ID22 = "askx-user-quotes";
  var settings21 = definePluginSettings({
    italic: {
      type: OptionType.BOOLEAN,
      label: "斜体",
      description: "引用行用斜体显示。",
      default: true
    },
    quotes: {
      type: OptionType.BOOLEAN,
      label: "引号",
      description: "在引用行前后加上装饰性的引号。",
      default: false
    }
  });
  function css4() {
    return [
      // One box per quote line, so the bar runs down every wrapped line.
      // min-height keeps the bar on blank lines inside a multi-paragraph quote.
      `.${QUOTE}{display:inline-block;max-width:100%;min-height:1.3em;vertical-align:top;box-sizing:border-box;border-left:3px solid rgb(113,118,123);padding-left:8px;font-style:${settings21.store.italic ? "italic" : "inherit"}}`,
      // The ">" stays in the text (copying keeps it) but takes no space.
      `.${MARK10}{font-size:0;line-height:0;font-style:normal;user-select:text}`,
      settings21.store.quotes ? `.${QUOTE}-text::before{content:"\\201C"}.${QUOTE}-text::after{content:"\\201D"}` : ""
    ].join("\n");
  }
  function applyStyle(doc = app.doc) {
    let style = doc.getElementById(STYLE_ID22);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID22;
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = css4();
  }
  function quoteLine(doc, line) {
    const block = doc.createElement("span");
    block.className = QUOTE;
    block.dataset.line = line;
    const mark2 = doc.createElement("span");
    mark2.className = MARK10;
    mark2.textContent = ">";
    const body = doc.createElement("span");
    body.className = `${QUOTE}-text`;
    body.textContent = line.slice(1);
    block.append(mark2, body);
    return block;
  }
  function decorateTextNode(node2) {
    const text = node2.nodeValue || "";
    if (!/(^|\n)>/.test(text)) return false;
    const doc = node2.ownerDocument;
    const frag = doc.createDocumentFragment();
    const parts = text.split(/(\n)/);
    let buffer = "";
    const flush = () => {
      if (buffer) frag.appendChild(doc.createTextNode(buffer));
      buffer = "";
    };
    for (const part of parts) {
      if (part.startsWith(">")) {
        flush();
        frag.appendChild(quoteLine(doc, part));
      } else {
        buffer += part;
      }
    }
    flush();
    node2.parentNode.replaceChild(frag, node2);
    return true;
  }
  function decorateElement(doc, el2) {
    const walker = doc.createTreeWalker(el2, 4);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement.closest(`.${QUOTE}, pre, code`)) nodes.push(n);
    }
    let changed = false;
    for (const n of nodes) changed = decorateTextNode(n) || changed;
    return changed;
  }
  var transform2 = { order: 50, apply: (doc, el2) => decorateElement(doc, el2) };
  var userQuotes_default = definePlugin({
    name: "UserQuotes",
    description: "给你自己发给 Grok 的消息里以 > 开头的引用行加上左侧竖线，可选斜体和引号（移植自 void++）。",
    icon: ICONS.userQuotes,
    tags: ["messages"],
    enabledByDefault: true,
    settings: settings21,
    start() {
      applyStyle();
      setTransform("quotes", transform2);
    },
    onSettingsChange: () => applyStyle(),
    stop() {
      setTransform("quotes", null);
      app.doc.getElementById(STYLE_ID22)?.remove();
    }
  });

  // src/plugins/index.js
  var ALL_PLUGINS = [
    askGrok_default,
    newChat_default,
    incognito_default,
    quoteFormat_default,
    quickPrompts_default,
    followUp_default,
    postGrok_default,
    markdown_default,
    userQuotes_default,
    betterLinks_default,
    postTypography_default,
    customGreeting_default,
    drawerHeight_default,
    composerOpacity_default,
    grokScrollbars_default,
    noSideScroll_default,
    modelChips_default,
    messageNavigator_default,
    inputHistory_default,
    responseNotification_default,
    completeToast_default,
    statusBadge_default,
    grokState_default,
    autoRetry_default,
    toasts_default,
    menuCommands_default,
    noSuggestions_default,
    hideFollowUps_default,
    noVoiceMode_default,
    noGrokComLink_default,
    noLinkAccounts_default,
    settings_default
  ];

  // src/styles.js
  var STYLE_ID23 = "askx-styles";
  var CSS11 = `
.askx-bar, .askx-toast {
  --askx-bg: #000;
  --askx-fg: #e7e9ea;
  --askx-muted: #71767b;
  --askx-line: #2f3336;
  --askx-hover: rgba(231, 233, 234, 0.1);
  --askx-accent: #1d9bf0;
  --askx-shadow: 0 0 15px rgba(255, 255, 255, 0.2), 0 0 3px 1px rgba(255, 255, 255, 0.15);
  font: 400 14px/20px TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.askx-bar[data-theme="light"] {
  --askx-bg: #fff;
  --askx-fg: #0f1419;
  --askx-muted: #536471;
  --askx-line: #eff3f4;
  --askx-hover: rgba(15, 20, 25, 0.1);
  --askx-shadow: 0 0 15px rgba(101, 119, 134, 0.2), 0 0 3px 1px rgba(101, 119, 134, 0.15);
}

.askx-bar {
  position: fixed;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 9999px;
  color: var(--askx-fg);
  background: var(--askx-bg);
  box-shadow: var(--askx-shadow);
  user-select: none;
}
.askx-bar[hidden] { display: none !important; }
.askx-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  min-width: 30px;
  margin: 0;
  padding: 0 6px;
  border: 0;
  border-radius: 9999px;
  color: inherit;
  background: transparent;
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.askx-btn:hover, .askx-btn:focus-visible { background: var(--askx-hover); outline: none; }
.askx-btn svg { display: block; pointer-events: none; }
.askx-ghost { color: var(--askx-accent); }
.askx-prompt { gap: 5px; padding: 0 10px; }
.askx-btn-icon { width: 15px; height: 15px; }
.askx-btn-icon[data-state="error"], .askx-btn-icon[data-state="loading"] { display: none; }
.askx-prompt.askx-icon-only:has(> .askx-btn-icon[data-state="ok"]) { padding: 0 6px; }
.askx-prompt.askx-icon-only:has(> .askx-btn-icon[data-state="ok"]) > .askx-btn-label { display: none; }
.askx-prompt[data-private="true"]::after { content: "·"; margin-left: 3px; color: var(--askx-accent); }

.askx-toast {
  position: fixed;
  z-index: 2147483647;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  max-width: min(420px, calc(100vw - 32px));
  padding: 12px 16px;
  border-radius: 6px;
  color: #fff;
  background: var(--askx-accent);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  font-weight: 500;
}
.askx-toast[data-closable="true"] { padding-right: 36px; }
.askx-toast-detail { margin-top: 4px; font-weight: 400; font-size: 13px; opacity: 0.85; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.askx-toast-close { position: absolute; top: 6px; right: 8px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; color: inherit; background: transparent; font-size: 18px; line-height: 22px; cursor: pointer; opacity: 0.8; }
.askx-toast-close:hover { opacity: 1; background: rgba(255, 255, 255, 0.15); }
.askx-toast[data-kind="error"] { background: #f4212e; }
.askx-toast[data-kind="private"] { background: #3c3f44; }

/* Settings dialog: mirrors the Void++ plugin dialog (Grok design tokens). */
.askx-layer {
  --askx-d-surface: #181716;
  --askx-d-raised: #201f1d;
  --askx-d-pop: #363636;
  --askx-d-fg: #fcfcfc;
  --askx-d-muted: #9e9e9e;
  --askx-d-line: rgba(252, 252, 252, 0.06);
  --askx-d-line-strong: rgba(252, 252, 252, 0.1);
  --askx-d-input: rgba(83, 83, 83, 0.3);
  --askx-d-hover: rgba(252, 252, 252, 0.08);
  --askx-d-track: rgba(252, 252, 252, 0.2);
  --askx-d-accent: #427eff;
  --askx-d-danger: #e5484d;
  --askx-d-overlay: rgba(0, 0, 0, 0.5);
  --askx-d-nav: #131211;
  --askx-d-chip: rgba(252, 252, 252, 0.1);
  --askx-d-tertiary: #858585;
  --askx-d-scroll: rgba(252, 252, 252, 0.18);
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  color: var(--askx-d-fg);
  font: 400 15px/1.5 universalSans, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.askx-layer[data-theme="light"] {
  --askx-d-surface: #ffffff;
  --askx-d-raised: #f7f7f7;
  --askx-d-pop: #ffffff;
  --askx-d-fg: #0d0d0d;
  --askx-d-muted: #6b6b6b;
  --askx-d-line: rgba(13, 13, 13, 0.08);
  --askx-d-line-strong: rgba(13, 13, 13, 0.12);
  --askx-d-input: rgba(13, 13, 13, 0.02);
  --askx-d-hover: rgba(13, 13, 13, 0.06);
  --askx-d-track: rgba(13, 13, 13, 0.15);
  --askx-d-overlay: rgba(0, 0, 0, 0.3);
  --askx-d-nav: #f7f7f7;
  --askx-d-chip: rgba(13, 13, 13, 0.06);
  --askx-d-tertiary: #8a8a8a;
  --askx-d-scroll: rgba(13, 13, 13, 0.2);
}
.askx-layer *, .askx-layer *::before, .askx-layer *::after { box-sizing: border-box; }
.askx-layer button, .askx-layer input, .askx-layer textarea { font: inherit; color: inherit; }
.askx-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--askx-d-overlay);
}
.askx-overlay-nested { background: var(--askx-d-overlay); }
.askx-overlay-nested .askx-dialog { box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45); }
.askx-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 512px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  padding: 24px;
  border: 1px solid var(--askx-d-line);
  border-radius: 16px;
  background: var(--askx-d-surface);
  overflow: hidden;
}
.askx-dialog-sm { width: 448px; }
/* Close button centred on the title line and flush with the content edge. */
.askx-dialog-close { position: absolute; top: 24px; right: 24px; z-index: 1; }
.askx-settings-dialog .askx-dialog-close { right: 20px; }
.askx-dialog-header { display: flex; flex-direction: column; gap: 8px; padding-right: 40px; text-align: left; }
.askx-dialog-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 550; letter-spacing: 0; }
.askx-dialog-desc { margin: 0; color: var(--askx-d-muted); font-size: 14px; line-height: 21px; }
.askx-separator { flex: none; height: 1px; background: var(--askx-d-line); }
.askx-field { display: flex; flex-direction: column; gap: 4px; }
.askx-field-label { font-size: 14px; line-height: 21px; font-weight: 500; }
.askx-paragraph { margin: 0; color: var(--askx-d-muted); font-size: 14px; line-height: 21px; }
.askx-settings { flex: 1 1 auto; min-height: 0; }
.askx-settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  margin: 8px -24px 0;
  padding: 0 24px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.askx-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0; }
.askx-stacked { display: flex; flex-direction: column; gap: 8px; }
.askx-label { display: flex; flex-direction: column; min-width: 0; }
.askx-label-title { font-size: 14px; line-height: 21px; font-weight: 500; }
.askx-label-desc { color: var(--askx-d-muted); font-size: 13px; line-height: 19.5px; }

.askx-switch {
  position: relative;
  flex: none;
  width: 32px;
  height: 18px;
  padding: 2px;
  border: 0;
  border-radius: 9999px;
  background: var(--askx-d-track);
  box-shadow: inset 0 0 0 1px var(--askx-d-line-strong);
  cursor: pointer;
  transition: background-color 0.15s;
}
.askx-switch[data-state="checked"] { background: var(--askx-d-accent); }
.askx-switch-thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
}
.askx-switch[data-state="checked"] .askx-switch-thumb { transform: translateX(14px); }
.askx-switch:focus-visible, .askx-select:focus-visible, .askx-button:focus-visible, .askx-icon-btn:focus-visible,
.askx-card-btn:focus-visible, .askx-nav-item:focus-visible, .askx-plugins-tab:focus-visible { outline: 2px solid var(--askx-d-accent); outline-offset: 2px; }
.askx-layer button:focus:not(:focus-visible) { outline: none; }

.askx-select {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--askx-d-line);
  border-radius: 6px;
  background: var(--askx-d-input);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  font-size: 14px !important;
  line-height: 21px;
  white-space: nowrap;
  cursor: pointer;
}
.askx-select:hover { background: var(--askx-d-hover); }
.askx-select-chevron { display: inline-flex; opacity: 0.5; }
.askx-select-chevron svg { width: 16px; height: 16px; }
.askx-select[aria-expanded="true"] .askx-select-chevron { transform: rotate(180deg); }
.askx-select-content {
  position: fixed;
  z-index: 2;
  padding: 4px;
  border: 1px solid var(--askx-d-line);
  border-radius: 16px;
  background: var(--askx-d-pop);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.askx-select-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 6px 40px 6px 8px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 21px;
  white-space: nowrap;
  cursor: default;
  user-select: none;
}
.askx-select-item:hover, .askx-select-item[data-state="checked"] { background: var(--askx-d-hover); }
.askx-select-check { position: absolute; right: 10px; display: inline-flex; }
.askx-select-check svg { width: 16px; height: 16px; }

.askx-input {
  height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--askx-d-line-strong);
  border-radius: 6px;
  background: var(--askx-d-input);
  font-size: 14px !important;
  outline: none;
}
.askx-number { flex: none; width: 96px; }
.askx-input:focus { border-color: var(--askx-d-accent); }
.askx-textarea-wrap {
  border: 1px solid var(--askx-d-line-strong);
  border-radius: 12px;
  background: var(--askx-d-raised);
}
.askx-textarea {
  display: block;
  width: 100%;
  min-height: 60px;
  padding: 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font-size: 14px !important;
  line-height: 21px;
  resize: vertical;
  outline: none;
}
.askx-textarea-wrap:focus-within { border-color: var(--askx-d-accent); }
.askx-textarea::placeholder, .askx-input::placeholder { color: var(--askx-d-muted); }

.askx-presets { display: flex; flex-direction: column; gap: 8px; }
/* Text starts where the name input's text starts (1px border + 12px padding). */

.askx-dialog-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; }
.askx-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  font-size: 13px !important;
  font-weight: 500 !important;
  cursor: pointer;
}
.askx-button svg { width: 16px; height: 16px; }
.askx-button-ghost { height: 24px; padding: 0 10px; background: transparent; }
/* Ghost button text lines up with the content edge above it. */
.askx-dialog-footer .askx-button-ghost:last-child { margin-right: -10px; }
.askx-button-ghost:hover { background: var(--askx-d-hover); }
.askx-button-secondary { background: var(--askx-d-hover); }
.askx-button-secondary:hover { background: var(--askx-d-line-strong); }
.askx-button-danger { color: #fff !important; background: var(--askx-d-danger); }
.askx-button-danger:hover { filter: brightness(1.1); }
.askx-add { align-self: flex-start; }
.askx-icon-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.askx-icon-btn:hover { background: var(--askx-d-hover); }
.askx-icon-btn svg { width: 16px; height: 16px; }

/* Settings window: side nav + plugin list, after the Void++ settings layout. */
.askx-settings-dialog {
  position: relative;
  display: flex;
  width: 1000px;
  max-width: calc(100vw - 32px);
  height: 640px;
  max-height: calc(100vh - 32px);
  border: 1px solid var(--askx-d-line);
  border-radius: 16px;
  background: var(--askx-d-surface);
  overflow: hidden;
}
.askx-nav {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: 200px;
  padding: 24px 12px;
  border-right: 1px solid var(--askx-d-line);
  background: var(--askx-d-nav);
}
.askx-nav-group { padding: 0 10px 6px; color: var(--askx-d-muted); font-size: 13px; line-height: 20px; }
.askx-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font-size: 15px !important;
  text-align: left;
  cursor: pointer;
}
.askx-nav-item svg { width: 16px; height: 16px; }
.askx-nav-item:hover { background: var(--askx-d-hover); }
.askx-nav-item-active { background: var(--askx-d-hover); }
.askx-main { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; }
.askx-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.askx-tab { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px; padding: 24px 20px 0; }
.askx-tab-header { display: flex; align-items: center; gap: 8px; padding-right: 40px; }
.askx-tab-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 550; }
.askx-tab-info { display: inline-flex; color: var(--askx-d-muted); }
.askx-tab-info svg { width: 16px; height: 16px; }
.askx-plugins-tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid var(--askx-d-line); }
.askx-plugins-tab {
  position: relative;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  color: var(--askx-d-muted) !important;
  background: transparent;
  font-size: 13px !important;
  font-weight: 500 !important;
  cursor: pointer;
}
.askx-plugins-tab:hover { color: var(--askx-d-fg) !important; }
.askx-plugins-tab-active { color: var(--askx-d-fg) !important; }
.askx-plugins-tab-active::after {
  content: "";
  position: absolute;
  inset-inline: 8px;
  bottom: -1px;
  height: 2px;
  border-radius: 1px;
  background: var(--askx-d-fg);
}
.askx-search-bar { display: flex; align-items: center; gap: 12px; }
.askx-search { flex: 1; min-width: 0; background: transparent; border-color: var(--askx-d-line); }
.askx-filter { width: 120px; }
.askx-plugins-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-inline: -20px;
  padding: 0 20px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.askx-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.askx-empty { margin: 0; padding: 32px 0; color: var(--askx-d-muted); font-size: 14px; text-align: center; }
.askx-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 120px;
  border: 1px solid var(--askx-d-line);
  border-radius: 8px;
  background: var(--askx-d-surface);
  overflow: hidden;
}
.askx-card-required { opacity: 0.4; }
.askx-card-body { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
.askx-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.askx-card-name { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
.askx-card-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--askx-d-chip);
}
.askx-card-icon svg { width: 14px; height: 14px; }
.askx-card-title { min-width: 0; overflow: hidden; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.askx-card-badge { display: inline-flex; flex: none; color: var(--askx-d-tertiary); }
.askx-card-badge svg { width: 14px; height: 14px; }
.askx-card-controls { display: flex; flex: none; align-items: center; gap: 6px; }
.askx-card-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: 6px;
  color: var(--askx-d-tertiary) !important;
  background: transparent;
  cursor: pointer;
}
.askx-card-btn svg { width: 14px; height: 14px; }
.askx-card-spacer { visibility: hidden; pointer-events: none; }
.askx-card-btn:hover, .askx-card-btn.askx-active { color: var(--askx-d-fg) !important; }
.askx-card-desc {
  display: -webkit-box;
  margin-top: 4px;
  overflow: hidden;
  color: var(--askx-d-muted);
  font-size: 13px;
  line-height: 1.5;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.askx-card-separator { height: 1px; background: var(--askx-d-line); }
.askx-card-footer { display: flex; align-items: center; gap: 6px; padding: 6px 12px; }
.askx-card-author { overflow: hidden; color: var(--askx-d-tertiary); font-size: 11.2px; text-overflow: ellipsis; white-space: nowrap; }
.askx-switch:disabled { cursor: not-allowed; }
.askx-about-actions { display: flex; gap: 8px; }
.askx-slider-row { display: flex; align-items: center; gap: 12px; width: 100%; }
.askx-slider-wrap { position: relative; flex: 1; min-width: 0; height: 20px; }
.askx-slider-rail { position: absolute; left: 8px; right: 8px; top: 50%; height: 6px; transform: translateY(-50%); border-radius: 999px; background: var(--askx-d-track); pointer-events: none; }
.askx-slider-fill { height: 100%; border-radius: inherit; background: var(--askx-d-fg); }
.askx-slider-thumb { position: absolute; top: 50%; width: 16px; height: 16px; border-radius: 50%; background: var(--askx-d-fg); transform: translate(-50%, -50%); }
.askx-slider { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.askx-slider-value { flex: none; min-width: 3ch; color: var(--askx-d-muted); font-size: 14px; font-variant-numeric: tabular-nums; text-align: right; }

/* Scrollbars: thin thumb on a transparent track (as Void++ does), so a
   scrolling textarea or list never paints a dark strip over rounded corners
   or the focus border. Applies to every scroll area in the settings UI. */
.askx-layer, .askx-layer * {
  scrollbar-width: thin;
  scrollbar-color: var(--askx-d-scroll) transparent;
}
.askx-layer ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
.askx-layer ::-webkit-scrollbar-track, .askx-layer ::-webkit-scrollbar-corner { background: transparent; }
.askx-layer ::-webkit-scrollbar-thumb { border-radius: 999px; background: var(--askx-d-scroll); }
.askx-layer ::-webkit-resizer { background: transparent; }
/* Keep the thumb off the rounded corners of text boxes. */
.askx-textarea { scrollbar-gutter: auto; clip-path: inset(0 round 11px); }
/* Number fields: no native spinner block clashing with the dark field. */
.askx-number { appearance: textfield; -moz-appearance: textfield; }
.askx-number::-webkit-inner-spin-button, .askx-number::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

/* Quick prompts: list rows + one-at-a-time editor (list/detail). */
.askx-prompt-list { display: flex; flex-direction: column; gap: 8px; }
.askx-prompt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 12px;
  border: 1px solid var(--askx-d-line);
  border-radius: 8px;
  background: var(--askx-d-surface);
}
.askx-prompt-row:hover { background: var(--askx-d-hover); }
.askx-prompt-open {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 0 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.askx-prompt-open:focus-visible { outline: 2px solid var(--askx-d-accent); outline-offset: 2px; }
.askx-prompt-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--askx-d-chip);
}
.askx-prompt-icon .askx-icon-holder { width: 16px; height: 16px; }
.askx-prompt-icon[data-state="empty"] .askx-icon-holder, .askx-prompt-icon[data-state="error"] .askx-icon-holder { display: none; }
.askx-prompt-text { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.askx-prompt-name { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; line-height: 20px; }
.askx-prompt-preview { overflow: hidden; color: var(--askx-d-muted); font-size: 12.5px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.askx-prompt-chevron { display: inline-flex; flex: none; color: var(--askx-d-tertiary); transform: rotate(-90deg); }
.askx-prompt-chevron svg { width: 14px; height: 14px; }
.askx-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--askx-d-muted);
  background: var(--askx-d-chip);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}
.askx-empty-sm { padding: 12px 0; font-size: 13px; }

.askx-back {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 4px;
  height: 24px;
  margin-left: -6px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  color: var(--askx-d-muted) !important;
  background: transparent;
  font-size: 13px !important;
  cursor: pointer;
}
.askx-back:hover { color: var(--askx-d-fg) !important; background: var(--askx-d-hover); }
.askx-back:focus-visible { outline: 2px solid var(--askx-d-accent); outline-offset: 2px; }
.askx-back svg { width: 14px; height: 14px; transform: rotate(90deg); }
.askx-form { display: flex; flex-direction: column; gap: 16px; }
.askx-form-field { display: flex; flex-direction: column; gap: 6px; }
.askx-form-field > .askx-row + .askx-row { margin-top: 6px; }
.askx-form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.askx-dialog-editing > .askx-dialog-footer { display: none; }
/* While editing one prompt, the back link replaces the section heading. */
.askx-dialog-editing .askx-stacked > .askx-label { display: none; }
.askx-button-primary { color: #fff !important; background: var(--askx-d-accent); }
.askx-button-primary:hover { filter: brightness(1.1); }
.askx-button:disabled { opacity: 0.4; cursor: not-allowed; filter: none; }

.askx-icon-trigger {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 12px 0 3px;
  border: 1px solid var(--askx-d-line-strong);
  border-radius: 6px;
  background: var(--askx-d-input);
  font-size: 13px !important;
  cursor: pointer;
}
.askx-icon-trigger:hover { background: var(--askx-d-hover); }
.askx-icon-trigger[aria-expanded="true"] { border-color: var(--askx-d-accent); }
.askx-icon-trigger:focus-visible { outline: 2px solid var(--askx-d-accent); outline-offset: 2px; }
.askx-icon-trigger-text { color: var(--askx-d-muted); }
.askx-icon-preview {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px dashed var(--askx-d-line-strong);
  border-radius: 5px;
}
.askx-icon-preview-lg { width: 36px; height: 36px; border-radius: 6px; background: var(--askx-d-input); }
.askx-icon-preview[data-state="ok"] { border-style: solid; border-color: transparent; background: var(--askx-d-chip); }
.askx-icon-preview[data-state="error"] { border: 1px solid var(--askx-d-danger); }
.askx-icon-preview[data-state="error"]::after { content: "!"; color: var(--askx-d-danger); font-weight: 700; font-size: 14px; }
.askx-icon-preview[data-state="error"] .askx-icon-holder, .askx-icon-preview[data-state="empty"] .askx-icon-holder { display: none; }
.askx-icon-preview .askx-icon-holder { width: 16px; height: 16px; }
.askx-icon-preview-lg .askx-icon-holder { width: 20px; height: 20px; }
.askx-icon-holder, .askx-btn-icon { display: inline-flex; align-items: center; justify-content: center; }
.askx-icon-holder img, .askx-btn-icon img { display: block; width: 100%; height: 100%; object-fit: contain; }
.askx-icon-mask {
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}
.askx-icon-pop { display: flex; flex-direction: column; gap: 8px; width: 360px; padding: 12px; border-radius: 12px; }
.askx-icon-pop-row { display: flex; align-items: center; gap: 8px; }
.askx-icon-pop-row .askx-input { flex: 1; min-width: 0; }
.askx-icon-pop-actions { display: flex; justify-content: flex-end; gap: 8px; }
.askx-icon-pop-actions .askx-button-ghost { height: 32px; margin: 0; }
.askx-input.askx-input-error { border-color: var(--askx-d-danger); }
.askx-icon-error { margin: 0; color: var(--askx-d-danger); font-size: 12px; line-height: 16px; }
.askx-icon-error[hidden] { display: none; }
`;
  function injectStyles(doc = document) {
    if (doc.getElementById(STYLE_ID23)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID23;
    style.textContent = CSS11;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // src/main.js
  function boot() {
    if (document.documentElement.dataset.askx) return;
    document.documentElement.dataset.askx = "on";
    const storage = defaultStorage();
    const manager = createPluginManager(storage);
    app.manager = manager;
    app.doc = document;
    for (const plugin of ALL_PLUGINS) manager.register(plugin);
    try {
      migrateLegacy(storage.read(LEGACY_KEY), manager);
    } catch {
    }
    manager.pruneUnknown();
    injectStyles();
    manager.startAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
