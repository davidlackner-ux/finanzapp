// Pure helpers for amounts and receipt text. No DOM access, so they can be tested with `node --test`.

/** Parses user input like "12,50", "12.50", "1.234,56" or "7" into cents. Returns NaN if invalid. */
export function parseAmountInput(input) {
  const s = String(input ?? '').replace(/[€\s]/g, '');
  if (!s) return NaN;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decimalSep = null;
  if (lastComma >= 0 && lastDot >= 0) decimalSep = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0) decimalSep = ',';
  else if (lastDot >= 0) decimalSep = /^\d{1,3}(\.\d{3})+$/.test(s) ? null : '.';

  let intPart = s;
  let frac = '';
  if (decimalSep) {
    const i = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, i);
    frac = s.slice(i + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(frac) || (!intPart && !frac)) return NaN;
  return Number(intPart || 0) * 100 + Number(frac.padEnd(2, '0'));
}

/** Formats cents for an input field: 1250 -> "12,50". */
export function centsToInput(cents) {
  return (cents / 100).toFixed(2).replace('.', ',');
}

const DATE_RE = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/g;
const ISO_DATE_RE = /(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g;
const TIME_RE = /(?<!\d)\d{1,2}:\d{2}(:\d{2})?(?!\d)/g;
// "12,50", "1.234,56", "12.50" – but not part of a longer number like "08.10.26"
const AMOUNT_RE = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d{1,6})\s?[,.]\s?(\d{2})(?![\d]|[.,]\d)/g;

const TOTAL_STRONG = /(^|[^a-zäöü])(summe|gesamt\w*|total|zu\s*zahlen|zahlbetrag|endbetrag|rechnungsbetrag|bruttobetrag|brutto)(?![a-zäöü])/i;
const TOTAL_WEAK = /(^|[^a-zäöü])(bar|ec|karte|girocard|visa|mastercard|maestro|kartenzahlung|betrag|eur)(?![a-zäöü])/i;
const EXCLUDE = /(mwst|ust\b|netto(?!\s*markt)|steuer|mehrwert|r[üu]ckgeld|zur[üu]ck|gegeben|rabatt|pfand|zwischensumme|kunden|tel\.?|fax)/i;

const MERCHANT_SKIP = /(rechnung|beleg|quittung|kasse|bon\b|filiale|tel|fax|www\.|http|str\.|stra(ss|ß)e|ust|steuer|datum|uhrzeit)/i;

const CATEGORY_KEYWORDS = {
  lebensmittel: ['rewe', 'edeka', 'aldi', 'lidl', 'netto', 'penny', 'kaufland', 'norma', 'globus', 'tegut', 'spar', 'billa', 'hofer', 'migros', 'coop', 'denns', 'alnatura', 'bäckerei', 'baeckerei', 'backhaus', 'metzgerei', 'supermarkt', 'markt'],
  restaurant: ['restaurant', 'café', 'cafe', 'pizzeria', 'pizza', 'burger', 'mcdonald', "mcdonald's", 'starbucks', 'bistro', 'imbiss', 'döner', 'doener', 'gaststätte', 'trattoria', 'sushi', 'kebab', 'subway', 'kfc', 'lieferando'],
  mobilitaet: ['aral', 'shell', 'esso', 'jet', 'omv', 'agip', 'avia', 'tankstelle', 'diesel', 'benzin', 'super e10', 'deutsche bahn', 'db', 'bahn', 'fahrkarte', 'ticket', 'parken', 'parkhaus', 'uber', 'bolt', 'bvg', 'mvv', 'hvv', 'flixbus'],
  shopping: ['dm', 'rossmann', 'müller', 'h&m', 'zara', 'primark', 'amazon', 'mediamarkt', 'media markt', 'saturn', 'ikea', 'tk maxx', 'deichmann', 'obi', 'bauhaus', 'hornbach', 'toom', 'douglas', 'thalia'],
  gesundheit: ['apotheke', 'arzt', 'praxis', 'optiker', 'fielmann', 'zahnarzt', 'physio'],
  freizeit: ['kino', 'cinema', 'cinemaxx', 'museum', 'theater', 'fitness', 'sport', 'eintritt', 'steam', 'playstation', 'konzert', 'schwimmbad'],
  wohnen: ['miete', 'strom', 'stadtwerke', 'nebenkosten', 'hausverwaltung'],
  abos: ['netflix', 'spotify', 'telekom', 'vodafone', 'o2', 'disney', 'apple.com', 'abo'],
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CATEGORY_RES = Object.entries(CATEGORY_KEYWORDS).map(([id, words]) => [
  id,
  new RegExp(`(^|[^a-zäöüß])(${words.map(escapeRe).join('|')})(?![a-zäöüß])`, 'i'),
]);

function toIsoDate(y, m, d) {
  let year = Number(y);
  if (y.length === 2) year += 2000;
  const month = Number(m);
  const day = Number(d);
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function findAmounts(line) {
  const cleaned = line.replace(DATE_RE, ' ').replace(ISO_DATE_RE, ' ').replace(TIME_RE, ' ');
  return [...cleaned.matchAll(AMOUNT_RE)].map((m) => Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]));
}

function findDate(text, today) {
  const maxDate = new Date(today.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const candidates = [
    ...[...text.matchAll(DATE_RE)].map((m) => toIsoDate(m[3], m[2], m[1])),
    ...[...text.matchAll(ISO_DATE_RE)].map((m) => toIsoDate(m[1], m[2], m[3])),
  ];
  return candidates.find((d) => d && d <= maxDate) ?? null;
}

function findTotal(lines) {
  let best = null;
  const consider = (value, score) => {
    if (!value || value > 10_000_000) return;
    if (!best || score > best.score || (score === best.score && value > best.value)) best = { value, score };
  };

  lines.forEach((line, i) => {
    if (EXCLUDE.test(line)) return;
    const strong = TOTAL_STRONG.test(line);
    if (!strong && !TOTAL_WEAK.test(line)) return;
    let amounts = findAmounts(line);
    // Amount is sometimes printed on the line below the keyword
    if (!amounts.length && lines[i + 1] && !EXCLUDE.test(lines[i + 1])) amounts = findAmounts(lines[i + 1]);
    if (amounts.length) consider(amounts[amounts.length - 1], strong ? 3 : 1);
  });

  if (best) return best.value;

  // Fallback: largest plausible amount on the receipt
  for (const line of lines) {
    if (EXCLUDE.test(line)) continue;
    for (const value of findAmounts(line)) consider(value, 0);
  }
  return best?.value ?? null;
}

function findMerchant(lines) {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.replace(/[^\p{L}\d&'.\- ]/gu, ' ').replace(/\s+/g, ' ').trim();
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (letters < 3 || letters / line.length < 0.5 || MERCHANT_SKIP.test(line)) continue;
    const name = line === line.toUpperCase()
      ? line.toLowerCase().replace(/(^|[\s\-&])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
      : line;
    return name.slice(0, 40);
  }
  return null;
}

function guessCategory(text) {
  for (const [id, re] of CATEGORY_RES) {
    if (re.test(text)) return id;
  }
  return null;
}

/**
 * Extracts the most likely total, date, merchant and category from OCR text of a receipt.
 * @returns {{ amount: number|null, date: string|null, merchant: string|null, category: string|null }}
 */
export function parseReceipt(text, today = new Date()) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    amount: findTotal(lines),
    date: findDate(lines.join('\n'), today),
    merchant: findMerchant(lines),
    category: guessCategory(lines.join('\n')),
  };
}
