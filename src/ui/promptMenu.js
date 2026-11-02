// Small menu of your recent prompts, opened by right-clicking the 问 Grok
// button (selection toolbar) or a post's Grok button. Picking one asks with
// that prompt; Esc, a click outside or scrolling closes it.

import { pageTheme } from '../theme.js';
import { el } from './dom.js';

const MENU = 'askx-prompt-menu';
let closeOpen = null;

const oneLine = (text, max = 40) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
};

export function closePromptMenu() {
  closeOpen?.();
}

export function openPromptMenu(doc, anchor, prompts, onPick) {
  closePromptMenu();
  const view = doc.defaultView;
  const menu = el(doc, 'div', { class: MENU, role: 'menu', 'data-theme': pageTheme(doc) });
  if (!prompts.length) menu.appendChild(el(doc, 'div', { class: 'askx-prompt-menu-empty', text: '还没有提示词历史' }));
  for (const prompt of prompts) {
    menu.appendChild(el(doc, 'button', {
      type: 'button',
      role: 'menuitem',
      class: 'askx-prompt-menu-item',
      title: prompt,
      text: oneLine(prompt),
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
        onPick(prompt);
      }
    }));
  }
  // Keep the text selection (and X's handlers) out of it.
  menu.addEventListener('mousedown', (event) => { event.preventDefault(); event.stopPropagation(); });
  doc.body.appendChild(menu);

  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const left = Math.min(view.innerWidth - w - 8, Math.max(8, r.left));
  let top = r.bottom + 6;
  if (top + h > view.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.querySelector('button')?.focus({ preventScroll: true });

  const onDown = (event) => { if (!menu.contains(event.target)) close(); };
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  function close() {
    if (closeOpen !== close) return;
    closeOpen = null;
    menu.remove();
    doc.removeEventListener('mousedown', onDown, true);
    doc.removeEventListener('keydown', onKey, true);
    view.removeEventListener('scroll', close, true);
    view.removeEventListener('resize', close);
  }
  closeOpen = close;
  doc.addEventListener('mousedown', onDown, true);
  doc.addEventListener('keydown', onKey, true);
  view.addEventListener('scroll', close, true);
  view.addEventListener('resize', close);
  return close;
}

export const PROMPT_MENU_CSS = `
.${MENU} {
  --askx-bg: #000; --askx-fg: #e7e9ea; --askx-muted: #71767b; --askx-hover: rgba(231, 233, 234, 0.1);
  --askx-shadow: 0 0 15px rgba(255, 255, 255, 0.2), 0 0 3px 1px rgba(255, 255, 255, 0.15);
  position: fixed; z-index: 2147483647; display: flex; flex-direction: column; min-width: 160px; max-width: 320px;
  padding: 4px; border-radius: 12px; color: var(--askx-fg); background: var(--askx-bg); box-shadow: var(--askx-shadow);
  font: 400 14px/20px TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; user-select: none;
}
.${MENU}[data-theme="light"] {
  --askx-bg: #fff; --askx-fg: #0f1419; --askx-muted: #536471; --askx-hover: rgba(15, 20, 25, 0.1);
  --askx-shadow: 0 0 15px rgba(101, 119, 134, 0.2), 0 0 3px 1px rgba(101, 119, 134, 0.15);
}
.askx-prompt-menu-item {
  display: block; width: 100%; margin: 0; padding: 6px 10px; border: 0; border-radius: 8px; color: inherit; background: transparent;
  font: inherit; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
}
.askx-prompt-menu-item:hover, .askx-prompt-menu-item:focus-visible { background: var(--askx-hover); outline: none; }
.askx-prompt-menu-empty { padding: 6px 10px; color: var(--askx-muted); }
`;
