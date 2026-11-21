#!/usr/bin/env node
/**
 * TradeDocs — document template tests (docs/CONTRACT.md §6, §7)
 * Run:  node tests/test-templates.mjs   (plain Node >= 18, zero npm deps)
 *
 * Loads js/core.js → js/demo.js → js/doc-templates.js in the app's script order,
 * renders all 12 documents for demo order 1 and asserts:
 *   - registry shape (version / groups / list / get)
 *   - article contract: class="doc-sheet doc-sheet--<key>" data-doc="<key>"
 *   - title, document number, date, buyer, company letterhead, seal/signer
 *   - per-type mandatory content per contract §7 (CI/PL/PI/SC/QT/BK/SA/CD/CO/BC/DR/CS)
 *   - no undefined / NaN / null / [object Object] leaks
 *   - HTML escaping of every user string (XSS payload in buyer/remarks/marks/items)
 *   - empty-order render does not throw
 *   - render() is pure (order/state/opts/meta deep-equal before/after) and deterministic
 *
 * Exit codes: 0 = all pass, 1 = failures, 2 = dependency js/doc-templates.js missing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Classic scripts expect a browser-ish global; provide one before loading. */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_PATH = path.join(ROOT, 'js', 'doc-templates.js');

if (!fs.existsSync(DOCS_PATH)) {
  console.error('PENDING  js/doc-templates.js does not exist yet (owner: doc-dev).');
  console.error('         test-templates.mjs is ready; re-run once the document engine lands.');
  process.exit(2);
}

const core = require(path.join(ROOT, 'js', 'core.js'));
const demo = require(path.join(ROOT, 'js', 'demo.js'));

let docs = null;
let loadError = null;
try {
  const required = require(DOCS_PATH);
  if (required && typeof required.render === 'function') docs = required;
} catch (err) {
  loadError = err;
}
if (!docs && globalThis.TradeDocs && globalThis.TradeDocs.docs) docs = globalThis.TradeDocs.docs;
if (!docs || typeof docs.render !== 'function') {
  console.error('LOAD FAIL  js/doc-templates.js did not expose { list, groups, get, render }.');
  if (loadError) console.error(loadError && loadError.stack ? loadError.stack : String(loadError));
  console.error('Expected a UMD module like core.js/demo.js (module.exports) or window.TradeDocs.docs.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Harness                                                            */
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
    for (const line of String(err && err.message ? err.message : err).split('\n')) {
      console.error(`       ${line}`);
    }
  }
}
function group(title) {
  console.log(`\n# ${title}`);
}

/* ------------------------------------------------------------------ */
/*  HTML helpers                                                       */
/* ------------------------------------------------------------------ */
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] || m);
}
function tagless(html) {
  return decodeEntities(
    String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]*>/g, '')
  );
}
const squash = (s) => String(s).replace(/\s+/g, '');
/** Whitespace/tag-insensitive substring search over rendered document text. */
function hasText(html, needle) {
  return squash(tagless(html)).includes(squash(decodeEntities(String(needle))));
}
function hasTextCI(html, needle) {
  return squash(tagless(html)).toLowerCase().includes(squash(decodeEntities(String(needle))).toLowerCase());
}
function assertNoLeaks(html, label) {
  const body = tagless(html);
  assert.ok(!body.includes('[object Object]'), `${label}: [object Object] leaked into text`);
  assert.ok(!/\bundefined\b/.test(body), `${label}: "undefined" leaked into text`);
  assert.ok(!/\bNaN\b/.test(body), `${label}: "NaN" leaked into text`);
  assert.ok(!/\bnull\b/.test(body), `${label}: "null" leaked into text`);
  assert.ok(!/\bInfinity\b/.test(body), `${label}: "Infinity" leaked into text`);
}
function assertArticle(html, key, label) {
  assert.equal(typeof html, 'string', `${label}: render must return a string`);
  assert.ok(html.trim().length > 500, `${label}: render output too short (${String(html).length} chars)`);
  assert.ok(/^\s*<article\b/.test(html), `${label}: root element must be <article>`);
  assert.ok(/<\/article>\s*$/.test(html), `${label}: output must close with </article>`);
  assert.equal((html.match(/<article\b/g) || []).length, 1, `${label}: exactly one article root`);
  const rootTag = html.match(/^\s*<article\b([^>]*)>/)[1];
  const classAttr = (rootTag.match(/\bclass="([^"]*)"/) || [])[1] || '';
  const classes = classAttr.split(/\s+/).filter(Boolean);
  assert.ok(classes.includes('doc-sheet'), `${label}: root needs class "doc-sheet" (got "${classAttr}")`);
  assert.ok(classes.includes(`doc-sheet--${key}`), `${label}: root needs modifier "doc-sheet--${key}" (got "${classAttr}")`);
  assert.ok(new RegExp(`\\bdata-doc="${key}"`).test(rootTag), `${label}: root needs data-doc="${key}" (got ${rootTag})`);
}

