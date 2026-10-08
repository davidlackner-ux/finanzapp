// Planning tab: budgets, recurring entries (Fixkosten) and savings goals.

import { getCategories, getCategory } from './categories.js';
import { INTERVALS, monthlyAmount, nextDate } from './recurring.js';
import { byCategory, sumOf } from './stats.js';
import {
  state, refresh, getBudget, getCategoryBudgets, setCategoryBudget,
  saveRecurring, deleteRecurring, saveGoal, deleteGoal,
} from './store.js';
import { $, el, fmt, monthKey, monthFmt, isoDate, deDate, newId, settings, toast, askAmount, wireDialog, keyToDate } from './ui.js';
import { evalAmount, centsToInput } from './parser.js';

export function renderPlan() {
  renderBudgets();
  renderRecurring();
  renderGoals();
}

// ---------- budgets ----------

function progressRow({ icon, label, spent, budget, onClick, strong = false }) {
  const ratio = budget ? spent / budget : 0;
  const status = !budget ? 'kein Budget' : ratio > 1 ? `⚠️ ${fmt(spent - budget)} drüber` : `noch ${fmt(budget - spent)}`;
  const row = el('button', { type: 'button', className: `budget-row${strong ? ' strong' : ''}` },
    el('span', { className: 'bar-label', textContent: `${icon} ${label}` }),
    el('span', { className: 'bar-value', textContent: budget ? `${fmt(spent)} / ${fmt(budget)}` : fmt(spent) }),
    budget ? el('div', { className: 'progress' }, el('div', { className: ratio > 1 ? 'over' : ratio > 0.8 ? 'warn' : '', style: `width:${Math.min(100, ratio * 100)}%` })) : null,
    el('span', { className: `label small ${ratio > 1 ? 'negative' : ''}`, textContent: status }),
  );
  row.addEventListener('click', onClick);
  return row;
}

function renderBudgets() {
  const key = monthKey(state.month);
  const monthTx = state.transactions.filter((t) => t.date.startsWith(key));
  const spentBy = new Map(byCategory(monthTx).map((c) => [c.id, c.amount]));
  const budgets = getCategoryBudgets();
  $('#budgetMonth').textContent = monthFmt.format(state.month);

  const total = getBudget();
  const rows = [
    progressRow({
      icon: '💶', label: 'Gesamt', strong: true, spent: sumOf(monthTx, 'expense'), budget: total,
      onClick: () => editBudget('Gesamtbudget pro Monat', total, (v) => settings.set('budget', v)),
    }),
  ];
  // Categories with a budget or spending first, the rest below
  const cats = getCategories('expense').sort((a, b) => (budgets[b.id] ? 1 : 0) - (budgets[a.id] ? 1 : 0) || (spentBy.get(b.id) ?? 0) - (spentBy.get(a.id) ?? 0));
  const hidden = [];
  for (const c of cats) {
    const row = progressRow({
      icon: c.icon, label: c.label, spent: spentBy.get(c.id) ?? 0, budget: budgets[c.id],
      onClick: () => editBudget(`Budget: ${c.label}`, budgets[c.id], (v) => setCategoryBudget(c.id, v)),
    });
    // Categories without budget and spending stay folded away
    if (budgets[c.id] || spentBy.get(c.id) || showAllBudgets) rows.push(row);
    else hidden.push(row);
  }
  if (hidden.length || showAllBudgets) {
    const toggle = el('button', {
      type: 'button',
      className: 'more-toggle',
      textContent: showAllBudgets ? 'Weniger anzeigen ▴' : `Weitere Kategorien (${hidden.length}) ▾`,
    });
    toggle.addEventListener('click', () => {
      showAllBudgets = !showAllBudgets;
      renderBudgets();
    });
    rows.push(toggle);
  }
  $('#budgetList').replaceChildren(...rows);
}

let showAllBudgets = false;

async function editBudget(title, current, save) {
  const cents = await askAmount({ title, label: 'Betrag pro Monat (leer = kein Budget)', value: current ? centsToInput(current) : '', allowEmpty: true });
  if (cents === null) return;
  save(cents);
  refresh();
  toast(cents ? `${title}: ${fmt(cents)}` : 'Budget entfernt');
}

// ---------- recurring ----------

