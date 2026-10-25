// Shared runtime handles, filled in at boot (and by tests).
export const app = {
  manager: null,
  doc: typeof document !== 'undefined' ? document : null
};
