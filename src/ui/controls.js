// Controls styled after Grok/Void++: switch, select with popover, inputs.

import { ICONS } from '../icons.js';
import { el } from './dom.js';

export function createSwitch(doc, checked, onChange, { label, disabled } = {}) {
  const sw = el(doc, 'button', { type: 'button', role: 'switch', class: 'askx-switch', 'aria-label': label || null, disabled: Boolean(disabled) }, [
    el(doc, 'span', { class: 'askx-switch-thumb' })
  ]);
  const set = (value) => {
    sw.setAttribute('aria-checked', String(value));
    sw.dataset.state = value ? 'checked' : 'unchecked';
  };
  set(Boolean(checked));
  sw.addEventListener('click', (event) => {
    event.stopPropagation();
    if (sw.disabled) return;
    const next = sw.getAttribute('aria-checked') !== 'true';
    set(next);
    onChange(next);
  });
  return sw;
}

// options: [{ value, label }]
export function createSelect(doc, options, value, onChange, layer, { className = '' } = {}) {
  const text = el(doc, 'span', { class: 'askx-select-value' });
  const trigger = el(doc, 'button', { type: 'button', role: 'combobox', class: `askx-select ${className}`.trim(), 'aria-expanded': 'false', 'aria-haspopup': 'listbox' }, [
    text,
    el(doc, 'span', { class: 'askx-select-chevron', html: ICONS.chevron })
  ]);
  const setValue = (v) => {
    trigger.dataset.value = String(v);
    text.textContent = (options.find((o) => String(o.value) === String(v)) || options[0]).label;
  };
  setValue(value);

  let menu = null;
  const close = () => {
    menu?.remove();
    menu = null;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu = el(doc, 'div', { role: 'listbox', class: 'askx-select-content' }, options.map((o) => {
      const selected = String(o.value) === trigger.dataset.value;
      return el(doc, 'div', {
        role: 'option',
        class: 'askx-select-item',
        'aria-selected': String(selected),
        'data-state': selected ? 'checked' : 'unchecked',
        onclick: () => {
          setValue(o.value);
          close();
          onChange(o.value);
        }
      }, [el(doc, 'span', { text: o.label }), selected ? el(doc, 'span', { class: 'askx-select-check', html: ICONS.check }) : null]);
    }));
    layer.appendChild(menu);
    const box = trigger.getBoundingClientRect();
    const view = doc.defaultView;
    menu.style.minWidth = `${Math.max(128, Math.round(box.width))}px`;
    const left = Math.min(box.left, view.innerWidth - menu.offsetWidth - 8);
    let top = box.bottom + 4;
    if (top + menu.offsetHeight > view.innerHeight - 8) top = box.top - menu.offsetHeight - 4;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    trigger.setAttribute('aria-expanded', 'true');
  };
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (menu) close();
    else {
      layer.dispatchEvent(new doc.defaultView.Event('askx-close-popups'));
      open();
    }
  });
  layer.addEventListener('askx-close-popups', close);
  return trigger;
}

export function createTextArea(doc, value, onChange, { rows = 4, placeholder = '', label } = {}) {
  const area = el(doc, 'textarea', { rows, spellcheck: 'false', placeholder, class: 'askx-textarea', 'aria-label': label || null });
  area.value = value;
  area.addEventListener('change', () => onChange(area));
  return el(doc, 'div', { class: 'askx-textarea-wrap' }, [area]);
}

export function createSlider(doc, value, { min, max }, onChange) {
  const wrap = el(doc, 'div', { class: 'askx-slider-row' });
  const rail = el(doc, 'div', { class: 'askx-slider-rail' }, [el(doc, 'div', { class: 'askx-slider-fill' }), el(doc, 'div', { class: 'askx-slider-thumb' })]);
  const input = el(doc, 'input', { type: 'range', min, max, step: 1, class: 'askx-slider' });
  const out = el(doc, 'span', { class: 'askx-slider-value' });
  const paint = (n) => {
    const pct = max === min ? 100 : ((n - min) / (max - min)) * 100;
    rail.firstChild.style.width = `${pct}%`;
    rail.lastChild.style.left = `${pct}%`;
    out.textContent = String(n);
  };
  input.value = value;
  paint(Number(value));
  input.addEventListener('input', () => { paint(Number(input.value)); onChange(Number(input.value)); });
  wrap.append(el(doc, 'div', { class: 'askx-slider-wrap' }, [rail, input]), out);
  return wrap;
}
