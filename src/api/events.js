// Tiny event bus between plugins (e.g. AskGrok reports results, Toasts shows them).

const handlers = new Map();

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type)?.delete(fn);
}

export function emit(type, payload) {
  for (const fn of handlers.get(type) || []) {
    try { fn(payload); } catch (error) { console.error('[Ask X] event handler failed', type, error); }
  }
}