/* ------------------------------------------------------------------ */
/*  Fixtures & context factory                                         */
/* ------------------------------------------------------------------ */
const state = demo.data();
const order = state.orders[0];
const LIST = Array.isArray(docs.list) ? docs.list : [];
const BASE_OPTS = { bilingual: false, showSeal: true, showSignature: true };

function generatedMeta(orderRef, key, stateRef) {
  const entry = docs.get(key);
  const own = orderRef && orderRef.docMeta && orderRef.docMeta[key];
  const numbering = (stateRef.settings && stateRef.settings.numbering) || { next: {}, padding: 4 };
  const nextSeq = numbering.next && numbering.next[key] !== undefined ? numbering.next[key] : 1;
  return {
    no: own && own.no ? own.no
      : core.docNo(entry ? entry.prefix : String(key).toUpperCase(), nextSeq, orderRef && orderRef.date, numbering.padding || 4),
    date: own && own.date ? own.date : ((orderRef && orderRef.date) || core.todayISO())
  };
}
function ctxFor(key, orderRef, optsRef, stateRef) {
  const s = stateRef || state;
  const o = orderRef || order;
  return {
    state: s,
    order: o,
    meta: generatedMeta(o, key, s),
    opts: Object.assign({}, BASE_OPTS, optsRef || {}),
    core
  };
}
function renderFor(key, ctx) {
  return docs.render(key, ctx || ctxFor(key));
}

const META = {};
const RENDERS = {};
for (const entry of LIST) {
  META[entry.key] = generatedMeta(order, entry.key, state);
  RENDERS[entry.key] = renderFor(entry.key);
}

const company = state.settings.company;
const bank = state.settings.bank;
const calc = core.calcOrder(order);
const cost = core.calcCost(order);
const FX = {
  companyEn: company.nameEn,
  companyCn: company.nameCn,
  buyer: order.buyer.nameEn,
  buyerAddr: order.buyer.addressEn.split('\n')[0],
  buyerCountry: order.buyer.country,
  orderNo: order.no,
  incoterm: order.incoterm,
  pol: order.portOfLoading,
  pod: order.portOfDischarge,
  vessel: order.vessel,
  voyage: order.voyage,
  container: order.containerNo,
  sealNo: order.sealNo,
  blNo: order.blNo,
  bookingNo: order.bookingNo,
  lcNo: order.lcNo,
  lcBank: order.lcIssuingBank,
  payment: order.paymentTerms,
  marks: order.shippingMarks.split('\n')[1],
  marksLast: order.shippingMarks.split('\n').pop(),
  prod1: order.items[0].nameEn,
  prod2: order.items[1].nameEn,
  hs1: order.items[0].hsCode,
  qty1: core.fmtQty(order.items[0].qty),
  unitPrice1: core.fmtNum(order.items[0].unitPrice),
  totalMoney: core.fmtMoney(calc.grandTotal, order.currency),
  totalNum: core.fmtNum(calc.grandTotal),
  wordsEn: calc.amountInWordsEn,
  wordsCn: calc.amountInWordsCn,
  bankName: bank.bankNameEn,
  accountNo: bank.accountNo,
  swift: bank.swift,
  declaration: state.settings.defaults.declaration,
  certStatement: 'IN CONFORMITY WITH THE CONTRACT',
  totalCartons: core.fmtQty(calc.totalCartons),
  totalNet: core.fmtNum(calc.totalNetWeight),
  totalGross: core.fmtNum(calc.totalGrossWeight),
  totalCbm: core.fmtNum(calc.totalCbm, 3),
  signer: company.signer,
  signerTitle: company.signerTitle
};

/* ================================================================== */
group('Registry (§6.1)');
/* ================================================================== */

test('docs exposes version/groups/list/get/render', () => {
  assert.equal(typeof docs, 'object');
  assert.equal(typeof docs.render, 'function');
  assert.equal(typeof docs.get, 'function');
  assert.equal(docs.version, '1.0.0', 'contract pins docs.version = "1.0.0"');
  assert.ok(Array.isArray(docs.groups));
  assert.ok(Array.isArray(docs.list));
});

