#!/usr/bin/env node
/**
 * TradeDocs — CustomerCRM sync engine unit tests (v1.2, CONTRACT §14.2/§14.4)
 * Run from anywhere:  node tests/test-crm-sync.mjs   (plain Node >= 18, zero npm deps)
 *
 * Covers js/crm-sync.js: API/version/COUNTRIES, read() over real demo payload
 * (12 customers / 2 won) + missing/corrupt/disabled/version/invalid/empty,
 * mapCustomer() field mapping (no invented address/email/tel), merge() add /
 * dedupe (externalId + normalized name) / auto no-overwrite / manual
 * updateExisting fill-empty / selectedIds / conflicts / idempotency / purity /
 * warnings, sync() convenience envelope, and read-only localStorage behaviour.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = require(path.join(ROOT, 'js', 'crm-sync.js'));
const core = require(path.join(ROOT, 'js', 'core.js'));
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'crm-demo.json'), 'utf8'));
const FIXTURE_RAW = JSON.stringify(fixture);
const WON = fixture.customers.filter((c) => c.dealStatus === '已成交');
const OPEN = fixture.customers.filter((c) => c.dealStatus !== '已成交');

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
    for (const line of String(err && err.message ? err.message : err).split('\n')) console.error(`       ${line}`);
  }
}

function group(title) {
  console.log(`\n# ${title}`);
}

/** Mock localStorage: only getItem, tracks writes so tests can prove read-only. */
function mockStorage(raw, opts = {}) {
  const calls = { getItem: 0, setItem: 0, removeItem: 0, setItemArgs: [] };
  const store = {
    calls,
    getItem(key) {
      calls.getItem += 1;
      if (opts.getItemThrows) throw new Error('SecurityError: localStorage disabled');
      if (key !== engine.STORAGE_KEY) return null;
      return raw;
    },
    setItem(key, value) { calls.setItem += 1; calls.setItemArgs.push([key, value]); },
    removeItem(key) { calls.removeItem += 1; }
  };
  return store;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function warningCodes(result) {
  return (result.warnings || []).map((w) => w.code);
}

const EMPTY_STORAGE = mockStorage(null);
const FIXTURE_STORAGE = mockStorage(FIXTURE_RAW);

/* ================================================================== */
group('Registry / API shape (§14.2)');
/* ================================================================== */

test('VERSION is 1.2.0 and STORAGE_KEY is customer-crm.v1', () => {
  assert.equal(engine.VERSION, '1.2.0');
  assert.equal(engine.STORAGE_KEY, 'customer-crm.v1');
});

test('COUNTRIES covers 135 countries with zh→EN mappings', () => {
  assert.equal(Object.keys(engine.COUNTRIES).length, 135);
  const expected = {
    德国: 'Germany', 英国: 'United Kingdom', 美国: 'United States', 法国: 'France',
    日本: 'Japan', 荷兰: 'Netherlands', 阿联酋: 'United Arab Emirates', 澳大利亚: 'Australia'
  };
  for (const [zh, en] of Object.entries(expected)) assert.equal(engine.COUNTRIES[zh], en, zh);
});

test('public API exposes read/mapCustomer/merge/sync only', () => {
  assert.deepEqual(Object.keys(engine).sort(), ['COUNTRIES', 'STORAGE_KEY', 'VERSION', 'mapCustomer', 'merge', 'read', 'sync']);
  for (const fn of ['read', 'mapCustomer', 'merge', 'sync']) assert.equal(typeof engine[fn], 'function', fn);
});

/* ================================================================== */
group('read(storage) — real payload and failure modes (§14.2/§14.4)');
/* ================================================================== */

test('reads real demo payload: available, 12 total, 2 won, savedAt, no warnings', () => {
  const result = engine.read(FIXTURE_STORAGE);
  assert.equal(result.available, true);
  assert.equal(result.reason, 'ok');
  assert.equal(result.total, 12);
  assert.equal(result.customers.length, 12);
  assert.equal(result.won.length, 2);
  assert.equal(result.savedAt, fixture.savedAt);
  assert.deepEqual(result.warnings, []);
});

test('missing key → available:false, reason missing, crm-missing warning (no throw)', () => {
  const result = engine.read(EMPTY_STORAGE);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'missing');
  assert.equal(result.total, 0);
  assert.deepEqual(result.won, []);
  assert.ok(warningCodes(result).includes('crm-missing'));
});

