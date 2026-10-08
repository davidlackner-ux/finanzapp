// The add/edit transaction sheet, including receipt photo + OCR.

import { getCategories, getCategory } from './categories.js';
import * as db from './db.js';
import { evalAmount, centsToInput, parseReceipt } from './parser.js';
import { recognizeReceipt } from './ocr.js';
import { frequentEntries, sumOf } from './stats.js';
import { state, refresh, saveTransaction, deleteTransaction, learnedCategory, getBudget, getCategoryBudgets } from './store.js';
import { $, el, fmt, toast, settings, isoDate, deDate, newId, keyToDate, wireDialog } from './ui.js';

const form = $('#txForm');
const dialog = $('#txDialog');

const ctx = {
  editing: null, // transaction being edited, or null for new
  photo: undefined, // Blob = new photo, null = removed, undefined = unchanged
  ocrToken: 0,
  touched: new Set(), // fields changed by hand – OCR and templates won't overwrite them
};

let onMakeRecurring = () => {};
export function setMakeRecurringHandler(fn) {
  onMakeRecurring = fn;
}

const currentType = () => form.elements.type.value;
const selectedCategory = () => form.elements.category?.value;

function renderCategoryChips(selected) {
  const cats = getCategories(currentType());
  const value = cats.some((c) => c.id === selected) ? selected : cats[0].id;
  $('#categoryChips').replaceChildren(
    ...cats.map((c) =>
      el('label', { className: 'chip' },
        el('input', { type: 'radio', name: 'category', value: c.id, checked: c.id === value }),
        el('span', { textContent: `${c.icon} ${c.label}` }),
      ),
    ),
  );
}

function setCategory(id) {
  if (!getCategories(currentType()).some((c) => c.id === id)) return false;
  renderCategoryChips(id);
  return true;
}

function renderTemplates() {
  const box = $('#templates');
  const items = ctx.editing || ctx.photo ? [] : frequentEntries(state.transactions, currentType());
  box.hidden = !items.length;
  $('#templateChips').replaceChildren(
    ...items.map((t) => {
      const cat = getCategory(t.category);
      const btn = el('button', { type: 'button', className: 'chip-btn' }, `${cat.icon} ${t.note}`, t.amount ? el('small', { textContent: ` ${fmt(t.amount)}` }) : null);
      btn.addEventListener('click', () => {
        $('#noteInput').value = t.note;
        setCategory(t.category);
        if (t.amount && !$('#amountInput').value) $('#amountInput').value = centsToInput(t.amount);
        updateCalcHint();
        if (!$('#amountInput').value) $('#amountInput').focus();
      });
      return btn;
    }),
  );
}

function renderNoteSuggestions() {
  const seen = new Set();
  const notes = [];
  for (const t of [...state.transactions].sort((a, b) => b.date.localeCompare(a.date))) {
    const n = t.note?.trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    notes.push(n);
    if (notes.length >= 200) break;
  }
  $('#noteSuggestions').replaceChildren(...notes.map((n) => el('option', { value: n })));
}

/** Shows the result of "12+3,50" live below the amount. */
function updateCalcHint() {
  const raw = $('#amountInput').value;
  const hint = $('#calcHint');
  const isExpr = /\d\s*[+\-*/×÷]\s*\d/.test(raw);
  const cents = isExpr ? evalAmount(raw) : NaN;
  hint.hidden = !isExpr || !Number.isFinite(cents);
  if (!hint.hidden) hint.textContent = `= ${fmt(cents)}`;
}

// ---------- photo ----------

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