test('docs.groups declares the three contract groups', () => {
  assert.deepEqual(docs.groups, [
    { key: 'sales', nameCn: '销售与结算' },
    { key: 'logistics', nameCn: '物流与报关' },
    { key: 'internal', nameCn: '内部管理' }
  ]);
});

test('docs.list declares all 12 document types in contract order', () => {
  const expected = [
    { key: 'ci', group: 'sales', prefix: 'CI', nameEn: 'COMMERCIAL INVOICE', nameCn: '商业发票' },
    { key: 'pl', group: 'sales', prefix: 'PL', nameEn: 'PACKING LIST', nameCn: '装箱单' },
    { key: 'pi', group: 'sales', prefix: 'PI', nameEn: 'PROFORMA INVOICE', nameCn: '形式发票' },
    { key: 'sc', group: 'sales', prefix: 'SC', nameEn: 'SALES CONTRACT', nameCn: '销售合同' },
    { key: 'qt', group: 'sales', prefix: 'QT', nameEn: 'QUOTATION', nameCn: '报价单' },
    { key: 'bk', group: 'logistics', prefix: 'BK', nameEn: 'BOOKING NOTE', nameCn: '订舱委托书' },
    { key: 'sa', group: 'logistics', prefix: 'SA', nameEn: 'SHIPPING ADVICE', nameCn: '装运通知' },
    { key: 'cd', group: 'logistics', prefix: 'CD', nameEn: 'CUSTOMS DOCUMENT CHECKLIST', nameCn: '报关资料清单' },
    { key: 'co', group: 'logistics', prefix: 'CO', nameEn: 'CERTIFICATE OF ORIGIN', nameCn: '一般原产地证' },
    { key: 'bc', group: 'sales', prefix: 'BC', nameEn: "BENEFICIARY'S CERTIFICATE", nameCn: '受益人证明' },
    { key: 'dr', group: 'sales', prefix: 'DR', nameEn: 'BILL OF EXCHANGE', nameCn: '汇票' },
    { key: 'cs', group: 'internal', prefix: 'CS', nameEn: 'COST SHEET', nameCn: '成本核算表' }
  ];
  assert.equal(docs.list.length, 12);
  assert.deepEqual(
    docs.list.map((e) => ({ key: e.key, group: e.group, prefix: e.prefix, nameEn: e.nameEn, nameCn: e.nameCn })),
    expected
  );
});

test('every registry entry is complete and addressable via docs.get', () => {
  const groupKeys = new Set(docs.groups.map((g) => g.key));
  const seenKeys = new Set();
  const seenPrefixes = new Set();
  for (const entry of docs.list) {
    assert.ok(entry.key && /^[a-z]{2}$/.test(entry.key), `entry key ${entry.key}`);
    assert.ok(entry.group && groupKeys.has(entry.group), `${entry.key} group ${entry.group}`);
    assert.match(entry.prefix, /^[A-Z]{2}$/, `${entry.key} prefix`);
    assert.ok(entry.nameEn && entry.nameEn.length > 3, `${entry.key} nameEn`);
    assert.ok(entry.nameCn && entry.nameCn.length > 1, `${entry.key} nameCn`);
    assert.ok(entry.desc && entry.desc.length > 3, `${entry.key} desc`);
    assert.ok(!seenKeys.has(entry.key), `duplicate key ${entry.key}`);
    assert.ok(!seenPrefixes.has(entry.prefix), `duplicate prefix ${entry.prefix}`);
    seenKeys.add(entry.key);
    seenPrefixes.add(entry.prefix);
    assert.deepEqual(docs.get(entry.key), entry, `get(${entry.key}) must return the registry entry`);
  }
  assert.equal(docs.get('nope'), undefined);
  assert.equal(docs.get(), undefined);
});

test('groups cover the 7/4/1 document split', () => {
  const counts = {};
  for (const entry of docs.list) counts[entry.group] = (counts[entry.group] || 0) + 1;
  assert.deepEqual(counts, { sales: 7, logistics: 4, internal: 1 });
});

/* ================================================================== */
group('Common render contract (§6.2) — all 12 documents, demo order 1');
/* ================================================================== */

