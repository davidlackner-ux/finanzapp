// Overview tab: month summary, budget, categories, search and the transaction list.

import { getCategory } from './categories.js';
import { byCategory, cumulativeDaily, shiftMonth, sumOf } from './stats.js';
import { state, refresh, getBudget, getCategoryBudgets } from './store.js';
import { $, el, fmt, fmtSigned, dayFmt, monthKey, monthNameFmt, keyToDate, settings, isoDate, deDate } from './ui.js';
import { openTxDialog } from './txform.js';

export function renderHome() {
  const key = monthKey(state.month);
  const monthTx = state.transactions.filter((t) => t.date.startsWith(key));
  const expense = sumOf(monthTx, 'expense');
  const income = sumOf(monthTx, 'income');
  const balance = income - expense;

  $('#sumExpense').textContent = fmt(expense);
  $('#sumIncome').textContent = fmt(income);
  const bal = $('#sumBalance');
  bal.textContent = fmtSigned(balance);
  bal.className = balance < 0 ? 'negative' : balance > 0 ? 'positive' : '';

  renderComparison(key);
  renderBudget(expense, key);
  renderBreakdown(monthTx);
  renderBackupBanner();
  renderList(monthTx);
}

/** Compares with last month – for the running month only up to the same day, so it is fair. */
function renderComparison(key) {
  const prevKey = shiftMonth(key, -1);
  const isCurrent = key === monthKey(new Date());
  const day = new Date().getDate();
  const cur = cumulativeDaily(state.transactions, key);
  const prev = cumulativeDaily(state.transactions, prevKey);
  const curValue = isCurrent ? cur[day - 1] : cur[cur.length - 1];
  const prevValue = isCurrent ? prev[Math.min(day, prev.length) - 1] : prev[prev.length - 1];
  const box = $('#compareText');
  box.hidden = !prevValue;
  if (!prevValue) return;
  const diff = Math.round(((curValue - prevValue) / prevValue) * 100);
  const name = monthNameFmt.format(keyToDate(prevKey));
  const suffix = isCurrent ? ` (bis zum ${day}.)` : '';
  box.textContent =
    diff === 0 ? `Gleich viel wie im ${name}${suffix}`
      : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} % ${diff > 0 ? 'mehr' : 'weniger'} als im ${name}${suffix}`;
}

function renderBudget(expense, key) {
  const budget = getBudget();
  const box = $('#budgetBox');
  box.hidden = !budget;
  if (!budget) return;
  const ratio = expense / budget;
  const fill = $('#budgetFill');
  fill.style.width = `${Math.min(100, ratio * 100)}%`;
  fill.className = ratio > 1 ? 'over' : ratio > 0.8 ? 'warn' : '';
  let text = ratio > 1
    ? `⚠️ ${fmt(expense - budget)} über dem Budget von ${fmt(budget)}`
    : `Noch ${fmt(budget - expense)} von ${fmt(budget)} übrig`;
  if (key === monthKey(new Date()) && ratio <= 1) {
    const now = new Date();
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    text += ` · ${fmt(Math.floor((budget - expense) / daysLeft))} pro Tag`;
  }
  $('#budgetText').textContent = text;
}

function renderBreakdown(monthTx) {
  const cats = byCategory(monthTx, 'expense');
  $('#breakdownCard').hidden = !cats.length;
  const sum = cats.reduce((s, c) => s + c.amount, 0);
  const max = cats[0]?.amount ?? 1;
  const budgets = getCategoryBudgets();
  $('#categoryBreakdown').replaceChildren(
    ...cats.map(({ id, amount }) => {
      const cat = getCategory(id);
      const budget = budgets[id];
      const over = budget && amount > budget;
      const row = el('button', { className: `bar-row${state.filterCategory === id ? ' active' : ''}`, type: 'button' },
        el('span', { className: 'bar-label', textContent: `${cat.icon} ${cat.label}` }),
        el('span', {
          className: 'bar-value',
          textContent: `${fmt(amount)}${budget ? ` / ${fmt(budget)}` : ` · ${Math.round((amount / sum) * 100)} %`}${over ? ' ⚠️' : ''}`,
        }),
        el('div', { className: 'bar' }, el('div', { style: `width:${(amount / max) * 100}%` })),
      );
      row.addEventListener('click', () => {
        state.filterCategory = state.filterCategory === id ? null : id;
        refresh();
      });
      return row;
    }),
  );
}

function renderBackupBanner() {
  const last = settings.get('lastBackup', null);
  const snoozed = settings.get('backupSnooze', null);
  const due = state.transactions.length >= 10 && (!last || Date.now() - last > 30 * 864e5) && (!snoozed || Date.now() > snoozed);
  $('#backupBanner').hidden = !due;
}

function matchesSearch(t, q) {
  const cat = getCategory(t.category);
  return [t.note, cat.label, fmt(t.amount), deDate(t.date)].some((s) => s?.toLowerCase().includes(q));
}

function renderList(monthTx) {
  const q = state.search.trim().toLowerCase();
  let list = q ? state.transactions.filter((t) => matchesSearch(t, q)) : monthTx;
  const filterBtn = $('#clearFilter');
  filterBtn.hidden = !state.filterCategory;
  if (state.filterCategory) {
    const cat = getCategory(state.filterCategory);
    filterBtn.textContent = `${cat.icon} ${cat.label} ✕`;
    list = list.filter((t) => t.category === state.filterCategory);
  }

  const title = $('#listTitle');
  if (q) {
    const total = sumOf(list, 'expense');
    title.textContent = `${list.length} Treffer${total ? ` · ${fmt(total)} ausgegeben` : ''}`;
  } else {
    title.textContent = 'Buchungen';
  }

  const container = $('#txList');
  if (!list.length) {
    container.replaceChildren(
      q
        ? el('div', { className: 'empty' }, el('p', { textContent: `Nichts gefunden für „${state.search}“.` }))
        : el('div', { className: 'empty' },
          el('div', { className: 'empty-icon', textContent: '🧾' }),
          el('p', { textContent: 'Noch keine Buchungen in diesem Monat.' }),
          el('p', { className: 'label', textContent: 'Tippe auf „📷 Beleg“, um eine Rechnung zu fotografieren, oder auf ＋ für eine schnelle Eingabe.' }),
        ),
    );
    return;
  }
  container.replaceChildren(...txListNodes(list, { showYear: !!q }));
}

/** Transactions grouped by day, newest first. */
export function txListNodes(list, { showYear = false } = {}) {
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const groups = new Map();
  for (const t of sorted) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const today = isoDate();
  const yesterday = isoDate(new Date(Date.now() - 864e5));
  const nodes = [];
  for (const [date, items] of groups) {
    const d = keyToDate(date);
    let label = date === today ? 'Heute' : date === yesterday ? 'Gestern' : dayFmt.format(d);
    if (showYear) label += ` ${d.getFullYear()}`;
    const daySum = items.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0);
    nodes.push(el('div', { className: 'day-head' }, el('span', { textContent: label }), el('span', { textContent: fmtSigned(daySum) })));
    nodes.push(el('div', { className: 'card tx-group' }, items.map(txRow)));
  }
  return nodes;
}

function txRow(t) {
  const cat = getCategory(t.category);
  const badges = [cat.label, t.hasPhoto && '📎 Beleg', t.recurringId && '🔁 Fix'].filter(Boolean).join(' · ');
  const row = el('button', { className: 'tx', type: 'button' },
    el('span', { className: 'tx-icon', textContent: cat.icon }),
    el('span', { className: 'tx-text' },
      el('span', { className: 'tx-title', textContent: t.note || cat.label }),
      el('span', { className: 'tx-sub', textContent: badges }),
    ),
    el('span', { className: `tx-amount ${t.type === 'income' ? 'positive' : ''}`, textContent: (t.type === 'income' ? '+' : '−') + fmt(t.amount) }),
  );
  row.addEventListener('click', () => openTxDialog(t));
  return row;
}

// ---------- events ----------

$('#clearFilter').addEventListener('click', () => {
  state.filterCategory = null;
  refresh();
});

let searchTimer;
$('#searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value;
    renderHome();
  }, 150);
});

$('#bannerLater').addEventListener('click', () => {
  settings.set('backupSnooze', Date.now() + 7 * 864e5);
  renderBackupBanner();
});
