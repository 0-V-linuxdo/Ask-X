// Ask X settings, shaped like the Void++ settings: a dialog with a side nav,
// a Plugins tab (category tabs, search + filter, two-column plugin cards with
// star / pin / config / switch, required plugins after a separator) and an
// About tab. Config opens the per-plugin dialog.

import { ICONS } from '../icons.js';
import { META } from '../meta-info.js';
import { pageTheme } from '../theme.js';
import { createSelect, createSwitch } from './controls.js';
import { el } from './dom.js';
import { keepEdges } from './gutter.js';
import { confirmDialog, openPluginDialog } from './pluginDialog.js';

export const CATEGORIES = [
  { id: 'favorites', label: '收藏' },
  { id: 'all', label: '全部' },
  { id: 'composer', label: '输入框' },
  { id: 'appearance', label: '外观' },
  { id: 'messages', label: '消息' },
  { id: 'chats', label: '对话' },
  { id: 'privacy', label: '隐私' },
  { id: 'notifications', label: '通知' },
  { id: 'navigation', label: '导航' },
  { id: 'declutter', label: '精简' },
  { id: 'developer', label: '开发' }
];

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' }
];

function pluginCard(doc, manager, plugin, onConfig, onChange) {
  const enabled = manager.isEnabled(plugin.name);
  const starred = manager.isStarred(plugin.name);
  const pinned = manager.isPinned(plugin.name);
  const iconButton = (icon, labelText, cls, onclick) => el(doc, 'button', {
    type: 'button', class: `askx-card-btn ${cls}`, title: labelText, 'aria-label': labelText, html: icon,
    onclick: (e) => { e.stopPropagation(); onclick(); }
  });
  // Keep a fixed slot for every control so stars, pins and switches line up
  // in columns across cards, whether or not a card has settings.
  const spacer = () => el(doc, 'span', { class: 'askx-card-btn askx-card-spacer', 'aria-hidden': 'true' });
  const controls = [
    iconButton(starred ? ICONS.starFilled : ICONS.star, starred ? '取消收藏' : '收藏', starred ? 'askx-active' : '', () => { manager.toggleStar(plugin.name); onChange(); }),
    plugin.required ? spacer() : iconButton(pinned ? ICONS.pinFilled : ICONS.pin, pinned ? '取消置顶' : '置顶', pinned ? 'askx-active' : '', () => { manager.togglePin(plugin.name); onChange(); }),
    plugin.settings ? iconButton(ICONS.sliders, '设置', 'askx-card-config', () => onConfig(plugin)) : spacer(),
    createSwitch(doc, enabled, () => { manager.toggle(plugin.name); onChange(); }, { label: `启用 ${plugin.name}`, disabled: plugin.required })
  ];
  return el(doc, 'div', { class: `askx-card${plugin.required ? ' askx-card-required' : ''}`, 'data-plugin': plugin.name }, [
    el(doc, 'div', { class: 'askx-card-body' }, [
      el(doc, 'div', { class: 'askx-card-head' }, [
        el(doc, 'div', { class: 'askx-card-name' }, [
          el(doc, 'span', { class: 'askx-card-icon', html: plugin.icon || ICONS.plug }),
          el(doc, 'span', { class: 'askx-card-title', text: plugin.name, title: plugin.name }),
          plugin.required ? el(doc, 'span', { class: 'askx-card-badge', title: 'Ask X 运行必需的插件', html: ICONS.info }) : null
        ]),
        el(doc, 'div', { class: 'askx-card-controls' }, controls)
      ]),
      el(doc, 'div', { class: 'askx-card-desc', text: plugin.description })
    ]),
    el(doc, 'div', { class: 'askx-card-separator' }),
    el(doc, 'div', { class: 'askx-card-footer' }, [el(doc, 'span', { class: 'askx-card-author', text: plugin.authors.join(', ') })])
  ]);
}