for (const entry of LIST) {
  const key = entry.key;
  test(`render ${key}: article shape, title, number, date, letterhead, no leaks`, () => {
    const html = RENDERS[key];
    assertArticle(html, key, key);
    assertNoLeaks(html, key);

    const meta = META[key];
    assert.ok(hasText(html, meta.no), `${key}: document number ${meta.no} missing`);
    assert.ok(hasText(html, core.fmtDate(meta.date)), `${key}: formatted doc date ${core.fmtDate(meta.date)} missing`);

    if (key === 'cd') {
      assert.ok(hasText(html, '报关资料清单'), 'cd: Chinese title 报关资料清单 missing');
    } else if (key === 'cs') {
      assert.ok(hasText(html, '成本核算表'), 'cs: Chinese title 成本核算表 missing');
      assert.ok(hasTextCI(html, entry.nameEn), 'cs: English title COST SHEET missing');
      assert.ok(hasText(html, '内部资料'), 'cs: 内部资料 marker missing');
      assert.ok(hasTextCI(html, 'INTERNAL'), 'cs: INTERNAL marker missing');
    } else {
      assert.ok(hasTextCI(html, entry.nameEn), `${key}: English title ${entry.nameEn} missing`);
    }

    assert.ok(hasText(html, FX.companyEn) || hasText(html, FX.companyCn), `${key}: issuing company name missing`);
    assert.ok(!/<script/i.test(html), `${key}: template must not emit <script> tags`);
    assert.ok(!html.includes('IMP. & EXP.'), `${key}: raw ampersand in company name (must be &amp;)`);
  });
}

test('CI: seal and signer render when opts request them', () => {
  assert.ok(RENDERS.ci.includes(company.seal), 'ci: seal dataURL must be embedded (showSeal true)');
  assert.ok(hasText(RENDERS.ci, FX.signer), 'ci: signer name missing (showSignature true)');
});

test('every §7 doc that mandates 签章 shows seal + signer', () => {
  for (const key of ['ci', 'pl', 'pi', 'sc', 'qt', 'sa', 'co', 'bc', 'dr']) {
    assert.ok(RENDERS[key].includes(company.seal), `${key}: seal dataURL missing`);
    assert.ok(hasText(RENDERS[key], FX.signer), `${key}: signer name missing`);
  }
});

/* ================================================================== */
group('Per-document required content (§7)');
/* ================================================================== */

test('§7.1 CI — commercial invoice content', () => {
  const html = RENDERS.ci;
  const required = [
    FX.buyer, FX.buyerAddr, META.ci.no, core.fmtDate(META.ci.date),
    FX.orderNo, FX.incoterm, FX.pol, FX.pod, FX.vessel, FX.voyage, FX.lcNo,
    FX.marks, FX.prod1, FX.hs1, FX.qty1, FX.unitPrice1,
    FX.totalMoney, FX.wordsEn,
    FX.declaration, FX.signer
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `ci: required content missing -> ${needle}`);
  for (const item of order.items) assert.ok(hasText(html, item.nameEn), `ci: item ${item.nameEn} missing`);
  assert.ok(!/BANKING DETAILS/i.test(tagless(html)), 'ci: bank details block must be omitted per business requirement');
  assert.ok(!hasText(html, FX.accountNo), 'ci: bank account number must not appear');
  assert.ok(!hasText(html, FX.swift), 'ci: SWIFT code must not appear');
});

test('§7.2 PL — packing list content, and NO prices/amounts', () => {
  const html = RENDERS.pl;
  const required = [
    FX.buyer, META.pl.no, core.fmtDate(META.pl.date), FX.marks,
    FX.prod1, FX.totalCartons, FX.totalNet, FX.totalGross, FX.totalCbm, FX.signer
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `pl: required content missing -> ${needle}`);
  assert.ok(!/unit\s*price/i.test(tagless(html)), 'pl: must not show a UNIT PRICE column/label');
  assert.ok(!/\bamount\b/i.test(tagless(html)), 'pl: must not show an AMOUNT column/label');
  assert.ok(!/USD\s?[\d,]+\.\d\d/.test(html), 'pl: must not show money amounts');
});

test('§7.3 PI — proforma invoice content', () => {
  const html = RENDERS.pi;
  const required = [
    FX.buyer, META.pi.no, core.fmtDate(META.pi.date), FX.incoterm, FX.pol, FX.pod,
    FX.vessel, FX.voyage, FX.lcNo, FX.marks, FX.prod1, FX.hs1, FX.qty1, FX.unitPrice1,
    FX.totalMoney, FX.wordsEn, FX.payment, FX.bankName, FX.accountNo, FX.signer
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `pi: required content missing -> ${needle}`);
  assert.ok(hasTextCI(html, 'PROFORMA INVOICE'), 'pi: title PROFORMA INVOICE missing');
  assert.ok(hasTextCI(html, 'DELIVERY') || hasTextCI(html, 'VALID'), 'pi: validity/delivery terms missing');
});

