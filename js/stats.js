// Aggregations for overview and statistics. Pure functions, testable with `node --test`.

/** "2026-10" + (-1) -> "2026-09" */
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function sumOf(transactions, type) {
  return transactions.reduce((s, t) => (t.type === type ? s + t.amount : s), 0);
}

/** Expense/income per month for `count` months ending with `endKey` (oldest first). */
export function monthlyTotals(transactions, endKey, count) {
  const map = new Map();
  for (let i = count - 1; i >= 0; i--) {
    const key = shiftMonth(endKey, -i);
    map.set(key, { key, expense: 0, income: 0 });
  }
  for (const t of transactions) {
    const entry = map.get(t.date.slice(0, 7));
    if (entry) entry[t.type] += t.amount;
  }
  return [...map.values()];
}

/** [{ id, amount, count }] sorted by amount, descending. */
export function byCategory(transactions, type = 'expense') {
  const map = new Map();
  for (const t of transactions) {
    if (t.type !== type) continue;
    const e = map.get(t.category) ?? { id: t.category, amount: 0, count: 0 };
    e.amount += t.amount;
    e.count++;
    map.set(t.category, e);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** Cumulative expenses per day of the month: result[i] = total spent up to and including day i+1. */
export function cumulativeDaily(transactions, key) {
  const days = new Array(daysInMonth(key)).fill(0);
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.date.startsWith(key)) continue;
    days[Number(t.date.slice(8, 10)) - 1] += t.amount;
  }
  for (let i = 1; i < days.length; i++) days[i] += days[i - 1];
  return days;
}

/** Expense totals per note (merchant), case-insensitive. [{ name, amount, count }] */
export function topMerchants(transactions, limit = 5) {
  const map = new Map();
  for (const t of transactions) {
    const name = t.note?.trim();
    if (t.type !== 'expense' || !name) continue;
    const k = name.toLowerCase();
    const e = map.get(k) ?? { name, amount: 0, count: 0 };
    e.amount += t.amount;
    e.count++;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/**
 * Frequently repeated entries, offered as one-tap templates in the entry form.
 * Amount is only included when it was the same every time.
 */
export function frequentEntries(transactions, type, limit = 6) {
  const map = new Map();
  for (const t of transactions) {
    const note = t.note?.trim();
    if (t.type !== type || !note || t.recurringId) continue;
    const k = `${note.toLowerCase()}|${t.category}`;
    const e = map.get(k) ?? { note, category: t.category, count: 0, amounts: new Set(), last: '' };
    e.count++;
    e.amounts.add(t.amount);
    if (t.date > e.last) e.last = t.date;
    map.set(k, e);
  }
  return [...map.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ note, category, count, amounts }) => ({
      note,
      category,
      count,
      amount: amounts.size === 1 ? [...amounts][0] : null,
    }));
}
