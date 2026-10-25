// Line icons (24px grid, currentColor) used as data: URLs for the default
// quick prompts, and to migrate presets saved with the earlier built-in icon
// keys (lightbulb, languages, …) to plain icon URLs.

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const PRESET_ICONS = {
  lightbulb: { label: '解释', svg: svg('<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>') },
  languages: { label: '翻译', svg: svg('<path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>') },
  list: { label: '总结', svg: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>') },
  help: { label: '提问', svg: svg('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>') },
  search: { label: '查证', svg: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>') },
  sparkles: { label: '润色', svg: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>') },
  message: { label: '评论', svg: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') },
  book: { label: '背景', svg: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>') },
  code: { label: '代码', svg: svg('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>') },
  pen: { label: '改写', svg: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>') },
  check: { label: '核对', svg: svg('<path d="M20 6 9 17l-5-5"/>') },
  alert: { label: '风险', svg: svg('<path d="m10.3 3.9-8.2 14A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-3.1l-8.2-14a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>') },
  link: { label: '来源', svg: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>') },
  smile: { label: '有趣', svg: svg('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>') },
  chart: { label: '数据', svg: svg('<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>') },
  zap: { label: '快速', svg: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>') }
};

export const svgDataUrl = (markup) => `data:image/svg+xml,${encodeURIComponent(markup)}`;

export function legacyIconUrl(key) {
  return PRESET_ICONS[key] ? svgDataUrl(PRESET_ICONS[key].svg) : '';
}

// Defaults for the two built-in prompts, also given to presets saved before
// icons existed.
export const DEFAULT_PRESET_ICON = { 解释: legacyIconUrl('lightbulb'), 翻译: legacyIconUrl('languages') };
