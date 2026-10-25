// Quick prompt editor, as a list + detail view:
// - List: one compact row per prompt (icon, name, one-line template preview,
//   small badges). Click a row to edit it; trash deletes it.
// - Detail: one prompt at a time with labelled fields (名称, 图标, 提问模板,
//   选项) and an explicit 取消 / 保存. The icon URL lives in a popover behind
//   the icon button, so a long data: URL never fills the main view.

import { iconUrlKind, paintIcon } from '../iconLoader.js';
import { ICONS } from '../icons.js';
import { createSwitch, createTextArea } from './controls.js';
import { el } from './dom.js';

const ICON_ERRORS = {
  invalid: '请填写 https:// 图片地址或 data:image/… URL。',
  'not-image': '这个地址返回的不是图片。',
  'too-large': '图片太大（上限 512 KB）。'
};

function iconErrorText(code) {
  if (!code) return '';
  const http = /^http-(\d+)$/.exec(code);
  return ICON_ERRORS[code] || (http ? `图片地址返回错误（HTTP ${http[1]}），请换一个地址。` : '图标加载失败，请检查地址是否能打开。');
}

function iconBox(doc, url, cls) {
  const box = el(doc, 'span', { class: cls, 'aria-hidden': 'true' });
  const holder = el(doc, 'span', { class: 'askx-icon-holder' });
  box.appendChild(holder);
  const paint = (value) => {
    box.dataset.state = iconUrlKind(value) === 'empty' ? 'empty' : 'loading';
    return paintIcon(holder, value).then((state) => {
      if (state !== 'stale') box.dataset.state = holder.dataset.state;
      return holder.dataset;
    });
  };
  void paint(url);
  return { box, paint };
}

// Icon button + popover with the URL field, live preview and errors.
function iconPicker(doc, layer, value, onChange) {
  let current = value;
  const preview = iconBox(doc, current, 'askx-icon-preview');
  const trigger = el(doc, 'button', { type: 'button', class: 'askx-icon-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, [
    preview.box,
    el(doc, 'span', { class: 'askx-icon-trigger-text' })
  ]);
  const label = () => {
    const kind = iconUrlKind(current);
    trigger.querySelector('.askx-icon-trigger-text').textContent = kind === 'empty' ? '添加图标' : kind === 'data' ? '已设置（data URL）' : '已设置（图片地址）';
  };
  label();

  let pop = null;
  const close = () => {
    pop?.remove();
    pop = null;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    const input = el(doc, 'input', { class: 'askx-input', placeholder: 'https://… 或 data:image/…', 'aria-label': '图标 URL', spellcheck: 'false' });
    input.value = current;
    const big = iconBox(doc, current, 'askx-icon-preview askx-icon-preview-lg');
    const error = el(doc, 'p', { class: 'askx-icon-error', role: 'status', hidden: true });
    let timer = 0;
    const check = () => big.paint(input.value.trim()).then((data) => {
      const bad = data.state === 'error';
      input.classList.toggle('askx-input-error', bad);
      error.hidden = !bad;
      error.textContent = bad ? iconErrorText(data.error) : '';
    });
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(check, 350); });
    const apply = (next) => {
      current = next;
      label();
      void preview.paint(current);
      onChange(current);
      close();
    };
    pop = el(doc, 'div', { class: 'askx-select-content askx-icon-pop', role: 'dialog', 'aria-label': '图标' }, [
      el(doc, 'div', { class: 'askx-field-label', text: '图标 URL' }),
      el(doc, 'div', { class: 'askx-icon-pop-row' }, [big.box, input]),
      error,
      el(doc, 'p', { class: 'askx-label-desc', text: '支持 https 图片地址或 data:image URL。外站图片会通过脚本管理器下载并缓存。' }),
      el(doc, 'div', { class: 'askx-icon-pop-actions' }, [
        el(doc, 'button', { type: 'button', class: 'askx-button askx-button-ghost', text: '移除图标', onclick: () => apply('') }),
        el(doc, 'button', { type: 'button', class: 'askx-button askx-button-primary', text: '完成', onclick: () => apply(input.value.trim()) })
      ])
    ]);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(input.value.trim()); } });
    layer.appendChild(pop);
    void check();
    const box = trigger.getBoundingClientRect();
    const view = doc.defaultView;
    let top = box.bottom + 6;
    if (top + pop.offsetHeight > view.innerHeight - 8) top = box.top - pop.offsetHeight - 6;
    pop.style.left = `${Math.round(Math.min(box.left, view.innerWidth - pop.offsetWidth - 8))}px`;
    pop.style.top = `${Math.round(top)}px`;
    trigger.setAttribute('aria-expanded', 'true');
  };
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (pop) close();
    else {
      layer.dispatchEvent(new doc.defaultView.Event('askx-close-popups'));
      open();
    }
  });
  layer.addEventListener('askx-close-popups', close);
  return { element: trigger, get value() { return current; } };
}

function badge(doc, text) {
  return el(doc, 'span', { class: 'askx-badge', text });
}

function oneLine(template) {
  return String(template || '').replace(/\s+/g, ' ').trim();
}

