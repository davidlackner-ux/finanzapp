// Settings sheet: theme, OCR, custom categories, export, backup/restore.

import { getCategory, setCustomCategories } from './categories.js';
import * as db from './db.js';
import { centsToInput } from './parser.js';
import { state, refresh, load } from './store.js';
import { $, el, toast, download, settings, isoDate, deDate, monthKey, monthFmt, newId, wireDialog, SETTING_KEYS } from './ui.js';

const dialog = $('#settingsDialog');

export function applyTheme(theme = settings.get('theme', 'system')) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0d1412' : '#0f766e';
}

async function openSettings() {
  for (const r of dialog.querySelectorAll('input[name="theme"]')) r.checked = r.value === settings.get('theme', 'system');
  $('#ocrToggle').checked = settings.get('ocr', true);
  $('#exportCsvMonth').textContent = `📄 CSV: ${monthFmt.format(state.month)}`;
  renderCustomCategories();
  const photos = state.transactions.filter((t) => t.hasPhoto).length;
  let info = `${state.transactions.length} Buchungen, ${photos} Belegfotos, ${state.recurring.length} Fixkosten, ${state.goals.length} Sparziele.`;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage) info += ` Speicher: ${(est.usage / 1024 / 1024).toFixed(1)} MB.`;
  } catch {
    /* ignore */
  }
  const last = settings.get('lastBackup', null);
  info += last ? ` Letztes Backup: ${deDate(isoDate(new Date(last)))}.` : ' Noch kein Backup.';
  $('#storageInfo').textContent = info;
  dialog.showModal();
}

// ---------- custom categories ----------

function renderCustomCategories() {
  const list = settings.get('customCategories', []).filter((c) => !c.archived);
  $('#customCategoryList').replaceChildren(
    ...(list.length
      ? list.map((c) => {
        const btn = el('button', { type: 'button', className: 'chip-btn', title: 'Entfernen' }, `${c.icon} ${c.label} `, el('span', { className: 'danger-text', textContent: '✕' }));
        btn.addEventListener('click', () => archiveCategory(c.id));
        return btn;
      })
      : [el('span', { className: 'label small', textContent: 'Noch keine – leg unten welche an, z. B. 🐶 Haustier oder 👶 Kinder.' })]),
  );
}

function saveCustomCategories(list) {
  settings.set('customCategories', list);
  setCustomCategories(list);
  renderCustomCategories();
  refresh();
}

function archiveCategory(id) {
  const used = state.transactions.some((t) => t.category === id);
  const list = settings.get('customCategories', []);
  const cat = list.find((c) => c.id === id);
  if (!confirm(`Kategorie „${cat.label}“ entfernen?${used ? ' Bestehende Buchungen behalten sie.' : ''}`)) return;
  // Used categories are archived so old entries still show their name
  saveCustomCategories(used ? list.map((c) => (c.id === id ? { ...c, archived: true } : c)) : list.filter((c) => c.id !== id));
}

$('#customCategoryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const label = f.label.value.trim();
  if (!label) return;
  const list = settings.get('customCategories', []);
  list.push({ id: `c-${newId().slice(0, 8)}`, label, icon: f.icon.value.trim() || '🏷️', type: f.type.value });
  saveCustomCategories(list);
  e.target.reset();
  toast(`Kategorie „${label}“ angelegt`);
});

// ---------- export ----------

function exportCsv(transactions, name) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Typ', 'Kategorie', 'Betrag', 'Notiz', 'Beleg', 'Fixkosten']];
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([
      deDate(t.date),
      t.type === 'income' ? 'Einnahme' : 'Ausgabe',
      getCategory(t.category).label,
      (t.type === 'income' ? '' : '-') + centsToInput(t.amount),
      t.note,
      t.hasPhoto ? 'ja' : 'nein',
      t.recurringId ? 'ja' : 'nein',
    ]);
  }
  // Semicolons + BOM so German Excel opens it correctly
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  download(name, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

$('#exportCsv').addEventListener('click', () => exportCsv(state.transactions, `finanzen-${isoDate()}.csv`));
$('#exportCsvMonth').addEventListener('click', () => {
  const key = monthKey(state.month);
  exportCsv(state.transactions.filter((t) => t.date.startsWith(key)), `finanzen-${key}.csv`);
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportBackup() {
  const photos = await db.getAllPhotos();
  const encoded = {};
  for (const [id, blob] of Object.entries(photos)) encoded[id] = await blobToDataUrl(blob);
  const backup = {
    app: 'finanzapp',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: Object.fromEntries(SETTING_KEYS.map((k) => [k, settings.get(k, null)]).filter(([, v]) => v !== null)),
    transactions: state.transactions,
    recurring: state.recurring,
    goals: state.goals,
    photos: encoded,
  };
  download(`finanzapp-backup-${isoDate()}.json`, new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  settings.set('lastBackup', Date.now());
  refresh();
}

$('#exportBackup').addEventListener('click', exportBackup);
$('#bannerBackup').addEventListener('click', exportBackup);

/** Merges settings from a backup without overwriting what is set on this device. */
function mergeSettings(incoming = {}) {
  const byId = (a = [], b = []) => [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))];
  settings.set('customCategories', byId(settings.get('customCategories', []), incoming.customCategories ?? []));
  settings.set('merchantMap', { ...(incoming.merchantMap ?? {}), ...settings.get('merchantMap', {}) });
  settings.set('categoryBudgets', { ...(incoming.categoryBudgets ?? {}), ...settings.get('categoryBudgets', {}) });
  if (incoming.budget && !settings.get('budget', 0)) settings.set('budget', incoming.budget);
}

$('#importBackup').addEventListener('click', () => $('#importInput').click());
$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'finanzapp' || !Array.isArray(data.transactions)) throw new Error('Keine gültige Backup-Datei');
    if (!confirm(`${data.transactions.length} Buchungen aus dem Backup vom ${deDate(data.exportedAt.slice(0, 10))} übernehmen? Vorhandene Einträge bleiben erhalten.`)) return;
    const photos = {};
    for (const [id, url] of Object.entries(data.photos ?? {})) photos[id] = await (await fetch(url)).blob();
    await db.importData({ transactions: data.transactions, photos, recurring: data.recurring, goals: data.goals });
    mergeSettings(data.settings ?? { budget: data.budget });
    await load();
    dialog.close();
    refresh();
    toast(`${data.transactions.length} Buchungen wiederhergestellt`);
  } catch (err) {
    alert(`Import fehlgeschlagen: ${err.message}`);
  }
});

$('#deleteAll').addEventListener('click', async () => {
  if (!confirm('Wirklich ALLE Buchungen, Belegfotos, Fixkosten und Sparziele löschen? Das kann nicht rückgängig gemacht werden.')) return;
  if (!confirm('Letzte Sicherheitsabfrage: Hast du ein Backup? Wirklich alles löschen?')) return;
  await db.clearAll();
  Object.assign(state, { transactions: [], recurring: [], goals: [] });
  dialog.close();
  refresh();
  toast('Alle Daten gelöscht');
});

// ---------- preferences ----------

dialog.addEventListener('change', (e) => {
  if (e.target.name === 'theme') {
    settings.set('theme', e.target.value);
    applyTheme(e.target.value);
    refresh(); // charts pick up new colors
  }
  if (e.target.id === 'ocrToggle') settings.set('ocr', e.target.checked);
});

$('#openSettings').addEventListener('click', openSettings);
wireDialog(dialog);