function pluginsTab(doc, manager, layer) {
  const all = manager.order.map((n) => manager.plugins[n]);
  const state = {
    category: manager.data.starred.length ? 'favorites' : 'all',
    search: '',
    filter: 'all'
  };
  const root = el(doc, 'div', { class: 'askx-tab askx-plugins' });
  const tabs = el(doc, 'div', { class: 'askx-plugins-tabs', role: 'tablist' });
  const list = el(doc, 'div', { class: 'askx-plugins-list' });
  const search = el(doc, 'input', { type: 'text', class: 'askx-input askx-search', placeholder: `搜索 ${all.length} 个插件…`, 'aria-label': '搜索插件' });
  search.addEventListener('input', () => { state.search = search.value; renderList(); });
  const filter = createSelect(doc, FILTERS, state.filter, (v) => { state.filter = v; renderList(); }, layer, { className: 'askx-filter' });

  const inCategory = (p) => {
    if (state.category === 'favorites') return manager.isStarred(p.name);
    if (state.category === 'all') return true;
    return p.tags.includes(state.category);
  };
  const visibleTabs = () => CATEGORIES.filter((c) => c.id === 'favorites' || c.id === 'all' || all.some((p) => p.tags.includes(c.id)));

  function renderTabs() {
    tabs.textContent = '';
    for (const c of visibleTabs()) {
      tabs.appendChild(el(doc, 'button', {
        type: 'button',
        role: 'tab',
        class: `askx-plugins-tab${state.category === c.id ? ' askx-plugins-tab-active' : ''}`,
        'aria-selected': String(state.category === c.id),
        text: c.label,
        onclick: () => { state.category = c.id; renderTabs(); renderList(); }
      }));
    }
  }

  function renderList() {
    const q = state.search.trim().toLowerCase();
    const match = (p) => inCategory(p)
      && (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      && (state.filter === 'all' || (state.filter === 'enabled') === manager.isEnabled(p.name));
    const byPin = (a, b) => Number(manager.isPinned(b.name)) - Number(manager.isPinned(a.name));
    const user = all.filter((p) => !p.required && match(p)).sort(byPin);
    const required = all.filter((p) => p.required && match(p));
    const card = (p) => pluginCard(doc, manager, p, (plugin) => openPluginDialog(doc, layer, plugin), renderList);
    list.textContent = '';
    if (user.length) list.appendChild(el(doc, 'div', { class: 'askx-grid' }, user.map(card)));
    if (required.length) {
      if (user.length) list.appendChild(el(doc, 'div', { class: 'askx-separator' }));
      list.appendChild(el(doc, 'div', { class: 'askx-grid' }, required.map(card)));
    }
    fitList?.();
    if (!user.length && !required.length) {
      const hint = q ? '没有匹配的插件。' : state.category === 'favorites' ? '还没有收藏。点插件上的星标收藏到这里。' : '这个分类下没有插件。';
      list.appendChild(el(doc, 'p', { class: 'askx-empty', text: hint }));
    }
  }

  let fitList = null;
  renderTabs();
  renderList();
  root.append(
    el(doc, 'div', { class: 'askx-tab-header' }, [
      el(doc, 'h2', { class: 'askx-tab-title', text: '插件' }),
      el(doc, 'span', { class: 'askx-tab-info', title: '开关功能，点调节图标设置插件。改动即时生效。', html: ICONS.info })
    ]),
    tabs,
    el(doc, 'div', { class: 'askx-search-bar' }, [search, filter]),
    list
  );
  // Measure once the list is in the document.
  queueMicrotask(() => { fitList = keepEdges(list, 20); });
  return root;
}

function aboutTab(doc, manager, layer, rerender) {
  return el(doc, 'div', { class: 'askx-tab askx-about' }, [
    el(doc, 'div', { class: 'askx-tab-header' }, [el(doc, 'h2', { class: 'askx-tab-title', text: '关于' })]),
    el(doc, 'p', { class: 'askx-paragraph', text: `${META.name} · v${META.version} · ${META.release}` }),
    el(doc, 'p', { class: 'askx-paragraph', text: '在 X 上划词问 Grok 小窗。每个功能都是一个插件，可单独开关和设置。' }),
    el(doc, 'div', { class: 'askx-about-actions' }, [
      el(doc, 'button', {
        type: 'button',
        class: 'askx-button askx-button-secondary',
        text: '重置全部设置',
        onclick: () => confirmDialog(doc, layer, {
          title: '重置全部设置',
          description: '恢复所有插件的开关和设置为默认值，并清空收藏和置顶？此操作无法撤销。',
          confirmText: '重置',
          onConfirm: () => { manager.resetAll(); rerender(); }
        })
      })
    ])
  ]);
}

export function openSettings(manager, doc = document, { tab = 'plugins' } = {}) {
  doc.querySelector('.askx-layer')?.remove();
  const layer = el(doc, 'div', { class: 'askx-layer', 'data-theme': pageTheme(doc) });
  const pane = el(doc, 'div', { class: 'askx-pane' });
  let current = tab;

  const navItem = (id, text, icon) => el(doc, 'button', {
    type: 'button',
    class: `askx-nav-item${current === id ? ' askx-nav-item-active' : ''}`,
    'data-tab': id,
    html: `${icon}<span>${text}</span>`,
    onclick: () => show(id)
  });
  const nav = el(doc, 'nav', { class: 'askx-nav', 'aria-label': 'Ask X 设置' });

  function show(id) {
    current = id;
    nav.textContent = '';
    nav.append(
      el(doc, 'div', { class: 'askx-nav-group', text: 'Ask X' }),
      navItem('plugins', '插件', ICONS.plug),
      navItem('about', '关于', ICONS.info)
    );
    pane.textContent = '';
    pane.appendChild(id === 'about' ? aboutTab(doc, manager, layer, () => show('about')) : pluginsTab(doc, manager, layer));
  }

  const close = () => {
    layer.remove();
    doc.removeEventListener('keydown', onKey, true);
  };
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (layer.querySelector('.askx-select-content')) {
      layer.dispatchEvent(new doc.defaultView.Event('askx-close-popups'));
      return;
    }
    const modals = layer.querySelectorAll('[data-askx-modal]');
    if (modals.length) modals[modals.length - 1].remove();
    else close();
  };

  const dialog = el(doc, 'div', { class: 'askx-settings-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ask X 设置' }, [
    nav,
    el(doc, 'div', { class: 'askx-main' }, [
      el(doc, 'button', { type: 'button', class: 'askx-icon-btn askx-dialog-close', 'aria-label': '关闭', title: '关闭', html: ICONS.close, onclick: close }),
      pane
    ])
  ]);
  const overlay = el(doc, 'div', { class: 'askx-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, [dialog]);
  layer.appendChild(overlay);
  layer.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.askx-select-content, .askx-select, .askx-icon-trigger')) layer.dispatchEvent(new doc.defaultView.Event('askx-close-popups'));
  });
  // Keep X's single-key shortcuts (j/k/l…) from firing while typing here.
  layer.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  show(tab);
  doc.body.appendChild(layer);
  doc.addEventListener('keydown', onKey, true);
  return { element: layer, close, show };
}