function setCandidates(amounts) {
  const box = $('#ocrCandidates');
  box.hidden = !amounts.length;
  box.replaceChildren(
    ...(amounts.length ? [el('span', { className: 'label small', textContent: 'Anderer Betrag?' })] : []),
    ...amounts.map((a) => {
      const btn = el('button', { type: 'button', className: 'chip-btn', textContent: fmt(a) });
      btn.addEventListener('click', () => {
        $('#amountInput').value = centsToInput(a);
        ctx.touched.add('amount');
        updateCalcHint();
      });
      return btn;
    }),
  );
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

async function setNewPhoto(file) {
  let blob;
  try {
    blob = await compressImage(file);
  } catch {
    blob = file;
  }
  ctx.photo = blob;
  showPhoto(blob);
  $('#templates').hidden = true;
  if (settings.get('ocr', true)) runOcr(blob);
}

async function runOcr(blob) {
  const token = ++ctx.ocrToken;
  const stillCurrent = () => token === ctx.ocrToken && dialog.open;
  setCandidates([]);
  setOcrStatus('Texterkennung wird geladen …', 'busy');
  try {
    const text = await recognizeReceipt(blob, (p, label) => {
      if (stillCurrent()) setOcrStatus(`${label} … ${Math.round(p * 100)} %`, 'busy');
    });
    if (stillCurrent()) applyOcrResult(parseReceipt(text));
  } catch (err) {
    if (stillCurrent()) setOcrStatus(`⚠️ ${err.message || 'Texterkennung fehlgeschlagen'} – bitte manuell eintragen.`, 'warn');
  }
}

function applyOcrResult({ amount, candidates, date, merchant, category }) {
  const found = [];
  if (amount && !ctx.touched.has('amount')) {
    $('#amountInput').value = centsToInput(amount);
    updateCalcHint();
    found.push(fmt(amount));
  }
  if (date && !ctx.touched.has('date')) {
    $('#dateInput').value = date;
    found.push(deDate(date));
  }
  if (merchant && !ctx.touched.has('note')) {
    $('#noteInput').value = merchant;
    found.push(merchant);
  }
  // What the user picked for this merchant before beats the keyword guess
  const cat = learnedCategory(merchant) ?? category;
  if (cat && currentType() === 'expense' && !ctx.touched.has('category') && setCategory(cat)) {
    found.push(getCategory(cat).label);
  }
  setCandidates(candidates ?? []);
  if (!amount) {
    setOcrStatus(`Kein Betrag erkannt${found.length ? ` (erkannt: ${found.join(' · ')})` : ''} – bitte Betrag eintippen.`, 'warn');
    $('#amountInput').focus();
  } else {
    setOcrStatus(`✓ Erkannt: ${found.join(' · ')} – bitte kurz prüfen.`, 'ok');
  }
}

// ---------- open / close ----------

export async function openTxDialog(tx = null, photo = undefined) {
  ctx.editing = tx;
  ctx.photo = undefined;
  ctx.touched.clear();
  ctx.ocrToken++;
  form.reset();
  $('#formError').hidden = true;
  setOcrStatus(null);
  setCandidates([]);

  $('#txDialogTitle').textContent = tx ? 'Buchung bearbeiten' : 'Neue Buchung';
  $('#deleteTx').hidden = !tx;
  $('#makeRecurring').hidden = !tx || !!tx.recurringId;
  form.elements.type.value = tx?.type ?? 'expense';
  renderCategoryChips(tx?.category);
  $('#amountInput').value = tx ? centsToInput(tx.amount) : '';
  $('#dateInput').value = tx?.date ?? defaultDate();
  $('#noteInput').value = tx?.note ?? '';
  const meta = $('#txMeta');
  meta.hidden = !tx?.recurringId;
  meta.textContent = tx?.recurringId ? '🔁 Automatisch aus Fixkosten gebucht' : '';
  updateCalcHint();
  showPhoto(null);
  renderNoteSuggestions();
  renderTemplates();

  dialog.showModal();

  if (photo) {
    await setNewPhoto(photo);
  } else if (tx?.hasPhoto) {
    const blob = await db.getPhoto(tx.id);
    if (ctx.editing === tx && ctx.photo === undefined) showPhoto(blob ?? null);
  } else if (!tx) {
    $('#amountInput').focus();
  }
}

/** Today, or the 1st of the selected month when browsing a past month. */
function defaultDate() {
  const today = isoDate();
  const selected = isoDate(state.month).slice(0, 7);
  return today.startsWith(selected) ? today : `${selected}-01`;
}

function closeTxDialog() {
  ctx.ocrToken++;
  dialog.close();
  showPhoto(null);
}

// ---------- save ----------

function findDuplicate(tx) {
  return state.transactions.find((t) => t.id !== tx.id && t.type === tx.type && t.date === tx.date && t.amount === tx.amount);
}

/** Warns when this save pushed a budget past 80 % or 100 %. */
function budgetWarning(tx, before) {
  if (tx.type !== 'expense') return '';
  const key = tx.date.slice(0, 7);
  const month = state.transactions.filter((t) => t.date.startsWith(key) && t.type === 'expense');
  const checks = [];
  const catBudget = getCategoryBudgets()[tx.category];
  if (catBudget) {
    const spent = month.filter((t) => t.category === tx.category).reduce((s, t) => s + t.amount, 0);
    checks.push({ name: getCategory(tx.category).label, budget: catBudget, spent, prev: before.category });
  }
  const total = getBudget();
  if (total) checks.push({ name: 'Gesamtbudget', budget: total, spent: sumOf(month, 'expense'), prev: before.total });
  for (const c of checks) {
    if (c.spent > c.budget && c.prev <= c.budget) return `⚠️ ${c.name}: ${fmt(c.spent - c.budget)} über dem Budget`;
    if (c.spent >= c.budget * 0.8 && c.prev < c.budget * 0.8) return `⚠️ ${c.name}: ${Math.round((c.spent / c.budget) * 100)} % des Budgets verbraucht`;
  }
  return '';
}

function spentBefore(tx) {
  const key = tx.date.slice(0, 7);
  const month = state.transactions.filter((t) => t.date.startsWith(key) && t.type === 'expense' && t.id !== tx.id);
  return {
    total: sumOf(month, 'expense'),
    category: month.filter((t) => t.category === tx.category).reduce((s, t) => s + t.amount, 0),
  };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('#formError');
  const amount = evalAmount($('#amountInput').value);
  if (!Number.isFinite(amount) || amount <= 0) {
    error.textContent = 'Bitte einen gültigen Betrag eingeben, z. B. 12,50 oder 8+4,50';
    error.hidden = false;
    $('#amountInput').focus();
    return;
  }
  const prev = ctx.editing;
  const tx = {
    ...prev,
    id: prev?.id ?? newId(),
    type: currentType(),
    amount,
    category: selectedCategory(),
    date: $('#dateInput').value || isoDate(),
    note: $('#noteInput').value.trim(),
    hasPhoto: ctx.photo instanceof Blob || (ctx.photo === undefined && !!prev?.hasPhoto),
    createdAt: prev?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  const dup = !prev && findDuplicate(tx);
  if (dup && !confirm(`Es gibt am ${deDate(tx.date)} schon eine Buchung über ${fmt(tx.amount)}${dup.note ? ` („${dup.note}“)` : ''}. Trotzdem speichern?`)) return;

  const before = spentBefore(tx);
  try {
    await saveTransaction(tx, ctx.photo);
  } catch (err) {
    error.textContent = `Speichern fehlgeschlagen: ${err.message}`;
    error.hidden = false;
    return;
  }

  state.month = keyToDate(tx.date.slice(0, 7)); // show the month of the saved entry
  closeTxDialog();
  refresh();
  const warning = budgetWarning(tx, before);
  toast(warning || (prev ? 'Änderung gespeichert' : `${tx.type === 'income' ? 'Einnahme' : 'Ausgabe'} über ${fmt(amount)} gespeichert`));
});

// ---------- events ----------

form.addEventListener('input', (e) => {
  const name = e.target.name;
  if (name) ctx.touched.add(name);
  if (name === 'type') {
    renderCategoryChips(selectedCategory());
    renderTemplates();
  }
  if (name === 'amount') {
    $('#formError').hidden = true;
    updateCalcHint();
  }
  if (name === 'note' && !ctx.touched.has('category')) {
    const learned = learnedCategory(e.target.value);
    if (learned) setCategory(learned);
  }
});

$('#deleteTx').addEventListener('click', async () => {
  const tx = ctx.editing;
  if (!tx) return;
  const undo = await deleteTransaction(tx);
  closeTxDialog();
  refresh();
  toast('Buchung gelöscht', { label: 'Rückgängig', onClick: undo });
});

$('#makeRecurring').addEventListener('click', () => {
  const tx = ctx.editing;
  closeTxDialog();
  onMakeRecurring(tx);
});

$('#removePhoto').addEventListener('click', () => {
  ctx.ocrToken++;
  ctx.photo = null;
  showPhoto(null);
  setOcrStatus(null);
  setCandidates([]);
});

$('#photoPreview').addEventListener('click', () => {
  $('#photoFull').src = previewUrl;
  $('#photoDialog').showModal();
});

wireDialog(dialog, closeTxDialog);
dialog.addEventListener('cancel', () => {
  ctx.ocrToken++;
  showPhoto(null);
});
wireDialog($('#photoDialog'));

// ---------- photo inputs ----------

let photoTarget = 'new'; // 'new' = start a new entry from the photo, 'form' = attach to the open form

function pickPhoto(input, target) {
  photoTarget = target;
  input.value = '';
  input.click();
}

for (const input of [$('#cameraInput'), $('#galleryInput')]) {
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (photoTarget === 'form' && dialog.open) setNewPhoto(file);
    else openTxDialog(null, file);
  });
}

export const openScan = () => pickPhoto($('#cameraInput'), 'new');
$('#takePhoto').addEventListener('click', () => pickPhoto($('#cameraInput'), 'form'));
$('#pickPhoto').addEventListener('click', () => pickPhoto($('#galleryInput'), 'form'));