export function createPresetEditor(doc, settings, key, layer) {
  const root = el(doc, 'div', { class: 'askx-presets' });
  // Hide the plugin dialog's own 重置 while one prompt is being edited, so
  // only the editor's 取消 / 保存 are on screen.
  const setEditing = (on) => root.closest('.askx-dialog')?.classList.toggle('askx-dialog-editing', on);

  function showList() {
    setEditing(false);
    root.textContent = '';
    const presets = settings.get(key);
    const list = el(doc, 'div', { class: 'askx-prompt-list', role: 'list' });
    presets.forEach((preset, index) => {
      const remove = el(doc, 'button', {
        type: 'button', class: 'askx-card-btn', title: '删除', 'aria-label': `删除 ${preset.name}`, html: ICONS.trash,
        onclick: (e) => {
          e.stopPropagation();
          const next = settings.get(key).filter((_, i) => i !== index);
          settings.set(key, next);
          showList();
        }
      });
      const row = el(doc, 'div', { class: 'askx-prompt-row', role: 'listitem' }, [
        el(doc, 'button', { type: 'button', class: 'askx-prompt-open', 'aria-label': `编辑 ${preset.name}`, onclick: () => showEditor(index) }, [
          iconBox(doc, preset.icon, 'askx-prompt-icon').box,
          el(doc, 'span', { class: 'askx-prompt-text' }, [
            el(doc, 'span', { class: 'askx-prompt-name' }, [
              el(doc, 'span', { text: preset.name }),
              preset.private ? badge(doc, '无痕') : null,
              preset.autoSend ? badge(doc, '自动发送') : null
            ]),
            el(doc, 'span', { class: 'askx-prompt-preview', text: oneLine(preset.template) })
          ]),
          el(doc, 'span', { class: 'askx-prompt-chevron', html: ICONS.chevron })
        ]),
        remove
      ]);
      list.appendChild(row);
    });
    if (!presets.length) list.appendChild(el(doc, 'p', { class: 'askx-empty askx-empty-sm', text: '还没有快捷提问。' }));
    root.append(list, el(doc, 'button', {
      type: 'button',
      class: 'askx-button askx-button-secondary askx-add',
      html: `${ICONS.plus}<span>添加快捷提问</span>`,
      onclick: () => showEditor(-1)
    }));
  }

  function showEditor(index) {
    setEditing(true);
    const presets = settings.get(key);
    const draft = index >= 0 ? { ...presets[index] } : { name: '', icon: '', template: '{quote}\n\n', private: false, autoSend: false };
    root.textContent = '';

    const name = el(doc, 'input', { class: 'askx-input', placeholder: '例如：总结', maxlength: 12, 'aria-label': '名称' });
    name.value = draft.name;
    const picker = iconPicker(doc, layer, draft.icon || '', (value) => { draft.icon = value; });
    const template = createTextArea(doc, draft.template, () => {}, { rows: 5, label: '提问模板', placeholder: '{quote}\n\n你的问题' });
    const area = template.querySelector('textarea');
    const save = el(doc, 'button', { type: 'button', class: 'askx-button askx-button-primary', text: '保存' });
    const sync = () => { save.disabled = !name.value.trim() || !area.value.trim(); };
    name.addEventListener('input', sync);
    area.addEventListener('input', sync);
    sync();

    const field = (labelText, control, hint) => el(doc, 'div', { class: 'askx-form-field' }, [
      el(doc, 'div', { class: 'askx-label-title', text: labelText }),
      control,
      hint ? el(doc, 'div', { class: 'askx-label-desc', text: hint }) : null
    ]);
    const option = (title, desc, prop) => el(doc, 'div', { class: 'askx-row' }, [
      el(doc, 'div', { class: 'askx-label' }, [
        el(doc, 'div', { class: 'askx-label-title', text: title }),
        el(doc, 'div', { class: 'askx-label-desc', text: desc })
      ]),
      createSwitch(doc, draft[prop], (v) => { draft[prop] = v; }, { label: title })
    ]);

    save.addEventListener('click', () => {
      const next = { ...draft, name: name.value.trim(), template: area.value };
      const list = settings.get(key);
      if (index >= 0) list[index] = next;
      else list.push(next);
      settings.set(key, list);
      showList();
    });

    root.append(
      el(doc, 'button', { type: 'button', class: 'askx-back', html: `${ICONS.chevron}<span>快捷提问</span>`, onclick: showList }),
      el(doc, 'div', { class: 'askx-form' }, [
        field('名称', name),
        field('图标', picker.element, '可选。显示在工具条按钮的名字前面。'),
        field('提问模板', template, '占位符：{quote} 带 > 的原文、{text} 原文、{url} 推文链接、{author} 作者。'),
        el(doc, 'div', { class: 'askx-form-field' }, [
          el(doc, 'div', { class: 'askx-label-title', text: '选项' }),
          option('无痕', '用 Grok 的 Private Chat 新对话提问。', 'private'),
          option('自动发送', '写入后直接发送。适合问题已经写好的提问，例如翻译。', 'autoSend')
        ])
      ]),
      el(doc, 'div', { class: 'askx-form-actions' }, [
        el(doc, 'button', { type: 'button', class: 'askx-button askx-button-secondary', text: '取消', onclick: showList }),
        save
      ])
    );
  }

  showList();
  return root;
}
