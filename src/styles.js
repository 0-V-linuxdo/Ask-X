const STYLE_ID = 'askx-styles';

const CSS = `
.askx-bar, .askx-toast {
  --askx-bg: #000;
  --askx-fg: #e7e9ea;
  --askx-muted: #71767b;
  --askx-line: #2f3336;
  --askx-hover: rgba(231, 233, 234, 0.1);
  --askx-accent: #1d9bf0;
  --askx-shadow: 0 0 15px rgba(255, 255, 255, 0.2), 0 0 3px 1px rgba(255, 255, 255, 0.15);
  font: 400 14px/20px TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.askx-bar[data-theme="light"] {
  --askx-bg: #fff;
  --askx-fg: #0f1419;
  --askx-muted: #536471;
  --askx-line: #eff3f4;
  --askx-hover: rgba(15, 20, 25, 0.1);
  --askx-shadow: 0 0 15px rgba(101, 119, 134, 0.2), 0 0 3px 1px rgba(101, 119, 134, 0.15);
}

.askx-bar {
  position: fixed;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 9999px;
  color: var(--askx-fg);
  background: var(--askx-bg);
  box-shadow: var(--askx-shadow);
  user-select: none;
}
.askx-bar[hidden] { display: none !important; }
.askx-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  min-width: 30px;
  margin: 0;
  padding: 0 6px;
  border: 0;
  border-radius: 9999px;
  color: inherit;
  background: transparent;
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.askx-btn:hover, .askx-btn:focus-visible { background: var(--askx-hover); outline: none; }
.askx-btn svg { display: block; pointer-events: none; }
.askx-ghost { color: var(--askx-accent); }
.askx-prompt { gap: 5px; padding: 0 10px; }
.askx-btn-icon { width: 15px; height: 15px; }
.askx-btn-icon[data-state="error"], .askx-btn-icon[data-state="loading"] { display: none; }
.askx-prompt.askx-icon-only:has(> .askx-btn-icon[data-state="ok"]) { padding: 0 6px; }
.askx-prompt.askx-icon-only:has(> .askx-btn-icon[data-state="ok"]) > .askx-btn-label { display: none; }
.askx-prompt[data-private="true"]::after { content: "·"; margin-left: 3px; color: var(--askx-accent); }

.askx-toast {
  position: fixed;
  z-index: 2147483647;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  max-width: min(420px, calc(100vw - 32px));
  padding: 12px 16px;
  border-radius: 6px;
  color: #fff;
  background: var(--askx-accent);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  font-weight: 500;
}
.askx-toast[data-closable="true"] { padding-right: 36px; }
.askx-toast-detail { margin-top: 4px; font-weight: 400; font-size: 13px; opacity: 0.85; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.askx-toast-close { position: absolute; top: 6px; right: 8px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; color: inherit; background: transparent; font-size: 18px; line-height: 22px; cursor: pointer; opacity: 0.8; }
.askx-toast-close:hover { opacity: 1; background: rgba(255, 255, 255, 0.15); }
.askx-toast[data-kind="error"] { background: #f4212e; }
.askx-toast[data-kind="private"] { background: #3c3f44; }

/* Settings dialog: mirrors the Void++ plugin dialog (Grok design tokens). */
.askx-layer {
  --askx-d-surface: #181716;
  --askx-d-raised: #201f1d;
  --askx-d-pop: #363636;
  --askx-d-fg: #fcfcfc;
  --askx-d-muted: #9e9e9e;
  --askx-d-line: rgba(252, 252, 252, 0.06);
  --askx-d-line-strong: rgba(252, 252, 252, 0.1);
  --askx-d-input: rgba(83, 83, 83, 0.3);
  --askx-d-hover: rgba(252, 252, 252, 0.08);
  --askx-d-track: rgba(252, 252, 252, 0.2);
  --askx-d-accent: #427eff;
  --askx-d-danger: #e5484d;
  --askx-d-overlay: rgba(0, 0, 0, 0.5);
  --askx-d-nav: #131211;
  --askx-d-chip: rgba(252, 252, 252, 0.1);
  --askx-d-tertiary: #858585;
  --askx-d-scroll: rgba(252, 252, 252, 0.18);
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  color: var(--askx-d-fg);
  font: 400 15px/1.5 universalSans, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.askx-layer[data-theme="light"] {
  --askx-d-surface: #ffffff;
  --askx-d-raised: #f7f7f7;
  --askx-d-pop: #ffffff;
  --askx-d-fg: #0d0d0d;
  --askx-d-muted: #6b6b6b;
  --askx-d-line: rgba(13, 13, 13, 0.08);
  --askx-d-line-strong: rgba(13, 13, 13, 0.12);
  --askx-d-input: rgba(13, 13, 13, 0.02);
  --askx-d-hover: rgba(13, 13, 13, 0.06);
  --askx-d-track: rgba(13, 13, 13, 0.15);
  --askx-d-overlay: rgba(0, 0, 0, 0.3);
  --askx-d-nav: #f7f7f7;
  --askx-d-chip: rgba(13, 13, 13, 0.06);
  --askx-d-tertiary: #8a8a8a;
  --askx-d-scroll: rgba(13, 13, 13, 0.2);
}
.askx-layer *, .askx-layer *::before, .askx-layer *::after { box-sizing: border-box; }
.askx-layer button, .askx-layer input, .askx-layer textarea { font: inherit; color: inherit; }
.askx-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--askx-d-overlay);
}
.askx-overlay-nested { background: var(--askx-d-overlay); }
.askx-overlay-nested .askx-dialog { box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45); }
.askx-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 512px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  padding: 24px;
  border: 1px solid var(--askx-d-line);
  border-radius: 16px;
  background: var(--askx-d-surface);
  overflow: hidden;
}
.askx-dialog-sm { width: 448px; }
/* Close button centred on the title line and flush with the content edge. */
.askx-dialog-close { position: absolute; top: 24px; right: 24px; z-index: 1; }
.askx-settings-dialog .askx-dialog-close { right: 20px; }
.askx-dialog-header { display: flex; flex-direction: column; gap: 8px; padding-right: 40px; text-align: left; }
.askx-dialog-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 550; letter-spacing: 0; }
.askx-dialog-desc { margin: 0; color: var(--askx-d-muted); font-size: 14px; line-height: 21px; }
.askx-separator { flex: none; height: 1px; background: var(--askx-d-line); }
.askx-field { display: flex; flex-direction: column; gap: 4px; }
.askx-field-label { font-size: 14px; line-height: 21px; font-weight: 500; }
.askx-paragraph { margin: 0; color: var(--askx-d-muted); font-size: 14px; line-height: 21px; }
.askx-settings { flex: 1 1 auto; min-height: 0; }
.askx-settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  margin: 8px -24px 0;
  padding: 0 24px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.askx-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0; }
.askx-stacked { display: flex; flex-direction: column; gap: 8px; }
.askx-label { display: flex; flex-direction: column; min-width: 0; }
.askx-label-title { font-size: 14px; line-height: 21px; font-weight: 500; }
.askx-label-desc { color: var(--askx-d-muted); font-size: 13px; line-height: 19.5px; }

.askx-switch {
  position: relative;
  flex: none;
  width: 32px;
  height: 18px;
  padding: 2px;
  border: 0;
  border-radius: 9999px;
  background: var(--askx-d-track);
  box-shadow: inset 0 0 0 1px var(--askx-d-line-strong);
  cursor: pointer;
  transition: background-color 0.15s;
}
.askx-switch[data-state="checked"] { background: var(--askx-d-accent); }
.askx-switch-thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
}
.askx-switch[data-state="checked"] .askx-switch-thumb { transform: translateX(14px); }
.askx-switch:focus-visible, .askx-select:focus-visible, .askx-button:focus-visible, .askx-icon-btn:focus-visible,
.askx-card-btn:focus-visible, .askx-nav-item:focus-visible, .askx-plugins-tab:focus-visible { outline: 2px solid var(--askx-d-accent); outline-offset: 2px; }
.askx-layer button:focus:not(:focus-visible) { outline: none; }

.askx-select {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--askx-d-line);
  border-radius: 6px;
  background: var(--askx-d-input);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  font-size: 14px !important;
  line-height: 21px;
  white-space: nowrap;
  cursor: pointer;
}
.askx-select:hover { background: var(--askx-d-hover); }
.askx-select-chevron { display: inline-flex; opacity: 0.5; }
.askx-select-chevron svg { width: 16px; height: 16px; }
.askx-select[aria-expanded="true"] .askx-select-chevron { transform: rotate(180deg); }
.askx-select-content {
  position: fixed;
  z-index: 2;
  padding: 4px;
  border: 1px solid var(--askx-d-line);
  border-radius: 16px;
  background: var(--askx-d-pop);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.askx-select-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 6px 40px 6px 8px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 21px;
  white-space: nowrap;
  cursor: default;
  user-select: none;
}
.askx-select-item:hover, .askx-select-item[data-state="checked"] { background: var(--askx-d-hover); }
.askx-select-check { position: absolute; right: 10px; display: inline-flex; }
.askx-select-check svg { width: 16px; height: 16px; }

.askx-input {
  height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--askx-d-line-strong);
  border-radius: 6px;
  background: var(--askx-d-input);
  font-size: 14px !important;
  outline: none;
}
.askx-number { flex: none; width: 96px; }
.askx-input:focus { border-color: var(--askx-d-accent); }
.askx-textarea-wrap {
  border: 1px solid var(--askx-d-line-strong);
  border-radius: 12px;
  background: var(--askx-d-raised);
}
.askx-textarea {
  display: block;
  width: 100%;
  min-height: 60px;
  padding: 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font-size: 14px !important;
  line-height: 21px;
  resize: vertical;
  outline: none;
}
.askx-textarea-wrap:focus-within { border-color: var(--askx-d-accent); }
.askx-textarea::placeholder, .askx-input::placeholder { color: var(--askx-d-muted); }

.askx-presets { display: flex; flex-direction: column; gap: 8px; }
/* Text starts where the name input's text starts (1px border + 12px padding). */

.askx-dialog-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; }
.askx-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  font-size: 13px !important;
  font-weight: 500 !important;
  cursor: pointer;
}
.askx-button svg { width: 16px; height: 16px; }
.askx-button-ghost { height: 24px; padding: 0 10px; background: transparent; }
/* Ghost button text lines up with the content edge above it. */
.askx-dialog-footer .askx-button-ghost:last-child { margin-right: -10px; }
.askx-button-ghost:hover { background: var(--askx-d-hover); }
.askx-button-secondary { background: var(--askx-d-hover); }
.askx-button-secondary:hover { background: var(--askx-d-line-strong); }
.askx-button-danger { color: #fff !important; background: var(--askx-d-danger); }
.askx-button-danger:hover { filter: brightness(1.1); }
.askx-add { align-self: flex-start; }
.askx-icon-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.askx-icon-btn:hover { background: var(--askx-d-hover); }
.askx-icon-btn svg { width: 16px; height: 16px; }

/* Settings window: side nav + plugin list, after the Void++ settings layout. */
.askx-settings-dialog {
  position: relative;
  display: flex;
  width: 1000px;
  max-width: calc(100vw - 32px);
  height: 640px;
  max-height: calc(100vh - 32px);
  border: 1px solid var(--askx-d-line);
  border-radius: 16px;
  background: var(--askx-d-surface);
  overflow: hidden;
}
.askx-nav {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: 200px;
  padding: 24px 12px;
  border-right: 1px solid var(--askx-d-line);
  background: var(--askx-d-nav);
}
.askx-nav-group { padding: 0 10px 6px; color: var(--askx-d-muted); font-size: 13px; line-height: 20px; }
.askx-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font-size: 15px !important;
  text-align: left;
  cursor: pointer;
}
.askx-nav-item svg { width: 16px; height: 16px; }
.askx-nav-item:hover { background: var(--askx-d-hover); }
.askx-nav-item-active { background: var(--askx-d-hover); }
.askx-main { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; }
.askx-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.askx-tab { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px; padding: 24px 20px 0; }
.askx-tab-header { display: flex; align-items: center; gap: 8px; padding-right: 40px; }
.askx-tab-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 550; }
.askx-tab-info { display: inline-flex; color: var(--askx-d-muted); }
.askx-tab-info svg { width: 16px; height: 16px; }
.askx-plugins-tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid var(--askx-d-line); }
.askx-plugins-tab {
  position: relative;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  color: var(--askx-d-muted) !important;
  background: transparent;
  font-size: 13px !important;
  font-weight: 500 !important;
  cursor: pointer;
}
.askx-plugins-tab:hover { color: var(--askx-d-fg) !important; }
.askx-plugins-tab-active { color: var(--askx-d-fg) !important; }
.askx-plugins-tab-active::after {
  content: "";
  position: absolute;
  inset-inline: 8px;
  bottom: -1px;
  height: 2px;
  border-radius: 1px;
  background: var(--askx-d-fg);
}
.askx-search-bar { display: flex; align-items: center; gap: 12px; }
.askx-search { flex: 1; min-width: 0; background: transparent; border-color: var(--askx-d-line); }
.askx-filter { width: 120px; }
.askx-plugins-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-inline: -20px;
  padding: 0 20px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.askx-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.askx-empty { margin: 0; padding: 32px 0; color: var(--askx-d-muted); font-size: 14px; text-align: center; }
.askx-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 120px;
  border: 1px solid var(--askx-d-line);
  border-radius: 8px;
  background: var(--askx-d-surface);
  overflow: hidden;
}
.askx-card-required { opacity: 0.4; }
.askx-card-body { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
.askx-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.askx-card-name { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
.askx-card-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--askx-d-chip);
}
.askx-card-icon svg { width: 14px; height: 14px; }
.askx-card-title { min-width: 0; overflow: hidden; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.askx-card-badge { display: inline-flex; flex: none; color: var(--askx-d-tertiary); }
.askx-card-badge svg { width: 14px; height: 14px; }
.askx-card-controls { display: flex; flex: none; align-items: center; gap: 6px; }
.askx-card-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: 6px;
  color: var(--askx-d-tertiary) !important;
  background: transparent;
  cursor: pointer;
}
.askx-card-btn svg { width: 14px; height: 14px; }
.askx-card-spacer { visibility: hidden; pointer-events: none; }
.askx-card-btn:hover, .askx-card-btn.askx-active { color: var(--askx-d-fg) !important; }
.askx-card-desc {
  display: -webkit-box;
  margin-top: 4px;
  overflow: hidden;
  color: var(--askx-d-muted);
  font-size: 13px;
  line-height: 1.5;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.askx-card-separator { height: 1px; background: var(--askx-d-line); }
.askx-card-footer { display: flex; align-items: center; gap: 6px; padding: 6px 12px; }
.askx-card-author { overflow: hidden; color: var(--askx-d-tertiary); font-size: 11.2px; text-overflow: ellipsis; white-space: nowrap; }
.askx-switch:disabled { cursor: not-allowed; }
.askx-about-actions { display: flex; gap: 8px; }
.askx-slider-row { display: flex; align-items: center; gap: 12px; width: 100%; }
.askx-slider-wrap { position: relative; flex: 1; min-width: 0; height: 20px; }
.askx-slider-rail { position: absolute; left: 8px; right: 8px; top: 50%; height: 6px; transform: translateY(-50%); border-radius: 999px; background: var(--askx-d-track); pointer-events: none; }
.askx-slider-fill { height: 100%; border-radius: inherit; background: var(--askx-d-fg); }
.askx-slider-thumb { position: absolute; top: 50%; width: 16px; height: 16px; border-radius: 50%; background: var(--askx-d-fg); transform: translate(-50%, -50%); }
.askx-slider { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.askx-slider-value { flex: none; min-width: 3ch; color: var(--askx-d-muted); font-size: 14px; font-variant-numeric: tabular-nums; text-align: right; }

/* Scrollbars: thin thumb on a transparent track (as Void++ does), so a
   scrolling textarea or list never paints a dark strip over rounded corners
   or the focus border. Applies to every scroll area in the settings UI. */
.askx-layer, .askx-layer * {
  scrollbar-width: thin;
  scrollbar-color: var(--askx-d-scroll) transparent;
}
.askx-layer ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
.askx-layer ::-webkit-scrollbar-track, .askx-layer ::-webkit-scrollbar-corner { background: transparent; }
.askx-layer ::-webkit-scrollbar-thumb { border-radius: 999px; background: var(--askx-d-scroll); }
.askx-layer ::-webkit-resizer { background: transparent; }
/* Keep the thumb off the rounded corners of text boxes. */
.askx-textarea { scrollbar-gutter: auto; clip-path: inset(0 round 11px); }
/* Number fields: no native spinner block clashing with the dark field. */
.askx-number { appearance: textfield; -moz-appearance: textfield; }
.askx-number::-webkit-inner-spin-button, .askx-number::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

/* Quick prompts: list rows + one-at-a-time editor (list/detail). */
.askx-prompt-list { display: flex; flex-direction: column; gap: 8px; }
.askx-prompt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 12px;
  border: 1px solid var(--askx-d-line);
  border-radius: 8px;
  background: var(--askx-d-surface);
}
.askx-prompt-row:hover { background: var(--askx-d-hover); }
.askx-prompt-open {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 0 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.askx-prompt-open:focus-visible { outline: 2px solid var(--askx-d-accent); outline-offset: 2px; }
.askx-prompt-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--askx-d-chip);
}
.askx-prompt-icon .askx-icon-holder { width: 16px; height: 16px; }
.askx-prompt-icon[data-state="empty"] .askx-icon-holder, .askx-prompt-icon[data-state="error"] .askx-icon-holder { display: none; }
.askx-prompt-text { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.askx-prompt-name { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; line-height: 20px; }
.askx-prompt-preview { overflow: hidden; color: var(--askx-d-muted); font-size: 12.5px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.askx-prompt-chevron { display: inline-flex; flex: none; color: var(--askx-d-tertiary); transform: rotate(-90deg); }
.askx-prompt-chevron svg { width: 14px; height: 14px; }
.askx-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--askx-d-muted);
  background: var(--askx-d-chip);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}
.askx-empty-sm { padding: 12px 0; font-size: 13px; }

.askx-back {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 4px;
  height: 24px;
  margin-left: -6px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  color: var(--askx-d-muted) !important;
  background: transparent;
  font-size: 13px !important;
  cursor: pointer;
}
.askx-back:hover { color: var(--askx-d-fg) !important; background: var(--askx-d-hover); }
.askx-back:focus-visible { outline: 2px solid var(--askx-d-accent); outline-offset: 2px; }
.askx-back svg { width: 14px; height: 14px; transform: rotate(90deg); }
.askx-form { display: flex; flex-direction: column; gap: 16px; }
.askx-form-field { display: flex; flex-direction: column; gap: 6px; }
.askx-form-field > .askx-row + .askx-row { margin-top: 6px; }
.askx-form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.askx-dialog-editing > .askx-dialog-footer { display: none; }
/* While editing one prompt, the back link replaces the section heading. */
.askx-dialog-editing .askx-stacked > .askx-label { display: none; }
.askx-button-primary { color: #fff !important; background: var(--askx-d-accent); }
.askx-button-primary:hover { filter: brightness(1.1); }
.askx-button:disabled { opacity: 0.4; cursor: not-allowed; filter: none; }

.askx-icon-trigger {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 12px 0 3px;
  border: 1px solid var(--askx-d-line-strong);
  border-radius: 6px;
  background: var(--askx-d-input);
  font-size: 13px !important;
  cursor: pointer;
}
.askx-icon-trigger:hover { background: var(--askx-d-hover); }
.askx-icon-trigger[aria-expanded="true"] { border-color: var(--askx-d-accent); }
.askx-icon-trigger:focus-visible { outline: 2px solid var(--askx-d-accent); outline-offset: 2px; }
.askx-icon-trigger-text { color: var(--askx-d-muted); }
.askx-icon-preview {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px dashed var(--askx-d-line-strong);
  border-radius: 5px;
}
.askx-icon-preview-lg { width: 36px; height: 36px; border-radius: 6px; background: var(--askx-d-input); }
.askx-icon-preview[data-state="ok"] { border-style: solid; border-color: transparent; background: var(--askx-d-chip); }
.askx-icon-preview[data-state="error"] { border: 1px solid var(--askx-d-danger); }
.askx-icon-preview[data-state="error"]::after { content: "!"; color: var(--askx-d-danger); font-weight: 700; font-size: 14px; }
.askx-icon-preview[data-state="error"] .askx-icon-holder, .askx-icon-preview[data-state="empty"] .askx-icon-holder { display: none; }
.askx-icon-preview .askx-icon-holder { width: 16px; height: 16px; }
.askx-icon-preview-lg .askx-icon-holder { width: 20px; height: 20px; }
.askx-icon-holder, .askx-btn-icon { display: inline-flex; align-items: center; justify-content: center; }
.askx-icon-holder img, .askx-btn-icon img { display: block; width: 100%; height: 100%; object-fit: contain; }
.askx-icon-mask {
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}
.askx-icon-pop { display: flex; flex-direction: column; gap: 8px; width: 360px; padding: 12px; border-radius: 12px; }
.askx-icon-pop-row { display: flex; align-items: center; gap: 8px; }
.askx-icon-pop-row .askx-input { flex: 1; min-width: 0; }
.askx-icon-pop-actions { display: flex; justify-content: flex-end; gap: 8px; }
.askx-icon-pop-actions .askx-button-ghost { height: 32px; margin: 0; }
.askx-input.askx-input-error { border-color: var(--askx-d-danger); }
.askx-icon-error { margin: 0; color: var(--askx-d-danger); font-size: 12px; line-height: 16px; }
.askx-icon-error[hidden] { display: none; }
`;

export function injectStyles(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);
}
