// Small shared DOM, formatting and storage helpers.

import { evalAmount } from './parser.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const fmt = (cents) => euro.format(cents / 100);
export const fmtSigned = (cents) => (cents > 0 ? '+' : '') + fmt(cents);

/** Short axis labels: 1234 € -> "1,2k" */
export function fmtShort(cents) {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}k`;
  return Math.round(v).toLocaleString('de-DE');
}

export const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
export const monthNameFmt = new Intl.DateTimeFormat('de-DE', { month: 'long' });
export const shortMonthFmt = new Intl.DateTimeFormat('de-DE', { month: 'short' });
export const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });

export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const monthKey = (d) => isoDate(d).slice(0, 7);

export function keyToDate(key) {
  const [y, m, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-10-08" -> "08.10.2026" */
export const deDate = (iso) => iso.split('-').reverse().join('.');

export function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function el(tag, props = {}, ...children) {
  const { dataset, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

let toastTimer;
/** Shows a short message, optionally with an action button (e.g. "Rückgängig"). */
export function toast(message, action) {
  const t = $('#toast');
  t.replaceChildren(el('span', { textContent: message }));
  if (action) {
    const btn = el('button', { type: 'button', textContent: action.label });
    btn.addEventListener('click', () => {
      t.classList.remove('show');
      action.onClick();
    });
    t.append(btn);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 3000);
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Small values (budgets, preferences) live in localStorage. */
export const settings = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`finanzapp.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`finanzapp.${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable – setting just won't persist */
    }
  },
};

export const SETTING_KEYS = ['budget', 'categoryBudgets', 'customCategories', 'merchantMap', 'ocr', 'theme', 'lastBackup'];

/** Closes a dialog when its backdrop or a [data-close] button is tapped. */
export function wireDialog(dialog, onClose = () => dialog.close()) {
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return onClose();
    if (e.target !== dialog) return;
    // Clicks on the dialog's own padding also target it – only close for real backdrop taps
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
  });
}

/** Simple modal asking for an amount. Resolves with cents, or null when cancelled. */
export function askAmount({ title, label, value = '', confirm = 'OK', allowEmpty = false }) {
  const dialog = $('#amountDialog');
  $('#amountDialogTitle').textContent = title;
  $('#amountDialogLabel').textContent = label;
  $('#amountDialogOk').textContent = confirm;
  const input = $('#amountDialogInput');
  input.value = value;
  dialog.showModal();
  input.focus();
  input.select();
  return new Promise((resolve) => {
    const form = $('#amountDialogForm');
    const finish = (result) => {
      form.onsubmit = null;
      dialog.onclose = null;
      dialog.close();
      resolve(result);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw && allowEmpty) return finish(0);
      const cents = evalAmount(raw);
      if (!Number.isFinite(cents) || cents < 0) {
        input.setCustomValidity('Ungültiger Betrag');
        input.reportValidity();
        input.oninput = () => input.setCustomValidity('');
        return;
      }
      finish(cents);
    };
    dialog.onclose = () => finish(null);
  });
}