test('no storage available in Node → unavailable warning, no throw', () => {
  const result = engine.read();
  assert.equal(result.available, false);
  assert.equal(result.reason, 'unavailable');
  assert.ok(warningCodes(result).includes('crm-storage-unavailable'));
});

test('getItem throws → reason disabled + crm-storage-disabled warning', () => {
  const result = engine.read(mockStorage(null, { getItemThrows: true }));
  assert.equal(result.available, false);
  assert.equal(result.reason, 'disabled');
  assert.ok(warningCodes(result).includes('crm-storage-disabled'));
});

test('corrupt JSON → available:false/corrupt, crm-corrupt warning', () => {
  const result = engine.read(mockStorage('{not json'));
  assert.equal(result.available, false);
  assert.equal(result.reason, 'corrupt');
  assert.ok(warningCodes(result).includes('crm-corrupt'));
});

test('payload without customers/records → corrupt warning', () => {
  const result = engine.read(mockStorage(JSON.stringify({ version: 1, savedAt: 'x', settings: {} })));
  assert.equal(result.available, false);
  assert.equal(result.reason, 'corrupt');
  assert.ok(warningCodes(result).includes('crm-corrupt'));
});

test('bare array payload is accepted (savedAt empty)', () => {
  const result = engine.read(mockStorage(JSON.stringify(fixture.customers)));
  assert.equal(result.available, true);
  assert.equal(result.total, 12);
  assert.equal(result.won.length, 2);
  assert.equal(result.savedAt, '');
});

test('unsupported payload version warns but still parses', () => {
  const result = engine.read(mockStorage(JSON.stringify(Object.assign({}, fixture, { version: 2 }))));
  assert.equal(result.available, true);
  assert.equal(result.total, 12);
  assert.ok(warningCodes(result).includes('crm-version'));
});

test('invalid customer entries are ignored with crm-invalid-records warning', () => {
  const payload = { version: 1, customers: [WON[0], 'oops', 42, null, WON[1]] };
  const result = engine.read(mockStorage(JSON.stringify(payload)));
  assert.equal(result.available, true);
  assert.equal(result.total, 2);
  assert.equal(result.won.length, 2);
  assert.ok(warningCodes(result).includes('crm-invalid-records'));
});

test('empty customers array → available but crm-empty warning', () => {
  const result = engine.read(mockStorage(JSON.stringify({ version: 1, customers: [] })));
  assert.equal(result.available, true);
  assert.equal(result.total, 0);
  assert.deepEqual(result.won, []);
  assert.ok(warningCodes(result).includes('crm-empty'));
});

test('records are normalized: whitespace trimmed, only known keys kept', () => {
  const payload = {
    version: 1,
    customers: [{ id: '  crm_x1  ', customerName: '  Ann Lee ', companyName: '  A&L Ltd ', dealStatus: '  已成交  ', followups: [{ note: 'x' }], junk: 1 }]
  };
  const result = engine.read(mockStorage(JSON.stringify(payload)));
  const record = result.customers[0];
  assert.equal(record.id, 'crm_x1');
  assert.equal(record.customerName, 'Ann Lee');
  assert.equal(record.companyName, 'A&L Ltd');
  assert.equal(record.dealStatus, '已成交');
  assert.equal(record.followups, undefined);
  assert.equal(record.junk, undefined);
  assert.equal(result.won.length, 1);
});

