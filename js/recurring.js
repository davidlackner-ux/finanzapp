// Recurring entries (Fixkosten / Daueraufträge). Pure date logic, testable with `node --test`.
// Rule shape: { id, name, type, amount, category, interval, startDate: 'YYYY-MM-DD', lastDate: 'YYYY-MM-DD'|null, active }

export const INTERVALS = {
  weekly: 'wöchentlich',
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  yearly: 'jährlich',
};

const MONTH_STEP = { monthly: 1, quarterly: 3, yearly: 12 };
const PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** n-th occurrence (0 = start date). Day-of-month is clamped, e.g. the 31st becomes the 30th in short months. */
export function nthOccurrence(startDate, interval, n) {
  const [y, m, d] = startDate.split('-').map(Number);
  if (interval === 'weekly') return new Date(Date.UTC(y, m - 1, d + 7 * n)).toISOString().slice(0, 10);
  const total = m - 1 + MONTH_STEP[interval] * n;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return iso(year, month, Math.min(d, daysInMonth));
}

/** Dates that are due up to and including `untilDate` and were not generated yet. */
export function dueDates(rule, untilDate) {
  const out = [];
  for (let n = 0; n < 2000; n++) {
    const date = nthOccurrence(rule.startDate, rule.interval, n);
    if (date > untilDate) break;
    if (!rule.lastDate || date > rule.lastDate) out.push(date);
  }
  return out;
}

/** Next date after `afterDate` that has not been generated yet. */
export function nextDate(rule, afterDate) {
  const after = rule.lastDate && rule.lastDate > afterDate ? rule.lastDate : afterDate;
  for (let n = 0; n < 2000; n++) {
    const date = nthOccurrence(rule.startDate, rule.interval, n);
    if (date > after) return date;
  }
  return null;
}

/** Amount normalized to one month, e.g. 120 €/year -> 10 €/month. */
export function monthlyAmount(rule) {
  return Math.round(rule.amount * PER_MONTH[rule.interval]);
}

/** Builds the transactions a rule should have created up to `untilDate`. Ids are deterministic, so nothing is created twice. */
export function generateTransactions(rule, untilDate, now = Date.now()) {
  if (!rule.active) return [];
  return dueDates(rule, untilDate).map((date) => ({
    id: `r:${rule.id}:${date}`,
    type: rule.type,
    amount: rule.amount,
    category: rule.category,
    date,
    note: rule.name,
    hasPhoto: false,
    recurringId: rule.id,
    createdAt: now,
    updatedAt: now,
  }));
}
