import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountInput, evalAmount, centsToInput, parseReceipt } from '../js/parser.js';

const TODAY = new Date('2026-10-08T12:00:00Z');

test('parseAmountInput understands German and English formats', () => {
  assert.equal(parseAmountInput('12,50'), 1250);
  assert.equal(parseAmountInput('12.50'), 1250);
  assert.equal(parseAmountInput('1.234,56'), 123456);
  assert.equal(parseAmountInput('1,234.56'), 123456);
  assert.equal(parseAmountInput('1.234'), 123400);
  assert.equal(parseAmountInput('7'), 700);
  assert.equal(parseAmountInput('3,5'), 350);
  assert.equal(parseAmountInput(' 9,99 € '), 999);
  assert.ok(Number.isNaN(parseAmountInput('')));
  assert.ok(Number.isNaN(parseAmountInput('abc')));
  assert.ok(Number.isNaN(parseAmountInput('1,234')));
});

test('evalAmount works as a small calculator', () => {
  assert.equal(evalAmount('12,50'), 1250);
  assert.equal(evalAmount('12,50+3,20'), 1570);
  assert.equal(evalAmount('3*2,50'), 750);
  assert.equal(evalAmount('10+2*3'), 1600);
  assert.equal(evalAmount('100/3'), 3333);
  assert.equal(evalAmount('20 - 4,99'), 1501);
  assert.equal(evalAmount('0,1+0,2'), 30);
  assert.equal(evalAmount('1.234+1'), 123500);
  assert.ok(Number.isNaN(evalAmount('5+')));
  assert.ok(Number.isNaN(evalAmount('5/0')));
  assert.ok(Number.isNaN(evalAmount('a+b')));
});

test('centsToInput formats with comma', () => {
  assert.equal(centsToInput(1250), '12,50');
  assert.equal(centsToInput(5), '0,05');
});

test('supermarket receipt', () => {
  const text = `REWE
Musterstraße 12
12345 Berlin
UID Nr.: DE123456789
BANANEN 1,49 B
VOLLMILCH 1,19 B
BROT 2,79 B
--------------------------
SUMME EUR 5,47
Geg. Bar EUR 10,00
Rückgeld BAR EUR 4,53
Steuer % Netto Steuer Brutto
B= 7,0% 5,11 0,36 5,47
08.10.2026 14:23 Bon-Nr.:4711`;
  const r = parseReceipt(text, TODAY);
  assert.equal(r.amount, 547);
  assert.equal(r.date, '2026-10-08');
  assert.equal(r.merchant, 'Rewe');
  assert.equal(r.category, 'lebensmittel');
  assert.ok(r.candidates.includes(279));
  assert.ok(!r.candidates.includes(547), 'chosen total is not repeated');
  assert.ok(!r.candidates.includes(1000), 'cash given is not offered');
});

test('total on the line after the keyword and two-digit year', () => {
  const text = `Pizzeria Da Mario
Datum: 03.10.26 19:45
Pizza Margherita 9,50
Cola 3,20
Gesamtbetrag
12,70 €
Vielen Dank!`;
  const r = parseReceipt(text, TODAY);
  assert.equal(r.amount, 1270);
  assert.equal(r.date, '2026-10-03');
  assert.equal(r.merchant, 'Pizzeria Da Mario');
  assert.equal(r.category, 'restaurant');
});

test('fuel receipt with thousands separator and card payment', () => {
  const text = `ARAL Tankstelle
Super E10 45,12 l
Betrag 1.084,30
girocard 1.084,30
MwSt 19% 173,12
2026-09-30`;
  const r = parseReceipt(text, TODAY);
  assert.equal(r.amount, 108430);
  assert.equal(r.date, '2026-09-30');
  assert.equal(r.category, 'mobilitaet');
});

test('falls back to the largest amount and ignores future dates', () => {
  const text = `Kleiner Laden
Artikel A 4,00
Artikel B 6,50
gültig bis 31.12.2027
Kauf am 01.10.2026`;
  const r = parseReceipt(text, TODAY);
  assert.equal(r.amount, 650);
  assert.equal(r.date, '2026-10-01');
  assert.equal(r.category, null);
});

test('empty text yields nulls', () => {
  assert.deepEqual(parseReceipt('', TODAY), { amount: null, candidates: [], date: null, merchant: null, category: null });
});
