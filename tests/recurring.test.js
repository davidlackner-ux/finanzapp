import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nthOccurrence, dueDates, nextDate, monthlyAmount, generateTransactions } from '../js/recurring.js';

test('monthly occurrences clamp to the end of short months', () => {
  assert.equal(nthOccurrence('2026-01-31', 'monthly', 0), '2026-01-31');
  assert.equal(nthOccurrence('2026-01-31', 'monthly', 1), '2026-02-28');
  assert.equal(nthOccurrence('2026-01-31', 'monthly', 2), '2026-03-31');
  assert.equal(nthOccurrence('2026-11-15', 'monthly', 2), '2027-01-15');
  assert.equal(nthOccurrence('2026-05-01', 'quarterly', 3), '2027-02-01');
  assert.equal(nthOccurrence('2024-02-29', 'yearly', 1), '2025-02-28');
  assert.equal(nthOccurrence('2026-12-28', 'weekly', 1), '2027-01-04');
});

test('dueDates only returns dates not generated yet', () => {
  const rule = { startDate: '2026-08-01', interval: 'monthly', lastDate: null };
  assert.deepEqual(dueDates(rule, '2026-10-08'), ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.deepEqual(dueDates({ ...rule, lastDate: '2026-09-01' }, '2026-10-08'), ['2026-10-01']);
  assert.deepEqual(dueDates({ ...rule, startDate: '2026-11-01' }, '2026-10-08'), []);
});

test('nextDate and monthlyAmount', () => {
  const rule = { startDate: '2026-01-15', interval: 'monthly', lastDate: '2026-10-15' };
  assert.equal(nextDate(rule, '2026-10-08'), '2026-11-15');
  assert.equal(nextDate({ ...rule, lastDate: null }, '2026-10-08'), '2026-10-15');
  assert.equal(monthlyAmount({ amount: 12000, interval: 'yearly' }), 1000);
  assert.equal(monthlyAmount({ amount: 1000, interval: 'weekly' }), 4333);
});

test('generateTransactions creates deterministic ids and skips inactive rules', () => {
  const rule = { id: 'abc', name: 'Miete', type: 'expense', amount: 80000, category: 'wohnen', interval: 'monthly', startDate: '2026-09-01', lastDate: null, active: true };
  const txs = generateTransactions(rule, '2026-10-08', 1);
  assert.deepEqual(txs.map((t) => t.id), ['r:abc:2026-09-01', 'r:abc:2026-10-01']);
  assert.equal(txs[0].note, 'Miete');
  assert.equal(txs[0].recurringId, 'abc');
  assert.deepEqual(generateTransactions({ ...rule, active: false }, '2026-10-08'), []);
});
