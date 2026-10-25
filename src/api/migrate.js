// One-time import of the v1 flat settings into per-plugin settings.

export const LEGACY_KEY = 'askx.settings.v1';

export function migrateLegacy(legacy, manager) {
  if (!legacy || typeof legacy !== 'object' || manager.data.migratedV1) return false;
  const set = (name, patch) => manager.mergePluginData(name, patch);
  if (legacy.openIn === 'current') set('NewChat', { enabled: false });
  if (typeof legacy.template === 'string' && legacy.template.trim()) set('QuoteFormat', { template: legacy.template });
  if (Array.isArray(legacy.presets)) set('QuickPrompts', { presets: legacy.presets });
  manager.data.migratedV1 = true;
  manager.mergePluginData('Settings', {});
  return true;
}