test('§7.4 SC — sales contract content and clauses', () => {
  const html = RENDERS.sc;
  const required = [
    FX.buyer, FX.companyEn, META.sc.no, core.fmtDate(META.sc.date),
    FX.prod1, FX.totalMoney, FX.wordsEn, FX.signer,
    order.buyer.addressEn.split('\n')[0], company.addressEn
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `sc: required content missing -> ${needle}`);
  for (const clause of ['QUALITY', 'PACKING', 'SHIPMENT', 'PAYMENT', 'INSPECTION', 'FORCE MAJEURE', 'ARBITRATION', 'LAW']) {
    assert.ok(hasTextCI(html, clause), `sc: contract clause missing -> ${clause}`);
  }
  assert.ok(hasTextCI(html, 'THE BUYER') && hasTextCI(html, 'THE SELLER'), 'sc: both party signature blocks required');
});

test('§7.5 QT — quotation content', () => {
  const html = RENDERS.qt;
  const required = [
    FX.buyer, META.qt.no, core.fmtDate(META.qt.date), FX.prod1, FX.unitPrice1,
    FX.totalMoney, FX.incoterm, FX.payment, FX.signer
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `qt: required content missing -> ${needle}`);
  assert.ok(hasTextCI(html, 'DELIVERY'), 'qt: delivery time missing');
  assert.ok(hasTextCI(html, 'VALID'), 'qt: quotation validity missing');
});

test('§7.6 BK — booking note content and bilingual labels', () => {
  const html = RENDERS.bk;
  const required = [
    META.bk.no, core.fmtDate(META.bk.date), FX.companyEn,
    FX.pol, FX.pod, FX.vessel, FX.voyage, FX.prod1, FX.hs1,
    FX.totalGross, FX.totalCbm, FX.signer, core.fmtDate(order.etd)
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `bk: required content missing -> ${needle}`);
  assert.ok(hasTextCI(html, 'SHIPPER') && hasTextCI(html, 'CONSIGNEE') && hasTextCI(html, 'NOTIFY'),
    'bk: Shipper/Consignee/Notify parties required');
  assert.ok(hasTextCI(html, 'CUSTOMS') || hasText(html, '报关'), 'bk: customs requirements missing');
  assert.ok(hasTextCI(html, 'B/L') || hasTextCI(html, 'BILL OF LADING'), 'bk: B/L requirements missing');
  assert.ok(hasTextCI(html, 'CONTAINER') || hasText(html, '箱'), 'bk: container type/quantity missing');
  assert.match(tagless(html), /[\u4e00-\u9fa5]/, 'bk: §7.6 requires bilingual Chinese labels');
  assert.ok(hasText(html, '订舱委托书'), 'bk: Chinese title 订舱委托书 missing');
});

test('§7.7 SA — shipping advice content', () => {
  const html = RENDERS.sa;
  const required = [
    FX.buyer, META.sa.no, core.fmtDate(META.sa.date), META.ci.no,
    FX.vessel, FX.voyage, FX.blNo, FX.container, FX.sealNo, FX.pol, FX.pod,
    FX.prod1, FX.marks, FX.signer
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `sa: required content missing -> ${needle}`);
  assert.ok(hasTextCI(html, 'ETD') && hasTextCI(html, 'ETA'), 'sa: ETD/ETA missing');
  assert.ok((hasTextCI(html, 'ADVISE') || hasTextCI(html, 'NOTIF')) && hasTextCI(html, 'SHIPPED'),
    'sa: shipping notification statement missing');
});

test('§7.8 CD — Chinese customs document checklist content', () => {
  const html = RENDERS.cd;
  const required = [
    META.cd.no, core.fmtDate(META.cd.date), FX.hs1, FX.totalCartons,
    FX.totalGross, FX.totalNet, '报关资料清单', '数量', '总价', 'USD',
    '贸易方式', '运输方式', '目的国', '唛头', '发票', '装箱单', '合同',
    '报关委托书', '许可证', '制表人'
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `cd: required content missing -> ${needle}`);
  assert.ok(hasText(html, '一般贸易') || hasTextCI(html, 'GENERAL TRADE'), 'cd: trade mode value missing');
  assert.ok(hasText(html, '海运') || hasTextCI(html, 'SEA'), 'cd: transport mode value missing');
});