test('read is read-only: never writes, raw localStorage string unchanged', () => {
  const storage = mockStorage(FIXTURE_RAW);
  engine.read(storage);
  engine.sync(storage, []);
  assert.equal(storage.calls.setItem, 0);
  assert.equal(storage.calls.removeItem, 0);
  assert.equal(storage.getItem(engine.STORAGE_KEY), FIXTURE_RAW);
});

/* ================================================================== */
group('mapCustomer(record) — field mapping (§14.2)');
/* ================================================================== */

test('maps won company: nameEn/contact/country/code/externalId/source + empty contact fields', () => {
  const mapped = engine.mapCustomer(WON[0], fixture.savedAt);
  assert.equal(mapped.id, '');
  assert.equal(mapped.nameEn, 'Nordlicht Handels GmbH');
  assert.equal(mapped.contact, 'Lena Hoffmann');
  assert.equal(mapped.country, 'Germany');
  assert.equal(mapped.code, 'CRM-N7K2P9');
  assert.equal(mapped.externalId, WON[0].id);
  assert.equal(mapped.source, 'customer-crm');
  assert.equal(mapped.nameCn, '');
  assert.equal(mapped.addressEn, '');
  assert.equal(mapped.addressCn, '');
  assert.equal(mapped.tel, '');
  assert.equal(mapped.email, '');
  assert.equal(mapped.taxId, '');
});

test('companyName missing → nameEn falls back to customerName (contact kept)', () => {
  const mapped = engine.mapCustomer(WON[1], fixture.savedAt);
  assert.equal(mapped.nameEn, 'Oliver Smith');
  assert.equal(mapped.contact, 'Oliver Smith');
  assert.equal(mapped.country, 'United Kingdom');
  assert.equal(mapped.code, 'CRM-Q4M8Z1');
});

test('country mapping: unknown zh kept, already-English kept, empty stays empty', () => {
  assert.equal(engine.mapCustomer({ country: '火星' }).country, '火星');
  assert.equal(engine.mapCustomer({ country: 'United States' }).country, 'United States');
  assert.equal(engine.mapCustomer({ country: '' }).country, '');
});

test('code uses uppercase last 6 chars of id (short ids tolerated)', () => {
  assert.equal(engine.mapCustomer({ id: 'abc123' }).code, 'CRM-ABC123');
  assert.equal(engine.mapCustomer({ id: 'xy' }).code, 'CRM-XY');
  assert.equal(engine.mapCustomer({ id: '' }).code, '');
});

test('crmMeta carries deal/followup/product/business/inquiry/reason/savedAt', () => {
  const mapped = engine.mapCustomer(WON[0], fixture.savedAt);
  assert.deepEqual(Object.keys(mapped.crmMeta).sort(), [
    'coreReason', 'dealStatus', 'firstInquiryAt', 'followupStatus', 'mainBusiness', 'product', 'productModel', 'savedAt'
  ]);
  assert.equal(mapped.crmMeta.dealStatus, '已成交');
  assert.equal(mapped.crmMeta.product, '不锈钢保温杯');
  assert.equal(mapped.crmMeta.savedAt, fixture.savedAt);
  assert.equal(mapped.crmMeta.coreReason, '价格与账期符合预期');
});

test('crmMeta.savedAt falls back to updatedAt when payload savedAt absent', () => {
  const mapped = engine.mapCustomer(WON[1]);
  assert.equal(mapped.crmMeta.savedAt, WON[1].updatedAt);
});

test('coreReason is not smuggled into address fields (no invented address)', () => {
  const mapped = engine.mapCustomer(WON[0], fixture.savedAt);
  assert.equal(mapped.addressEn, '');
  assert.equal(mapped.addressCn, '');
  assert.ok(!JSON.stringify(mapped.addressEn + mapped.addressCn).includes('价格'));
});

test('mapCustomer tolerates non-object input', () => {
  const mapped = engine.mapCustomer(null);
  assert.equal(mapped.nameEn, '');
  assert.equal(mapped.contact, '');
  assert.equal(mapped.crmMeta.dealStatus, '未成交');
});

