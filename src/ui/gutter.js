// A scrolling list sits in the parent's padding (negative margin) so its
// scrollbar lands at the outer edge; this trims the right padding by the
// scrollbar width so the content keeps the same right edge as the header,
// whether or not a scrollbar is showing (and whatever its width).

export function keepEdges(list, gutter) {
  const apply = () => {
    const bar = list.offsetWidth - list.clientWidth;
    list.style.paddingRight = `${Math.max(0, gutter - bar)}px`;
  };
  apply();
  const view = list.ownerDocument.defaultView;
  if (typeof view?.ResizeObserver === 'function') {
    const ro = new view.ResizeObserver(apply);
    ro.observe(list);
    for (const child of list.children) ro.observe(child);
  }
  return apply;
}
