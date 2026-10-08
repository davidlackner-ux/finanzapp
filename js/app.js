import { CATEGORIES, getCategory } from './categories.js';
import * as db from './db.js';
import { parseAmountInput, centsToInput, parseReceipt } from './parser.js';
import { recognizeReceipt } from './ocr.js';

const $ = (sel) => document.querySelector(sel);
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmt = (cents) => euro.format(cents / 100);
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });

const state = {
  month: firstOfMonth(new Date()),
  transactions: [],
  filterCategory: null,
  editing: null, // transaction being edited, or null for new
  photo: undefined, // Blob = new photo, null = removed, undefined = unchanged
  ocrToken: 0,
  touched: new Set(), // form fields the user changed manually (OCR won't overwrite them)
};

// ---------- settings (small values, localStorage) ----------

const settings = {
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

// ---------- helpers ----------

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthKey(d) {
  return isoDate(d).slice(0, 7);
}

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Downscale photos so storage stays small (≈200–400 KB per receipt) while text stays readable. */
async function compressImage(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82));
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- rendering ----------

function render() {
  const key = monthKey(state.month);
  $('#monthLabel').textContent = monthFmt.format(state.month);
  const isCurrentMonth = key === monthKey(new Date());
  $('#nextMonth').disabled = isCurrentMonth;

  const monthTx = state.transactions.filter((t) => t.date.startsWith(key));
  const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  $('#sumExpense').textContent = fmt(expense);
  $('#sumIncome').textContent = fmt(income);
  const bal = $('#sumBalance');
  bal.textContent = (balance > 0 ? '+' : '') + fmt(balance);
  bal.className = balance < 0 ? 'negative' : balance > 0 ? 'positive' : '';

  renderBudget(expense, isCurrentMonth);
  renderBreakdown(monthTx);
  renderList(monthTx);
}

function renderBudget(expense, isCurrentMonth) {
  const budget = settings.get('budget', 0);
  const box = $('#budgetBox');
  box.hidden = !budget;
  if (!budget) return;
  const ratio = expense / budget;
  const fill = $('#budgetFill');
  fill.style.width = `${Math.min(100, ratio * 100)}%`;
  fill.className = ratio > 1 ? 'over' : ratio > 0.8 ? 'warn' : '';
  let text = ratio > 1
    ? `${fmt(expense - budget)} über dem Budget von ${fmt(budget)}`
    : `Noch ${fmt(budget - expense)} von ${fmt(budget)} übrig`;
  if (isCurrentMonth && ratio <= 1) {
    const now = new Date();
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    text += ` · ${fmt(Math.floor((budget - expense) / daysLeft))} pro Tag`;
  }
  $('#budgetText').textContent = text;
}

function renderBreakdown(monthTx) {
  const totals = new Map();
  for (const t of monthTx) {
    if (t.type !== 'expense') continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  const card = $('#breakdownCard');
  card.hidden = totals.size === 0;
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...totals.values());
  const rows = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => {
      const cat = getCategory(id);
      const row = el(
        'button',
        { className: `bar-row${state.filterCategory === id ? ' active' : ''}`, type: 'button' },
        el('span', { className: 'bar-label', textContent: `${cat.icon} ${cat.label}` }),
        el('span', { className: 'bar-value', textContent: `${fmt(amount)} · ${Math.round((amount / sum) * 100)} %` }),
        el('div', { className: 'bar' }, el('div', { style: `width:${(amount / max) * 100}%` })),
      );
      row.addEventListener('click', () => {
        state.filterCategory = state.filterCategory === id ? null : id;
        render();
      });
      return row;
    });
  $('#categoryBreakdown').replaceChildren(...rows);
}

