// Per-plugin settings dialog, laid out like the Void++ PluginDialog:
// name + description, separator, 作者, 设置 (one row per option), 重置.

import { OptionType } from '../api/plugins.js';
import { ICONS } from '../icons.js';
import { createSelect, createSlider, createSwitch, createTextArea } from './controls.js';
import { el } from './dom.js';
import { keepEdges } from './gutter.js';
import { createPresetEditor } from './presetEditor.js';

function label(doc, title, description) {
  return el(doc, 'div', { class: 'askx-label' }, [
    el(doc, 'div', { class: 'askx-label-title', text: title }),
    description ? el(doc, 'div', { class: 'askx-label-desc', text: description }) : null
  ]);
}

const row = (doc, def, control) => el(doc, 'div', { class: 'askx-row' }, [label(doc, def.label, def.description), control]);
const stacked = (doc, def, control) => el(doc, 'div', { class: 'askx-stacked' }, [label(doc, def.label, def.description), control]);

function field(doc, settings, key, def, layer) {
  const value = settings.get(key);
  switch (def.type) {
    case OptionType.BOOLEAN:
      return row(doc, def, createSwitch(doc, value, (v) => settings.set(key, v), { label: def.label }));
    case OptionType.SELECT:
      return row(doc, def, createSelect(doc, def.options, value, (v) => settings.set(key, v), layer));
    case OptionType.NUMBER: {
      const input = el(doc, 'input', { type: 'number', min: def.min, max: def.max, class: 'askx-input askx-number', 'aria-label': def.label });
      input.value = value;
      input.addEventListener('change', () => { settings.set(key, input.value); input.value = settings.get(key); });
      return row(doc, def, input);
    }
    case OptionType.SLIDER:
      return stacked(doc, def, createSlider(doc, value, def, (v) => settings.set(key, v)));
    case OptionType.STRING:
      if (def.multiline) {
        return stacked(doc, def, createTextArea(doc, value, (area) => {
          settings.set(key, area.value);
          area.value = settings.get(key);
        }, { label: def.label }));
      }
      {
        const input = el(doc, 'input', { type: 'text', class: 'askx-input', placeholder: def.placeholder || '', spellcheck: 'false', 'aria-label': def.label });
        input.value = value;
        input.addEventListener('change', () => { settings.set(key, input.value); input.value = settings.get(key); });
        return stacked(doc, def, input);
      }
    case OptionType.COMPONENT:
      if (def.component === 'presets') return stacked(doc, def, createPresetEditor(doc, settings, key, layer));
      if (typeof def.component === 'function') return (def.stacked ? stacked : row)(doc, def, def.component(doc, layer));
      return null;
    default:
      return null;
  }
}

export function confirmDialog(doc, layer, { title, description, confirmText, onConfirm }) {
  const close = () => box.remove();
  const box = el(doc, 'div', { class: 'askx-overlay askx-overlay-nested', 'data-askx-modal': '', onmousedown: (e) => { if (e.target === box) close(); } }, [
    el(doc, 'div', { class: 'askx-dialog askx-dialog-sm', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title }, [
      el(doc, 'div', { class: 'askx-dialog-header' }, [
        el(doc, 'h2', { class: 'askx-dialog-title', text: title }),
        el(doc, 'p', { class: 'askx-dialog-desc', text: description })
      ]),
      el(doc, 'div', { class: 'askx-dialog-footer' }, [
        el(doc, 'button', { type: 'button', class: 'askx-button askx-button-secondary', text: '取消', onclick: close }),
        el(doc, 'button', { type: 'button', class: 'askx-button askx-button-danger', text: confirmText, onclick: () => { close(); onConfirm(); } })
      ])
    ])
  ]);
  layer.appendChild(box);
  return close;
}

export function openPluginDialog(doc, layer, plugin) {
  const settings = plugin.settings;
  const entries = settings ? Object.entries(settings.def).filter(([, d]) => !d.hidden) : [];
  const list = el(doc, 'div', { class: 'askx-settings-list' });
  const render = () => {
    list.textContent = '';
    if (!entries.length) list.appendChild(el(doc, 'p', { class: 'askx-paragraph', text: '这个插件没有可调的设置。' }));
    for (const [key, def] of entries) {
      const node = field(doc, settings, key, def, layer);
      if (node) list.appendChild(node);
    }
  };
  render();

  const close = () => box.remove();
  const dialog = el(doc, 'div', { class: 'askx-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': plugin.name }, [
    el(doc, 'button', { type: 'button', class: 'askx-icon-btn askx-dialog-close', 'aria-label': '关闭', title: '关闭', html: ICONS.close, onclick: close }),
    el(doc, 'div', { class: 'askx-dialog-header' }, [
      el(doc, 'h2', { class: 'askx-dialog-title', text: plugin.name }),
      el(doc, 'p', { class: 'askx-dialog-desc', text: plugin.description })
    ]),
    el(doc, 'div', { class: 'askx-separator', role: 'separator' }),
    el(doc, 'div', { class: 'askx-field' }, [
      el(doc, 'div', { class: 'askx-field-label', text: '作者' }),
      el(doc, 'p', { class: 'askx-paragraph', text: plugin.authors.join(', ') })
    ]),
    el(doc, 'div', { class: 'askx-field askx-settings' }, [
      el(doc, 'div', { class: 'askx-field-label', text: '设置' }),
      list
    ]),
    entries.length ? el(doc, 'div', { class: 'askx-dialog-footer' }, [
      el(doc, 'button', {
        type: 'button',
        class: 'askx-button askx-button-ghost',
        text: '重置',
        onclick: () => confirmDialog(doc, layer, {
          title: '重置设置',
          description: `把 ${plugin.name} 的设置恢复为默认值？此操作无法撤销。`,
          confirmText: '重置',
          onConfirm: () => { settings.reset(); render(); }
        })
      })
    ]) : null
  ]);
  const box = el(doc, 'div', { class: 'askx-overlay askx-overlay-nested', 'data-askx-modal': '', onmousedown: (e) => { if (e.target === box) close(); } }, [dialog]);
  layer.appendChild(box);
  keepEdges(list, 24);
  return { element: box, close };
}
