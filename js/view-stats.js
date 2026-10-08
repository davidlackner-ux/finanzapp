// Statistics tab: key figures, 12-month trend, month progress, top merchants, year overview.

import { getCategory } from './categories.js';
import { monthBarChart, cumulativeChart, legend } from './charts.js';
import { monthlyAmount } from './recurring.js';
import { byCategory, cumulativeDaily, daysInMonth, monthlyTotals, shiftMonth, sumOf, topMerchants } from './stats.js';
import { state, refresh, getBudget } from './store.js';
import { $, el, fmt, fmtSigned, monthKey, monthFmt, monthNameFmt, shortMonthFmt, keyToDate } from './ui.js';

export function renderStats() {
  const key = monthKey(state.month);
  const monthTx = state.transactions.filter((t) => t.date.startsWith(key));
  renderKpis(key, monthTx);
  renderTrend(key);
  renderCumulative(key);
  renderMerchants(monthTx);
  renderYear();
}

function kpi(label, value, sub = '') {
  return el('div', { className: 'kpi card' },
    el('span', { className: 'label', textContent: label }),
    el('strong', { textContent: value }),
    sub ? el('span', { className: 'label small', textContent: sub }) : null,
  );
}

function renderKpis(key, monthTx) {
  const expense = sumOf(monthTx, 'expense');
  const income = sumOf(monthTx, 'income');
  const isCurrent = key === monthKey(new Date());
  const days = isCurrent ? new Date().getDate() : daysInMonth(key);
  const biggest = monthTx.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0];
  const fixed = state.recurring.filter((r) => r.active && r.type === 'expense').reduce((s, r) => s + monthlyAmount(r), 0);
  const rate = income ? Math.round(((income - expense) / income) * 100) : null;

  $('#kpis').replaceChildren(
    kpi('Ø pro Tag', fmt(Math.round(expense / days)), isCurrent ? `in ${days} Tagen` : monthNameFmt.format(state.month)),
    kpi('Sparquote', rate === null ? '–' : `${rate} %`, rate === null ? 'keine Einnahmen' : `${fmtSigned(income - expense)} übrig`),
    kpi('Größte Ausgabe', biggest ? fmt(biggest.amount) : '–', biggest ? biggest.note || getCategory(biggest.category).label : ''),
    kpi('Fixkosten', `${fmt(fixed)}`, 'pro Monat'),
  );
}

function renderTrend(key) {
  const currentKey = monthKey(new Date());
  // Keep the window stable while browsing the last 12 months
  const endKey = key <= currentKey && key > shiftMonth(currentKey, -12) ? currentKey : key;
  const months = monthlyTotals(state.transactions, endKey, 12).map((m) => {
    const d = keyToDate(m.key);
    return { ...m, label: shortMonthFmt.format(d).replace('.', ''), title: monthFmt.format(d) };
  });
  $('#trendLegend').replaceChildren(legend([
    { label: 'Ausgaben', color: '--viz-expense' },
    { label: 'Einnahmen', color: '--viz-income' },
  ]));
  monthBarChart($('#trendChart'), months, {
    selectedKey: key,
    onSelect: (k) => {
      state.month = keyToDate(k);
      refresh();
    },
  });
}

function renderCumulative(key) {
  const days = daysInMonth(key);
  const isCurrent = key === monthKey(new Date());
  const current = cumulativeDaily(state.transactions, key);
  const prevKey = shiftMonth(key, -1);
  const prevRaw = cumulativeDaily(state.transactions, prevKey);
  const prev = Array.from({ length: days }, (_, i) => prevRaw[Math.min(i, prevRaw.length - 1)]);
  const budget = getBudget();

  const series = [
    { label: monthNameFmt.format(state.month), values: isCurrent ? current.slice(0, new Date().getDate()) : current, color: '--viz-expense' },
    { label: monthNameFmt.format(keyToDate(prevKey)), values: prev, color: '--viz-prev' },
  ];
  if (budget) series.push({ label: 'Budget-Plan', values: Array.from({ length: days }, (_, i) => Math.round((budget * (i + 1)) / days)), color: '--viz-ref', dashed: true });

  $('#cumTitle').textContent = `Ausgaben im ${monthNameFmt.format(state.month)} – aufsummiert`;
  $('#cumLegend').replaceChildren(legend(series));
  const monthLabel = monthNameFmt.format(state.month);
  cumulativeChart($('#cumChart'), series, { days, dayLabel: (d) => `bis ${d}. ${monthLabel}` });
}

function renderMerchants(monthTx) {
  const top = topMerchants(monthTx, 5);
  $('#merchantsCard').hidden = !top.length;
  const max = top[0]?.amount ?? 1;
  $('#topMerchants').replaceChildren(
    ...top.map((m, i) =>
      el('div', { className: 'rank' },
        el('span', { className: 'rank-no', textContent: `${i + 1}` }),
        el('span', { className: 'rank-name', textContent: m.name }),
        el('span', { className: 'label small', textContent: `${m.count}×` }),
        el('strong', { textContent: fmt(m.amount) }),
        el('div', { className: 'bar' }, el('div', { style: `width:${(m.amount / max) * 100}%` })),
      ),
    ),
  );
}

function renderYear() {
  const year = state.month.getFullYear();
  const yearTx = state.transactions.filter((t) => t.date.startsWith(`${year}-`));
  const expense = sumOf(yearTx, 'expense');
  const income = sumOf(yearTx, 'income');
  const now = new Date();
  const months = year === now.getFullYear() ? now.getMonth() + 1 : 12;

  $('#yearTitle').textContent = `Jahr ${year}`;
  const cell = (label, value, cls = '') => el('div', {}, el('span', { className: 'label', textContent: label }), el('strong', { className: cls, textContent: value }));
  $('#yearStats').replaceChildren(
    cell('Ausgaben', fmt(expense)),
    cell('Einnahmen', fmt(income), 'positive'),
    cell('Saldo', fmtSigned(income - expense), income - expense < 0 ? 'negative' : 'positive'),
    cell('Ø Ausgaben/Monat', fmt(Math.round(expense / months))),
  );

  const cats = byCategory(yearTx, 'expense').slice(0, 6);
  const max = cats[0]?.amount ?? 1;
  $('#yearCategories').replaceChildren(
    ...cats.map(({ id, amount }) => {
      const cat = getCategory(id);
      return el('div', { className: 'bar-row static' },
        el('span', { className: 'bar-label', textContent: `${cat.icon} ${cat.label}` }),
        el('span', { className: 'bar-value', textContent: `${fmt(amount)} · ${Math.round((amount / expense) * 100)} %` }),
        el('div', { className: 'bar' }, el('div', { style: `width:${(amount / max) * 100}%` })),
      );
    }),
  );
}
