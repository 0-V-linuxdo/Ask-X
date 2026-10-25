// Keyboard message switching, part of MessageNavigator as in Void++'s
// BetterNavigator: ↑ / ↓ move to the
// previous / next message, Home / End to the first / last, ⌘/Ctrl + ↑ / ↓ to
// the very top / bottom. Never while you are typing. In the drawer it only
// acts while the pointer is over the drawer (or focus is inside it), so the
// arrow keys keep scrolling the X timeline everywhere else.

import { app } from './app.js';
import { getDrawer } from './drawer.js';
import { activeIndex, getMessages, grokRoots, isTypingTarget, jumpTo, onGrokPage, scrollerOf } from './grok.js';

let onlyUserFn = () => false;

let overDrawer = false;
// Smooth scrolling takes a moment; quick repeated presses continue from the
// message we last jumped to instead of from the half-scrolled position.
let last = { root: null, idx: -1, at: 0 };

function onPointer(event) {
  const drawer = getDrawer(app.doc);
  overDrawer = Boolean(drawer && event.target instanceof app.doc.defaultView.Node && drawer.contains(event.target));
}

// Which Grok surface the keys should drive right now, if any.
export function targetRoot(doc = app.doc) {
  const roots = grokRoots(doc);
  const drawer = getDrawer(doc);
  const inDrawer = roots.find((r) => r === drawer);
  if (inDrawer && (overDrawer || drawer.contains(doc.activeElement))) return inDrawer;
  if (onGrokPage(doc)) return roots.find((r) => r !== drawer) || null;
  return null;
}

export function step(root, key, { meta = false, onlyUser = onlyUserFn() } = {}) {
  const all = getMessages(root);
  const messages = onlyUser ? all.filter((m) => m.role === 'user') : all;
  if (!messages.length) return -1;
  if (meta) {
    const scroller = scrollerOf(messages[0].el);
    const top = key === 'ArrowUp' ? 0 : scroller.scrollHeight;
    try { scroller.scrollTo({ top, behavior: 'smooth' }); } catch { scroller.scrollTop = top; }
    return key === 'ArrowUp' ? 0 : messages.length - 1;
  }
  let idx;
  if (key === 'Home') idx = 0;
  else if (key === 'End') idx = messages.length - 1;
  else {
    const scroller = scrollerOf(messages[0].el);
    const recent = last.root === root && Date.now() - last.at < 700 && last.idx < messages.length;
    const current = recent ? last.idx : activeIndex(messages, scroller);
    // If the current message's top is already off-screen above, ↑ first
    // brings that message's own start back into view.
    const head = messages[current].el.getBoundingClientRect().top;
    const viewTop = scroller === app.doc.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
    if (key === 'ArrowUp') idx = !recent && head < viewTop - 8 ? current : current - 1;
    else idx = current + 1;
  }
  idx = Math.max(0, Math.min(messages.length - 1, idx));
  jumpTo(messages[idx], { effect: 'none' });
  last = { root, idx, at: Date.now() };
  return idx;
}

function onKeyDown(event) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  if (event.altKey || event.shiftKey) return;
  if (isTypingTarget(event.target) || isTypingTarget(app.doc.activeElement)) return;
  if (event.target.closest?.('.askx-layer, [role="menu"], [role="listbox"], [role="dialog"]')) return;
  const root = targetRoot();
  if (!root) return;
  const meta = (event.metaKey || event.ctrlKey) && (event.key === 'ArrowUp' || event.key === 'ArrowDown');
  if ((event.metaKey || event.ctrlKey) && !meta) return;
  if (step(root, event.key, { meta }) < 0) return;
  event.preventDefault();
  event.stopPropagation();
}

// onlyUser(): whether to skip Grok's replies (follows the navigator setting).
export function startMessageKeys(onlyUser = () => false) {
  onlyUserFn = onlyUser;
  app.doc.addEventListener('keydown', onKeyDown, true);
  app.doc.addEventListener('pointerover', onPointer, true);
}

export function stopMessageKeys() {
  app.doc.removeEventListener('keydown', onKeyDown, true);
  app.doc.removeEventListener('pointerover', onPointer, true);
  overDrawer = false;
}
