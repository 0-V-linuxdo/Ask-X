import { definePlugin, definePluginSettings, OptionType } from '../api/plugins.js';
import { ICONS } from '../icons.js';
import { iconUrlKind } from '../iconLoader.js';
import { DEFAULT_PRESET_ICON, legacyIconUrl, PRESET_ICONS } from '../presetIcons.js';

const MAX_ICON_LENGTH = 400_000;

function cleanIcon(raw, name) {
  if (raw === undefined) return DEFAULT_PRESET_ICON[name] || '';
  const value = String(raw).trim();
  if (value in PRESET_ICONS) return legacyIconUrl(value);
  // Keep whatever the user typed (even if it does not load yet) so the editor
  // can show it with an error, but drop oversized values.
  return value.length > MAX_ICON_LENGTH ? '' : value;
}

function cleanPreset(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 12);
  const template = String(raw.template || '');
  if (!name || !template.trim()) return null;
  // Presets saved before icons existed have no icon field: give the built-in
  // ones their default icon. An explicit '' means "no icon".
  const icon = cleanIcon(raw.icon, name);
  return { name, icon, template, private: Boolean(raw.private), autoSend: Boolean(raw.autoSend) };
}

const settings = definePluginSettings({
  presets: {
    type: OptionType.COMPONENT,
    component: 'presets',
    label: '快捷提问',
    description: '划词工具条上额外的按钮。点一条可以编辑它的名称、图标、提问模板和选项。',
    validate: (value) => (Array.isArray(value) ? value.map(cleanPreset).filter(Boolean).slice(0, 8) : undefined),
    default: [
      { name: '解释', icon: DEFAULT_PRESET_ICON.解释, template: '{url}\n\n{quote}\n\n解释一下这段话。', private: false, autoSend: false },
      { name: '翻译', icon: DEFAULT_PRESET_ICON.翻译, template: '{quote}\n\n翻译成中文。', private: false, autoSend: false }
    ]
  },
  showLabels: {
    type: OptionType.BOOLEAN,
    label: '显示文字',
    description: '按钮上除了图标再显示名称。关闭时只显示图标，悬停可看名称；没有图标的按钮仍显示文字。',
    default: false
  }
});

export default definePlugin({
  name: 'QuickPrompts',
  description: '在划词工具条上加“解释”“翻译”这类一键提问按钮，每个按钮有自己的图标和提问模板。',
  icon: ICONS.zap,
  tags: ['composer'],
  enabledByDefault: true,
  settings,
  // Runs last so a preset's own template, private and auto-send win.
  askOrder: 90,
  // Inside Grok (follow-up) only the non-private presets make sense: a
  // private chat would have to start over.
  toolbarButtons: () => settings.store.presets.map((preset, index) => ({
    id: 'preset',
    label: `${preset.name}${preset.private ? '（无痕）' : ''}`,
    text: preset.name,
    iconUrl: iconUrlKind(preset.icon) === 'invalid' ? '' : preset.icon,
    className: settings.store.showLabels ? 'askx-prompt' : 'askx-prompt askx-icon-only',
    data: preset.private ? { private: 'true' } : {},
    preset: index,
    contexts: preset.private ? ['post'] : ['post', 'grok'],
    order: 20 + index
  })),
  onAsk(ctx) {
    if (ctx.trigger.id !== 'preset') return;
    const preset = settings.store.presets[ctx.trigger.preset];
    if (!preset) return;
    ctx.template = preset.template;
    ctx.plan.autoSend = preset.autoSend;
    if (preset.private) ctx.plan.privateMode = 'on';
  }
});
