// X localises aria-labels, so the drawer buttons are matched by the string X
// itself would render. Those strings live in X's webpack i18n module as
// o("<key>","<text>"); we read them from the page once and fall back to known
// English/Chinese labels when the module is not reachable.

export const X_KEYS = {
  newChat: 'ica55d24',
  privateChat: 'd285710e',
  privateNotice: 'c590ddd2',
  send: 'b5df32b0'
};

const FALLBACK = {
  newChat: ['New Chat', '新聊天', '新对话', '新建聊天'],
  privateChat: ['Private Chat', '私密聊天', '隐私聊天', '私人聊天'],
  privateNotice: ['This chat won’t appear in your history'],
  send: ['Grok something', 'Grok 一下', 'Send', '发送']
};

let cache = null;
let scannedAt = 0;
// Scanning X's webpack modules is expensive; when the keys are not found
// (X changed its strings), keep the fallback labels and only rescan rarely.
const RESCAN_MS = 300_000;

function pageWindow() {
  // eslint-disable-next-line no-undef
  return typeof unsafeWindow !== 'undefined' ? unsafeWindow : globalThis;
}

function readFromChunks(win) {
  const found = {};
  const chunkKey = Object.keys(win).find((key) => key.startsWith('webpackChunk'));
  const chunks = chunkKey ? win[chunkKey] : null;
  if (!Array.isArray(chunks)) return found;
  const wanted = Object.entries(X_KEYS);
  for (const chunk of chunks) {
    const modules = chunk?.[1];
    if (!modules) continue;
    for (const id of Object.keys(modules)) {
      let src;
      try { src = String(modules[id]); } catch { continue; }
      if (!src.includes(X_KEYS.newChat) && !src.includes(X_KEYS.privateChat)) continue;
      for (const [name, key] of wanted) {
        if (found[name]) continue;
        const m = new RegExp(`\\("${key}",\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(src);
        if (m) {
          try { found[name] = JSON.parse(`"${m[1]}"`); } catch { found[name] = m[1]; }
        }
      }
      if (wanted.every(([name]) => found[name])) return found;
    }
  }
  return found;
}

let partial = null;

export function xLabels(win = pageWindow()) {
  if (cache) return cache;
  if (partial && Date.now() - scannedAt < RESCAN_MS) return partial;
  scannedAt = Date.now();
  let found = {};
  try { found = readFromChunks(win); } catch {}
  const labels = {};
  for (const name of Object.keys(X_KEYS)) {
    labels[name] = [...new Set([found[name], ...FALLBACK[name]].filter(Boolean))];
  }
  if (found.newChat && found.privateChat) cache = labels;
  else partial = labels;
  return labels;
}

export function resetLabelCache() {
  cache = null;
  partial = null;
  scannedAt = 0;
}