/* ================================================================== */
group('merge(existing, records) — add, mapping, purity (§14.2/§14.4)');
/* ================================================================== */

test('adds exactly the 2 won customers (10 open skipped), with ids/source/code/meta', () => {
  const result = engine.merge([], fixture.customers, { savedAt: fixture.savedAt });
  assert.equal(result.added, 2);
  assert.equal(result.updated, 0);
  assert.equal(result.linked, 0);
  assert.equal(result.skipped, 10);
  assert.equal(result.customers.length, 2);
  assert.deepEqual(result.customers.map((c) => c.nameEn).sort(), ['Nordlicht Handels GmbH', 'Oliver Smith']);
  for (const customer of result.customers) {
    assert.ok(customer.id.startsWith('cust_crm_'), customer.id);
    assert.equal(customer.source, 'customer-crm');
    assert.ok(customer.externalId);
    assert.ok(customer.code.startsWith('CRM-'));
    assert.ok(customer.syncedAt);
    assert.equal(customer.country === 'Germany' || customer.country === 'United Kingdom', true, customer.country);
    assert.equal(customer.addressEn, '');
    assert.equal(customer.addressCn, '');
    assert.equal(customer.tel, '');
    assert.equal(customer.email, '');
    assert.equal(customer.taxId, '');
  }
  assert.equal(new Set(result.customers.map((c) => c.id)).size, 2);
});

test('crmMeta.savedAt uses payload savedAt option in merge', () => {
  const result = engine.merge([], WON, { savedAt: fixture.savedAt });
  for (const customer of result.customers) assert.equal(customer.crmMeta.savedAt, fixture.savedAt);
});

test('merge is pure: input customers/records deep-equal before/after', () => {
  const existing = [{ id: 'cust_local_1', nameEn: 'Local Buyer', addressEn: '1 Road', source: 'manual' }];
  const records = clone(WON);
  const existingBefore = clone(existing);
  const recordsBefore = clone(records);
  const result = engine.merge(existing, records, { savedAt: fixture.savedAt });
  assert.deepEqual(existing, existingBefore);
  assert.deepEqual(records, recordsBefore);
  assert.equal(result.customers.length, 3);
  assert.equal(existing.length, 1);
});

test('merge tolerates null/non-array existingCustomers and records', () => {
  assert.equal(engine.merge(null, WON).added, 2);
  assert.equal(engine.merge([], null).added, 0);
  assert.equal(engine.merge(undefined, undefined).customers.length, 0);
});

test('second merge of same payload is idempotent (no add/update/link)', () => {
  const first = engine.merge([], WON, { savedAt: fixture.savedAt });
  const second = engine.merge(first.customers, WON, { savedAt: fixture.savedAt });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.linked, 0);
  assert.equal(second.skipped, 2);
  assert.equal(second.customers.length, 2);
});

test('onlyWon:false imports all 12 records', () => {
  const result = engine.merge([], fixture.customers, { onlyWon: false, savedAt: fixture.savedAt });
  assert.equal(result.added, 12);
  assert.equal(result.skipped, 0);
  assert.equal(result.customers.length, 12);
});

test('selectedIds syncs only the selected record', () => {
  const result = engine.merge([], fixture.customers, { selectedIds: [WON[1].id], savedAt: fixture.savedAt });
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 11);
  assert.equal(result.customers[0].externalId, WON[1].id);
});

test('empty selectedIds syncs nothing; unknown ids are skipped', () => {
  assert.equal(engine.merge([], fixture.customers, { selectedIds: [] }).added, 0);
  const result = engine.merge([], fixture.customers, { selectedIds: ['nope'] });
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 12);
});

test('invalid/no-name records are skipped with warnings; warning list de-duplicated', () => {
  const records = [null, 'oops', WON[0], { id: 'x', customerName: '', companyName: '', dealStatus: '已成交' }];
  const result = engine.merge([], records);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 3);
  const codes = warningCodes(result);
  assert.ok(codes.includes('crm-invalid-record'));
  assert.ok(codes.includes('crm-no-name'));
  const invalidWarnings = result.warnings.filter((w) => w.code === 'crm-invalid-record');
  assert.equal(invalidWarnings.length, 1, 'duplicate invalid warnings should be de-duplicated');
});

