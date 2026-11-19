#!/usr/bin/env node
/**
 * TradeDocs — core unit tests
 * Run from anywhere:  node tests/test-core.mjs   (plain Node >= 18, zero npm deps)
 *
 * Covers js/core.js per docs/CONTRACT.md §5:
 *   esc, num/round, fmtNum/fmtQty/fmtMoney, fmtDate, todayISO, docNo,
 *   integerToEnglish/Chinese, amountWordsEn/Cn, calcOrder, calcCost,
 *   validateOrder, currency constants, uid/clone/byId, demo fixture shape.
 *
 * Every assertion checks real behaviour of the shipped core; there are no
 * placeholder/always-pass tests. Known defects are marked "QA FINDING" in a
 * comment and documented in tests/QA_REPORT.md — they are pinned to current
 * behaviour so the suite stays truthful until the owner fixes them.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = require(path.join(ROOT, 'js', 'core.js'));
const demo = require(path.join(ROOT, 'js', 'demo.js'));

/* ------------------------------------------------------------------ */
/*  Tiny test harness                                                  */
/* ------------------------------------------------------------------ */
const results = { pass: 0, fail: 0, failures: [] };

function test(name, fn) {
  try {
    fn();
    results.pass += 1;
    console.log(`ok   ${results.pass + results.fail} - ${name}`);
  } catch (err) {
    results.fail += 1;
    results.failures.push({ name, err });
    console.error(`FAIL ${results.pass + results.fail} - ${name}`);
    const lines = String(err && err.message ? err.message : err).split('\n');
    for (const line of lines) console.error(`       ${line}`);
  }
}

function group(title) {
  console.log(`\n# ${title}`);
}

const APP_YEAR = new Date().getFullYear();

/* ================================================================== */
group('Registry constants (§5)');
/* ================================================================== */

test('CURRENCIES exposes 11 contract currencies with complete metadata', () => {
  assert.ok(Array.isArray(core.CURRENCIES));
  assert.deepEqual(core.CURRENCIES.map((c) => c.code), [
    'USD', 'EUR', 'CNY', 'GBP', 'JPY', 'AUD', 'CAD', 'HKD', 'SGD', 'CHF', 'AED'
  ]);
  for (const c of core.CURRENCIES) {
    assert.match(c.code, /^[A-Z]{3}$/, `currency code ${c.code}`);
    assert.ok(c.nameEn && c.nameCn && c.symbol, `${c.code} has nameEn/nameCn/symbol`);
    assert.ok(c.wordsEn && c.wordsCn, `${c.code} has wordsEn/wordsCn`);
    assert.equal(c.decimals, c.code === 'JPY' ? 0 : 2, `${c.code} decimals`);
  }
});

test('INCOTERMS lists the 10 contract terms in order', () => {
  assert.deepEqual(core.INCOTERMS, ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);
});

test('TRANSPORT_MODES lists 5 modes with EN/CN labels', () => {
  assert.deepEqual(core.TRANSPORT_MODES.map((m) => m.key), ['SEA', 'AIR', 'RAIL', 'EXPRESS', 'LAND']);
  for (const m of core.TRANSPORT_MODES) {
    assert.ok(m.nameEn && m.nameCn, `${m.key} labels`);
  }
});

test('currencyInfo resolves case-insensitively and falls back safely', () => {
  assert.equal(core.currencyInfo('jpy').code, 'JPY');
  assert.equal(core.currencyInfo('jpy').decimals, 0);
  assert.equal(core.currencyInfo('jpy').wordsEn, 'JAPANESE YEN');
  assert.equal(core.currencyInfo('').code, 'USD', 'empty falls back to USD');
  assert.equal(core.currencyInfo().code, 'USD', 'missing falls back to USD');
  assert.equal(core.currencyInfo(null).code, 'USD');
  const unknown = core.currencyInfo('xyz');
  assert.equal(unknown.code, 'XYZ', 'unknown code upper-cased');
  assert.equal(unknown.decimals, 2);
  assert.equal(unknown.wordsCn, 'XYZ');
  assert.equal(core.decimalsOf('USD'), 2);
  assert.equal(core.decimalsOf('JPY'), 0);
  assert.equal(core.decimalsOf('xyz'), 2);
});

/* ================================================================== */
group('esc() — HTML escaping (§1 constraint 19)');
/* ================================================================== */

test('esc(null/undefined) yields empty string', () => {
  assert.equal(core.esc(null), '');
  assert.equal(core.esc(undefined), '');
});

test('esc escapes & < > " and \' exactly once, in order', () => {
  const input = `<a href="x" title='y'>&</a>`;
  const expected = '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;';
  assert.equal(core.esc(input), expected);
});

test('esc stringifies numbers and booleans', () => {
  assert.equal(core.esc(0), '0');
  assert.equal(core.esc(42.5), '42.5');
  assert.equal(core.esc(false), 'false');
  assert.equal(core.esc(NaN), 'NaN');
});

