// Quick-prompt icons are user-supplied URLs. X's CSP only allows images from
// its own hosts plus data:/blob:, so http(s) icons are fetched through the
// userscript manager (GM_xmlhttpRequest), turned into data: URLs, checked by
// decoding them, and cached (memory + GM storage) so they load instantly next
// time. data: URLs are used as they are.

/* global GM_xmlhttpRequest, GM_getValue, GM_setValue */

const CACHE_KEY = 'askx.iconCache.v1';
const MAX_BYTES = 512 * 1024;
const MAX_ENTRIES = 40;
const memory = new Map();

const HTTP = /^https?:\/\/[^\s]+$/i;
const DATA = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*,/i;

export function iconUrlKind(value) {
  const v = String(value || '').trim();
  if (!v) return 'empty';
  if (DATA.test(v)) return 'data';
  if (HTTP.test(v)) return 'http';
  return 'invalid';
}

// Line icons written for currentColor are drawn as a mask so they take the
// toolbar's text colour in both light and dark themes.
export function isTintable(dataUrl) {
  if (!/^data:image\/svg\+xml/i.test(dataUrl)) return false;
  try {
    const body = dataUrl.includes(';base64,') ? atob(dataUrl.split(',')[1]) : decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));
    return body.includes('currentColor');
  } catch {
    return false;
  }
}

function readCache() {
  try { return typeof GM_getValue === 'function' ? GM_getValue(CACHE_KEY, {}) || {} : {}; } catch { return {}; }
}

function writeCache(url, dataUrl) {
  if (typeof GM_setValue !== 'function') return;
  try {
    const cache = readCache();
    delete cache[url];
    cache[url] = dataUrl;
    const keys = Object.keys(cache);
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete cache[key];
    GM_setValue(CACHE_KEY, cache);
  } catch {}
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read-failed'));
    reader.readAsDataURL(blob);
  });
}

function download(url) {
  if (typeof GM_xmlhttpRequest === 'function') {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: 15_000,
        anonymous: true,
        onload: (res) => (res.status >= 200 && res.status < 300 && res.response ? resolve(res.response) : reject(new Error(`http-${res.status}`))),
        onerror: () => reject(new Error('network')),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  }
  return fetch(url, { mode: 'cors', credentials: 'omit' }).then((res) => {
    if (!res.ok) throw new Error(`http-${res.status}`);
    return res.blob();
  });
}

function decodes(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.naturalWidth || img.width ? resolve() : reject(new Error('empty')));
    img.onerror = () => reject(new Error('decode'));
    img.src = dataUrl;
  });
}

/** Resolves a user icon URL to a data: URL usable on x.com, or rejects. */
export async function resolveIcon(value) {
  const url = String(value || '').trim();
  const kind = iconUrlKind(url);
  if (kind === 'empty') return '';
  if (kind === 'invalid') throw new Error('invalid');
  if (memory.has(url)) return memory.get(url);
  const job = (async () => {
    let dataUrl = kind === 'data' ? url : readCache()[url];
    if (!dataUrl) {
      const blob = await download(url);
      if (blob.size > MAX_BYTES) throw new Error('too-large');
      if (blob.type && !/^image\//i.test(blob.type)) throw new Error('not-image');
      dataUrl = await blobToDataUrl(blob);
      if (!/^data:image\//i.test(dataUrl)) dataUrl = dataUrl.replace(/^data:[^;,]*/, 'data:image/png');
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

/** Fills `holder` with the icon for `value`; sets data-state loading/ok/error/empty. */
export function paintIcon(holder, value) {
  holder.textContent = '';
  holder.style.removeProperty('-webkit-mask-image');
  holder.style.removeProperty('mask-image');
  holder.classList.remove('askx-icon-mask');
  const kind = iconUrlKind(value);
  if (kind === 'empty') {
    holder.dataset.state = 'empty';
    return Promise.resolve('empty');
  }
  holder.dataset.state = 'loading';
  const token = Symbol('paint');
  holder._askxPaint = token;
  return resolveIcon(value).then((dataUrl) => {
    if (holder._askxPaint !== token) return 'stale';
    if (isTintable(dataUrl)) {
      holder.classList.add('askx-icon-mask');
      const css = `url("${dataUrl.replace(/"/g, '%22')}")`;
      holder.style.setProperty('-webkit-mask-image', css);
      holder.style.setProperty('mask-image', css);
    } else {
      const img = holder.ownerDocument.createElement('img');
      img.alt = '';
      img.src = dataUrl;
      holder.appendChild(img);
    }
    holder.dataset.state = 'ok';
    return 'ok';
  }, (error) => {
    if (holder._askxPaint !== token) return 'stale';
    holder.dataset.state = 'error';
    holder.dataset.error = error.message;
    return 'error';
  });
}
