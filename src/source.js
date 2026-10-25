// Work out which post a selection came from.

const POST = 'article[data-testid="tweet"]';
const X_HOSTS = /^(?:www\.|mobile\.|m\.)?(?:x|twitter)\.com$/i;
const USER_STATUS = /^\/(\w{1,15})\/status\/(\d+)/;
const ANON_STATUS = /^\/i\/(?:web\/)?status\/(\d+)/;

function asElement(node) {
  if (!node) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}

export function normalizePostUrl(href, base = 'https://x.com/') {
  let url;
  try { url = new URL(String(href || ''), base); } catch { return null; }
  if (!X_HOSTS.test(url.hostname)) return null;
  const user = USER_STATUS.exec(url.pathname);
  if (user) return { url: `https://x.com/${user[1]}/status/${user[2]}`, author: user[1] };
  const anon = ANON_STATUS.exec(url.pathname);
  if (anon) return { url: `https://x.com/i/status/${anon[1]}`, author: '' };
  return null;
}

export function findPostSource(node, doc = asElement(node)?.ownerDocument || document) {
  const base = doc.defaultView?.location?.href || 'https://x.com/';
  const post = asElement(node)?.closest(POST);
  if (post) {
    for (const link of post.querySelectorAll('a[href*="/status/"]')) {
      if (link.closest(POST) !== post) continue;
      const hit = normalizePostUrl(link.getAttribute('href'), base);
      if (hit) return hit;
    }
  }
  return normalizePostUrl(base, base) || { url: '', author: '' };
}
