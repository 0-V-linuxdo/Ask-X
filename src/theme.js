// Light or dark, following X's own theme first, then the OS.

export function pageTheme(doc = document) {
  const root = doc.documentElement;
  const named = (root.getAttribute('data-theme') || '').toLowerCase();
  if (named === 'light') return 'light';
  if (named === 'dark' || named === 'dim') return 'dark';
  const view = doc.defaultView;
  const scheme = (root.style.colorScheme || view?.getComputedStyle?.(root)?.colorScheme || '').toLowerCase();
  if (scheme.includes('dark')) return 'dark';
  if (scheme.includes('light')) return 'light';
  const bg = view?.getComputedStyle?.(doc.body || root)?.backgroundColor || '';
  const rgb = bg.match(/\d+(\.\d+)?/g);
  if (rgb && rgb.length >= 3 && (rgb.length < 4 || Number(rgb[3]) > 0)) {
    const [r, g, b] = rgb.map(Number);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? 'light' : 'dark';
  }
  return view?.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
}

export function watchTheme(doc, apply) {
  const run = () => apply(pageTheme(doc));
  run();
  const view = doc.defaultView;
  const observer = typeof view?.MutationObserver === 'function' ? new view.MutationObserver(run) : null;
  observer?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
  if (doc.body) observer?.observe(doc.body, { attributes: true, attributeFilter: ['style', 'class'] });
  const media = view?.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', run);
  return () => {
    observer?.disconnect();
    media?.removeEventListener?.('change', run);
  };
}