function renderRecurring() {
  const today = isoDate();
  const rules = [...state.recurring].sort((a, b) => (b.active - a.active) || (nextDate(a, today) ?? '').localeCompare(nextDate(b, today) ?? ''));
  const out = state.recurring.filter((r) => r.active && r.type === 'expense').reduce((s, r) => s + monthlyAmount(r), 0);
  const inc = state.recurring.filter((r) => r.active && r.type === 'income').reduce((s, r) => s + monthlyAmount(r), 0);
  $('#recurringSummary').textContent = rules.length
    ? `Fixe Ausgaben: ${fmt(out)} / Monat${inc ? ` · Fixe Einnahmen: ${fmt(inc)} / Monat` : ''}`
    : 'Miete, Abos, Versicherungen oder dein Gehalt einmal anlegen – sie werden dann jeden Monat automatisch gebucht.';

  $('#recurringList').replaceChildren(
    ...rules.map((r) => {
      const cat = getCategory(r.category);
      const next = nextDate(r, today);
      const sub = r.active ? `${INTERVALS[r.interval]} · nächste: ${next ? deDate(next) : '–'}` : `pausiert · ${INTERVALS[r.interval]}`;
      const row = el('button', { type: 'button', className: `tx${r.active ? '' : ' muted'}` },
        el('span', { className: 'tx-icon', textContent: cat.icon }),
        el('span', { className: 'tx-text' }, el('span', { className: 'tx-title', textContent: r.name }), el('span', { className: 'tx-sub', textContent: sub })),
        el('span', { className: `tx-amount ${r.type === 'income' ? 'positive' : ''}`, textContent: (r.type === 'income' ? '+' : '−') + fmt(r.amount) }),
      );
      row.addEventListener('click', () => openRecurringDialog(r));
      return row;
    }),
  );
}

const recurringForm = $('#recurringForm');
const recurringDialog = $('#recurringDialog');
let editingRule = null;

function fillCategorySelect(select, type, selected) {
  const cats = getCategories(type);
  select.replaceChildren(...cats.map((c) => el('option', { value: c.id, textContent: `${c.icon} ${c.label}`, selected: c.id === selected })));
}

/** Opens the editor for a rule; `rule` may also be a partial template (from a transaction). */
export function openRecurringDialog(rule = null) {
  editingRule = rule?.id ? rule : null;
  const f = recurringForm.elements;
  recurringForm.reset();
  $('#recurringError').hidden = true;
  $('#recurringTitle').textContent = editingRule ? 'Fixkosten bearbeiten' : 'Neue Fixkosten';
  $('#deleteRecurring').hidden = !editingRule;
  f.type.value = rule?.type ?? 'expense';
  f.name.value = rule?.name ?? '';
  f.amount.value = rule?.amount ? centsToInput(rule.amount) : '';
  fillCategorySelect(f.category, f.type.value, rule?.category ?? (f.type.value === 'expense' ? 'wohnen' : 'gehalt'));
  f.interval.value = rule?.interval ?? 'monthly';
  f.startDate.value = rule?.startDate ?? isoDate();
  f.active.checked = rule?.active ?? true;
  recurringDialog.showModal();
}

recurringForm.addEventListener('input', (e) => {
  if (e.target.name === 'type') fillCategorySelect(recurringForm.elements.category, e.target.value);
});

recurringForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = recurringForm.elements;
  const amount = evalAmount(f.amount.value);
  const error = $('#recurringError');
  const fail = (msg) => {
    error.textContent = msg;
    error.hidden = false;
  };
  if (!f.name.value.trim()) return fail('Bitte eine Bezeichnung eingeben.');
  if (!Number.isFinite(amount) || amount <= 0) return fail('Bitte einen gültigen Betrag eingeben.');
  if (!f.startDate.value) return fail('Bitte die erste Fälligkeit angeben.');

  const scheduleChanged = editingRule && (editingRule.startDate !== f.startDate.value || editingRule.interval !== f.interval.value);
  const rule = {
    ...editingRule,
    id: editingRule?.id ?? newId(),
    name: f.name.value.trim(),
    type: f.type.value,
    amount,
    category: f.category.value,
    interval: f.interval.value,
    startDate: f.startDate.value,
    // A changed schedule continues from today instead of back-filling old dates
    lastDate: scheduleChanged ? isoDate(new Date(Date.now() - 864e5)) : editingRule?.lastDate ?? null,
    active: f.active.checked,
  };
  const created = await saveRecurring(rule);
  recurringDialog.close();
  refresh();
  toast(created.length ? `Gespeichert – ${created.length} fällige Buchung${created.length > 1 ? 'en' : ''} angelegt` : 'Fixkosten gespeichert');
});

$('#deleteRecurring').addEventListener('click', async () => {
  if (!editingRule || !confirm(`„${editingRule.name}“ löschen? Bereits gebuchte Einträge bleiben erhalten.`)) return;
  await deleteRecurring(editingRule.id);
  recurringDialog.close();
  refresh();
  toast('Fixkosten gelöscht');
});

$('#addRecurring').addEventListener('click', () => openRecurringDialog());
wireDialog(recurringDialog);

// ---------- goals ----------