test('§7.9 CO — certificate of origin content', () => {
  const html = RENDERS.co;
  const required = [
    FX.companyEn, FX.buyer, META.co.no, core.fmtDate(META.co.date),
    META.ci.no, core.fmtDate(META.ci.date), FX.buyerCountry, 'CHINA',
    FX.prod1, FX.hs1, FX.qty1, FX.marksLast
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `co: required content missing -> ${needle}`);
  assert.ok(hasTextCI(html, 'EXPORTER') && hasTextCI(html, 'CONSIGNEE'), 'co: exporter/consignee required');
  assert.ok(hasTextCI(html, 'CERTIFICATE OF ORIGIN'), 'co: title missing');
  assert.ok(hasTextCI(html, 'BY SEA') || hasText(html, 'SEA'), 'co: transport mode/route missing');
});

test('§7.10 BC — beneficiary certificate content', () => {
  const html = RENDERS.bc;
  const required = [
    FX.buyer, META.bc.no, core.fmtDate(META.bc.date), META.ci.no,
    FX.lcNo, FX.prod1, FX.certStatement, FX.signer
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `bc: required content missing -> ${needle}`);
  assert.ok(hasTextCI(html, 'BENEFICIARY'), 'bc: title/party BENEFICIARY missing');
  assert.ok(hasTextCI(html, 'PRESENTED') || hasTextCI(html, 'DOCUMENTS'), 'bc: document statement missing');
});

test('§7.11 DR — bill of exchange content', () => {
  const html = RENDERS.dr;
  const required = [
    META.dr.no, core.fmtDate(META.dr.date), FX.totalMoney, FX.wordsEn,
    FX.lcNo, FX.bankName, FX.lcBank, FX.signer
  ];
  for (const needle of required) assert.ok(hasText(html, needle), `dr: required content missing -> ${needle}`);
  assert.ok(hasTextCI(html, 'BILL OF EXCHANGE'), 'dr: title missing');
  assert.ok(hasTextCI(html, 'AT SIGHT'), 'dr: at-sight tenor missing');
  assert.ok(hasTextCI(html, 'PAY TO THE ORDER'), 'dr: payee clause missing');
  assert.ok(hasTextCI(html, 'DRAWER') || hasText(html, '出票人') || hasTextCI(html, 'SIGNATURE'),
    'dr: drawer signature block missing');
  assert.ok(hasTextCI(html, 'NINGBO'), 'dr: place of issue missing');
});

test('§7.12 CS — internal cost sheet content', () => {
  const html = RENDERS.cs;
  const tokens = [
    '33,390', '237,736.8', String(cost.exchangeRate), '131,140', '4,200', '850',
    '136,190', '101,546.8', '42.71'
  ];
  for (const token of tokens) assert.ok(hasText(html, token), `cs: cost number missing -> ${token}`);
  for (const label of ['内部资料', '成本核算表', 'COST SHEET', '单件']) {
    assert.ok(hasText(html, label), `cs: required label missing -> ${label}`);
  }
  assert.ok(hasTextCI(html, 'INTERNAL'), 'cs: INTERNAL marker missing');
  assert.ok(hasTextCI(html, 'USD'), 'cs: revenue currency missing');
});

test('CI/PL tables use real <table> with <thead> for cross-page repeat', () => {
  for (const key of ['ci', 'pl', 'pi']) {
    const html = RENDERS[key];
    assert.match(html, /<table\b/i, `${key}: expected an HTML table`);
    assert.match(html, /<thead\b/i, `${key}: long tables must use <thead> for print repeat`);
    assert.match(html, /<th\b/i, `${key}: expected table header cells`);
  }
});

/* ================================================================== */
group('Bilingual / seal / signature options (§6.2)');
/* ================================================================== */

test('bilingual=true renders Chinese titles for all 12 documents', () => {
  for (const entry of LIST) {
    const html = docs.render(entry.key, ctxFor(entry.key, order, { bilingual: true }));
    assert.ok(hasText(html, entry.nameCn), `${entry.key}: bilingual nameCn ${entry.nameCn} missing`);
  }
});

test('bilingual=false keeps demo docs English-only (no Chinese product names)', () => {
  const html = RENDERS.ci;
  assert.ok(hasText(html, FX.prod1), 'ci: English product name missing');
  assert.ok(!hasText(html, order.items[0].nameCn), 'ci: Chinese product name leaked with bilingual=false');
  assert.ok(!hasText(html, '商业发票'), 'ci: Chinese title leaked with bilingual=false');
});

test('showSeal=false omits the seal image; showSeal=true embeds it', () => {
  const withSeal = docs.render('ci', ctxFor('ci', order, { showSeal: true }));
  const withoutSeal = docs.render('ci', ctxFor('ci', order, { showSeal: false }));
  assert.ok(withSeal.includes(company.seal), 'ci: seal expected when showSeal=true');
  assert.ok(!withoutSeal.includes(company.seal), 'ci: seal must be absent when showSeal=false');
});