function renderList(monthTx) {
  const filterBtn = $('#clearFilter');
  let list = monthTx;
  if (state.filterCategory) {
    const cat = getCategory(state.filterCategory);
    filterBtn.hidden = false;
    filterBtn.textContent = `${cat.icon} ${cat.label} ✕`;
    list = list.filter((t) => t.category === state.filterCategory);
  } else {
    filterBtn.hidden = true;
  }

  const container = $('#txList');
  if (!list.length) {
    container.replaceChildren(
      el(
        'div',
        { className: 'empty' },
        el('div', { className: 'empty-icon', textContent: '🧾' }),
        el('p', { textContent: 'Noch keine Buchungen in diesem Monat.' }),
        el('p', { className: 'label', textContent: 'Tippe auf „📷 Beleg“, um eine Rechnung zu fotografieren, oder auf ＋ für eine schnelle Eingabe.' }),
      ),
    );
    return;
  }

  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const groups = new Map();
  for (const t of sorted) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }

  const nodes = [];
  for (const [date, items] of groups) {
    const [y, m, d] = date.split('-').map(Number);
    const daySum = items.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0);
    nodes.push(
      el(
        'div',
        { className: 'day-head' },
        el('span', { textContent: dayFmt.format(new Date(y, m - 1, d)) }),
        el('span', { textContent: fmt(daySum) }),
      ),
    );
    const card = el('div', { className: 'card tx-group' });
    for (const t of items) {
      const cat = getCategory(t.category);
      const row = el(
        'button',
        { className: 'tx', type: 'button' },
        el('span', { className: 'tx-icon', textContent: cat.icon }),
        el(
          'span',
          { className: 'tx-text' },
          el('span', { className: 'tx-title', textContent: t.note || cat.label }),
          el('span', { className: 'tx-sub', textContent: cat.label + (t.hasPhoto ? ' · 📎 Beleg' : '') }),
        ),
        el('span', {
          className: `tx-amount ${t.type === 'income' ? 'positive' : ''}`,
          textContent: (t.type === 'income' ? '+' : '−') + fmt(t.amount),
        }),
      );
      row.addEventListener('click', () => openTxDialog(t));
      card.append(row);
    }
    nodes.push(card);
  }
  container.replaceChildren(...nodes);
}

// ---------- transaction dialog ----------

const form = $('#txForm');
const txDialog = $('#txDialog');

function currentType() {
  return form.elements.type.value;
}

function renderCategoryChips(selected) {
  const cats = CATEGORIES[currentType()];
  const value = cats.some((c) => c.id === selected) ? selected : cats[0].id;
  $('#categoryChips').replaceChildren(
    ...cats.map((c) =>
      el(
        'label',
        { className: 'chip' },
        el('input', { type: 'radio', name: 'category', value: c.id, checked: c.id === value }),
        el('span', { textContent: `${c.icon} ${c.label}` }),
      ),
    ),
  );
}

let previewUrl = null;
function showPhoto(blob) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = blob ? URL.createObjectURL(blob) : null;
  const img = $('#photoPreview');
  img.hidden = !blob;
  if (blob) img.src = previewUrl;
  else img.removeAttribute('src');
  $('#removePhoto').hidden = !blob;
}

function setOcrStatus(text, kind = '') {
  const s = $('#ocrStatus');
  s.hidden = !text;
  s.textContent = text ?? '';
  s.className = `ocr-status ${kind}`;
}

async function openTxDialog(tx = null, photo = undefined) {
  state.editing = tx;
  state.photo = undefined;
  state.touched.clear();
  state.ocrToken++;
  form.reset();
  $('#formError').hidden = true;
  setOcrStatus(null);

  $('#txDialogTitle').textContent = tx ? 'Buchung bearbeiten' : 'Neue Buchung';
  $('#deleteTx').hidden = !tx;
  form.elements.type.value = tx?.type ?? 'expense';
  renderCategoryChips(tx?.category);
  $('#amountInput').value = tx ? centsToInput(tx.amount) : '';
  $('#dateInput').value = tx?.date ?? isoDate(new Date());
  $('#noteInput').value = tx?.note ?? '';
  showPhoto(null);

  txDialog.showModal();

  if (photo) {
    await setNewPhoto(photo);
  } else if (tx?.hasPhoto) {
    const blob = await db.getPhoto(tx.id);
    if (state.editing === tx && state.photo === undefined) showPhoto(blob ?? null);
  } else if (!tx) {
    $('#amountInput').focus();
  }
}

async function setNewPhoto(file) {
  let blob;
  try {
    blob = await compressImage(file);
  } catch {
    blob = file;
  }
  state.photo = blob;
  showPhoto(blob);
  if (settings.get('ocr', true)) runOcr(blob);
}

async function runOcr(blob) {
  const token = ++state.ocrToken;
  const stillCurrent = () => token === state.ocrToken && txDialog.open;
  setOcrStatus('Texterkennung wird geladen …', 'busy');
  try {
    const text = await recognizeReceipt(blob, (p, label) => {
      if (stillCurrent()) setOcrStatus(`${label} … ${Math.round(p * 100)} %`, 'busy');
    });
    if (!stillCurrent()) return;
    const result = parseReceipt(text);
    applyOcrResult(result);
  } catch (err) {
    if (stillCurrent()) setOcrStatus(`⚠️ ${err.message || 'Texterkennung fehlgeschlagen'} – bitte manuell eintragen.`, 'warn');
  }
}

