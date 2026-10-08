import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftMonth, daysInMonth, monthlyTotals, byCategory, cumulativeDaily, topMerchants, frequentEntries } from '../js/stats.js';

const tx = (date, amount, opts = {}) => ({ id: `${date}-${amount}`, type: 'expense', category: 'lebensmittel', note: '', date, amount, ...opts });

test('month helpers', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-10', 3), '2027-01');
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
});

test('monthlyTotals fills empty months', () => {
  const data = [tx('2026-10-02', 500), tx('2026-08-10', 300), tx('2026-10-05', 1000, { type: 'income' }), tx('2025-01-01', 999)];
  assert.deepEqual(monthlyTotals(data, '2026-10', 3), [
    { key: '2026-08', expense: 300, income: 0 },
    { key: '2026-09', expense: 0, income: 0 },
    { key: '2026-10', expense: 500, income: 1000 },
  ]);
});

test('byCategory and cumulativeDaily', () => {
  const data = [tx('2026-02-01', 100), tx('2026-02-03', 200, { category: 'freizeit' }), tx('2026-02-03', 50)];
  assert.deepEqual(byCategory(data), [
    { id: 'freizeit', amount: 200, count: 1 },
    { id: 'lebensmittel', amount: 150, count: 2 },
  ]);
  const cum = cumulativeDaily(data, '2026-02');
  assert.equal(cum.length, 28);
  assert.deepEqual(cum.slice(0, 4), [100, 100, 350, 350]);
  assert.equal(cum[27], 350);
});

test('topMerchants groups case-insensitively', () => {
  const data = [tx('2026-10-01', 100, { note: 'Rewe' }), tx('2026-10-02', 300, { note: 'rewe ' }), tx('2026-10-03', 250, { note: 'Aldi' })];
  assert.deepEqual(topMerchants(data), [
    { name: 'Rewe', amount: 400, count: 2 },
    { name: 'Aldi', amount: 250, count: 1 },
  ]);
});

test('frequentEntries suggests repeated entries with a fixed amount only when constant', () => {
  const data = [
    tx('2026-10-01', 320, { note: 'Kaffee', category: 'restaurant' }),
    tx('2026-10-02', 320, { note: 'kaffee', category: 'restaurant' }),
    tx('2026-10-03', 1500, { note: 'Rewe' }),
    tx('2026-10-04', 2300, { note: 'Rewe' }),
    tx('2026-10-05', 999, { note: 'Einmalig' }),
  ];
  assert.deepEqual(frequentEntries(data, 'expense'), [
    { note: 'Rewe', category: 'lebensmittel', count: 2, amount: null },
    { note: 'Kaffee', category: 'restaurant', count: 2, amount: 320 },
  ]);
});