function monthsUntil(deadline) {
  const now = new Date();
  const [y, m] = deadline.split('-').map(Number);
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + 1;
}

function renderGoals() {
  const list = $('#goalList');
  if (!state.goals.length) {
    list.replaceChildren(el('p', { className: 'label small', textContent: 'Lege ein Ziel an – z. B. Urlaub, neues Handy oder einen Notgroschen – und verfolge deinen Fortschritt.' }));
    return;
  }
  list.replaceChildren(
    ...[...state.goals].sort((a, b) => a.createdAt - b.createdAt).map((g) => {
      const ratio = g.target ? g.saved / g.target : 0;
      const done = g.saved >= g.target;
      let hint = done ? '🎉 Ziel erreicht!' : `noch ${fmt(g.target - g.saved)}`;
      if (!done && g.deadline) {
        const months = monthsUntil(g.deadline);
        const due = monthFmt.format(keyToDate(g.deadline));
        hint += months > 0 ? ` · ${fmt(Math.ceil((g.target - g.saved) / months))} pro Monat bis ${due}` : ` · Termin (${due}) verstrichen`;
      }
      const deposit = el('button', { type: 'button', className: 'btn small', textContent: '＋ Einzahlen' });
      deposit.addEventListener('click', () => depositToGoal(g));
      const head = el('button', { type: 'button', className: 'goal-head' },
        el('span', { className: 'goal-icon', textContent: g.icon || '🎯' }),
        el('span', { className: 'tx-text' },
          el('span', { className: 'tx-title', textContent: g.name }),
          el('span', { className: 'tx-sub', textContent: `${fmt(g.saved)} von ${fmt(g.target)} · ${Math.round(ratio * 100)} %` }),
        ),
      );
      head.addEventListener('click', () => openGoalDialog(g));
      return el('div', { className: 'goal' },
        head,
        el('div', { className: 'progress' }, el('div', { className: done ? 'done' : '', style: `width:${Math.min(100, ratio * 100)}%` })),
        el('div', { className: 'goal-foot' }, el('span', { className: 'label small', textContent: hint }), deposit),
      );
    }),
  );
}

async function depositToGoal(goal) {
  const cents = await askAmount({ title: `${goal.icon || '🎯'} ${goal.name}`, label: 'Wie viel legst du zurück? (z. B. 50 oder 25+25)', confirm: 'Einzahlen' });
  if (!cents) return;
  const updated = { ...goal, saved: goal.saved + cents };
  await saveGoal(updated);
  refresh();
  toast(updated.saved >= updated.target && goal.saved < goal.target ? `🎉 Sparziel „${goal.name}“ erreicht!` : `${fmt(cents)} für „${goal.name}“ zurückgelegt`, {
    label: 'Rückgängig',
    onClick: async () => {
      await saveGoal(goal);
      refresh();
    },
  });
}

const goalForm = $('#goalForm');
const goalDialog = $('#goalDialog');
let editingGoal = null;

function openGoalDialog(goal = null) {
  editingGoal = goal;
  const f = goalForm.elements;
  goalForm.reset();
  $('#goalError').hidden = true;
  $('#goalTitle').textContent = goal ? 'Sparziel bearbeiten' : 'Neues Sparziel';
  $('#deleteGoal').hidden = !goal;
  f.icon.value = goal?.icon ?? '🎯';
  f.name.value = goal?.name ?? '';
  f.target.value = goal ? centsToInput(goal.target) : '';
  f.saved.value = goal ? centsToInput(goal.saved) : '';
  f.deadline.value = goal?.deadline ?? '';
  goalDialog.showModal();
}

goalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = goalForm.elements;
  const target = evalAmount(f.target.value);
  const saved = f.saved.value.trim() ? evalAmount(f.saved.value) : 0;
  const error = $('#goalError');
  if (!f.name.value.trim() || !Number.isFinite(target) || target <= 0 || !Number.isFinite(saved) || saved < 0) {
    error.textContent = 'Bitte Name und einen gültigen Zielbetrag eingeben.';
    error.hidden = false;
    return;
  }
  await saveGoal({
    id: editingGoal?.id ?? newId(),
    icon: f.icon.value.trim() || '🎯',
    name: f.name.value.trim(),
    target,
    saved,
    deadline: f.deadline.value || null,
    createdAt: editingGoal?.createdAt ?? Date.now(),
  });
  goalDialog.close();
  refresh();
});

$('#deleteGoal').addEventListener('click', async () => {
  if (!editingGoal || !confirm(`Sparziel „${editingGoal.name}“ löschen?`)) return;
  await deleteGoal(editingGoal.id);
  goalDialog.close();
  refresh();
});

$('#addGoal').addEventListener('click', () => openGoalDialog());
wireDialog(goalDialog);