test('esc neutralises script payloads (no raw tag survives)', () => {
  const payload = '<script>alert(1)</script>';
  const out = core.esc(payload);
  assert.equal(out, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.ok(!out.includes('<script'), 'no raw <script');
  assert.ok(!out.includes('</script'), 'no raw </script');
});

test('esc neutralises attribute-breakout payloads', () => {
  const payload = 'Bob " onmouseover="alert(1)" & <img src=x onerror=alert(2)>';
  const out = core.esc(payload);
  assert.ok(!out.includes('" onmouseover="'), 'quote breakout neutralised');
  assert.ok(!out.includes('<img'), 'img tag neutralised');
  assert.ok(out.includes('&quot;'), 'double quote encoded');
  assert.ok(out.includes('&lt;img'), 'tag opener encoded');
  assert.ok(out.includes('&amp;'), 'ampersand encoded');
});

test('esc escapes literal entity text instead of trusting it (double-encoding is correct)', () => {
  assert.equal(core.esc('&amp;'), '&amp;amp;');
  assert.equal(core.esc('&lt;b&gt;'), '&amp;lt;b&amp;gt;');
});

/* ================================================================== */
group('num() — safe numeric coercion');
/* ================================================================== */

test('num returns 0 by default for empty/invalid input', () => {
  assert.equal(core.num(undefined), 0);
  assert.equal(core.num(null), 0);
  assert.equal(core.num(''), 0);
  assert.equal(core.num(NaN), 0);
  assert.equal(core.num(Infinity), 0);
  assert.equal(core.num(-Infinity), 0);
  assert.equal(core.num('abc'), 0);
  assert.equal(core.num({}), 0);
});

test('num honours an explicit fallback', () => {
  assert.equal(core.num(undefined, 5), 5);
  assert.equal(core.num(null, 5), 5);
  assert.equal(core.num('', 5), 5);
  assert.equal(core.num(Infinity, 5), 5);
  assert.equal(core.num('abc', 5), 5);
  assert.equal(core.num(0, 5), 0, 'real zero is not replaced by fallback');
});

test('num parses numeric strings, negatives and exponents', () => {
  assert.equal(core.num('12.5'), 12.5);
  assert.equal(core.num('-3'), -3);
  assert.equal(core.num('1e3'), 1000);
  assert.equal(core.num('  7  '), 7, 'surrounding whitespace tolerated by Number()');
});

test('num coerces JS primitives like Number()', () => {
  assert.equal(core.num(true), 1);
  assert.equal(core.num(false), 0);
  assert.equal(core.num([3]), 3);
  assert.equal(core.num([]), 0);
});

test('num returns 0 for whitespace-only string (documents Number("") === 0)', () => {
  assert.equal(core.num('  ', 5), 0);
});

/* ================================================================== */
group('round() — decimal rounding');
/* ================================================================== */

test('round defaults to 2 dp', () => {
  assert.equal(core.round(1.2345), 1.23);
  assert.equal(core.round(1234.5678), 1234.57);
});

test('round handles classic binary-float cases', () => {
  assert.equal(core.round(1.005, 2), 1.01);
  assert.equal(core.round(2.675, 2), 2.68);
  assert.equal(core.round(0.1 + 0.2, 2), 0.3);
});

test('round supports 0 and 3 decimal places', () => {
  assert.equal(core.round(1234.5678, 3), 1234.568);
  assert.equal(core.round(2.4, 0), 2);
  assert.equal(core.round(2.6, 0), 3);
  assert.equal(core.round(2.5, 0), 3);
});

test('round normalises negative zero to +0', () => {
  const r = core.round(-1e-9, 2);
  assert.equal(r, 0);
  assert.ok(Object.is(r, 0), 'must be +0, not -0');
});

test('round coerces non-numeric input to 0', () => {
  assert.equal(core.round(NaN), 0);
  assert.equal(core.round('abc'), 0);
  assert.equal(core.round(undefined), 0);
});

test('round handles negative values (QA FINDING: half-ties round away from zero on + side only)', () => {
  assert.equal(core.round(-1.2345, 2), -1.23);
  assert.equal(core.round(-2.505, 2), -2.5, 'binary-float tie lands toward zero here');
  assert.equal(core.round(-1.005, 2), -1.01);
  // Documented asymmetry: positive half ties round up (away from zero),
  // negative half ties round toward zero (-2.5 -> -2). Harmless for the
  // non-negative grandTotal contract, flagged as QA-F04 in QA_REPORT.md.
  assert.equal(core.round(2.5, 0), 3);
  assert.equal(core.round(-2.5, 0), -2);
});

/* ================================================================== */
group('fmtNum() — grouped decimal formatting');
/* ================================================================== */

test('fmtNum formats money-style numbers with thousands separators', () => {
  assert.equal(core.fmtNum(1234.5), '1,234.50');
  assert.equal(core.fmtNum(0), '0.00');
  assert.equal(core.fmtNum(-1234.5), '-1,234.50');
  assert.equal(core.fmtNum(1234567.891), '1,234,567.89');
  assert.equal(core.fmtNum(1000000), '1,000,000.00');
});

test('fmtNum honours custom decimal places', () => {
  assert.equal(core.fmtNum(1234.5, 0), '1,235');
  assert.equal(core.fmtNum(0.5, 0), '1');
  assert.equal(core.fmtNum(1.23456, 3), '1.235');
});

test('fmtNum never renders floating-point noise for non-finite input', () => {
  assert.equal(core.fmtNum(NaN), '0.00');
  assert.equal(core.fmtNum(Infinity), '0.00');
  assert.equal(core.fmtNum('abc'), '0.00');
  assert.equal(core.fmtNum(-0.001), '0.00', 'tiny negative renders without minus');
  assert.equal(core.fmtNum(null), '0.00');
});

test('fmtNum throws RangeError for negative dp (QA FINDING QA-F01: no guard)', () => {
  assert.throws(() => core.fmtNum(1, -1), RangeError);
});

/* ================================================================== */
group('fmtQty() — quantity formatting');
/* ================================================================== */

test('fmtQty renders integers without decimals and with grouping', () => {
  assert.equal(core.fmtQty(2400), '2,400');
  assert.equal(core.fmtQty(0), '0');
  assert.equal(core.fmtQty(-12), '-12');
  assert.equal(core.fmtQty('3600'), '3,600');
  assert.equal(core.fmtQty(1000000), '1,000,000');
});

test('fmtQty renders non-integers with at most 3 decimals', () => {
  assert.equal(core.fmtQty(1.5), '1.5');
  assert.equal(core.fmtQty(1.23456), '1.235');
  assert.equal(core.fmtQty(1234567.5), '1,234,567.5');
});

test('fmtQty snaps near-integers to integers', () => {
  assert.equal(core.fmtQty(2.9999999999), '3');
  assert.equal(core.fmtQty(0.0000001), '0');
});

test('fmtQty handles invalid input as 0', () => {
  assert.equal(core.fmtQty(NaN), '0');
  assert.equal(core.fmtQty(Infinity), '0');
  assert.equal(core.fmtQty('abc'), '0');
});

/* ================================================================== */
group('fmtMoney() — currency money formatting');
/* ================================================================== */

test('fmtMoney formats USD with 2 decimals', () => {
  assert.equal(core.fmtMoney(12345.6, 'USD'), 'USD 12,345.60');
  assert.equal(core.fmtMoney(0, 'USD'), 'USD 0.00');
  assert.equal(core.fmtMoney(1234.5678, 'USD'), 'USD 1,234.57');
  assert.equal(core.fmtMoney(1000000.5, 'USD'), 'USD 1,000,000.50');
});

test('fmtMoney defaults to USD when currency is empty/unknown form', () => {
  assert.equal(core.fmtMoney(1234.5), 'USD 1,234.50');
  assert.equal(core.fmtMoney(1234.5, ''), 'USD 1,234.50');
  assert.equal(core.fmtMoney(1234.5, null), 'USD 1,234.50');
});

test('fmtMoney renders JPY with 0 decimals', () => {
  assert.equal(core.fmtMoney(1234.4, 'JPY'), 'JPY 1,234');
  assert.equal(core.fmtMoney(1234.5, 'JPY'), 'JPY 1,235');
  assert.equal(core.fmtMoney(0, 'JPY'), 'JPY 0');
});

test('fmtMoney puts the minus sign before the currency code', () => {
  assert.equal(core.fmtMoney(-1234.56, 'USD'), '-USD 1,234.56');
  assert.equal(core.fmtMoney(-1234.56, 'JPY'), '-JPY 1,235');
});

test('fmtMoney supports other contract currencies', () => {
  assert.equal(core.fmtMoney(1000000, 'CNY'), 'CNY 1,000,000.00');
  assert.equal(core.fmtMoney(1234.5, 'EUR'), 'EUR 1,234.50');
  assert.equal(core.fmtMoney(1234.5, 'AED'), 'AED 1,234.50');
});

test('fmtMoney upper-cases unknown currency codes', () => {
  assert.equal(core.fmtMoney(1234.5, 'xyz'), 'XYZ 1,234.50');
});

test('fmtMoney rounds half-cents away from the cent boundary', () => {
  assert.equal(core.fmtMoney(0.005, 'USD'), 'USD 0.01');
  assert.equal(core.fmtMoney(-0.001, 'USD'), 'USD 0.00');
  assert.equal(core.fmtMoney(NaN, 'USD'), 'USD 0.00');
  assert.equal(core.fmtMoney('abc', 'USD'), 'USD 0.00');
});

/* ================================================================== */
group('fmtDate() — date formatting (§5)');
/* ================================================================== */

test('fmtDate medium style is "D Mon YYYY" without zero padding', () => {
  assert.equal(core.fmtDate('2026-11-19'), '19 Nov 2026');
  assert.equal(core.fmtDate('2026-11-19', 'medium'), '19 Nov 2026');
  assert.equal(core.fmtDate('2026-01-05'), '5 Jan 2026');
});

test('fmtDate long style uses full month name', () => {
  assert.equal(core.fmtDate('2026-11-19', 'long'), '19 November 2026');
  assert.equal(core.fmtDate('2026-01-05', 'long'), '5 January 2026');
});

test('fmtDate short style is zero-padded DD/MM/YYYY', () => {
  assert.equal(core.fmtDate('2026-11-19', 'short'), '19/11/2026');
  assert.equal(core.fmtDate('2026-01-05', 'short'), '05/01/2026');
});

test('fmtDate iso style round-trips the date', () => {
  assert.equal(core.fmtDate('2026-11-19', 'iso'), '2026-11-19');
  assert.equal(core.fmtDate('2026-01-05', 'iso'), '2026-01-05');
});

test('fmtDate unknown style falls back to medium', () => {
  assert.equal(core.fmtDate('2026-11-19', 'bogus'), '19 Nov 2026');
});

test('fmtDate handles year boundaries', () => {
  assert.equal(core.fmtDate('2026-01-01'), '1 Jan 2026');
  assert.equal(core.fmtDate('2026-12-31'), '31 Dec 2026');
});

test('fmtDate accepts ISO datetime strings and Date instances', () => {
  assert.equal(core.fmtDate('2026-11-19T10:00:00'), '19 Nov 2026');
  assert.equal(core.fmtDate(new Date(2026, 10, 19)), '19 Nov 2026');
});

test('fmtDate returns empty string for missing/unparseable dates', () => {
  assert.equal(core.fmtDate(''), '');
  assert.equal(core.fmtDate(null), '');
  assert.equal(core.fmtDate(undefined), '');
  assert.equal(core.fmtDate('not-a-date'), '');
  assert.equal(core.fmtDate('2026-1-5'), '', 'requires zero-padded ISO shape');
});

test('fmtDate silently normalises out-of-range calendar dates (QA FINDING QA-F02)', () => {
  // QA-F02: invalid calendar days/months overflow into a valid Date instead of
  // returning '' — flagged low severity in tests/QA_REPORT.md.
  assert.equal(core.fmtDate('2026-02-30'), '2 Mar 2026');
  assert.equal(core.fmtDate('2026-13-45'), '14 Feb 2027');
});

/* ================================================================== */
group('todayISO()');
/* ================================================================== */

test('todayISO returns the local date as YYYY-MM-DD', () => {
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(core.todayISO(), expected);
  assert.match(core.todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

/* ================================================================== */
group('docNo() — document numbering (§5, §8)');
/* ================================================================== */

test('docNo builds PREFIX-YYYY-NNNN from the supplied date', () => {
  assert.equal(core.docNo('ci', 1, '2026-11-19'), 'CI-2026-0001');
  assert.equal(core.docNo('CI', 87, '2026-11-19'), 'CI-2026-0087');
  assert.equal(core.docNo('pl', 1, '2025-01-02'), 'PL-2025-0001');
});

test('docNo honours custom padding', () => {
  assert.equal(core.docNo('sc', 7, '2026-11-19', 3), 'SC-2026-007');
  assert.equal(core.docNo('qt', 7, '2026-11-19', 1), 'QT-2026-7');
  assert.equal(core.docNo('bk', 7, '2026-11-19', 6), 'BK-2026-000007');
});

test('docNo clamps seq to a minimum of 1 and accepts numeric strings', () => {
  assert.equal(core.docNo('bk', 0, '2026-11-19'), 'BK-2026-0001');
  assert.equal(core.docNo('sa', -5, '2026-11-19'), 'SA-2026-0001');
  assert.equal(core.docNo('sa', '42', '2026-11-19'), 'SA-2026-0042');
});

test('docNo does not truncate seq values wider than the padding', () => {
  assert.equal(core.docNo('pl', 12345, '2026-01-02'), 'PL-2026-12345');
});

test('docNo upper-cases prefix and falls back to DOC', () => {
  assert.equal(core.docNo('ci', 1, '2026-11-19'), 'CI-2026-0001');
  assert.equal(core.docNo('', 1, '2026-11-19'), 'DOC-2026-0001');
  assert.equal(core.docNo(undefined, 1, '2026-11-19'), 'DOC-2026-0001');
});

test('docNo falls back to the current year for a missing/invalid date', () => {
  const expected = `CO-${APP_YEAR}-0002`;
  assert.equal(core.docNo('co', 2, 'garbage'), expected);
  assert.equal(core.docNo('co', 2, ''), expected);
  assert.equal(core.docNo('co', 2, null), expected);
});

test('docNo treats padding 0 as default 4 (QA FINDING QA-F05: falsy-padding fallback)', () => {
  // QA-F05: Number(0) || 4 => 4, so padding 0 cannot select 1 digit.
  // Pinned current behaviour; flagged low severity in QA_REPORT.md.
  assert.equal(core.docNo('ci', 1, '2026-11-19', 0), 'CI-2026-0001');
  assert.equal(core.docNo('ci', 1, '2026-11-19', 2), 'CI-2026-01');
});

/* ================================================================== */
group('integerToEnglish()');
/* ================================================================== */

test('integerToEnglish handles 0-19', () => {
  assert.equal(core.integerToEnglish(0), 'ZERO');
  assert.equal(core.integerToEnglish(1), 'ONE');
  assert.equal(core.integerToEnglish(10), 'TEN');
  assert.equal(core.integerToEnglish(11), 'ELEVEN');
  assert.equal(core.integerToEnglish(19), 'NINETEEN');
});

test('integerToEnglish handles tens and hundreds', () => {
  assert.equal(core.integerToEnglish(20), 'TWENTY');
  assert.equal(core.integerToEnglish(21), 'TWENTY-ONE');
  assert.equal(core.integerToEnglish(99), 'NINETY-NINE');
  assert.equal(core.integerToEnglish(100), 'ONE HUNDRED');
  assert.equal(core.integerToEnglish(101), 'ONE HUNDRED AND ONE');
  assert.equal(core.integerToEnglish(110), 'ONE HUNDRED AND TEN');
  assert.equal(core.integerToEnglish(999), 'NINE HUNDRED AND NINETY-NINE');
});

test('integerToEnglish handles thousands/millions/billions', () => {
  assert.equal(core.integerToEnglish(1000), 'ONE THOUSAND');
  assert.equal(core.integerToEnglish(1001), 'ONE THOUSAND ONE');
  assert.equal(core.integerToEnglish(1100), 'ONE THOUSAND ONE HUNDRED');
  assert.equal(core.integerToEnglish(12345), 'TWELVE THOUSAND THREE HUNDRED AND FORTY-FIVE');
  assert.equal(core.integerToEnglish(1000000), 'ONE MILLION');
  assert.equal(core.integerToEnglish(1000001), 'ONE MILLION ONE');
  assert.equal(core.integerToEnglish(1000000000), 'ONE BILLION');
});

test('integerToEnglish renders the 12-digit contract maximum', () => {
  assert.equal(
    core.integerToEnglish(999999999999),
    'NINE HUNDRED AND NINETY-NINE BILLION NINE HUNDRED AND NINETY-NINE MILLION ' +
    'NINE HUNDRED AND NINETY-NINE THOUSAND NINE HUNDRED AND NINETY-NINE'
  );
});

test('integerToEnglish guards the 1e15 scale boundary with digits', () => {
  assert.equal(core.integerToEnglish(1e15), '1000000000000000');
});

test('integerToEnglish floors decimals, uses abs, never emits NaN', () => {
  assert.equal(core.integerToEnglish(12.9), 'TWELVE');
  assert.equal(core.integerToEnglish(-5), 'FIVE');
  assert.equal(core.integerToEnglish(NaN), 'ZERO');
  assert.equal(core.integerToEnglish('123'), 'ONE HUNDRED AND TWENTY-THREE');
});

/* ================================================================== */
group('integerToChinese()');
/* ================================================================== */

test('integerToChinese handles single/dual digits and hundreds', () => {
  assert.equal(core.integerToChinese(0), '零');
  assert.equal(core.integerToChinese(1), '壹');
  assert.equal(core.integerToChinese(10), '壹拾');
  assert.equal(core.integerToChinese(11), '壹拾壹');
  assert.equal(core.integerToChinese(100), '壹佰');
  assert.equal(core.integerToChinese(101), '壹佰零壹');
  assert.equal(core.integerToChinese(110), '壹佰壹拾');
  assert.equal(core.integerToChinese(999), '玖佰玖拾玖');
});

test('integerToChinese handles thousands and internal zeros', () => {
  assert.equal(core.integerToChinese(1000), '壹仟');
  assert.equal(core.integerToChinese(1001), '壹仟零壹');
  assert.equal(core.integerToChinese(10000), '壹万');
  assert.equal(core.integerToChinese(10001), '壹万零壹');
  assert.equal(core.integerToChinese(12345), '壹万贰仟叁佰肆拾伍');
  assert.equal(core.integerToChinese(100000), '壹拾万');
});

test('integerToChinese handles 万/亿 boundaries', () => {
  assert.equal(core.integerToChinese(1000000), '壹佰万');
  assert.equal(core.integerToChinese(10000000), '壹仟万');
  assert.equal(core.integerToChinese(100000000), '壹亿');
  assert.equal(core.integerToChinese(100000001), '壹亿零壹');
  assert.equal(core.integerToChinese(100010000), '壹亿零壹万');
  assert.equal(core.integerToChinese(120000000), '壹亿贰仟万');
});

test('integerToChinese renders the 12-digit contract maximum', () => {
  assert.equal(
    core.integerToChinese(999999999999),
    '玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖'
  );
});

test('integerToChinese uses abs, floors decimals and falls back to 零', () => {
  assert.equal(core.integerToChinese(-123), '壹佰贰拾叁');
  assert.equal(core.integerToChinese(99.99), '玖拾玖');
  assert.equal(core.integerToChinese(NaN), '零');
});

/* ================================================================== */
group('amountWordsEn() (§5)');
/* ================================================================== */

test('amountWordsEn renders zero and cents exactly', () => {
  assert.equal(core.amountWordsEn(0, 'USD'), 'SAY US DOLLARS ZERO ONLY');
  assert.equal(core.amountWordsEn(0.05, 'USD'), 'SAY US DOLLARS ZERO AND 05/100 ONLY');
  assert.equal(core.amountWordsEn(0.5, 'USD'), 'SAY US DOLLARS ZERO AND 50/100 ONLY');
});

test('amountWordsEn renders whole and cents amounts', () => {
  assert.equal(core.amountWordsEn(999.99, 'USD'),
    'SAY US DOLLARS NINE HUNDRED AND NINETY-NINE AND 99/100 ONLY');
  assert.equal(core.amountWordsEn(1000, 'USD'), 'SAY US DOLLARS ONE THOUSAND ONLY');
  assert.equal(core.amountWordsEn(1001, 'USD'), 'SAY US DOLLARS ONE THOUSAND ONE ONLY');
  assert.equal(core.amountWordsEn(12345.6, 'USD'),
    'SAY US DOLLARS TWELVE THOUSAND THREE HUNDRED AND FORTY-FIVE AND 60/100 ONLY');
  assert.equal(core.amountWordsEn(12345.67, 'USD'),
    'SAY US DOLLARS TWELVE THOUSAND THREE HUNDRED AND FORTY-FIVE AND 67/100 ONLY');
});

test('amountWordsEn renders large contract-maximum amounts', () => {
  assert.equal(core.amountWordsEn(999999999999.99, 'USD'),
    'SAY US DOLLARS NINE HUNDRED AND NINETY-NINE BILLION NINE HUNDRED AND NINETY-NINE MILLION ' +
    'NINE HUNDRED AND NINETY-NINE THOUSAND NINE HUNDRED AND NINETY-NINE AND 99/100 ONLY');
});

test('amountWordsEn supports EUR/GBP/CNY word lists', () => {
  assert.equal(core.amountWordsEn(1234, 'EUR'),
    'SAY EURO ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR ONLY');
  assert.equal(core.amountWordsEn(1234, 'GBP'),
    'SAY POUNDS STERLING ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR ONLY');
  assert.equal(core.amountWordsEn(1234, 'CNY'),
    'SAY CHINESE YUAN ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR ONLY');
});

test('amountWordsEn treats JPY as zero-decimal and rounds to the yen', () => {
  assert.equal(core.amountWordsEn(1234, 'JPY'),
    'SAY JAPANESE YEN ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR ONLY');
  assert.equal(core.amountWordsEn(1234.56, 'JPY'),
    'SAY JAPANESE YEN ONE THOUSAND TWO HUNDRED AND THIRTY-FIVE ONLY');
  assert.equal(core.amountWordsEn(1234.5, 'JPY'),
    'SAY JAPANESE YEN ONE THOUSAND TWO HUNDRED AND THIRTY-FIVE ONLY');
});

test('amountWordsEn renders negative amounts with MINUS', () => {
  assert.equal(core.amountWordsEn(-1234.5, 'USD'),
    'SAY MINUS US DOLLARS ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR AND 50/100 ONLY');
  assert.equal(core.amountWordsEn(-0.5, 'USD'), 'SAY MINUS US DOLLARS ZERO AND 50/100 ONLY');
});

test('amountWordsEn falls back to the raw code for unknown currencies', () => {
  assert.equal(core.amountWordsEn(1234, 'XYZ'),
    'SAY XYZ ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR ONLY');
});

test('amountWordsEn carries cents that round to the next unit', () => {
  assert.equal(core.amountWordsEn(10.999, 'USD'), 'SAY US DOLLARS ELEVEN ONLY');
});

test('amountWordsEn is safe for strings, null and NaN input', () => {
  assert.equal(core.amountWordsEn('1234', 'USD'),
    'SAY US DOLLARS ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR ONLY');
  assert.equal(core.amountWordsEn(null, 'USD'), 'SAY US DOLLARS ZERO ONLY');
  const out = core.amountWordsEn(NaN, 'USD');
  assert.equal(out, 'SAY US DOLLARS ZERO ONLY');
  assert.ok(!/NaN|undefined/.test(out));
});

test('amountWordsEn direct half-cent disagrees with round() (QA FINDING)', () => {
  // QA-F03: amountWordsEn uses Math.round(abs*100)%100 while core.round uses an
  // epsilon nudge; calcOrder() always feeds already-rounded totals, so printed
  // docs stay consistent. Flagged low severity in QA_REPORT.md.
  assert.equal(core.round(1.005, 2), 1.01);
  assert.equal(core.amountWordsEn(1.005, 'USD'), 'SAY US DOLLARS ONE ONLY');
});

/* ================================================================== */
group('amountWordsCn() (§5)');
/* ================================================================== */

test('amountWordsCn renders zero, fen and jiao exactly', () => {
  assert.equal(core.amountWordsCn(0, 'USD'), '美元零元整');
  assert.equal(core.amountWordsCn(0.05, 'USD'), '美元零元零伍分');
  assert.equal(core.amountWordsCn(0.5, 'USD'), '美元零元伍角整');
  assert.equal(core.amountWordsCn(12.05, 'USD'), '美元壹拾贰元零伍分');
});

test('amountWordsCn renders whole and jiao/fen amounts', () => {
  assert.equal(core.amountWordsCn(1, 'USD'), '美元壹元整');
  assert.equal(core.amountWordsCn(999.99, 'USD'), '美元玖佰玖拾玖元玖角玖分');
  assert.equal(core.amountWordsCn(1000, 'USD'), '美元壹仟元整');
  assert.equal(core.amountWordsCn(1001, 'USD'), '美元壹仟零壹元整');
  assert.equal(core.amountWordsCn(12345.67, 'USD'), '美元壹万贰仟叁佰肆拾伍元陆角柒分');
  assert.equal(core.amountWordsCn(12345.6, 'USD'), '美元壹万贰仟叁佰肆拾伍元陆角整');
  assert.equal(core.amountWordsCn(1000000, 'USD'), '美元壹佰万元整');
});

test('amountWordsCn renders the 12-digit contract maximum', () => {
  assert.equal(core.amountWordsCn(999999999999.99, 'USD'),
    '美元玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元玖角玖分');
});

test('amountWordsCn supports EUR/CNY/GBP currency words', () => {
  assert.equal(core.amountWordsCn(100, 'EUR'), '欧元壹佰元整');
  assert.equal(core.amountWordsCn(12345.67, 'CNY'), '人民币壹万贰仟叁佰肆拾伍元陆角柒分');
  assert.equal(core.amountWordsCn(100, 'GBP'), '英镑壹佰元整');
});

test('amountWordsCn treats JPY as zero-decimal and rounds to the yen', () => {
  assert.equal(core.amountWordsCn(1234.56, 'JPY'), '日元壹仟贰佰叁拾伍元整');
  assert.equal(core.amountWordsCn(1234, 'JPY'), '日元壹仟贰佰叁拾肆元整');
});

test('amountWordsCn renders negative amounts with 负', () => {
  assert.equal(core.amountWordsCn(-1234.5, 'USD'), '负美元壹仟贰佰叁拾肆元伍角整');
});

test('amountWordsCn falls back to the raw code for unknown currencies', () => {
  assert.equal(core.amountWordsCn(100, 'XYZ'), 'XYZ壹佰元整');
});

test('amountWordsCn is safe for null/NaN input and never emits NaN', () => {
  assert.equal(core.amountWordsCn(null, 'USD'), '美元零元整');
  const out = core.amountWordsCn(NaN, 'USD');
  assert.equal(out, '美元零元整');
  assert.ok(!/NaN|undefined/.test(out));
});

/* ================================================================== */
group('calcOrder() (§5 calculation rules)');
/* ================================================================== */

test('calcOrder(undefined/{}) returns a complete zero result', () => {
  for (const input of [undefined, null, {}]) {
    const r = core.calcOrder(input);
    assert.deepEqual(r.lines, []);
    for (const k of ['totalQty', 'totalCartons', 'totalNetWeight', 'totalGrossWeight',
      'totalCbm', 'merchandiseTotal', 'freight', 'insurance', 'other', 'discount', 'grandTotal']) {
      assert.equal(r[k], 0, `${k} must be 0`);
    }
    assert.equal(r.amountInWordsEn, 'SAY US DOLLARS ZERO ONLY');
    assert.equal(r.amountInWordsCn, '美元零元整');
  }
});

test('calcOrder computes multi-line merchandise, totals and charges exactly', () => {
  const order = {
    currency: 'USD',
    items: [
      { code: 'A', qty: 3, unitPrice: 2.5, cartons: 2, netWeight: 1.2345, grossWeight: 2.5, cbm: 0.1 },
      { code: 'B', qty: 100, unitPrice: 0.125, qtyPerCarton: 30, netWeight: 0.5, grossWeight: 0.75, cbm: 0.02 }
    ],
    charges: { freight: 5.55, insurance: 1.11, other: 0.5, discount: 2.22 }
  };
  const r = core.calcOrder(order);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].amount, 7.5);
  assert.equal(r.lines[1].amount, 12.5);
  assert.equal(r.lines[1].cartonsCalc, 4, 'ceil(100/30)');
  assert.equal(r.totalQty, 103);
  assert.equal(r.totalCartons, 6);
  assert.equal(r.totalNetWeight, 4.469);
  assert.equal(r.totalGrossWeight, 8);
  assert.equal(r.totalCbm, 0.28);
  assert.equal(r.merchandiseTotal, 20);
  assert.equal(r.grandTotal, 24.94);
  assert.equal(r.amountInWordsEn, 'SAY US DOLLARS TWENTY-FOUR AND 94/100 ONLY');
  assert.equal(r.amountInWordsCn, '美元贰拾肆元玖角肆分');
});

test('calcOrder matches the demo order-1 fixture exactly', () => {
  const order1 = demo.data().orders[0];
  const r = core.calcOrder(order1);
  assert.equal(r.totalQty, 20200);
  assert.equal(r.totalCartons, 390);
  assert.equal(r.totalNetWeight, 3510);
  assert.equal(r.totalGrossWeight, 4046);
  assert.equal(r.totalCbm, 18.2);
  assert.equal(r.merchandiseTotal, 30900);
  assert.equal(r.freight, 2150);
  assert.equal(r.insurance, 340);
  assert.equal(r.discount, 0);
  assert.equal(r.grandTotal, 33390);
  assert.equal(r.amountInWordsEn, 'SAY US DOLLARS THIRTY-THREE THOUSAND THREE HUNDRED AND NINETY ONLY');
  assert.equal(r.amountInWordsCn, '美元叁万叁仟叁佰玖拾元整');
});

test('calcOrder enriches each line with amount/carton/weight totals', () => {
  const r = core.calcOrder({
    items: [{ id: 'i1', code: 'MUG', nameEn: 'MUG', qty: 101, unitPrice: 2, qtyPerCarton: 24,
      netWeight: 1.5, grossWeight: 2, cbm: 0.02, remarks: 'keep' }]
  });
  const line = r.lines[0];
  assert.equal(line.amount, 202);
  assert.equal(line.cartonsCalc, 5);
  assert.equal(line.netWeightTotal, 7.5);
  assert.equal(line.grossWeightTotal, 10);
  assert.equal(line.cbmTotal, 0.1);
  assert.equal(line.code, 'MUG', 'source fields preserved on the line');
  assert.equal(line.remarks, 'keep');
  assert.equal(line.qty, 101, 'line keeps the original qty untouched');
  assert.equal(line.unitPrice, 2, 'line keeps the original unitPrice untouched');
});

test('calcOrder prefers explicit cartons and falls back to ceil(qty/qtyPerCarton)', () => {
  const explicit = core.calcOrder({ items: [{ qty: 101, unitPrice: 2, qtyPerCarton: 24, cartons: 7 }] });
  assert.equal(explicit.lines[0].cartonsCalc, 7, 'explicit cartons win');
  const fallback = core.calcOrder({ items: [{ qty: 101, unitPrice: 2, qtyPerCarton: 24, cartons: 0 }] });
  assert.equal(fallback.lines[0].cartonsCalc, 5, 'ceil fallback');
  const none = core.calcOrder({ items: [{ qty: 5, unitPrice: 1, cartons: 0, qtyPerCarton: 0 }] });
  assert.equal(none.lines[0].cartonsCalc, 0, 'no carton data -> 0');
  const zeroQty = core.calcOrder({ items: [{ qty: 0, unitPrice: 1, qtyPerCarton: 24 }] });
  assert.equal(zeroQty.lines[0].cartonsCalc, 0, 'zero qty never yields cartons');
});

test('calcOrder rounds weight/CBM totals to 3 decimals', () => {
  const r = core.calcOrder({
    items: [{ qty: 10, unitPrice: 1, cartons: 3, netWeight: 1.2345, grossWeight: 2.3456, cbm: 0.01234 }]
  });
  assert.equal(r.lines[0].netWeightTotal, 3.704);
  assert.equal(r.lines[0].grossWeightTotal, 7.037);
  assert.equal(r.lines[0].cbmTotal, 0.037);
  assert.equal(r.totalNetWeight, 3.704);
  assert.equal(r.totalGrossWeight, 7.037);
  assert.equal(r.totalCbm, 0.037);
});

test('calcOrder clamps negative grand totals to 0 and re-syncs words', () => {
  const r = core.calcOrder({ items: [{ qty: 1, unitPrice: 100 }], charges: { discount: 500 } });
  assert.equal(r.grandTotal, 0);
  assert.equal(r.amountInWordsEn, 'SAY US DOLLARS ZERO ONLY');
  assert.equal(r.amountInWordsCn, '美元零元整');
});

test('calcOrder rounds charges to cents and applies the contract formula', () => {
  const r = core.calcOrder({
    items: [{ qty: 1, unitPrice: 100 }],
    charges: { freight: 10.555, insurance: 20, other: 5, discount: 3.333 }
  });
  assert.equal(r.freight, 10.56);
  assert.equal(r.insurance, 20);
  assert.equal(r.other, 5);
  assert.equal(r.discount, 3.33);
  assert.equal(r.grandTotal, 132.23);
});

test('calcOrder rounding of accumulated fractional quantities', () => {
  const r = core.calcOrder({ items: [{ qty: 0.1 }, { qty: 0.1 }, { qty: 0.1 }] });
  assert.equal(r.totalQty, 0.3);
});

test('calcOrder uses order currency for amount words', () => {
  const eur = core.calcOrder({ currency: 'EUR', items: [{ qty: 1, unitPrice: 5 }] });
  assert.equal(eur.amountInWordsEn, core.amountWordsEn(eur.grandTotal, 'EUR'));
  const jpy = core.calcOrder({ currency: 'JPY', items: [{ qty: 1, unitPrice: 1234.56 }] });
  assert.equal(jpy.amountInWordsEn, 'SAY JAPANESE YEN ONE THOUSAND TWO HUNDRED AND THIRTY-FIVE ONLY');
  assert.equal(jpy.amountInWordsCn, '日元壹仟贰佰叁拾伍元整');
});

test('calcOrder defaults missing currency to USD', () => {
  const r = core.calcOrder({ items: [{ qty: 1, unitPrice: 1 }] });
  assert.equal(r.amountInWordsEn, 'SAY US DOLLARS ONE ONLY');
});

test('calcOrder is pure and does not mutate the source order', () => {
  const order = {
    currency: 'EUR',
    items: [{ id: 'i1', qty: 3, unitPrice: 2.5, nested: { a: 1 }, remarks: 'x' }],
    charges: { freight: 1 }
  };
  const snapshot = JSON.stringify(order);
  const r = core.calcOrder(order);
  assert.equal(JSON.stringify(order), snapshot, 'input deep-equal after call');
  assert.notEqual(r.lines[0], order.items[0], 'lines are copies, not references');
  assert.equal(r.lines[0].nested.a, 1, 'line copies carry nested data through');
});

/* ================================================================== */
group('calcCost() (§5)');
/* ================================================================== */

test('calcCost returns zeroed result for an empty order with 7.1 default rate', () => {
  const r = core.calcCost();
  assert.deepEqual(r, {
    revenueFc: 0, exchangeRate: 7.1, revenueCny: 0, purchaseCost: 0,
    domesticCost: 0, bankCost: 0, miscCost: 0, totalCost: 0,
    grossProfit: 0, marginPct: 0
  });
});

test('calcCost matches the demo order-1 fixture exactly', () => {
  const r = core.calcCost(demo.data().orders[0]);
  assert.deepEqual(r, {
    revenueFc: 33390,
    exchangeRate: 7.12,
    revenueCny: 237736.8,
    purchaseCost: 131140,
    domesticCost: 4200,
    bankCost: 850,
    miscCost: 0,
    totalCost: 136190,
    grossProfit: 101546.8,
    marginPct: 42.71
  });
});

test('calcCost falls back to 7.1 for missing/zero/negative exchange rates', () => {
  const zero = core.calcCost({ cost: { exchangeRate: 0 }, items: [] });
  assert.equal(zero.exchangeRate, 7.1);
  const negative = core.calcCost({ cost: { exchangeRate: -3 }, items: [] });
  assert.equal(negative.exchangeRate, 7.1);
  const missing = core.calcCost({ items: [] });
  assert.equal(missing.exchangeRate, 7.1);
  const str = core.calcCost({ cost: { exchangeRate: '7.2' }, items: [] });
  assert.equal(str.exchangeRate, 7.2);
});

test('calcCost computes purchase cost from qty * costPrice and handles missing costPrice', () => {
  const r = core.calcCost({
    items: [{ qty: 10, unitPrice: 5, costPrice: 3 }, { qty: 2, unitPrice: 5 }],
    cost: { exchangeRate: 7 }
  });
  assert.equal(r.purchaseCost, 30);
  assert.equal(r.revenueFc, 60);
  assert.equal(r.revenueCny, 420);
  assert.equal(r.totalCost, 30);
  assert.equal(r.grossProfit, 390);
  assert.equal(r.marginPct, 92.86);
});

test('calcCost includes domestic/bank/misc costs and can report negative margin', () => {
  const r = core.calcCost({
    items: [{ qty: 1, unitPrice: 10, costPrice: 100 }],
    cost: { exchangeRate: 7, domestic: 5, bank: 2.5, misc: 1.25 }
  });
  assert.equal(r.revenueCny, 70);
  assert.equal(r.purchaseCost, 100);
  assert.equal(r.domesticCost, 5);
  assert.equal(r.bankCost, 2.5);
  assert.equal(r.miscCost, 1.25);
  assert.equal(r.totalCost, 108.75);
  assert.equal(r.grossProfit, -38.75);
  assert.equal(r.marginPct, -55.36);
});

test('calcCost rounds cost components to cents', () => {
  const r = core.calcCost({
    items: [{ qty: 1, unitPrice: 10 }],
    cost: { exchangeRate: 7, domestic: 1.234, bank: 2.345, misc: 0.005 }
  });
  assert.equal(r.domesticCost, 1.23);
  assert.equal(r.bankCost, 2.35);
  assert.equal(r.miscCost, 0.01);
  assert.equal(r.totalCost, 3.59);
});

test('calcCost guards margin when revenue is zero', () => {
  const r = core.calcCost({ items: [{ qty: 0, unitPrice: 0, costPrice: 5 }], cost: { domestic: 10 } });
  assert.equal(r.revenueCny, 0);
  assert.equal(r.totalCost, 10);
  assert.equal(r.grossProfit, -10);
  assert.equal(r.marginPct, 0, 'undefined margin reported as 0');
});

/* ================================================================== */
group('validateOrder() (§5)');
/* ================================================================== */

const issueKeys = (issues) => issues.map((i) => `${i.level}:${i.field}`);

test('validateOrder returns no issues for a complete valid order', () => {
  const order = {
    no: 'SO-2026-0001',
    date: '2026-11-19',
    buyer: { nameEn: 'ATLANTIC HOME GOODS LLC' },
    items: [{ nameEn: 'MUG', qty: 10, unitPrice: 2, unit: 'PCS', hsCode: '6912.00.00', cartons: 1, grossWeight: 9 }],
    portOfLoading: 'NINGBO, CHINA',
    portOfDischarge: 'LOS ANGELES, USA',
    incoterm: 'FOB',
    paymentTerms: 'T/T',
    countryOfDestination: 'UNITED STATES'
  };
  assert.deepEqual(core.validateOrder(order), []);
});

test('validateOrder reports the exact issue set for an empty order', () => {
  assert.deepEqual(issueKeys(core.validateOrder({})), [
    'error:buyer.nameEn',
    'error:date',
    'warn:no',
    'error:items',
    'warn:portOfLoading',
    'warn:portOfDischarge',
    'warn:incoterm',
    'warn:paymentTerms',
    'warn:countryOfDestination',
    'warn:charges'
  ]);
});

test('validateOrder reports per-line errors for empty items', () => {
  const issues = core.validateOrder({ buyer: { nameEn: 'X' }, date: '2026-11-19', no: 'SO-1', items: [{}] });
  assert.deepEqual(issueKeys(issues).filter((k) => k.includes('items.0')), [
    'error:items.0.nameEn',
    'error:items.0.qty',
    'warn:items.0.unit',
    'warn:items.0.hsCode',
    'warn:items.0.cartons',
    'warn:items.0.grossWeight'
  ]);
});

test('validateOrder flags missing buyer and invalid order date', () => {
  assert.deepEqual(issueKeys(core.validateOrder({ buyer: {} }).filter((i) => i.field.startsWith('buyer'))),
    ['error:buyer.nameEn']);
  assert.deepEqual(issueKeys(core.validateOrder({ date: 'abc' }).filter((i) => i.field === 'date')),
    ['error:date']);
  assert.deepEqual(core.validateOrder({ date: '2026-11-19' }).filter((i) => i.field === 'date'), []);
});

test('validateOrder enforces qty > 0 and unitPrice >= 0 per line', () => {
  const issues = core.validateOrder({
    items: [
      { nameEn: 'A', qty: 0, unitPrice: 1, unit: 'PCS', hsCode: '1', cartons: 1, grossWeight: 1 },
      { nameEn: 'B', qty: 2, unitPrice: -1, unit: 'PCS', hsCode: '1', cartons: 1, grossWeight: 1 }
    ]
  });
  assert.ok(issues.some((i) => i.level === 'error' && i.field === 'items.0.qty'));
  assert.ok(issues.some((i) => i.level === 'error' && i.field === 'items.1.unitPrice'));
  assert.equal(issues.filter((i) => i.field === 'items.0.unitPrice').length, 0, 'zero price not an error');
});

test('validateOrder warns for missing unit/HS/cartons/grossWeight on a line', () => {
  const issues = core.validateOrder({
    items: [{ nameEn: 'A', qty: 1, unitPrice: 1, unit: '', hsCode: '', cartons: 0, qtyPerCarton: 0, grossWeight: 0 }]
  });
  for (const field of ['items.0.unit', 'items.0.hsCode', 'items.0.cartons', 'items.0.grossWeight']) {
    assert.ok(issues.some((i) => i.level === 'warn' && i.field === field), `warn ${field}`);
  }
});

test('validateOrder accepts cartons OR qtyPerCarton and skips the carton warning', () => {
  const withCartons = core.validateOrder({ items: [{ nameEn: 'A', qty: 1, unitPrice: 1, unit: 'PCS', hsCode: '1', cartons: 2, grossWeight: 1 }] });
  assert.ok(!withCartons.some((i) => i.field === 'items.0.cartons'));
  const withQpc = core.validateOrder({ items: [{ nameEn: 'A', qty: 1, unitPrice: 1, unit: 'PCS', hsCode: '1', qtyPerCarton: 10, grossWeight: 1 }] });
  assert.ok(!withQpc.some((i) => i.field === 'items.0.cartons'));
});

test('validateOrder accepts a Chinese-only buyer name', () => {
  const order = { buyer: { nameCn: '宁波晨阳进出口有限公司' } };
  const issues = core.validateOrder(order);
  assert.ok(!issues.some((i) => i.field === 'buyer.nameEn'));
});

test('validateOrder suppresses destination warning when buyer.country is present', () => {
  const issues = core.validateOrder({ buyer: { nameEn: 'X', country: 'GERMANY' } });
  assert.ok(!issues.some((i) => i.field === 'countryOfDestination'));
});

test('validateOrder warns when grandTotal is zero', () => {
  const issues = core.validateOrder({
    buyer: { nameEn: 'A' }, date: '2026-11-19', no: 'SO-1',
    items: [{ nameEn: 'M', qty: 1, unitPrice: 0, unit: 'PCS', hsCode: '1', cartons: 1, grossWeight: 1 }],
    portOfLoading: 'A', portOfDischarge: 'B', incoterm: 'FOB', paymentTerms: 'T', countryOfDestination: 'C'
  });
  assert.deepEqual(issueKeys(issues), ['warn:charges']);
});

test('validateOrder only emits error|warn levels and non-empty Chinese messages', () => {
  const issues = core.validateOrder(null);
  assert.equal(issues.length, 10, 'null order yields the empty-order issue set');
  for (const issue of issues) {
    assert.ok(['error', 'warn'].includes(issue.level), `bad level ${issue.level}`);
    assert.equal(typeof issue.field, 'string');
    assert.ok(issue.field.length > 0);
    assert.ok(issue.message.length > 0);
    assert.match(issue.message, /[\u4e00-\u9fa5]/, 'message is Simplified Chinese UI copy');
  }
});

test('validateOrder does not mutate the order it validates', () => {
  const order = { buyer: { nameEn: 'X' }, items: [{ qty: 0 }] };
  const snapshot = JSON.stringify(order);
  core.validateOrder(order);
  assert.equal(JSON.stringify(order), snapshot);
});

/* ================================================================== */
group('uid() / clone() / byId()');
/* ================================================================== */

test('uid builds prefixed unique ids', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i += 1) ids.add(core.uid('ord'));
  assert.equal(ids.size, 500, 'no collisions across 500 ids');
  for (const id of ids) assert.match(id, /^ord_[a-z0-9]+_[a-z0-9]+$/);
  assert.match(core.uid(), /^id_/);
});