test('record without dealStatus is treated as open and skipped (onlyWon default)', () => {
  const result = engine.merge([], [{ id: 'n1', companyName: 'No Status Co' }]);
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 1);
});

/* ================================================================== */
group('merge — dedupe, no-overwrite and manual update semantics (§14.2)');
/* ================================================================== */

test('dedupe by externalId links existing contact-less CRM customer (updated, not added)', () => {
  const existing = [{ id: 'cust_local_9', nameEn: 'Nordlicht Handels GmbH', contact: '', country: '', externalId: WON[0].id, addressEn: 'User Street 1', email: 'user@example.com', tel: '+49 1', taxId: 'DE123' }];
  const result = engine.merge(existing, [WON[0]], { savedAt: fixture.savedAt });
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.linked, 0);
  const customer = result.customers[0];
  assert.equal(customer.id, 'cust_local_9');
  assert.equal(customer.addressEn, 'User Street 1');
  assert.equal(customer.email, 'user@example.com');
  assert.equal(customer.tel, '+49 1');
  assert.equal(customer.taxId, 'DE123');
});

test('dedupe by normalized company name links local customer (case/space/punctuation)', () => {
  const existing = [{ id: 'cust_local_2', nameEn: '  nordlicht   handels, gmbh ', addressEn: 'Keep Me 9', email: 'keep@example.com' }];
  const result = engine.merge(existing, [WON[0]], { savedAt: fixture.savedAt });
  assert.equal(result.added, 0);
  assert.equal(result.linked, 1);
  const customer = result.customers[0];
  assert.equal(customer.id, 'cust_local_2');
  assert.equal(customer.nameEn, '  nordlicht   handels, gmbh ', 'auto sync must not rewrite existing name');
  assert.equal(customer.addressEn, 'Keep Me 9');
  assert.equal(customer.externalId, WON[0].id);
  assert.equal(customer.source, 'customer-crm');
});

test('auto sync never overwrites manual name/contact/country/address/email/tel/taxId', () => {
  const existing = [{
    id: 'cust_manual', nameEn: 'MANUAL BUYER NAME', contact: 'Manual Contact', country: 'Spain',
    addressEn: 'Manual Address', addressCn: '手工地址', tel: '+34 1', email: 'manual@example.com', taxId: 'ES999',
    externalId: WON[0].id
  }];
  const result = engine.merge(existing, [WON[0]], { savedAt: fixture.savedAt, updateExisting: false });
  const customer = result.customers[0];
  assert.equal(customer.nameEn, 'MANUAL BUYER NAME');
  assert.equal(customer.contact, 'Manual Contact');
  assert.equal(customer.country, 'Spain');
  assert.equal(customer.addressEn, 'Manual Address');
  assert.equal(customer.addressCn, '手工地址');
  assert.equal(customer.tel, '+34 1');
  assert.equal(customer.email, 'manual@example.com');
  assert.equal(customer.taxId, 'ES999');
  assert.equal(customer.externalId, WON[0].id);
  assert.equal(customer.crmMeta.dealStatus, '已成交');
  assert.equal(result.updated, 1);
});

test('auto sync fills blank CRM-owned fields only (linked CRM customer)', () => {
  const existing = [{ id: 'cust_blank', nameEn: '', contact: '', country: '', externalId: WON[0].id }];
  const result = engine.merge(existing, [WON[0]], { savedAt: fixture.savedAt });
  const customer = result.customers[0];
  assert.equal(customer.nameEn, 'Nordlicht Handels GmbH');
  assert.equal(customer.contact, 'Lena Hoffmann');
  assert.equal(customer.country, 'Germany');
  assert.ok(!customer.addressEn, 'address must stay empty/absent (never invented)');
  assert.ok(!customer.email, 'email must stay empty/absent (never invented)');
  assert.equal(result.updated, 1);
});