test('showSignature=false removes the signer name and keeps a signature line', () => {
  const signed = docs.render('ci', ctxFor('ci', order, { showSignature: true }));
  const unsigned = docs.render('ci', ctxFor('ci', order, { showSignature: false }));
  assert.ok(hasText(signed, FX.signer), 'ci: signer expected when showSignature=true');
  assert.ok(!hasText(unsigned, FX.signer), 'ci: signer name must be absent when showSignature=false');
  assert.ok(hasTextCI(unsigned, 'SIGNATURE') || hasText(unsigned, '签字'),
    'ci: blank signature line expected when showSignature=false');
});

/* ================================================================== */
group('XSS / HTML-escaping (§1 constraint 19)');
/* ================================================================== */

const XSS = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
function hostileOrder() {
  const hostile = core.clone(order);
  hostile.buyer.nameEn = XSS;
  hostile.buyer.addressEn = XSS + '\n' + XSS;
  hostile.remarks = XSS;
  hostile.shippingMarks = XSS;
  hostile.items[0].nameEn = XSS;
  hostile.items[0].remarks = XSS;
  return hostile;
}

test('XSS payload in buyer/remarks/marks/items is escaped on every document', () => {
  const hostile = hostileOrder();
  for (const entry of LIST) {
    const html = docs.render(entry.key, ctxFor(entry.key, hostile));
    assertArticle(html, entry.key, `${entry.key} (xss)`);
    assert.ok(!html.includes('<script'), `${entry.key}: raw <script> from user data`);
    assert.ok(!html.includes('<img src=x'), `${entry.key}: raw <img> from user data`);
    // Escaped payload text may legitimately contain the literal "onerror=alert(2)"
    // (only <, >, &, " and ' are escaped); an actual breakout would put the
    // handler inside a real tag, i.e. after a raw "<".
    assert.ok(!/<[^>]*\son[a-z]+\s*=\s*["']?alert/i.test(html), `${entry.key}: inline handler injected from user data`);
    assert.ok(!/<script\s*>/i.test(html), `${entry.key}: script tag not escaped`);
    assertNoLeaks(html, `${entry.key} (xss)`);
  }
});

test('XSS payloads render in escaped form where the field is included', () => {
  const hostile = hostileOrder();
  for (const key of ['ci', 'pl', 'pi', 'sc', 'qt', 'sa', 'bc', 'co']) {
    const html = docs.render(key, ctxFor(key, hostile));
    assert.ok(html.includes('&lt;script&gt;'), `${key}: escaped script payload not found`);
    assert.ok(html.includes('&quot;') || html.includes('&#39;'), `${key}: quote characters not entity-encoded`);
  }
});

test('XSS payload is escaped exactly once (decodes back to original text)', () => {
  const hostile = hostileOrder();
  const text = tagless(docs.render('ci', ctxFor('ci', hostile)));
  assert.ok(text.includes('<script>alert(1)</script>'), 'ci: single-escaped payload should decode to original text');
  assert.ok(!text.includes('&lt;script&gt;'), 'ci: payload must not be double-escaped');
});

test('XSS in shipping marks uses pre-line-safe markup (newlines preserved)', () => {
  const html = docs.render('pl', ctxFor('pl', order));
  assert.ok(tagless(html).includes('C/NO.: 1-390'), 'pl: multi-line shipping marks content missing');
  // contract §6.2: multi-line fields rendered with white-space: pre-line (class or style);
  // unit suite only checks the value survives, print.css is validated in E2E.
});

/* ================================================================== */
group('Robustness — empty order must not throw (§6.2)');
/* ================================================================== */

test('all 12 documents render an empty order gracefully', () => {
  const empty = {};
  for (const entry of LIST) {
    const meta = { no: core.docNo(entry.prefix, 1, '2026-11-19', 4), date: '2026-11-19' };
    const ctx = { state, order: empty, meta, opts: Object.assign({}, BASE_OPTS), core };
    let html;
    assert.doesNotThrow(() => { html = docs.render(entry.key, ctx); }, `${entry.key}: empty order threw`);
    assertArticle(html, entry.key, `${entry.key} (empty order)`);
    assertNoLeaks(html, `${entry.key} (empty order)`);
    assert.ok(hasText(html, meta.no), `${entry.key}: doc number missing for empty order`);
  }
});

test('empty items array renders gracefully for all 12 documents', () => {
  const emptyItems = { currency: 'USD', items: [] };
  for (const entry of LIST) {
    const meta = { no: core.docNo(entry.prefix, 2, '2026-11-19', 4), date: '2026-11-19' };
    assert.doesNotThrow(() => docs.render(entry.key, { state, order: emptyItems, meta, opts: BASE_OPTS, core }),
      `${entry.key}: empty items threw`);
  }
});

/* ================================================================== */
group('Currency variants — EUR order 2, JPY order 3 with generated meta');
/* ================================================================== */

test('EUR order renders EUR totals and euro amount words', () => {
  const order2 = state.orders[1];
  assert.equal(order2.currency, 'EUR');
  const calc2 = core.calcOrder(order2);
  const html = docs.render('ci', ctxFor('ci', order2));
  assertArticle(html, 'ci', 'ci (EUR)');
  assertNoLeaks(html, 'ci (EUR)');
  assert.ok(hasText(html, generatedMeta(order2, 'ci', state).no), 'ci EUR: doc number missing');
  assert.ok(hasText(html, core.fmtMoney(calc2.grandTotal, 'EUR')), 'ci EUR: EUR total missing');
  assert.ok(hasText(html, calc2.amountInWordsEn), 'ci EUR: euro amount words missing');
  assert.ok(hasText(html, order2.buyer.nameEn), 'ci EUR: German buyer missing');
});

test('JPY order with missing docMeta uses generated meta and zero-decimal money', () => {
  const order3 = state.orders[2];
  assert.equal(order3.currency, 'JPY');
  assert.deepEqual(order3.docMeta, {}, 'fixture precondition: order 3 has no docMeta');
  const meta = generatedMeta(order3, 'ci', state);
  assert.equal(meta.no, core.docNo('CI', state.settings.numbering.next.ci, order3.date, 4));
  const calc3 = core.calcOrder(order3);
  const html = docs.render('ci', { state, order: order3, meta, opts: BASE_OPTS, core });
  assertArticle(html, 'ci', 'ci (JPY)');
  assertNoLeaks(html, 'ci (JPY)');
  assert.ok(hasText(html, meta.no), 'ci JPY: generated doc number missing');
  assert.ok(hasText(html, core.fmtMoney(calc3.grandTotal, 'JPY')), 'ci JPY: JPY total missing');
  assert.ok(hasText(html, calc3.amountInWordsEn), 'ci JPY: JPY amount words missing');
  assert.ok(hasText(html, core.fmtDate(order3.date)), 'ci JPY: order date missing');
  assert.ok(!hasText(html, '/100'), 'ci JPY: zero-decimal currency must not show /100 cents');
});

/* ================================================================== */
group('Purity & determinism (§6.2)');
/* ================================================================== */

test('docs.render is pure: state/order/meta/opts deep-equal before and after', () => {
  const stateClone = core.clone(state);
  const orderClone = core.clone(order);
  const ctx = {
    state: stateClone,
    order: orderClone,
    meta: core.clone(generatedMeta(orderClone, 'ci', stateClone)),
    opts: { bilingual: true, showSeal: true, showSignature: true },
    core
  };
  const before = JSON.stringify({ state: ctx.state, order: ctx.order, meta: ctx.meta, opts: ctx.opts });
  for (const entry of LIST) docs.render(entry.key, ctx);
  const after = JSON.stringify({ state: ctx.state, order: ctx.order, meta: ctx.meta, opts: ctx.opts });
  assert.equal(after, before, 'render mutated ctx/state/order/meta/opts');
});

test('docs.render is deterministic for identical input', () => {
  for (const entry of LIST) {
    const ctx = ctxFor(entry.key);
    assert.equal(docs.render(entry.key, ctx), docs.render(entry.key, ctx), `${entry.key} non-deterministic`);
  }
});

test('render output carries no global/DOM side-effect markers', () => {
  assert.equal(typeof globalThis.window.document, 'undefined', 'no document global should be required');
  const ctx = ctxFor('ci');
  const html = docs.render('ci', ctx);
  assert.ok(!/\bid_[a-z0-9]+_[a-z0-9]+/.test(html), 'unexpected uid() artefact in output');
  assert.ok(!/data-doc="undefined"/.test(html));
});

/* ------------------------------------------------------------------ */
const total = results.pass + results.fail;
console.log(`\n${'='.repeat(64)}`);
if (results.fail === 0) {
  console.log(`PASS  test-templates.mjs — ${total}/${total} tests passed (12 documents)`);
  process.exitCode = 0;
} else {
  console.error(`FAIL  test-templates.mjs — ${results.pass}/${total} passed, ${results.fail} failed`);
  for (const { name } of results.failures) console.error(`  - ${name}`);
  process.exitCode = 1;
}