test('clone performs a deep copy and passes null/undefined through', () => {
  const src = { a: 1, b: { c: [1, 2, 3] } };
  const copy = core.clone(src);
  assert.deepEqual(copy, src);
  assert.notEqual(copy, src);
  assert.notEqual(copy.b, src.b);
  copy.b.c.push(4);
  assert.deepEqual(src.b.c, [1, 2, 3], 'source untouched');
  assert.equal(core.clone(null), null);
  assert.equal(core.clone(undefined), undefined);
});

test('byId finds by id, returns the live reference, and handles misses', () => {
  const list = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
  assert.equal(core.byId(list, 'b'), list[1]);
  assert.equal(core.byId(list, 'zzz'), undefined);
  assert.equal(core.byId(list, ''), undefined);
  assert.equal(core.byId(null, 'a'), undefined);
  assert.equal(core.byId([], 'a'), undefined);
});

/* ================================================================== */
group('demo fixture integrity (used by template/E2E suites)');
/* ================================================================== */

test('demo.data() provides the QA fixture shape', () => {
  const state = demo.data();
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.orders.length, 3);
  assert.equal(state.customers.length, 4);
  assert.equal(state.products.length, 8);
  assert.equal(state.activeOrderId, state.orders[0].id);
  assert.equal(state.settings.numbering.padding, 4);
  assert.equal(state.settings.numbering.next.ci, 88);
  assert.ok(state.settings.company.logo.startsWith('data:image/svg+xml'));
  assert.ok(state.settings.company.seal.startsWith('data:image/svg+xml'));
  assert.equal(state.settings.company.nameEn, 'NINGBO SUNRISE IMP. & EXP. CO., LTD.');
});