function applyOcrResult({ amount, date, merchant, category }) {
  const found = [];
  if (amount && !state.touched.has('amount')) {
    $('#amountInput').value = centsToInput(amount);
    found.push(fmt(amount));
  }
  if (date && !state.touched.has('date')) {
    $('#dateInput').value = date;
    found.push(date.split('-').reverse().join('.'));
  }
  if (merchant && !state.touched.has('note')) {
    $('#noteInput').value = merchant;
    found.push(merchant);
  }
  if (category && currentType() === 'expense' && !state.touched.has('category')) {
    renderCategoryChips(category);
    found.push(getCategory(category).label);
  }
  if (!amount) {
    setOcrStatus(`Kein Betrag erkannt${found.length ? ` (erkannt: ${found.join(' · ')})` : ''} – bitte Betrag eintippen.`, 'warn');
    $('#amountInput').focus();
  } else {
    setOcrStatus(`✓ Erkannt: ${found.join(' · ')} – bitte kurz prüfen.`, 'ok');
  }
}

form.addEventListener('input', (e) => {
  const name = e.target.name;
  if (name) state.touched.add(name);
  if (name === 'type') renderCategoryChips(form.elements.category?.value);
  if (name === 'amount') $('#formError').hidden = true;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = parseAmountInput($('#amountInput').value);
  const error = $('#formError');
  if (!Number.isFinite(amount) || amount <= 0) {
    error.textContent = 'Bitte einen gültigen Betrag eingeben, z. B. 12,50';
    error.hidden = false;
    $('#amountInput').focus();
    return;
  }
  const date = $('#dateInput').value || isoDate(new Date());
  const prev = state.editing;
  const hasPhoto = state.photo instanceof Blob || (state.photo === undefined && !!prev?.hasPhoto);
  const tx = {
    id: prev?.id ?? newId(),
    type: currentType(),
    amount,
    category: form.elements.category.value,
    date,
    note: $('#noteInput').value.trim(),
    hasPhoto,
    createdAt: prev?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  try {
    await db.saveTransaction(tx, state.photo);
  } catch (err) {
    error.textContent = `Speichern fehlgeschlagen: ${err.message}`;
    error.hidden = false;
    return;
  }
  navigator.storage?.persist?.().catch(() => {});

  const i = state.transactions.findIndex((t) => t.id === tx.id);
  if (i >= 0) state.transactions[i] = tx;
  else state.transactions.push(tx);

  // Jump to the month of the saved entry so it is visible
  const [y, m] = date.split('-').map(Number);
  state.month = new Date(y, m - 1, 1);
  closeTxDialog();
  render();
  toast(prev ? 'Änderung gespeichert' : `${tx.type === 'income' ? 'Einnahme' : 'Ausgabe'} über ${fmt(amount)} gespeichert`);
});

function closeTxDialog() {
  state.ocrToken++;
  txDialog.close();
  showPhoto(null);
}

$('#deleteTx').addEventListener('click', async () => {
  const tx = state.editing;
  if (!tx || !confirm('Diese Buchung wirklich löschen?')) return;
  await db.deleteTransaction(tx.id);
  state.transactions = state.transactions.filter((t) => t.id !== tx.id);
  closeTxDialog();
  render();
  toast('Buchung gelöscht');
});

$('#removePhoto').addEventListener('click', () => {
  state.ocrToken++;
  state.photo = null;
  showPhoto(null);
  setOcrStatus(null);
});

$('#photoPreview').addEventListener('click', () => {
  $('#photoFull').src = previewUrl;
  $('#photoDialog').showModal();
});

// ---------- photo inputs ----------

let photoTarget = 'new'; // 'new' = start a new transaction from the photo, 'form' = attach to open form

function pickPhoto(input, target) {
  photoTarget = target;
  input.value = '';
  input.click();
}

for (const input of [$('#cameraInput'), $('#galleryInput')]) {
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (photoTarget === 'form' && txDialog.open) setNewPhoto(file);
    else openTxDialog(null, file);
  });
}

$('#scanBtn').addEventListener('click', () => pickPhoto($('#cameraInput'), 'new'));
$('#takePhoto').addEventListener('click', () => pickPhoto($('#cameraInput'), 'form'));
$('#pickPhoto').addEventListener('click', () => pickPhoto($('#galleryInput'), 'form'));
$('#addBtn').addEventListener('click', () => openTxDialog());

