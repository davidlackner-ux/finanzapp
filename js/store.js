// App state + all data changes. Views subscribe and re-render on refresh().

import * as db from './db.js';
import { settings, isoDate } from './ui.js';
import { setCustomCategories } from './categories.js';
import { generateTransactions } from './recurring.js';

const now = new Date();

export const state = {
  transactions: [],
  recurring: [],
  goals: [],
  month: new Date(now.getFullYear(), now.getMonth(), 1),
  filterCategory: null,
  search: '',
  tab: 'home',
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export const refresh = () => listeners.forEach((fn) => fn());

function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

export async function load() {
  setCustomCategories(settings.get('customCategories', []));
  const [transactions, recurring, goals] = await Promise.all([db.getAll('transactions'), db.getAll('recurring'), db.getAll('goals')]);
  Object.assign(state, { transactions, recurring, goals });
  return applyRecurring();
}

/** Creates the transactions of all recurring rules that became due. Returns the new transactions. */
export async function applyRecurring() {
  const today = isoDate();
  const existing = new Set(state.transactions.map((t) => t.id));
  const created = [];
  for (const rule of state.recurring) {
    const due = generateTransactions(rule, today);
    if (!due.length) continue;
    const fresh = due.filter((t) => !existing.has(t.id));
    if (fresh.length) await db.put('transactions', ...fresh);
    rule.lastDate = due[due.length - 1].date;
    await db.put('recurring', rule);
    state.transactions.push(...fresh);
    created.push(...fresh);
  }
  return created;
}

// ---------- transactions ----------

export async function saveTransaction(tx, photo) {
  await db.saveTransaction(tx, photo);
  upsert(state.transactions, tx);
  learnCategory(tx.note, tx.category);
  navigator.storage?.persist?.().catch(() => {});
}

/** Deletes a transaction and returns an undo function. */
export async function deleteTransaction(tx) {
  const photo = tx.hasPhoto ? await db.getPhoto(tx.id) : undefined;
  await db.deleteTransaction(tx.id);
  state.transactions = state.transactions.filter((t) => t.id !== tx.id);
  return async () => {
    await saveTransaction(tx, photo ?? undefined);
    refresh();
  };
}

// ---------- learned merchant -> category ----------

const normalizeNote = (note) => note?.trim().toLowerCase() ?? '';

function learnCategory(note, category) {
  const key = normalizeNote(note);
  if (!key) return;
  const map = settings.get('merchantMap', {});
  if (map[key] === category) return;
  delete map[key];
  map[key] = category; // re-insert so the newest entries survive trimming
  const keys = Object.keys(map);
  for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete map[k];
  settings.set('merchantMap', map);
}

export function learnedCategory(note) {
  const key = normalizeNote(note);
  if (!key) return null;
  const learned = settings.get('merchantMap', {})[key];
  if (learned) return learned;
  // e.g. after restoring a backup: use the latest entry with the same note
  let latest = null;
  for (const t of state.transactions) {
    if (normalizeNote(t.note) === key && (!latest || t.date > latest.date)) latest = t;
  }
  return latest?.category ?? null;
}

// ---------- recurring rules ----------

export async function saveRecurring(rule) {
  await db.put('recurring', rule);
  upsert(state.recurring, rule);
  return applyRecurring();
}

export async function deleteRecurring(id) {
  await db.remove('recurring', id);
  state.recurring = state.recurring.filter((r) => r.id !== id);
}

// ---------- savings goals ----------

export async function saveGoal(goal) {
  await db.put('goals', goal);
  upsert(state.goals, goal);
}

export async function deleteGoal(id) {
  await db.remove('goals', id);
  state.goals = state.goals.filter((g) => g.id !== id);
}

// ---------- budgets ----------

export const getBudget = () => settings.get('budget', 0);
export const getCategoryBudgets = () => settings.get('categoryBudgets', {});

export function setCategoryBudget(id, cents) {
  const budgets = getCategoryBudgets();
  if (cents) budgets[id] = cents;
  else delete budgets[id];
  settings.set('categoryBudgets', budgets);
}