test('demo order-1 fixture carries all 12 docMeta numbers', () => {
  const order1 = demo.data().orders[0];
  assert.equal(order1.id, 'ord_demo_001');
  assert.equal(order1.buyer.nameEn, 'ATLANTIC HOME GOODS LLC');
  assert.equal(order1.currency, 'USD');
  assert.equal(order1.items.length, 5);
  const keys = ['ci', 'pl', 'pi', 'sc', 'qt', 'bk', 'sa', 'co', 'bc', 'dr', 'cd', 'cs'];
  assert.deepEqual(Object.keys(order1.docMeta).sort(), keys.slice().sort());
  for (const key of keys) {
    const meta = order1.docMeta[key];
    assert.match(meta.no, new RegExp(`^${key.toUpperCase()}-\\d{4}-\\d{4}$`), `${key} number shape`);
    assert.match(meta.date, /^\d{4}-\d{2}-\d{2}$/, `${key} date shape`);
  }
  assert.equal(order1.docMeta.ci.no, 'CI-' + new Date().getFullYear() + '-0087');
});

test('demo data() is independent between calls', () => {
  const a = demo.data();
  const b = demo.data();
  a.orders[0].buyer.nameEn = 'MUTATED';
  assert.notEqual(b.orders[0].buyer.nameEn, 'MUTATED');
  assert.equal(b.orders[0].buyer.nameEn, 'ATLANTIC HOME GOODS LLC');
});

/* ------------------------------------------------------------------ */
/*  Summary                                                            */
/* ------------------------------------------------------------------ */
const total = results.pass + results.fail;
console.log(`\n${'='.repeat(64)}`);
if (results.fail === 0) {
  console.log(`PASS  test-core.mjs — ${total}/${total} tests passed`);
  process.exitCode = 0;
} else {
  console.error(`FAIL  test-core.mjs — ${results.pass}/${total} passed, ${results.fail} failed`);
  for (const { name } of results.failures) console.error(`  - ${name}`);
  process.exitCode = 1;
}