// ---------- navigation ----------

$('#prevMonth').addEventListener('click', () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
  render();
});
$('#nextMonth').addEventListener('click', () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
  render();
});
$('#clearFilter').addEventListener('click', () => {
  state.filterCategory = null;
  render();
});

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => (btn.closest('dialog') === txDialog ? closeTxDialog() : btn.closest('dialog').close()));
}
// Tap on the backdrop closes dialogs
for (const dlg of document.querySelectorAll('dialog')) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg === txDialog ? closeTxDialog() : dlg.close();
  });
}
txDialog.addEventListener('cancel', () => {
  state.ocrToken++;
  showPhoto(null);
});

// ---------- settings dialog ----------

$('#openSettings').addEventListener('click', async () => {
  const budget = settings.get('budget', 0);
  $('#budgetInput').value = budget ? centsToInput(budget) : '';
  $('#ocrToggle').checked = settings.get('ocr', true);
  const photos = state.transactions.filter((t) => t.hasPhoto).length;
  let info = `${state.transactions.length} Buchungen, ${photos} Belegfotos gespeichert.`;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage) info += ` Speicher: ${(est.usage / 1024 / 1024).toFixed(1)} MB.`;
  } catch {
    /* ignore */
  }
  $('#storageInfo').textContent = info;
  $('#settingsDialog').showModal();
});

$('#budgetInput').addEventListener('change', (e) => {
  const raw = e.target.value.trim();
  const cents = raw ? parseAmountInput(raw) : 0;
  if (Number.isNaN(cents)) return toast('Ungültiger Betrag');
  settings.set('budget', cents);
  render();
  toast(cents ? `Budget: ${fmt(cents)} pro Monat` : 'Budget entfernt');
});

$('#ocrToggle').addEventListener('change', (e) => settings.set('ocr', e.target.checked));

$('#exportCsv').addEventListener('click', () => {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Typ', 'Kategorie', 'Betrag', 'Notiz', 'Beleg']];
  for (const t of [...state.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([
      t.date.split('-').reverse().join('.'),
      t.type === 'income' ? 'Einnahme' : 'Ausgabe',
      getCategory(t.category).label,
      (t.type === 'income' ? '' : '-') + centsToInput(t.amount),
      t.note,
      t.hasPhoto ? 'ja' : 'nein',
    ]);
  }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  download(`finanzen-${isoDate(new Date())}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

$('#exportBackup').addEventListener('click', async () => {
  const photos = await db.getAllPhotos();
  const encoded = {};
  for (const [id, blob] of Object.entries(photos)) encoded[id] = await blobToDataUrl(blob);
  const backup = {
    app: 'finanzapp',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { budget: settings.get('budget', 0) },
    transactions: state.transactions,
    photos: encoded,
  };
  download(`finanzapp-backup-${isoDate(new Date())}.json`, new Blob([JSON.stringify(backup)], { type: 'application/json' }));
});

$('#importBackup').addEventListener('click', () => $('#importInput').click());
$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'finanzapp' || !Array.isArray(data.transactions)) throw new Error('Keine gültige Backup-Datei');
    if (!confirm(`${data.transactions.length} Buchungen aus dem Backup übernehmen? Vorhandene Einträge bleiben erhalten.`)) return;
    const photos = {};
    for (const [id, url] of Object.entries(data.photos ?? {})) photos[id] = await (await fetch(url)).blob();
    await db.importData(data.transactions, photos);
    if (data.settings?.budget && !settings.get('budget', 0)) settings.set('budget', data.settings.budget);
    state.transactions = await db.getAllTransactions();
    $('#settingsDialog').close();
    render();
    toast(`${data.transactions.length} Buchungen wiederhergestellt`);
  } catch (err) {
    alert(`Import fehlgeschlagen: ${err.message}`);
  }
});

$('#deleteAll').addEventListener('click', async () => {
  if (!confirm('Wirklich ALLE Buchungen und Belegfotos löschen? Das kann nicht rückgängig gemacht werden.')) return;
  await db.clearAll();
  state.transactions = [];
  $('#settingsDialog').close();
  render();
  toast('Alle Daten gelöscht');
});

// ---------- start ----------

async function init() {
  try {
    state.transactions = await db.getAllTransactions();
  } catch (err) {
    toast(`Daten konnten nicht geladen werden: ${err.message}`);
  }
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