test('manual updateExisting:true updates CRM-owned name/contact/country, keeps contacts', () => {
  const existing = [{
    id: 'cust_upd', nameEn: 'Old Name', contact: 'Old Contact', country: 'Oldland',
    addressEn: 'Saved Address', addressCn: '', tel: '+1 555', email: 'saved@example.com', taxId: '',
    externalId: WON[0].id
  }];
  const result = engine.merge(existing, [WON[0]], { savedAt: fixture.savedAt, updateExisting: true });
  const customer = result.customers[0];
  assert.equal(customer.nameEn, 'Nordlicht Handels GmbH');
  assert.equal(customer.contact, 'Lena Hoffmann');
  assert.equal(customer.country, 'Germany');
  assert.equal(customer.addressEn, 'Saved Address');
  assert.equal(customer.tel, '+1 555');
  assert.equal(customer.email, 'saved@example.com');
  assert.equal(result.updated, 1);
});

test('conflict: existing linked to a different CRM record is skipped with crm-conflict', () => {
  const existing = [{ id: 'cust_conf', nameEn: 'Nordlicht Handels GmbH', externalId: 'crm_other_record' }];
  const result = engine.merge(existing, [WON[0]], { savedAt: fixture.savedAt });
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 1);
  const warning = result.warnings.find((w) => w.code === 'crm-conflict');
  assert.ok(warning);
  assert.ok(warning.message.includes('Nordlicht Handels GmbH'));
});

test('new customers from two different payloads get unique ids', () => {
  const first = engine.merge([], [WON[0]], { savedAt: fixture.savedAt });
  const second = engine.merge(first.customers, [WON[1]], { savedAt: fixture.savedAt });
  const ids = second.customers.map((c) => c.id);
  assert.equal(new Set(ids).size, 2);
  assert.equal(second.added, 1);
});

/* ================================================================== */
group('sync(storage, existing, options) — convenience envelope (§14.2)');
/* ================================================================== */

test('sync reads fixture + merges won records with read meta', () => {
  const result = engine.sync(FIXTURE_STORAGE, [], { savedAt: undefined });
  assert.equal(result.available, true);
  assert.equal(result.total, 12);
  assert.equal(result.wonCount, 2);
  assert.equal(result.won.length, 2);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 10);
  assert.equal(result.reason, 'ok');
  assert.equal(result.savedAt, fixture.savedAt);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.customers.length, 2);
});

test('sync on missing CRM storage returns available:false + crm-missing warning', () => {
  const result = engine.sync(EMPTY_STORAGE, []);
  assert.equal(result.available, false);
  assert.equal(result.added, 0);
  assert.ok(warningCodes(result).includes('crm-missing'));
});

test('sync passes selectedIds through; first association counts linked + fills contact', () => {
  const existing = [{ id: 'cust_x', nameEn: 'Nordlicht Handels GmbH', contact: '', country: '' }];
  const result = engine.sync(FIXTURE_STORAGE, existing, { selectedIds: [WON[0].id], updateExisting: true });
  assert.equal(result.wonCount, 2);
  assert.equal(result.added, 0);
  assert.equal(result.linked, 1);
  assert.equal(result.customers[0].contact, 'Lena Hoffmann');
});

/* ------------------------------------------------------------------ */
/*  Summary                                                            */
/* ------------------------------------------------------------------ */
console.log(`\n${'='.repeat(64)}`);
if (results.fail) {
  console.error(`FAIL  test-crm-sync.mjs — ${results.fail} of ${results.pass + results.fail} tests failed`);
  for (const failure of results.failures) console.error(`  - ${failure.name}: ${failure.err && failure.err.message}`);
  process.exitCode = 1;
} else {
  console.log(`PASS  test-crm-sync.mjs — ${results.pass}/${results.pass} tests passed`);
  process.exitCode = 0;
}
