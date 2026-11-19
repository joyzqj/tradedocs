#!/usr/bin/env node
/**
 * TradeDocs — Chrome headless E2E harness (CDP)
 *
 * Modes (plain Node >= 22, zero npm deps, uses tests/cdp.mjs helpers):
 *   node tests/e2e.mjs --selfcheck
 *       Infrastructure self-test: launches headless Chrome and validates CDP
 *       plumbing against a tiny fixture page. Does NOT need the app.
 *
 *   node tests/e2e.mjs                 (or --smoke)
 *       App smoke test: dashboard/preview routes, console errors, horizontal
 *       overflow, test hooks, print media hiding, printToPDF, screenshots.
 *
 *   node tests/e2e.mjs --full
 *       Full integrated QA matrix (CONTRACT §11.3–§11.5):
 *       fresh demo boot; all routes + direct hash loads + unknown IDs; no console
 *       errors/page exceptions; no page overflow 1440/1024/768/390; new order →
 *       fill → save → preview; all 12 docs in UI + TradeDocs.test.renderDocs;
 *       qty/price sync to totals + amount words; reload persistence; numbering
 *       stability (repeat preview no increment, new doc consumes once); print
 *       emulation metrics; per-doc printToPDF page counts (SC=2, rest=1) and
 *       selected-set sums with no trailing blank page; JSON export→import
 *       round-trip; invalid import; clearAll empty states + reload; resetDemo;
 *       settings save incl. logo/seal dataURL; Ctrl+S; Esc; XSS escaping with
 *       zero execution; item-table + doc-tab scroll affordances; deliverable
 *       screenshots + PDF artifacts.
 *
 * Exit codes: 0 = all checks passed, 1 = failures, 2 = pending (missing app files / Chrome).
 * Artifacts: screenshots/ (deliverable images + PDFs), .scratch/qa/e2e-artifacts/ (matrix PDFs/downloads/evidence).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  PROJECT_ROOT,
  PageSession,
  connectToPage,
  countPdfPages,
  ensureDir,
  findChromePath,
  launchChrome,
  looksLikePdf,
  looksLikePng,
  serveStatic,
  sleep
} from './cdp.mjs';

const ROOT = PROJECT_ROOT;
const SCREENSHOTS = path.join(ROOT, 'screenshots');
const ARTIFACTS = path.join(ROOT, '.scratch', 'qa', 'e2e-artifacts');
const DOWNLOADS = path.join(ARTIFACTS, 'downloads');
const FIX_REC = path.join(ROOT, 'tests', 'fixtures');

/* ------------------------------------------------------------------ */
/*  CLI + harness                                                      */
/* ------------------------------------------------------------------ */
const argv = process.argv.slice(2);
const mode = argv.includes('--selfcheck') ? 'selfcheck'
  : argv.includes('--full') ? 'full'
    : argv.includes('--smoke') ? 'smoke' : 'smoke';
const appArg = argv.find((a) => a.startsWith('--app='));
const APP_ROOT = appArg ? path.resolve(ROOT, appArg.slice('--app='.length)) : ROOT;

const results = { pass: 0, fail: 0, failures: [] };
async function check(name, fn) {
  try {
    await fn();
    results.pass += 1;
    console.log(`ok   ${results.pass + results.fail} - ${name}`);
    return true;
  } catch (err) {
    results.fail += 1;
    results.failures.push({ name, err });
    console.error(`FAIL ${results.pass + results.fail} - ${name}`);
    for (const line of String(err && err.message ? err.message : err).split('\n')) {
      console.error(`       ${line}`);
    }
    return false;
  }
}
function group(title) {
  console.log(`\n# ${title}`);
}
function note(message) {
  console.log(`     ${message}`);
}
function summarize() {
  const total = results.pass + results.fail;
  console.log(`\n${'='.repeat(64)}`);
  if (results.fail === 0) {
    console.log(`PASS  test-e2e.mjs --${mode} — ${total}/${total} checks passed`);
    process.exitCode = 0;
  } else {
    console.error(`FAIL  test-e2e.mjs --${mode} — ${results.pass}/${total} passed, ${results.fail} failed`);
    for (const { name } of results.failures) console.error(`  - ${name}`);
    process.exitCode = 1;
  }
}
function formatErrors(session) {
  const errors = session.errors();
  if (!errors.length) return '(none)';
  return errors.map((e) => `[${e.kind}] ${e.text}`).join('\n       ');
}
async function waitForNode(predicate, { timeout = 10000, interval = 100, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(interval);
  }
  throw new Error(`Timed out after ${timeout}ms waiting for ${label}`);
}

/* ================================================================== */
/*  SELFCHECK — validates the harness itself against a fixture page    */
/* ================================================================== */

async function writeSelfcheckFixture() {
  const dir = path.join(ARTIFACTS, 'selfcheck-fixture');
  ensureDir(dir);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CDP Selfcheck</title>
<style>
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; }
  .print-only { display: none; }
  @media print {
    .screen-only { display: none !important; }
    .print-only { display: block !important; }
  }
</style>
</head>
<body>
  <h1 id="probe">CDP Selfcheck</h1>
  <div class="screen-only" id="screen-only">screen-only</div>
  <div class="print-only" id="print-only">print-only</div>
  <script>
    window.__selfcheck = 41 + 1;
    console.log('selfcheck expected console log');
    console.error('selfcheck expected console error');
    setTimeout(function () { throw new Error('selfcheck expected page error'); }, 100);
  </script>
</body>
</html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  return dir;
}

async function runSelfcheck() {
  ensureDir(ARTIFACTS);
  const server = await serveStatic(await writeSelfcheckFixture());
  let chrome = null;
  let page = null;
  try {
    chrome = await launchChrome({ windowSize: { width: 1280, height: 800 } });
    const { client, target } = await connectToPage(chrome);
    page = await PageSession.create(client, target);

    await check('Chrome + CDP page session connect', async () => {
      if (!page.client || page.client.closed) throw new Error('CDP client not connected');
    });

    await check('static server serves fixture page', async () => {
      const res = await fetch(`${server.url}/index.html`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for /index.html`);
      const text = await res.text();
      if (!text.includes('CDP Selfcheck')) throw new Error('fixture body not served');
      const notFound = await fetch(`${server.url}/definitely-missing.js`);
      if (notFound.status !== 404) throw new Error(`expected 404 for missing file, got ${notFound.status}`);
    });

    await check('Page.navigate + document ready', async () => {
      await page.navigate(`${server.url}/index.html`);
      const title = await page.title();
      if (title !== 'CDP Selfcheck') throw new Error(`title = ${JSON.stringify(title)}`);
      const heading = await page.text('#probe');
      if (heading !== 'CDP Selfcheck') throw new Error(`#probe text = ${JSON.stringify(heading)}`);
    });

    await check('Runtime.evaluate returns values', async () => {
      const value = await page.evaluate('window.__selfcheck');
      if (value !== 42) throw new Error(`window.__selfcheck = ${JSON.stringify(value)}`);
      const sum = await page.evaluate('1 + 2 + 3');
      if (sum !== 6) throw new Error(`1+2+3 = ${JSON.stringify(sum)}`);
    });

    await check('evaluate rejects with page exception details', async () => {
      let rejected = null;
      try {
        await page.evaluate('throw new Error("cdp-eval-probe")');
      } catch (err) {
        rejected = err;
      }
      if (!rejected || !String(rejected.message).includes('cdp-eval-probe')) {
        throw new Error(`expected rejection containing "cdp-eval-probe", got: ${rejected && rejected.message}`);
      }
    });

    await check('console.error capture', async () => {
      await waitForNode(
        () => page.consoleErrors.some((e) => e.text.includes('selfcheck expected console error')),
        { timeout: 8000, label: 'fixture console.error' }
      );
    });

    await check('page exception capture (Runtime.exceptionThrown)', async () => {
      await waitForNode(
        () => page.pageErrors.some((e) => e.text.includes('selfcheck expected page error')),
        { timeout: 8000, label: 'fixture uncaught exception' }
      );
    });

    await check('Emulation.setDeviceMetricsOverride (390x844 mobile)', async () => {
      await page.setViewport(390, 844, { mobile: true });
      const metrics = await page.layoutMetrics();
      if (metrics.innerWidth !== 390) throw new Error(`innerWidth = ${metrics.innerWidth}, expected 390`);
      if (metrics.innerHeight !== 844) throw new Error(`innerHeight = ${metrics.innerHeight}, expected 844`);
      if (metrics.docScrollWidth > metrics.innerWidth + 1) {
        throw new Error(`fixture overflows: scrollWidth ${metrics.docScrollWidth} > ${metrics.innerWidth}`);
      }
    });

    await check('Page.captureScreenshot writes a real PNG', async () => {
      const file = path.join(ARTIFACTS, 'selfcheck-mobile.png');
      const shot = await page.screenshot(file);
      const buffer = fs.readFileSync(file);
      if (!looksLikePng(buffer)) throw new Error('screenshot is not a PNG');
      if (shot.bytes < 1000) throw new Error(`screenshot suspiciously small: ${shot.bytes} bytes`);
      note(`screenshot: ${file} (${shot.bytes} bytes)`);
    });

    await check('Emulation.setEmulatedMedia switches print media', async () => {
      await page.emulateMedia('print');
      const isPrint = await page.evaluate('matchMedia("print").matches');
      if (isPrint !== true) throw new Error('matchMedia("print") is false under print emulation');
      const styles = await page.evaluate(`(() => ({
        print: getComputedStyle(document.querySelector('.print-only')).display,
        screen: getComputedStyle(document.querySelector('.screen-only')).display,
        media: matchMedia('print').matches
      }))()`);
      if (styles.print !== 'block') throw new Error(`.print-only display = ${styles.print} in print media`);
      if (styles.screen !== 'none') throw new Error(`.screen-only display = ${styles.screen} in print media`);
      await page.emulateMedia('screen');
      const reset = await page.evaluate('matchMedia("print").matches');
      if (reset !== false) throw new Error('print media did not reset to screen');
    });

    await check('Page.printToPDF produces a valid PDF', async () => {
      await page.emulateMedia('print');
      const file = path.join(ARTIFACTS, 'selfcheck.pdf');
      const pdf = await page.printPDF(file);
      await page.emulateMedia('screen');
      const buffer = fs.readFileSync(file);
      if (!looksLikePdf(buffer)) throw new Error('printToPDF output is not a PDF');
      if (pdf.bytes < 800) throw new Error(`PDF suspiciously small: ${pdf.bytes} bytes`);
      if (countPdfPages(buffer) < 1) throw new Error('PDF page count < 1');
      note(`PDF: ${file} (${pdf.bytes} bytes, ~${pdf.pages} page(s))`);
    });

    await check('unexpected console errors are absent', async () => {
      const extra = page.consoleErrors
        .filter((e) => !e.text.includes('selfcheck expected console error'))
        .map((e) => e.text);
      if (extra.length) throw new Error(`unexpected console errors:\n       ${extra.join('\n       ')}`);
    });

    await check('PageSession.close + chrome cleanup kills the browser', async () => {
      page.close();
      page = null;
      await chrome.close();
      if (!chrome.exited) throw new Error('chrome process still running after close()');
    });
    note(`artifacts: ${ARTIFACTS}`);
  } finally {
    if (page) page.close();
    if (chrome) await chrome.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/* ================================================================== */
/*  APP SMOKE — real app                                               */
/* ================================================================== */

const APP_REQUIRED_FILES = ['index.html', 'js/core.js', 'js/demo.js', 'js/doc-templates.js', 'js/store.js', 'js/app.js', 'css/app.css', 'css/print.css'];

function appPreflight() {
  const missing = APP_REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(APP_ROOT, rel)));
  if (missing.length) {
    console.error(`PENDING  App files not ready under ${APP_ROOT}: ${missing.join(', ')} (owners: ui-dev / doc-dev).`);
    console.error('         E2E starts automatically once the app is complete.');
    process.exit(2);
  }
}

async function runAppSmoke() {
  appPreflight();
  ensureDir(SCREENSHOTS);
  ensureDir(ARTIFACTS);
  const server = await serveStatic(APP_ROOT);
  let chrome = null;
  let page = null;
  try {
    chrome = await launchChrome({ windowSize: { width: 1440, height: 900 } });
    const { client, target } = await connectToPage(chrome);
    page = await PageSession.create(client, target);

    await check('app loads and window.TradeDocs.app is ready', async () => {
      await page.navigate(`${server.url}/index.html`, { timeout: 30000 });
      try {
        await page.waitForApp({ timeout: 20000 });
      } catch (err) {
        throw new Error(`${err.message}\n       console/page errors:\n       ${formatErrors(page)}`);
      }
    });

    await check('default route is #/dashboard with dashboard nav visible', async () => {
      await page.waitUntil('location.hash === "#/dashboard"', { timeout: 10000, label: 'default #/dashboard route' });
      if (!(await page.exists('[data-nav="dashboard"]'))) throw new Error('[data-nav="dashboard"] missing');
    });

    await check('dashboard renders 12 document-type cards', async () => {
      const count = await page.count('[data-doc-type]');
      if (count !== 12) throw new Error(`[data-doc-type] count = ${count}, expected 12`);
    });

    await check('dashboard desktop screenshot 1440x900', async () => {
      await page.setViewport(1440, 900);
      const metrics = await page.layoutMetrics();
      if (metrics.docScrollWidth > metrics.innerWidth + 1) {
        throw new Error(`horizontal overflow: scrollWidth ${metrics.docScrollWidth} > innerWidth ${metrics.innerWidth}`);
      }
      const shot = await page.screenshot(path.join(SCREENSHOTS, 'dashboard.png'));
      if (shot.bytes < 5000) throw new Error(`dashboard.png suspiciously small (${shot.bytes} bytes)`);
      note(`screenshot: screenshots/dashboard.png (${shot.bytes} bytes)`);
    });

    await check('no console errors / page exceptions on first load', async () => {
      const errors = page.errors();
      if (errors.length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('contract test hooks are implemented (§8)', async () => {
      const hooks = await page.evaluate(`(() => {
        const t = window.TradeDocs.test || {};
        return ['createOrder','fillOrder','openPreview','ensureAllDocMeta','renderDocs','getOrder']
          .map((k) => k + ':' + typeof t[k]);
      })()`);
      const bad = hooks.filter((h) => h.endsWith(':undefined'));
      if (bad.length) throw new Error(`missing test hooks: ${bad.join(', ')}`);
    });

    await check('preview route renders selected documents', async () => {
      const orderId = await page.evaluate(`(() => {
        const state = window.TradeDocs.store.getState();
        return state.orders && state.orders[0] ? state.orders[0].id : null;
      })()`);
      if (!orderId) throw new Error('no demo order found in store');
      await page.appNavigate(`#/preview/${orderId}`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length >= 1', {
        timeout: 10000,
        label: '.doc-sheet render in preview'
      });
    });

    await check('print media hides app chrome and keeps doc sheets visible', async () => {
      await page.emulateMedia('print');
      const computed = await page.evaluate(`(() => {
        const val = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display : null; };
        return { appShell: val('.app-shell'), toolbar: val('.preview-toolbar'), firstSheet: val('.doc-sheet') };
      })()`);
      await page.emulateMedia('screen');
      if (computed.appShell !== 'none') throw new Error(`.app-shell display in print = ${computed.appShell}`);
      if (computed.toolbar !== null && computed.toolbar !== 'none') throw new Error(`.preview-toolbar display in print = ${computed.toolbar}`);
      if (computed.firstSheet === 'none') throw new Error('.doc-sheet hidden in print media');
    });

    await check('Page.printToPDF succeeds with sensible page count', async () => {
      await page.emulateMedia('print');
      const file = path.join(ARTIFACTS, 'preview-print.pdf');
      const pdf = await page.printPDF(file);
      await page.emulateMedia('screen');
      const sheets = await page.count('.doc-sheet');
      if (pdf.bytes < 5000) throw new Error(`PDF suspiciously small (${pdf.bytes} bytes)`);
      if (pdf.pages < sheets) throw new Error(`PDF pages ${pdf.pages} < rendered doc sheets ${sheets}`);
      note(`PDF: .scratch/qa/e2e-artifacts/preview-print.pdf (${pdf.bytes} bytes, ~${pdf.pages} page(s))`);
    });

    await check('mobile 390x844: no horizontal overflow + screenshot', async () => {
      const hasViewportMeta = await page.evaluate('!!document.querySelector(\'meta[name="viewport"]\')');
      if (!hasViewportMeta) throw new Error('index.html lacks viewport meta');
      await page.setViewport(390, 844, { mobile: true });
      await page.appNavigate('#/dashboard');
      await sleep(300);
      const metrics = await page.layoutMetrics();
      if (metrics.innerWidth !== 390) throw new Error(`mobile layout viewport ${metrics.innerWidth}px, expected 390`);
      if (metrics.docScrollWidth > metrics.innerWidth + 1) throw new Error(`mobile horizontal overflow: ${metrics.docScrollWidth} > ${metrics.innerWidth}`);
      const shot = await page.screenshot(path.join(SCREENSHOTS, 'mobile-dashboard.png'));
      if (shot.bytes < 5000) throw new Error(`mobile-dashboard.png suspiciously small (${shot.bytes} bytes)`);
    });

    await check('no console errors / page exceptions during whole smoke run', async () => {
      const errors = page.errors();
      if (errors.length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });
  } finally {
    if (page) page.close();
    if (chrome) await chrome.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/* ================================================================== */
/*  FULL INTEGRATED E2E (CONTRACT §11.3–§11.5)                         */
/* ================================================================== */

const DOC_KEYS = ['ci', 'pl', 'pi', 'sc', 'qt', 'bk', 'sa', 'cd', 'co', 'bc', 'dr', 'cs'];
const DOC_PAGES = { ci: 1, pl: 1, pi: 1, sc: 2, qt: 1, bk: 1, sa: 1, cd: 1, co: 1, bc: 1, dr: 1, cs: 1 };
const XSS = '<script>window.__xssFired=true;alert(1)</script><img src=x onerror="window.__xssFired=true"><svg onload=alert(2)>"\'&';
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function fileHash(relPath) {
  try {
    return createHash('sha256').update(fs.readFileSync(path.join(APP_ROOT, relPath))).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}
function hashAppFiles() {
  return {
    'index.html': fileHash('index.html'),
    'css/app.css': fileHash('css/app.css'),
    'css/print.css': fileHash('css/print.css'),
    'js/app.js': fileHash('js/app.js'),
    'js/doc-templates.js': fileHash('js/doc-templates.js'),
    'js/store.js': fileHash('js/store.js'),
    'js/core.js': fileHash('js/core.js'),
    'js/demo.js': fileHash('js/demo.js')
  };
}

async function runFullE2E() {
  appPreflight();
  // Fresh deliverable folders: remove stale images/PDFs so a failed run cannot
  // leave misleading artifacts behind.
  ensureDir(SCREENSHOTS);
  ensureDir(ARTIFACTS);
  fs.rmSync(SCREENSHOTS, { recursive: true, force: true });
  ensureDir(SCREENSHOTS);
  fs.rmSync(DOWNLOADS, { recursive: true, force: true });
  ensureDir(DOWNLOADS);

  const startHashes = hashAppFiles();
  const server = await serveStatic(APP_ROOT);
  let chrome = null;
  let page = null;
  const networkRequests = [];

  try {
    chrome = await launchChrome({ windowSize: { width: 1440, height: 900 } });
    const { client, target } = await connectToPage(chrome);
    page = await PageSession.create(client, target);
    await page.client.send('Network.enable');
    page.client.on('Network.requestWillBeSent', (params) => {
      if (params && params.request && params.request.url) networkRequests.push(params.request.url);
    });
    await page.setDownloadBehavior(DOWNLOADS);

    /* -------------------------------------------------------------- */
    group('A. Fresh-profile boot + deliverable screenshots (desktop)');
    /* -------------------------------------------------------------- */

    await check('fresh Chrome profile boots demo seed: 3 orders / 4 customers / 8 products, schemaVersion 1', async () => {
      await page.navigate(`${server.url}/index.html`, { timeout: 30000 });
      try {
        await page.waitForApp({ timeout: 20000 });
      } catch (err) {
        throw new Error(`${err.message}\n       console/page errors:\n       ${formatErrors(page)}`);
      }
      await page.waitUntil('document.querySelectorAll("[data-doc-type]").length === 12', { timeout: 10000, label: 'dashboard cards' });
      const state = await page.evaluate('window.TradeDocs.store.getState()');
      if (state.schemaVersion !== 1) throw new Error(`schemaVersion = ${state.schemaVersion}`);
      if (state.orders.length !== 3) throw new Error(`orders = ${state.orders.length}, expected 3`);
      if (state.customers.length !== 4) throw new Error(`customers = ${state.customers.length}, expected 4`);
      if (state.products.length !== 8) throw new Error(`products = ${state.products.length}, expected 8`);
      if (!state.meta || state.meta.demo !== true) throw new Error('state.meta.demo flag missing (demo seed not loaded)');
      const storage = await page.evaluate('Object.keys(localStorage)');
      if (!storage.includes('tradedocs.v1')) throw new Error(`localStorage key missing, got ${JSON.stringify(storage)}`);
      const stored = await page.evaluate('JSON.parse(localStorage.getItem("tradedocs.v1")).orders.length');
      if (stored !== 3) throw new Error(`persisted orders = ${stored}`);
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('dashboard: 4 KPI values, 12 doc-type cards, recent orders and quick actions', async () => {
      const viewText = await page.evaluate('document.querySelector("#view-inner").innerText');
      for (const label of ['订单总数', '本月单证', '客户数量', '待完善订单', '单证类型']) {
        if (!viewText.includes(label)) throw new Error(`dashboard text missing "${label}"`);
      }
      const counts = await page.evaluate(`(() => ({
        docCards: document.querySelectorAll('[data-doc-type]').length,
        orderRows: document.querySelectorAll('[data-order-id]').length,
        navItems: document.querySelectorAll('[data-nav]').length
      }))()`);
      if (counts.docCards !== 12) throw new Error(`doc cards = ${counts.docCards}`);
      if (counts.orderRows < 1) throw new Error('recent orders table has no [data-order-id] rows');
      const activeNav = await page.evaluate('(document.querySelector(".nav-item.is-active")||{}).getAttribute ? document.querySelector(".nav-item.is-active").getAttribute("data-nav") : null');
      if (activeNav !== 'dashboard') throw new Error(`active nav = ${activeNav}`);
    });

    await check('deliverable screenshots captured: dashboard / settings / order-editor (desktop)', async () => {
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      await sleep(250);
      const dash = await page.screenshot(path.join(SCREENSHOTS, 'dashboard.png'), { fullPage: true });
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("[name=\'company.nameEn\']")');
      const settings = await page.screenshot(path.join(SCREENSHOTS, 'settings.png'), { fullPage: true });
      const demoOrder = await page.evaluate(`window.TradeDocs.store.getState().orders.find((o) => o.id === 'ord_demo_001') || window.TradeDocs.store.getState().orders[0]`);
      await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(demoOrder && demoOrder.id || '')}))`);
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000 });
      await page.evaluate('window.scrollTo(0, 0)');
      const editor = await page.screenshot(path.join(SCREENSHOTS, 'order-editor.png'), { fullPage: true });
      for (const shot of [dash, settings, editor]) {
        const buf = fs.readFileSync(shot.path);
        if (!looksLikePng(buf)) throw new Error(`${path.basename(shot.path)} is not a PNG`);
        if (shot.bytes < 8000) throw new Error(`${path.basename(shot.path)} suspiciously small (${shot.bytes} bytes)`);
      }
      note(`dashboard=${dash.bytes}B settings=${settings.bytes}B order-editor=${editor.bytes}B`);
    });

    await check('no page horizontal overflow on dashboard/settings/editor at 1440x900', async () => {
      for (const route of ['#/dashboard', '#/settings', '#/orders']) {
        await page.evaluate(`window.TradeDocs.app.navigate(${JSON.stringify(route)})`);
        await sleep(250);
        const metrics = await page.layoutMetrics();
        if (metrics.docScrollWidth > metrics.innerWidth + 1) {
          throw new Error(`${route}: overflow ${metrics.docScrollWidth} > ${metrics.innerWidth}`);
        }
      }
    });

    /* -------------------------------------------------------------- */
    group('B. Routes, direct hash loads and unknown IDs');
    /* -------------------------------------------------------------- */

    const demoOrderId = await page.evaluate(`(() => {
      const state = window.TradeDocs.store.getState();
      const demo = state.orders.find((o) => o.id === 'ord_demo_001');
      return demo ? demo.id : (state.orders[0] && state.orders[0].id);
    })()`);
    if (!demoOrderId) throw new Error('no demo order available for E2E');

    await check('all main hash routes render with correct title/active nav and no console errors', async () => {
      const routes = {
        '#/dashboard': '仪表盘',
        '#/orders': '订单管理',
        '#/customers': '客户管理',
        '#/products': '产品库',
        '#/settings': '设置',
        '#/help': '使用说明'
      };
      for (const [route, title] of Object.entries(routes)) {
        page.clearErrors();
        await page.evaluate(`window.TradeDocs.app.navigate(${JSON.stringify(route)})`);
        await page.waitUntil(`location.hash === ${JSON.stringify(route)}`);
        await sleep(200);
        const info = await page.evaluate(`(() => ({
          title: document.querySelector('#page-title') ? document.querySelector('#page-title').textContent : '',
          activeNav: (document.querySelector('.nav-item.is-active') || {}).getAttribute ? document.querySelector('.nav-item.is-active').getAttribute('data-nav') : '',
          viewHtmlLength: document.querySelector('#view-inner') ? document.querySelector('#view-inner').innerHTML.length : 0
        }))()`);
        if (info.title !== title) throw new Error(`${route}: title = ${JSON.stringify(info.title)}, expected ${title}`);
        if (!info.viewHtmlLength || info.viewHtmlLength < 100) throw new Error(`${route}: empty view`);
        if (page.errors().length) throw new Error(`${route}: console/page errors:\n       ${formatErrors(page)}`);
      }
    });

    await check('every route direct-loads correctly from a fresh document (hash deep link)', async () => {
      const cases = [
        ['#/dashboard', 'document.querySelectorAll("[data-doc-type]").length === 12'],
        [`#/orders/${demoOrderId}`, '!!document.querySelector("#order-form")'],
        [`#/preview/${demoOrderId}`, '!!document.querySelector("#preview-sheets")'],
        ['#/customers', 'document.querySelector("#view-inner").innerText.includes("客户")'],
        ['#/products', 'document.querySelector("#view-inner").innerText.includes("产品")'],
        ['#/settings', '!!document.querySelector("[name=\'company.nameEn\']")'],
        ['#/help', 'document.querySelector("#view-inner").innerText.includes("使用说明")']
      ];
      for (const [hash, expression] of cases) {
        page.clearErrors();
        await page.navigate(`${server.url}/index.html${hash}`, { timeout: 30000 });
        await page.reload({ timeout: 30000 }).catch(() => {});
        await page.waitForApp({ timeout: 20000 });
        await page.waitUntil(expression, { timeout: 10000, label: `${hash} direct load` });
        const actual = await page.hash();
        if (actual !== hash) throw new Error(`${hash}: location.hash after direct load = ${actual}`);
        if (page.errors().length) throw new Error(`${hash}: console/page errors:\n       ${formatErrors(page)}`);
      }
    });

    await check('unknown order/preview IDs show graceful missing-order state, unselected docKey is ignored', async () => {
      page.clearErrors();
      await page.navigate(`${server.url}/index.html#/orders/does-not-exist`, { timeout: 30000 });
      await page.reload({ timeout: 30000 }).catch(() => {});
      await page.waitForApp({ timeout: 20000 });
      await page.waitUntil('document.querySelector("#view-inner").innerText.includes("未找到订单")', {
        timeout: 10000,
        label: 'missing order page'
      });
      await page.navigate(`${server.url}/index.html#/preview/does-not-exist`, { timeout: 30000 });
      await page.reload({ timeout: 30000 }).catch(() => {});
      await page.waitForApp({ timeout: 20000 });
      await page.waitUntil('document.querySelector("#view-inner").innerText.includes("未找到订单")', {
        timeout: 10000,
        label: 'missing preview order page'
      });
      // Unknown docKey in an otherwise valid preview is ignored; selection still renders.
      await page.navigate(`${server.url}/index.html#/preview/${demoOrderId}/not-a-doc`, { timeout: 30000 });
      await page.reload({ timeout: 30000 }).catch(() => {});
      await page.waitForApp({ timeout: 20000 });
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length >= 1', { timeout: 10000, label: 'preview unknown key' });
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('unknown root route falls back to the dashboard without errors', async () => {
      page.clearErrors();
      await page.navigate(`${server.url}/index.html#/this-route-does-not-exist`, { timeout: 30000 });
      await page.reload({ timeout: 30000 }).catch(() => {});
      await page.waitForApp({ timeout: 20000 });
      await page.waitUntil('document.querySelectorAll("[data-doc-type]").length === 12', { timeout: 10000, label: 'dashboard fallback' });
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    /* -------------------------------------------------------------- */
    group('C. Create order → fill → save → preview; totals/words sync; numbering');
    /* -------------------------------------------------------------- */

    let newOrderId = '';
    let exportedState = null;
    let exportedPath = '';

    await check('UI "new order" creates an empty draft and opens the editor', async () => {
      page.clearErrors();
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      await sleep(200);
      await page.click('[data-testid="new-order"]');
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000, label: 'new order editor' });
      const info = await page.evaluate(`(() => ({
        hash: location.hash,
        form: !!document.querySelector('#order-form'),
        itemRows: document.querySelectorAll('#order-form tr[data-item-index]').length,
        buyer: (document.querySelector('[name="buyer.nameEn"]') || {}).value,
        activeId: window.TradeDocs.store.getState().activeOrderId,
        orders: window.TradeDocs.store.getState().orders.length
      }))()`);
      if (!info.hash.startsWith('#/orders/')) throw new Error(`hash after new order = ${info.hash}`);
      if (info.itemRows !== 0) throw new Error(`new order item rows = ${info.itemRows}`);
      if (info.buyer) throw new Error(`new order buyer should be empty, got ${JSON.stringify(info.buyer)}`);
      if (info.orders !== 4) throw new Error(`orders after create = ${info.orders}`);
      newOrderId = info.activeId;
      if (!newOrderId) throw new Error('activeOrderId not set after new order');
    });

    await check('customer picker + product picker populate buyer and item lines', async () => {
      await page.fill('customerId', 'cust_nordlicht');
      await sleep(250);
      const buyer = await page.evaluate('(document.querySelector(\'[name="buyer.nameEn"]\') || {}).value');
      if (buyer !== 'NORDLICHT HANDELS GMBH') throw new Error(`buyer after customer select = ${JSON.stringify(buyer)}`);
      await page.fill('date', '2026-11-19');
      await page.fill('currency', 'EUR');
      await page.fill('incoterm', 'FOB');
      await page.fill('portOfLoading', 'NINGBO, CHINA');
      await page.fill('portOfDischarge', 'HAMBURG, GERMANY');
      await page.fill('countryOfDestination', 'GERMANY');
      await page.fill('paymentTerms', 'T/T 30% DEPOSIT, BALANCE AGAINST COPY OF B/L');
      await page.fill('product-picker', 'prod_mug');
      await page.click('[data-testid="add-product"]');
      await page.waitUntil('document.querySelectorAll("#order-form tr[data-item-index]").length === 1', { timeout: 8000 });
      const item = await page.evaluate(`(() => { const f = document.querySelector('#order-form'); const g = (n) => (f.querySelector('[name="items.0.' + n + '"]') || {}).value; return { nameEn: g('nameEn'), hsCode: g('hsCode'), unit: g('unit'), price: g('unitPrice'), qty: g('qty') }; })()`);
      if (item.nameEn !== 'Ceramic Mug 12 oz') throw new Error(`item name = ${JSON.stringify(item.nameEn)}`);
      if (item.hsCode !== '6912.00.00') throw new Error(`item HS = ${JSON.stringify(item.hsCode)}`);
      if (Number(item.price) !== 1.85) throw new Error(`item price = ${item.price}`);
      await page.fill('items.0.qty', '500');
      await page.fill('charges.freight', '120');
      await page.fill('charges.insurance', '30');
      await sleep(300);
      const line = await page.text('[data-line-amount]');
      if (line !== 'EUR 925.00') throw new Error(`line amount = ${line}, expected EUR 925.00`);
      const total = await page.text('[data-charges-total]');
      if (total !== 'EUR 1,075.00') throw new Error(`order total = ${total}, expected EUR 1,075.00`);
    });

    await check('save order persists buyer/items/charges/totals and amount words', async () => {
      await page.click('[data-testid="save-order"]');
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => e.textContent.includes('已保存'))`, {
        timeout: 6000,
        label: 'save toast'
      });
      const saved = await page.evaluate(`(() => {
        const o = window.TradeDocs.test.getOrder(${JSON.stringify(newOrderId)});
        const c = window.TradeDocs.core.calcOrder(o);
        return { buyer: o.buyer.nameEn, currency: o.currency, qty: o.items[0].qty, price: o.items[0].unitPrice, freight: o.charges.freight, insurance: o.charges.insurance, grandTotal: c.grandTotal, wordsEn: c.amountInWordsEn, selected: o.print.selected };
      })()`);
      if (saved.buyer !== 'NORDLICHT HANDELS GMBH') throw new Error(`saved buyer = ${saved.buyer}`);
      if (saved.currency !== 'EUR') throw new Error(`saved currency = ${saved.currency}`);
      if (saved.qty !== 500 || saved.price !== 1.85) throw new Error(`saved qty/price = ${saved.qty}/${saved.price}`);
      if (saved.grandTotal !== 1075) throw new Error(`saved grandTotal = ${saved.grandTotal}`);
      if (saved.wordsEn !== 'SAY EURO ONE THOUSAND SEVENTY-FIVE ONLY') throw new Error(`saved words = ${saved.wordsEn}`);
      if (saved.selected.join(',') !== 'ci,pl') throw new Error(`saved selected = ${saved.selected.join(',')}`);
      const summaryWords = await page.evaluate(`document.querySelector('#summary-body').textContent.includes('SAY EURO ONE THOUSAND SEVENTY-FIVE')`);
      if (!summaryWords) throw new Error('editor summary does not show amount words');
    });

    await check('preview new order renders CI+PL with total, words total and no money on PL', async () => {
      page.clearErrors();
      await page.click('[data-testid="preview-order"]');
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 2', { timeout: 12000, label: 'new order preview 2 sheets' });
      const ci = await page.evaluate("document.querySelector('.doc-sheet[data-doc=\"ci\"]').textContent");
      const pl = await page.evaluate("document.querySelector('.doc-sheet[data-doc=\"pl\"]').textContent");
      for (const needle of ['NORDLICHT HANDELS GMBH', 'Ceramic Mug 12 oz', 'EUR 1,075.00', 'SAY EURO ONE THOUSAND SEVENTY-FIVE ONLY']) {
        if (!ci.includes(needle)) throw new Error(`CI preview missing ${JSON.stringify(needle)}`);
      }
      if (!pl.includes('Ceramic Mug 12 oz')) throw new Error('PL preview missing item');
      if (/EUR\s?\d/.test(pl)) throw new Error('PL preview shows money amounts');
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('edit qty/price in editor → displayed totals + amount words update (no relaunch)', async () => {
      await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(newOrderId)}))`);
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000 });
      await page.fill('items.0.qty', '1000');
      await page.fill('items.0.unitPrice', '2');
      await page.click('[data-testid="save-order"]');
      await sleep(400);
      const total = await page.text('[data-charges-total]');
      if (total !== 'EUR 2,150.00') throw new Error(`editor total after edit = ${total}, expected EUR 2,150.00`);
      const summaryWords = await page.evaluate(`document.querySelector('#summary-body').textContent.includes('SAY EURO TWO THOUSAND ONE HUNDRED AND FIFTY')`);
      if (!summaryWords) throw new Error('editor amount words did not update');
      const saved = await page.evaluate(`(() => { const o = window.TradeDocs.test.getOrder(${JSON.stringify(newOrderId)}); return { qty: o.items[0].qty, price: o.items[0].unitPrice }; })()`);
      if (saved.qty !== 1000 || saved.price !== 2) throw new Error(`saved qty/price = ${saved.qty}/${saved.price}`);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(newOrderId)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 2', { timeout: 12000 });
      const ci = await page.evaluate("document.querySelector('.doc-sheet[data-doc=\"ci\"]').textContent");
      if (!ci.includes('EUR 2,150.00')) throw new Error('preview CI total did not update to EUR 2,150.00');
      if (!ci.includes('SAY EURO TWO THOUSAND ONE HUNDRED AND FIFTY ONLY')) throw new Error('preview CI amount words did not update');
    });

    await check('numbering: preview consumes once, repeat preview/reload does not increment', async () => {
      const before = await page.evaluate(`(() => {
        const s = window.TradeDocs.store.getState();
        return { next: s.settings.numbering.next, meta: s.orders.find((o) => o.id === ${JSON.stringify(newOrderId)}).docMeta };
      })()`);
      if (!before.meta.ci || !before.meta.ci.no) throw new Error('CI docMeta not generated by first preview');
      if (!before.meta.pl || !before.meta.pl.no) throw new Error('PL docMeta not generated by first preview');
      const ciNo = before.meta.ci.no;
      // repeat preview twice without changes
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(newOrderId)})`);
      await sleep(300);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(newOrderId)})`);
      await sleep(300);
      await page.reload({ timeout: 30000 });
      await page.waitForApp({ timeout: 20000 });
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(newOrderId)})`);
      await sleep(500);
      const after = await page.evaluate(`(() => {
        const s = window.TradeDocs.store.getState();
        return { next: s.settings.numbering.next, meta: s.orders.find((o) => o.id === ${JSON.stringify(newOrderId)}).docMeta };
      })()`);
      if (after.meta.ci.no !== ciNo) throw new Error(`CI number changed on repeat preview: ${after.meta.ci.no} !== ${ciNo}`);
      if (after.next.ci !== before.next.ci) throw new Error(`numbering.next.ci changed ${before.next.ci} -> ${after.next.ci} on repeat preview`);
      if (after.next.pl !== before.next.pl) throw new Error(`numbering.next.pl changed ${before.next.pl} -> ${after.next.pl} on repeat preview`);
      // adding a new document type consumes exactly once
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(newOrderId)}, 'qt')`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length >= 1', { timeout: 8000 });
      const qt1 = await page.evaluate(`(() => { const s = window.TradeDocs.store.getState(); return { meta: s.orders.find((o) => o.id === ${JSON.stringify(newOrderId)}).docMeta.qt, next: s.settings.numbering.next.qt }; })()`);
      if (!qt1.meta || !qt1.meta.no) throw new Error('QT docMeta not generated when added to preview');
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(newOrderId)}, 'qt')`);
      await sleep(300);
      await page.reload({ timeout: 30000 });
      await page.waitForApp({ timeout: 20000 });
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(newOrderId)}, 'qt')`);
      await sleep(400);
      const qt2 = await page.evaluate(`(() => { const s = window.TradeDocs.store.getState(); return { meta: s.orders.find((o) => o.id === ${JSON.stringify(newOrderId)}).docMeta.qt, next: s.settings.numbering.next.qt }; })()`);
      if (qt2.meta.no !== qt1.meta.no) throw new Error(`QT number changed on repeat preview: ${qt2.meta.no} !== ${qt1.meta.no}`);
      if (qt2.next !== qt1.next) throw new Error(`numbering.next.qt changed ${qt1.next} -> ${qt2.next} on repeat preview`);
    });

    await check('reload persistence: edited order values and generated numbers survive refresh', async () => {
      await page.reload({ timeout: 30000 });
      await page.waitForApp({ timeout: 20000 });
      const order = await page.evaluate(`window.TradeDocs.test.getOrder(${JSON.stringify(newOrderId)})`);
      if (!order) throw new Error('order lost after reload');
      if (order.buyer.nameEn !== 'NORDLICHT HANDELS GMBH') throw new Error(`buyer after reload = ${order.buyer.nameEn}`);
      if (order.items[0].qty !== 1000 || order.items[0].unitPrice !== 2) {
        throw new Error(`qty/price after reload = ${order.items[0].qty}/${order.items[0].unitPrice}`);
      }
      if (!order.docMeta.ci || !order.docMeta.ci.no) throw new Error('doc numbers lost after reload');
      await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(newOrderId)}))`);
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000 });
      const formValues = await page.evaluate(`(() => ({
        buyer: (document.querySelector('[name="buyer.nameEn"]') || {}).value,
        qty: (document.querySelector('[name="items.0.qty"]') || {}).value,
        price: (document.querySelector('[name="items.0.unitPrice"]') || {}).value
      }))()`);
      if (formValues.buyer !== 'NORDLICHT HANDELS GMBH' || Number(formValues.qty) !== 1000 || Number(formValues.price) !== 2) {
        throw new Error(`editor form after reload = ${JSON.stringify(formValues)}`);
      }
    });

    await check('Ctrl+S saves the current editor state (keyboard shortcut §8)', async () => {
      await page.fill('items.0.qty', '1200');
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))`);
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => e.textContent.includes('已保存'))`, {
        timeout: 6000,
        label: 'Ctrl+S save toast'
      });
      await sleep(250);
      const saved = await page.evaluate(`(() => { const o = window.TradeDocs.test.getOrder(${JSON.stringify(newOrderId)}); const c = window.TradeDocs.core.calcOrder(o); return { qty: o.items[0].qty, grandTotal: c.grandTotal }; })()`);
      if (saved.qty !== 1200) throw new Error(`Ctrl+S did not persist qty, got ${saved.qty}`);
      if (saved.grandTotal !== 2550) throw new Error(`grandTotal after Ctrl+S = ${saved.grandTotal}`);
    });

    await check('Esc closes confirmation modals without changing data', async () => {
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("[name=\'company.nameEn\']")', { timeout: 10000 });
      const ordersBefore = await page.evaluate('window.TradeDocs.store.getState().orders.length');
      await page.click('[data-action="clear-all"]');
      await page.waitUntil('document.querySelectorAll("#modal-root *").length > 0', { timeout: 5000, label: 'confirm modal' });
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
      await sleep(250);
      const modalChildren = await page.evaluate('document.querySelectorAll("#modal-root *").length');
      const ordersAfter = await page.evaluate('window.TradeDocs.store.getState().orders.length');
      if (modalChildren !== 0) throw new Error(`modal still open after Esc (${modalChildren} nodes)`);
      if (ordersAfter !== ordersBefore) throw new Error(`data changed by cancelled modal: ${ordersBefore} -> ${ordersAfter}`);
    });

    await check('XSS in buyer/remarks/marks rendered escaped with zero script execution (§1)', async () => {
      page.clearErrors();
      const ordersBefore = await page.evaluate('window.TradeDocs.store.getState().orders.length');
      await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(newOrderId)}))`);
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000 });
      await page.evaluate('window.__xssFired = false');
      await page.evaluate(`(() => { const orig = window.alert; window.alert = function () { window.__xssFired = true; }; window.__origAlert = orig; })()`);
      await page.fill('buyer.nameEn', XSS);
      await page.fill('buyer.addressEn', XSS);
      await page.fill('remarks', XSS);
      await page.fill('shippingMarks', XSS);
      await page.fill('items.0.nameEn', XSS);
      await page.click('[data-testid="save-order"]');
      await sleep(400);
      const beforeXss = await page.evaluate('window.__xssFired');
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(newOrderId)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length >= 2', { timeout: 12000, label: 'xss preview sheets' });
      await sleep(400);
      const xssReport = await page.evaluate(`(() => {
        const fired = !!window.__xssFired;
        const sheets = Array.from(document.querySelectorAll('.doc-sheet'));
        return {
          fired,
          rawScript: sheets.some((s) => s.innerHTML.includes('<script')),
          rawImg: sheets.some((s) => s.innerHTML.includes('<img src=x')),
          rawSvg: sheets.some((s) => s.innerHTML.includes('<svg')),
          escaped: sheets.some((s) => s.innerHTML.includes('&lt;script&gt;')),
          textPayload: sheets.some((s) => s.textContent.includes('<script>')),
          sheetCount: sheets.length
        };
      })()`);
      if (xssReport.fired) throw new Error('XSS payload executed in preview');
      if (xssReport.rawScript) throw new Error('raw <script> from user data in preview');
      if (xssReport.rawImg) throw new Error('raw <img> from user data in preview');
      if (xssReport.rawSvg) throw new Error('raw <svg> from user data in preview');
      if (!xssReport.escaped) throw new Error('XSS payload was not escaped');
      if (!xssReport.textPayload) throw new Error('escaped XSS payload does not decode back to text');
      if (ordersBefore !== await page.evaluate('window.TradeDocs.store.getState().orders.length')) throw new Error('order count changed during XSS test');
      if (page.errors().length) throw new Error(`console/page errors during XSS test:\n       ${formatErrors(page)}`);
    });

    /* -------------------------------------------------------------- */
    group('D. All 12 documents in UI + TradeDocs.test.renderDocs');
    /* -------------------------------------------------------------- */

    const allSelected = DOC_KEYS.slice();

    await check('all 12 documents render in the UI preview in contract order', async () => {
      page.clearErrors();
      await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demoOrderId)}, ${JSON.stringify({ print: { selected: allSelected } })})`);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(demoOrderId)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 12', { timeout: 20000, label: '12 doc sheets' });
      await sleep(300);
      const info = await page.evaluate(`(() => ({
        docs: Array.from(document.querySelectorAll('.doc-sheet')).map((el) => el.getAttribute('data-doc')),
        errors: Array.from(document.querySelectorAll('[data-doc-error]')).map((el) => el.getAttribute('data-doc-error')),
        tabs: Array.from(document.querySelectorAll('[data-doc-tab]')).map((el) => el.getAttribute('data-doc-tab')),
        selectedCount: document.querySelectorAll('[data-doc-tab].is-active').length
      }))()`);
      if (JSON.stringify(info.docs) !== JSON.stringify(DOC_KEYS)) throw new Error(`sheet order = ${JSON.stringify(info.docs)}`);
      if (info.errors.length) throw new Error(`doc render errors: ${info.errors.join(', ')}`);
      if (info.tabs.length !== 12) throw new Error(`doc tabs = ${info.tabs.length}`);
      if (info.selectedCount !== 12) throw new Error(`active tabs = ${info.selectedCount}`);
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('per-document content in UI sheets: title, doc number, total, no undefined/NaN leaks', async () => {
      const report = await page.evaluate(`(() => {
        const state = window.TradeDocs.store.getState();
        const order = state.orders.find((o) => o.id === ${JSON.stringify(demoOrderId)});
        const list = window.TradeDocs.docs.list;
        return list.map((entry) => {
          const sheet = document.querySelector('.doc-sheet[data-doc="' + entry.key + '"]');
          if (!sheet) return { key: entry.key, error: 'sheet missing' };
          const text = sheet.textContent;
          const meta = order.docMeta && order.docMeta[entry.key];
          const leaks = ['undefined', 'NaN', '[object Object]'].filter((bad) => text.includes(bad));
          if (/\\bnull\\b/.test(text)) leaks.push('null');
          return {
            key: entry.key,
            hasTitle: text.toLowerCase().includes(entry.nameEn.toLowerCase()) || text.includes(entry.nameCn),
            hasNo: !meta || text.includes(meta.no),
            hasBuyer: ['bk', 'cd', 'cs'].includes(entry.key) ? true : text.includes(order.buyer.nameEn),
            leaks
          };
        });
      })()`);
      for (const row of report) {
        if (row.error) throw new Error(`${row.key}: ${row.error}`);
        if (!row.hasTitle) throw new Error(`${row.key}: title missing`);
        if (!row.hasNo) throw new Error(`${row.key}: document number missing`);
        if (!row.hasBuyer) throw new Error(`${row.key}: buyer name missing`);
        if (row.leaks.length) throw new Error(`${row.key}: leaked tokens ${row.leaks.join(', ')}`);
      }
    });

    await check('TradeDocs.test.renderDocs returns ok for all 12 documents, consistent with UI markup', async () => {
      const renderResults = await page.evaluate(`(() => {
        const T = window.TradeDocs;
        const state = T.store.getState();
        const order = state.orders.find((o) => o.id === ${JSON.stringify(demoOrderId)});
        const opts = {
          bilingual: !!(order.print && order.print.bilingual),
          showSeal: !order.print || order.print.showSeal !== false,
          showSignature: true
        };
        const results = T.test.renderDocs(${JSON.stringify(demoOrderId)});
        const out = { results, ui: {}, normalized: {}, raw: {} };
        T.docs.list.forEach((entry) => {
          const key = entry.key;
          const meta = order.docMeta && order.docMeta[key];
          const rendered = T.docs.render(key, { state, order, meta, opts, core: T.core });
          const host = document.createElement('div');
          host.innerHTML = rendered;
          out.raw[key] = rendered.length;
          out.normalized[key] = host.firstElementChild ? host.firstElementChild.outerHTML : '';
          const uiSheet = document.querySelector('.doc-sheet[data-doc="' + key + '"]');
          out.ui[key] = uiSheet ? uiSheet.outerHTML : '';
        });
        return out;
      })()`);
      for (const key of DOC_KEYS) {
        const result = renderResults.results[key];
        if (!result) throw new Error(`renderDocs missing ${key}`);
        if (!result.ok) throw new Error(`renderDocs ${key} failed: ${result.error}`);
        if (!(result.length > 500)) throw new Error(`renderDocs ${key} length = ${result.length}`);
        if (result.length !== renderResults.raw[key]) {
          throw new Error(`renderDocs(${key}) length ${result.length} != direct render length ${renderResults.raw[key]}`);
        }
        if (renderResults.normalized[key] !== renderResults.ui[key]) {
          throw new Error(`renderDocs(${key}) DOM-normalised markup differs from UI sheet`);
        }
      }
      note(`renderDocs == UI markup for all 12 docs (browser-normalised)`);
    });

    /* -------------------------------------------------------------- */
    group('E. Print media + per-document PDF matrix + selected-set pages');
    /* -------------------------------------------------------------- */

    const printArtifacts = {};
    async function printOne(key) {
      await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demoOrderId)}, ${JSON.stringify({ print: { selected: [key] } })})`);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(demoOrderId)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 1', { timeout: 12000, label: `single ${key} sheet` });
      await sleep(250);
      await page.emulateMedia('print');
      const metrics = await page.evaluate(`(() => {
        const val = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display : 'MISSING'; };
        const sheet = document.querySelector('.doc-sheet');
        const wrapper = document.querySelector('.print-area > .preview-sheet');
        const multiPages = Array.from(document.querySelectorAll('.doc-sheet--multi .doc-page'));
        return {
          appShell: val('.app-shell'),
          toolbar: val('.preview-toolbar'),
          noPrint: val('.no-print'),
          printArea: val('.print-area'),
          sheet: val('.doc-sheet'),
          widthPx: sheet ? parseFloat(getComputedStyle(sheet).width) : 0,
          heightPx: sheet ? sheet.getBoundingClientRect().height : 0,
          wrapperBreakAfter: wrapper ? getComputedStyle(wrapper).breakAfter : null,
          multiBreaks: multiPages.map((el) => getComputedStyle(el).breakAfter),
          docPages: sheet ? sheet.querySelectorAll('.doc-page').length : 0
        };
      })()`);
      const file = path.join(ARTIFACTS, 'print-matrix', `${key}.pdf`);
      const pdf = await page.printPDF(file);
      await page.emulateMedia('screen');
      const buffer = fs.readFileSync(file);
      printArtifacts[key] = { bytes: pdf.bytes, pages: pdf.pages, metrics, path: file };
      return { pdf, metrics, buffer };
    }

    await check('print media hides app chrome (.app-shell/.preview-toolbar/.toast/.modal/.no-print) and shows A4 print area', async () => {
      page.clearErrors();
      await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demoOrderId)}, ${JSON.stringify({ print: { selected: ['ci'] } })})`);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(demoOrderId)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 1', { timeout: 12000 });
      await page.evaluate(`window.TradeDocs.app.toast('print-media-probe', 'info')`);
      await page.click('[data-action="clear-all"]');
      await sleep(200);
      await page.emulateMedia('print');
      await sleep(200);
      const metrics = await page.evaluate(`(() => {
        const val = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display : null; };
        const sheet = document.querySelector('.doc-sheet');
        const cs = sheet ? getComputedStyle(sheet) : null;
        return {
          appShell: val('.app-shell'),
          toolbar: val('.preview-toolbar'),
          toast: val('.toast'),
          modalRoot: val('#modal-root'),
          noPrint: val('.no-print'),
          printArea: val('.print-area'),
          sheetDisplay: cs ? cs.display : null,
          sheetWidth: cs ? cs.width : null,
          pageRule: (() => {
            for (const sheetStyle of Array.from(document.styleSheets)) {
              let rules; try { rules = Array.from(sheetStyle.cssRules || []); } catch (e) { continue; }
              for (const rule of rules) {
                if (rule.type === 6 || (rule.constructor && /CSSPageRule/.test(rule.constructor.name))) return rule.cssText;
              }
            }
            return null;
          })()
        };
      })()`);
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
      await page.emulateMedia('screen');
      await sleep(150);
      if (metrics.appShell !== 'none') throw new Error(`.app-shell print display = ${metrics.appShell}`);
      if (metrics.toolbar !== 'none') throw new Error(`.preview-toolbar print display = ${metrics.toolbar}`);
      if (metrics.toast !== 'none' && metrics.toast !== null) throw new Error(`.toast print display = ${metrics.toast}`);
      if (metrics.modalRoot !== 'none' && metrics.modalRoot !== null) throw new Error(`#modal-root print display = ${metrics.modalRoot}`);
      if (metrics.printArea !== 'block') throw new Error(`.print-area print display = ${metrics.printArea}`);
      if (metrics.sheetDisplay !== 'block') throw new Error(`.doc-sheet print display = ${metrics.sheetDisplay}`);
      const widthPx = parseFloat(metrics.sheetWidth);
      if (!(widthPx > 780 && widthPx < 800)) throw new Error(`A4 width = ${metrics.sheetWidth}px, expected ~793.7px (210mm)`);
      if (!metrics.pageRule || !/size:\s*a4/i.test(metrics.pageRule)) throw new Error(`@page A4 rule missing (found: ${metrics.pageRule})`);
      if (metrics.noPrint !== 'none' && metrics.noPrint !== null) throw new Error(`.no-print print display = ${metrics.noPrint}`);
    });

    await check('per-doc printToPDF page counts: CI/PL/PI/QT/BK/SA/CO/BC/DR/CD/CS = 1, SC = 2', async () => {
      const A4_PX = 1122.52; // 297mm at 96dpi
      const failures = [];
      for (const key of DOC_KEYS) {
        const { pdf, metrics, buffer } = await printOne(key);
        const expected = DOC_PAGES[key];
        if (!looksLikePdf(buffer)) failures.push(`${key}: PDF signature invalid`);
        if (pdf.pages !== expected) {
          failures.push(`${key}: PDF pages = ${pdf.pages}, expected ${expected} (sheet height ${Math.round(metrics.heightPx)}px vs A4 ${Math.round(A4_PX)}px)`);
        }
        if (pdf.bytes < 5000) failures.push(`${key}: PDF too small ${pdf.bytes}B`);
        // SC is the only intentionally multi-page document: allow up to 2 A4 pages.
        const maxHeight = DOC_PAGES[key] * A4_PX + 2;
        if (metrics.heightPx > maxHeight) {
          failures.push(`${key}: .doc-sheet height ${Math.round(metrics.heightPx)}px exceeds ${DOC_PAGES[key]} A4 page(s) (${Math.round(maxHeight)}px) by ${Math.round(metrics.heightPx - maxHeight)}px`);
        }
        if (metrics.appShell !== 'none') failures.push(`${key}: app-shell visible in print media`);
        if (metrics.toolbar !== 'none') failures.push(`${key}: toolbar visible in print media`);
        if (key === 'sc') {
          if (metrics.docPages !== 2) failures.push(`sc: .doc-page count = ${metrics.docPages}, expected 2`);
          if (JSON.stringify(metrics.multiBreaks) !== JSON.stringify(['page', 'auto'])) {
            failures.push(`sc: .doc-page break-after = ${JSON.stringify(metrics.multiBreaks)}, expected ["page","auto"]`);
          }
        } else if (metrics.docPages > 1) {
          failures.push(`${key}: .doc-page count = ${metrics.docPages}, expected 1`);
        }
        if (metrics.wrapperBreakAfter !== 'auto') {
          failures.push(`${key}: single-sheet wrapper break-after = ${metrics.wrapperBreakAfter}, expected auto (no trailing blank page)`);
        }
      }
      note(`print matrix: ${DOC_KEYS.map((k) => `${k}=${printArtifacts[k].pages}p/${Math.round(printArtifacts[k].metrics.heightPx)}px`).join(', ')}`);
      if (failures.length) throw new Error(failures.join('\n       '));
    });

    await check('selected demo set (CI,PL,SC,CO) = 5 PDF pages = sum of per-doc pages, no trailing blank page', async () => {
      await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demoOrderId)}, ${JSON.stringify({ print: { selected: ['ci', 'pl', 'sc', 'co'] } })})`);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(demoOrderId)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 4', { timeout: 12000 });
      await sleep(300);
      await page.emulateMedia('print');
      const file = path.join(SCREENSHOTS, 'preview-selected-demo.pdf');
      const pdf = await page.printPDF(file);
      const breakInfo = await page.evaluate(`(() => ({
        wrappers: Array.from(document.querySelectorAll('.print-area > .preview-sheet')).map((el) => getComputedStyle(el).breakAfter)
      }))()`);
      await page.emulateMedia('screen');
      const buffer = fs.readFileSync(file);
      const expected = ['ci', 'pl', 'sc', 'co'].reduce((sum, key) => sum + DOC_PAGES[key], 0);
      if (!looksLikePdf(buffer)) throw new Error('selected-set PDF signature invalid');
      if (pdf.pages !== expected) throw new Error(`selected-set PDF pages = ${pdf.pages}, expected ${expected}`);
      if (pdf.bytes < 10000) throw new Error(`selected-set PDF too small (${pdf.bytes}B)`);
      if (breakInfo.wrappers.length !== 4) throw new Error(`preview wrappers = ${breakInfo.wrappers.length}, expected 4`);
      if (breakInfo.wrappers.slice(0, -1).some((value) => value !== 'page')) {
        throw new Error(`non-last sheet wrappers break-after = ${JSON.stringify(breakInfo.wrappers)}`);
      }
      if (breakInfo.wrappers[breakInfo.wrappers.length - 1] !== 'auto') {
        throw new Error(`last sheet wrapper break-after = ${breakInfo.wrappers[breakInfo.wrappers.length - 1]}, expected auto`);
      }
      note(`PDF: screenshots/preview-selected-demo.pdf (${pdf.bytes}B, ${pdf.pages} pages)`);
    });

    await check('all-12 selected = 13 PDF pages (11×1 + SC×2), SC + all-12 print artifacts kept', async () => {
      await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demoOrderId)}, ${JSON.stringify({ print: { selected: allSelected } })})`);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(demoOrderId)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 12', { timeout: 20000 });
      await sleep(400);
      await page.emulateMedia('print');
      const pdf = await page.printPDF(path.join(ARTIFACTS, 'print-matrix', 'all-12.pdf'));
      await page.emulateMedia('screen');
      const expected = DOC_KEYS.reduce((sum, key) => sum + DOC_PAGES[key], 0);
      if (pdf.pages !== expected) {
        const overflowDocs = DOC_KEYS.filter((key) => printArtifacts[key].pages !== DOC_PAGES[key])
          .map((key) => `${key}=${printArtifacts[key].pages}p`).join(', ');
        throw new Error(`all-12 PDF pages = ${pdf.pages}, expected ${expected} (per-doc mismatches: ${overflowDocs})`);
      }
      // Keep the 2-page contract and the full 13-page set as visible artifacts.
      fs.copyFileSync(path.join(ARTIFACTS, 'print-matrix', 'sc.pdf'), path.join(SCREENSHOTS, 'preview-sc-2pages.pdf'));
      fs.copyFileSync(path.join(ARTIFACTS, 'print-matrix', 'all-12.pdf'), path.join(SCREENSHOTS, 'preview-all-12.pdf'));
      note(`all-12 PDF ${pdf.pages} pages (${pdf.bytes}B); artifacts: screenshots/preview-sc-2pages.pdf, screenshots/preview-all-12.pdf`);
    });

    /* -------------------------------------------------------------- */
    group('F. Settings, backup/restore, clearAll/resetDemo');
    /* -------------------------------------------------------------- */

    const logoFile = path.join(ARTIFACTS, 'qa-logo.png');
    const sealFile = path.join(ARTIFACTS, 'qa-seal.png');
    fs.writeFileSync(logoFile, PNG_PIXEL);
    fs.writeFileSync(sealFile, PNG_PIXEL);

    await check('settings form saves via UI + Ctrl+S and persists across reload', async () => {
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("[name=\'company.signer\']")', { timeout: 10000 });
      await page.fill('company.signer', 'QA Tester');
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))`);
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => e.textContent.includes('设置已保存'))`, {
        timeout: 6000,
        label: 'settings save toast'
      });
      await page.reload({ timeout: 30000 });
      await page.waitForApp({ timeout: 20000 });
      const signer = await page.evaluate('window.TradeDocs.store.getState().settings.company.signer');
      if (signer !== 'QA Tester') throw new Error(`settings signer after reload = ${JSON.stringify(signer)}`);
    });

    await check('logo/seal upload stores dataURL, renders in documents, and can be removed', async () => {
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("#logo-file")', { timeout: 10000 });
      await page.setFileInput('#logo-file', logoFile);
      await page.waitUntil(`window.TradeDocs.store.getState().settings.company.logo.startsWith('data:image/')`, {
        timeout: 8000,
        label: 'logo dataURL stored'
      });
      await page.setFileInput('#seal-file', sealFile);
      await page.waitUntil(`window.TradeDocs.store.getState().settings.company.seal.startsWith('data:image/')`, {
        timeout: 8000,
        label: 'seal dataURL stored'
      });
      await sleep(700); // debounce save
      const stored = await page.evaluate(`(() => { const s = window.TradeDocs.store.getState().settings.company; return { logo: s.logo.slice(0, 30), seal: s.seal.slice(0, 30), logoLen: s.logo.length, sealLen: s.seal.length }; })()`);
      if (!stored.logo.startsWith('data:image/png')) throw new Error(`logo dataURL = ${stored.logo}`);
      if (!stored.seal.startsWith('data:image/png')) throw new Error(`seal dataURL = ${stored.seal}`);
      if (stored.logoLen < 50 || stored.sealLen < 50) throw new Error(`dataURL lengths ${stored.logoLen}/${stored.sealLen}`);
      const previewImg = await page.evaluate('!!document.querySelector("#asset-preview-logo img") && !!document.querySelector("#asset-preview-seal img")');
      if (!previewImg) throw new Error('settings asset previews do not show uploaded images');
      // Rendered document includes the uploaded images (logo + seal).
      await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demoOrderId)}, ${JSON.stringify({ print: { selected: ['ci'], showSeal: true } })})`);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(demoOrderId)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 1', { timeout: 12000 });
      const imgCount = await page.evaluate(`document.querySelectorAll('.doc-sheet img[src^="data:image/png"]').length`);
      if (imgCount < 2) throw new Error(`CI sheet embedded png images = ${imgCount}, expected logo+seal (>=2)`);
      // Remove assets again (settings restore happens through resetDemo below).
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("[data-action=\'remove-logo\']")', { timeout: 10000 });
      await page.click('[data-action="remove-logo"]');
      await page.click('[data-action="remove-seal"]');
      await page.waitUntil(`(() => { const s = window.TradeDocs.store.getState().settings.company; return s.logo === '' && s.seal === ''; })()`, {
        timeout: 8000,
        label: 'assets removed'
      });
    });

    await check('JSON export via UI downloads a valid backup (schemaVersion 1, current state)', async () => {
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("[data-testid=\'export-backup\']")', { timeout: 10000 });
      for (const f of fs.readdirSync(DOWNLOADS)) fs.rmSync(path.join(DOWNLOADS, f), { force: true });
      await page.click('[data-testid="export-backup"]');
      const file = await waitForNode(() => {
        const names = fs.readdirSync(DOWNLOADS).filter((f) => f.endsWith('.json'));
        return names.length ? path.join(DOWNLOADS, names[0]) : null;
      }, { timeout: 10000, label: 'backup JSON download' });
      await sleep(200);
      const state = await page.evaluate('window.TradeDocs.store.getState()');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed.schemaVersion !== 1) throw new Error(`backup schemaVersion = ${parsed.schemaVersion}`);
      if (parsed.orders.length !== state.orders.length) throw new Error(`backup orders = ${parsed.orders.length}, live = ${state.orders.length}`);
      if (parsed.customers.length !== 4 || parsed.products.length !== 8) throw new Error('backup customers/products mismatch');
      if (!parsed.settings || !parsed.settings.company) throw new Error('backup settings missing');
      if (parsed.settings.company.signer !== 'QA Tester') throw new Error(`backup signer = ${JSON.stringify(parsed.settings.company.signer)}`);
      exportedState = parsed;
      exportedPath = file;
      note(`backup: ${path.basename(file)} (${parsed.orders.length} orders)`);
    });

    await check('JSON import round-trip restores the exported state exactly', async () => {
      // Mutate state first (extra order) so the restore is observable.
      await page.evaluate(`window.TradeDocs.test.createOrder({ no: 'QA-TMP-0001', buyer: { nameEn: 'TEMP QA BUYER' } })`);
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("#import-file")', { timeout: 10000 });
      await page.setFileInput('#import-file', exportedPath);
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => /导入成功|已导入/.test(e.textContent))`, {
        timeout: 10000,
        label: 'import success toast'
      });
      await sleep(300);
      const restored = await page.evaluate('window.TradeDocs.store.getState()');
      if (restored.orders.length !== exportedState.orders.length) throw new Error(`restored orders = ${restored.orders.length}, expected ${exportedState.orders.length}`);
      const temp = restored.orders.find((o) => o.no === 'QA-TMP-0001');
      if (temp) throw new Error('temporary order survived import (state not replaced)');
      if (restored.customers.length !== exportedState.customers.length || restored.products.length !== exportedState.products.length) {
        throw new Error('import restored different customers/products counts');
      }
      if (restored.settings.company.signer !== 'QA Tester') throw new Error(`import restored signer = ${JSON.stringify(restored.settings.company.signer)}`);
      const liveIds = restored.orders.map((o) => o.id).sort().join(',');
      const backupIds = exportedState.orders.map((o) => o.id).sort().join(',');
      if (liveIds !== backupIds) throw new Error('import restored different order ids');
    });

    await check('invalid JSON import is rejected without data loss', async () => {
      const badFile = path.join(ARTIFACTS, 'invalid-backup.json');
      fs.writeFileSync(badFile, '{ this is not valid json ', 'utf8');
      const before = await page.evaluate('window.TradeDocs.store.getState().orders.length');
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("#import-file")', { timeout: 10000 });
      await page.setFileInput('#import-file', badFile);
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => /JSON|解析|结构|失败|错误/.test(e.textContent))`, {
        timeout: 8000,
        label: 'invalid import toast'
      });
      await sleep(250);
      const after = await page.evaluate('window.TradeDocs.store.getState().orders.length');
      if (after !== before) throw new Error(`orders changed on invalid import: ${before} -> ${after}`);
    });

    await check('clearAll empties all data, shows empty states and persists across reload', async () => {
      page.clearErrors();
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("[data-action=\'clear-all\']")', { timeout: 10000 });
      await page.click('[data-action="clear-all"]');
      await page.waitUntil('document.querySelectorAll("#modal-root *").length > 0', { timeout: 5000, label: 'clear-all modal' });
      await page.click('[data-action="modal-confirm"]');
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => e.textContent.includes('所有数据已清空'))`, {
        timeout: 8000,
        label: 'clear-all toast'
      });
      await sleep(400);
      const cleared = await page.evaluate('window.TradeDocs.store.getState()');
      if (cleared.orders.length !== 0 || cleared.customers.length !== 0 || cleared.products.length !== 0) {
        throw new Error(`after clearAll: orders=${cleared.orders.length} customers=${cleared.customers.length} products=${cleared.products.length}`);
      }
      if (await page.exists('.doc-sheet')) throw new Error('doc sheets still rendered after clearAll');
      // Empty states on key pages
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      await sleep(250);
      const dashInfo = await page.evaluate(`(() => ({
        text: document.querySelector('#view-inner').innerText,
        orderRows: document.querySelectorAll('[data-order-id]').length
      }))()`);
      if (dashInfo.orderRows !== 0) throw new Error(`dashboard still lists ${dashInfo.orderRows} orders after clearAll`);
      if (!dashInfo.text.includes('0')) throw new Error('dashboard does not show zero KPI values after clearAll');
      const dashOrders = await page.evaluate('document.querySelectorAll("[data-doc-type]").length');
      if (dashOrders !== 12) throw new Error('dashboard doc cards missing after clearAll');
      await page.evaluate('window.TradeDocs.app.navigate("#/orders")');
      await sleep(250);
      const ordersText = await page.evaluate('document.querySelector("#view-inner").innerText');
      if (!/暂无|还没有|空|无订单|0\s*票/.test(ordersText)) throw new Error('orders empty state missing');
      await page.evaluate('window.TradeDocs.app.navigate("#/customers")');
      await sleep(250);
      if (!/暂无|还没有|空|无客户/.test(await page.evaluate('document.querySelector("#view-inner").innerText'))) throw new Error('customers empty state missing');
      await page.evaluate('window.TradeDocs.app.navigate("#/products")');
      await sleep(250);
      if (!/暂无|还没有|空|无产品/.test(await page.evaluate('document.querySelector("#view-inner").innerText'))) throw new Error('products empty state missing');
      // persists across reload
      await page.reload({ timeout: 30000 });
      await page.waitForApp({ timeout: 20000 });
      const reloaded = await page.evaluate('window.TradeDocs.store.getState()');
      if (reloaded.orders.length !== 0) throw new Error(`clearAll not persisted: ${reloaded.orders.length} orders after reload`);
      if (page.errors().length) throw new Error(`console/page errors after clearAll:\n       ${formatErrors(page)}`);
    });

    await check('resetDemo restores the demo dataset and persists across reload', async () => {
      page.clearErrors();
      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("[data-action=\'reset-demo\']")', { timeout: 10000 });
      await page.click('[data-action="reset-demo"]');
      await page.waitUntil('document.querySelectorAll("#modal-root *").length > 0', { timeout: 5000, label: 'reset-demo modal' });
      await page.click('[data-action="modal-confirm"]');
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => e.textContent.includes('已恢复演示数据'))`, {
        timeout: 8000,
        label: 'reset-demo toast'
      });
      await sleep(400);
      await page.reload({ timeout: 30000 });
      await page.waitForApp({ timeout: 20000 });
      const state = await page.evaluate('window.TradeDocs.store.getState()');
      if (state.orders.length !== 3 || state.customers.length !== 4 || state.products.length !== 8) {
        throw new Error(`resetDemo state: orders=${state.orders.length} customers=${state.customers.length} products=${state.products.length}`);
      }
      if (!state.settings.company.signer || state.settings.company.signer === 'QA Tester') {
        throw new Error('resetDemo did not restore demo settings');
      }
      const cards = await page.evaluate('document.querySelectorAll("[data-doc-type]").length');
      if (cards !== 12) throw new Error('dashboard cards missing after resetDemo');
      if (page.errors().length) throw new Error(`console/page errors after resetDemo:\n       ${formatErrors(page)}`);
    });

    /* -------------------------------------------------------------- */
    group('G. Responsive / mobile / scroll affordances');
    /* -------------------------------------------------------------- */

    const VIEWPORTS = [
      { width: 1440, height: 900, mobile: false },
      { width: 1024, height: 768, mobile: false },
      { width: 768, height: 1024, mobile: false },
      { width: 390, height: 844, mobile: true }
    ];

    await check('page-level horizontal overflow absent at 1440/1024/768/390 on dashboard/orders/editor/settings/preview', async () => {
      for (const vp of VIEWPORTS) {
        await page.setViewport(vp.width, vp.height, { mobile: vp.mobile });
        const routes = ['#/dashboard', '#/orders', '#/customers', '#/products', '#/settings', '#/help'];
        for (const route of routes) {
          await page.evaluate(`window.TradeDocs.app.navigate(${JSON.stringify(route)})`);
          await sleep(180);
          const metrics = await page.layoutMetrics();
          if (metrics.docScrollWidth > metrics.innerWidth + 1) {
            throw new Error(`${route} @${vp.width}: overflow ${metrics.docScrollWidth} > ${metrics.innerWidth}`);
          }
        }
        await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(demoOrderId)}))`);
        await sleep(250);
        let metrics = await page.layoutMetrics();
        if (metrics.docScrollWidth > metrics.innerWidth + 1) throw new Error(`editor @${vp.width}: overflow ${metrics.docScrollWidth} > ${metrics.innerWidth}`);
        await page.evaluate(`window.TradeDocs.app.navigate('#/preview/' + encodeURIComponent(${JSON.stringify(demoOrderId)}))`);
        await page.waitUntil('document.querySelectorAll(".doc-sheet").length >= 1', { timeout: 12000 });
        await sleep(250);
        metrics = await page.layoutMetrics();
        if (metrics.docScrollWidth > metrics.innerWidth + 1) throw new Error(`preview @${vp.width}: page overflow ${metrics.docScrollWidth} > ${metrics.innerWidth}`);
      }
      await page.setViewport(1440, 900);
    });

    await check('mobile 390: A4 preview swipes horizontally inside its container (page does not overflow)', async () => {
      await page.setViewport(390, 844, { mobile: true });
      await page.evaluate(`window.TradeDocs.app.navigate('#/preview/' + encodeURIComponent(${JSON.stringify(demoOrderId)}))`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length >= 1', { timeout: 12000 });
      await sleep(300);
      const scroll = await page.evaluate(`(() => {
        const candidates = ['.preview-canvas', '.preview-sheets', '#preview-sheets', '.preview-sheet'];
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const cs = getComputedStyle(el);
          if (el.scrollWidth > el.clientWidth + 1 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) {
            el.scrollLeft = 9999;
            return { sel, overflowX: cs.overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrolledTo: el.scrollLeft };
          }
        }
        const first = document.querySelector('.doc-sheet');
        return { sel: null, docScrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, sheetWidth: first ? first.getBoundingClientRect().width : null };
      })()`);
      if (!scroll.sel) throw new Error(`no horizontally scrollable preview container found: ${JSON.stringify(scroll)}`);
      if (!(scroll.scrolledTo > 0)) throw new Error(`preview container did not scroll horizontally (scrollLeft=${scroll.scrolledTo})`);
      await page.setViewport(1440, 900);
    });

    await check('mobile 390: sidebar becomes an off-canvas drawer opened by menu button and closed by Esc', async () => {
      await page.setViewport(390, 844, { mobile: true });
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      // Wait for the off-canvas transform transition to settle before measuring.
      await page.waitUntil(`(() => {
        const el = document.querySelector('.sidebar');
        if (!el) return false;
        return !document.body.classList.contains('sidebar-open') && el.getBoundingClientRect().right <= 1;
      })()`, { timeout: 5000, label: 'sidebar settled off-canvas' });
      const closed = await page.evaluate(`(() => {
        const el = document.querySelector('.sidebar');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, bodyOpen: document.body.classList.contains('sidebar-open') };
      })()`);
      if (!closed) throw new Error('.sidebar missing');
      if (closed.bodyOpen) throw new Error('sidebar drawer open on mobile before toggling');
      if (closed.right > 1) throw new Error(`sidebar not off-canvas on mobile: ${JSON.stringify(closed)}`);
      await page.click('[data-action="toggle-sidebar"]');
      await page.waitUntil(`(() => {
        const el = document.querySelector('.sidebar');
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return document.body.classList.contains('sidebar-open') && r.left >= -1 && r.right > 200;
      })()`, { timeout: 5000, label: 'sidebar drawer open transition' });
      const opened = await page.evaluate(`(() => {
        const el = document.querySelector('.sidebar');
        const r = el.getBoundingClientRect();
        const btn = document.querySelector('[data-action="toggle-sidebar"]');
        return { left: r.left, right: r.right, width: r.width, bodyOpen: document.body.classList.contains('sidebar-open'), expanded: btn ? btn.getAttribute('aria-expanded') : null };
      })()`);
      if (!opened.bodyOpen) throw new Error(`sidebar drawer did not open (body.sidebar-open missing): ${JSON.stringify(opened)}`);
      if (!(opened.right > 2 && opened.left < 390)) throw new Error(`sidebar drawer not on-screen: ${JSON.stringify(opened)}`);
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
      await page.waitUntil(`(() => {
        const el = document.querySelector('.sidebar');
        return !document.body.classList.contains('sidebar-open') && (!el || el.getBoundingClientRect().right <= 1);
      })()`, { timeout: 5000, label: 'sidebar drawer close transition' });
      const closedAgain = await page.evaluate(`(() => ({ bodyOpen: document.body.classList.contains('sidebar-open'), right: document.querySelector('.sidebar').getBoundingClientRect().right }))()`);
      if (closedAgain.bodyOpen || closedAgain.right > 1) throw new Error(`sidebar did not close on Esc: ${JSON.stringify(closedAgain)}`);
      await page.setViewport(1440, 900);
    });

    await check('item table (14 cols) has horizontal scroll affordance + hint at 1440/1024/768/390', async () => {
      for (const vp of VIEWPORTS) {
        await page.setViewport(vp.width, vp.height, { mobile: vp.mobile });
        await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(demoOrderId)}))`);
        await page.waitUntil('!!document.querySelector("#items-area")', { timeout: 10000 });
        await sleep(300);
        const info = await page.evaluate(`(() => {
          const wrap = document.querySelector('.items-wrap');
          const hint = document.querySelector('.picker-hint');
          if (!wrap) return { error: 'items-wrap missing' };
          const cs = getComputedStyle(wrap);
          wrap.scrollLeft = 99999;
          return {
            overflowX: cs.overflowX,
            scrollWidth: wrap.scrollWidth,
            clientWidth: wrap.clientWidth,
            scrolledTo: wrap.scrollLeft,
            hint: hint ? hint.textContent.trim() : '',
            cols: wrap.querySelectorAll('thead th').length
          };
        })()`);
        if (info.error) throw new Error(info.error);
        if (!(info.scrollWidth > info.clientWidth + 1)) throw new Error(`@${vp.width}: items table does not overflow (scrollWidth ${info.scrollWidth} <= clientWidth ${info.clientWidth})`);
        if (!(info.scrolledTo > 0)) throw new Error(`@${vp.width}: items table cannot scroll horizontally`);
        if (!/左右滚动|横向/.test(info.hint)) throw new Error(`@${vp.width}: horizontal scroll hint missing (hint="${info.hint}")`);
        if (info.cols < 10) throw new Error(`@${vp.width}: item table columns = ${info.cols}`);
        const metrics = await page.layoutMetrics();
        if (metrics.docScrollWidth > metrics.innerWidth + 1) throw new Error(`@${vp.width}: editor page overflows due to item table`);
      }
      await page.setViewport(1440, 900);
    });

    await check('all 12 doc tabs reachable and clickable at 1440/1024/768/390', async () => {
      for (const vp of VIEWPORTS) {
        await page.setViewport(vp.width, vp.height, { mobile: vp.mobile });
        await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demoOrderId)}, ${JSON.stringify({ print: { selected: ['ci', 'pl', 'sc', 'co'] } })})`);
        await page.evaluate(`window.TradeDocs.app.navigate('#/preview/' + encodeURIComponent(${JSON.stringify(demoOrderId)}))`);
        await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 4', { timeout: 12000 });
        await sleep(300);
        const tabInfo = await page.evaluate(`(() => {
          const tabs = Array.from(document.querySelectorAll('[data-doc-tab]'));
          const bar = document.querySelector('.doc-tabs');
          const cs = bar ? getComputedStyle(bar) : null;
          return {
            count: tabs.length,
            sizes: tabs.map((el) => { const r = el.getBoundingClientRect(); return { key: el.getAttribute('data-doc-tab'), w: Math.round(r.width), h: Math.round(r.height) }; }),
            barOverflow: cs ? cs.overflowX : null,
            barScrollable: bar ? bar.scrollWidth > bar.clientWidth + 1 : false
          };
        })()`);
        if (tabInfo.count !== 12) throw new Error(`@${vp.width}: doc tabs = ${tabInfo.count}`);
        if (tabInfo.sizes.some((s) => s.w <= 0 || s.h <= 0)) throw new Error(`@${vp.width}: zero-sized tab ${JSON.stringify(tabInfo.sizes.filter((s) => s.w <= 0 || s.h <= 0))}`);
        if (vp.width <= 760) {
          if (tabInfo.barOverflow !== 'auto' && tabInfo.barOverflow !== 'scroll') throw new Error(`@${vp.width}: doc-tabs overflow-x = ${tabInfo.barOverflow}`);
          if (!tabInfo.barScrollable) throw new Error(`@${vp.width}: doc-tabs not horizontally scrollable`);
        }
        // click the last tab: adds CS to the preview
        await page.evaluate(`(() => { const el = document.querySelector('[data-doc-tab="cs"]'); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); el.click(); })()`);
        await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 5', { timeout: 12000, label: `@${vp.width}: cs tab click adds sheet` });
        const csActive = await page.evaluate(`document.querySelector('[data-doc-tab="cs"]').getAttribute('aria-selected')`);
        if (csActive !== 'true') throw new Error(`@${vp.width}: cs tab aria-selected = ${csActive}`);
        await page.evaluate(`document.querySelector('[data-doc-tab="cs"] .doc-tab-x').click()`);
        await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 4', { timeout: 12000, label: `@${vp.width}: cs removed` });
      }
      await page.setViewport(1440, 900);
      await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demoOrderId)}, ${JSON.stringify({ print: { selected: ['ci', 'pl', 'sc', 'co'] } })})`);
    });

    await check('mobile dashboard screenshot (390x844) + no console errors during responsive sweep', async () => {
      await page.setViewport(390, 844, { mobile: true });
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      await sleep(400);
      const shot = await page.screenshot(path.join(SCREENSHOTS, 'mobile-dashboard.png'));
      const buf = fs.readFileSync(shot.path);
      if (!looksLikePng(buf)) throw new Error('mobile-dashboard.png is not a PNG');
      if (shot.bytes < 8000) throw new Error(`mobile-dashboard.png too small (${shot.bytes}B)`);
      note(`screenshot: screenshots/mobile-dashboard.png (${shot.bytes}B)`);
      if (page.errors().length) throw new Error(`console/page errors during responsive sweep:\n       ${formatErrors(page)}`);
      await page.setViewport(1440, 900);
    });

    /* -------------------------------------------------------------- */
    group('I. v1.1 smart recognition (智能填单)');
    /* -------------------------------------------------------------- */

    const RECOG_TEXT = '[data-testid="recognize-text"]';
    const RECOG_INPUT = '[data-testid="recognize-input"]';
    const SAMPLES_REC = path.join(ROOT, 'samples', '智能识别示例');
    const recResults = {};

    async function openRecognitionFromEditor(orderId) {
      await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(orderId)}))`);
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000, label: 'editor for recognition' });
      await page.waitUntil('!!document.querySelector(\'[data-testid="recognize-open"]\')', { timeout: 10000, label: 'recognize-open' });
      await page.click('[data-testid="recognize-open"]');
      await page.waitUntil('!!document.querySelector("#recognize-modal")', { timeout: 10000, label: 'recognize modal' });
      await page.waitUntil('!!document.querySelector(\'[data-testid="recognize-source"]\')', { timeout: 10000, label: 'recognition source step' });
    }
    async function loadSampleAndRecognize() {
      await page.click('[data-testid="recognize-sample"]');
      await sleep(150);
      await page.click('[data-testid="recognize-run"]');
      await page.waitUntil('!!document.querySelector(\'[data-testid="recognize-result"]\')', { timeout: 20000, label: 'recognition result step' });
      await sleep(250);
    }
    async function readRecognitionReview() {
      return page.evaluate(`(() => {
        const host = document.querySelector('#recognize-modal');
        const statTexts = Array.from(host.querySelectorAll('.rec-stat')).map((el) => el.textContent.replace(/\\s+/g, ' ').trim());
        const stats = {};
        statTexts.forEach((text) => {
          const match = text.match(/^(.*?)\\s+([\\d,]+)/);
          if (match) stats[match[1].trim()] = Number(match[2].replace(/,/g, ''));
        });
        const fieldValue = (path) => {
          const el = host.querySelector('[data-recognized-field="' + path + '"]');
          return el ? String(el.value) : null;
        };
        return {
          statTexts,
          stats,
          fieldCount: host.querySelectorAll('[data-recognized-field]').length,
          itemCount: host.querySelectorAll('[data-recognize-item]').length,
          itemFirstText: (host.querySelector('[data-recognize-item="0"]') || {}).innerText || '',
          buyer: fieldValue('buyer.nameEn'),
          etd: fieldValue('etd'),
          eta: fieldValue('eta'),
          incoterm: fieldValue('incoterm'),
          portOfLoading: fieldValue('portOfLoading'),
          portOfDischarge: fieldValue('portOfDischarge'),
          warningCount: host.querySelectorAll('.rec-warning').length,
          confidenceBadges: host.querySelectorAll('.rec-conf').length,
          hasOptions: !!host.querySelector('[data-recognize-option="overwrite"]') && !!host.querySelector('[data-recognize-option="itemsMode"]'),
          hasApply: !!document.querySelector('[data-testid="recognize-apply"]'),
          hasApplyNew: !!document.querySelector('[data-testid="recognize-apply-new"]')
        };
      })()`);
    }
    async function closeRecognition() {
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
      await page.waitUntil('!document.querySelector("#recognize-modal")', { timeout: 8000, label: 'recognition modal closed' });
      await sleep(150);
    }

    await check('recognize entry opens the modal with source step, privacy note and supported formats (§13.5)', async () => {
      await page.setViewport(1440, 900);
      page.clearErrors();
      await openRecognitionFromEditor(demoOrderId);
      const info = await page.evaluate(`(() => {
        const host = document.querySelector('#recognize-modal');
        const input = host.querySelector('${RECOG_INPUT}');
        return {
          title: (document.querySelector('.modal-title') || {}).textContent || '',
          privacy: host.innerText.includes('本地解析 · 文件不会上传'),
          accept: input ? input.getAttribute('accept') : null,
          multiple: input ? input.multiple : false,
          hasSample: !!host.querySelector('[data-testid="recognize-sample"]'),
          hasText: !!host.querySelector('${RECOG_TEXT}'),
          hasRun: !!document.querySelector('[data-testid="recognize-run"]'),
          dropHint: (host.querySelector('.rec-drop-hint') || {}).innerText || '',
          hasModalRoot: !!document.querySelector('#modal-root .modal')
        };
      })()`);
      assert.equal(info.title.trim(), '智能填单');
      assert.ok(info.privacy, 'privacy note "文件不会上传" missing');
      assert.equal(info.accept, '.txt,.md,.csv,.tsv,.json,.docx,.xlsx');
      assert.ok(info.multiple, 'file input must allow multiple files');
      assert.ok(info.hasSample && info.hasText && info.hasRun);
      assert.ok(info.hasModalRoot);
      assert.ok(/10\.00 MB|10 MB/.test(info.dropHint), `drop hint should show size limit: ${info.dropHint}`);
      await sleep(150);
      const shot = await page.screenshot(path.join(SCREENSHOTS, 'recognize-source.png'));
      note(`screenshot: screenshots/recognize-source.png (${shot.bytes}B)`);
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('"载入示例" fills the textarea and char counter (SAMPLE_TEXT)', async () => {
      await page.click('[data-testid="recognize-sample"]');
      await sleep(250);
      const info = await page.evaluate(`(() => {
        const ta = document.querySelector('${RECOG_TEXT}');
        const counter = document.querySelector('#recognize-char-count');
        return { length: ta ? ta.value.length : 0, hasBuyer: ta ? ta.value.includes('ATLANTIC HOME GOODS LLC') : false, counter: counter ? counter.innerText : '' };
      })()`);
      const sampleLength = await page.evaluate('window.TradeDocs.recognize.SAMPLE_TEXT.length');
      assert.equal(info.length, sampleLength);
      assert.ok(info.hasBuyer);
      assert.match(info.counter, /2,006\s*\/\s*300,000/);
    });

    await check('recognize sample → review shows 32 fields / 4 items incl. ETD/ETA, confidence and stats', async () => {
      await page.click('[data-testid="recognize-run"]');
      await page.waitUntil('!!document.querySelector(\'[data-testid="recognize-result"]\')', { timeout: 20000 });
      await sleep(300);
      const review = await readRecognitionReview();
      recResults.sampleReview = review;
      assert.equal(review.stats['字段'], 32, `stats 字段 = ${review.stats['字段']}`);
      assert.equal(review.stats['货物'], 4, `stats 货物 = ${review.stats['货物']}`);
      assert.equal(review.stats['来源'], 1, `stats 来源 = ${review.stats['来源']}`);
      assert.ok(review.stats['字符'] >= 2000, `stats 字符 = ${review.stats['字符']}`);
      assert.ok(review.fieldCount >= 30, `review field inputs = ${review.fieldCount}`);
      assert.equal(review.itemCount, 4);
      assert.ok(review.itemFirstText.includes('Ceramic Mug 12 oz'));
      assert.equal(review.buyer, 'ATLANTIC HOME GOODS LLC');
      assert.equal(review.etd, '2026-12-10');
      assert.equal(review.eta, '2026-12-24');
      assert.equal(review.incoterm, 'CIF');
      assert.ok(review.portOfLoading.includes('NINGBO'));
      assert.ok(review.portOfDischarge.includes('LOS ANGELES'));
      assert.equal(review.warningCount, 0, `unexpected warnings: ${JSON.stringify(review.statTexts)}`);
      assert.ok(review.confidenceBadges >= 20, `confidence badges = ${review.confidenceBadges}`);
      assert.ok(review.hasOptions, 'overwrite/itemsMode options missing');
      assert.ok(review.hasApply && review.hasApplyNew, 'apply buttons missing');
      const shot = await page.screenshot(path.join(SCREENSHOTS, 'recognize-result.png'));
      note(`screenshot: screenshots/recognize-result.png (${shot.bytes}B)`);
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('apply to current order: edited value wins, fields+items+totals+words persisted after reload', async () => {
      await closeRecognition();
      const created = await page.evaluate(`(() => {
        const order = window.TradeDocs.test.createOrder({ items: [], buyer: {}, charges: {} });
        return { id: order.id };
      })()`);
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000 });
      await openRecognitionFromEditor(created.id);
      await loadSampleAndRecognize();
      await page.evaluate(`(() => {
        const el = document.querySelector('[data-recognized-field="buyer.nameEn"]');
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
        setter.call(el, 'QA RECOGNIZED BUYER LLC');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await page.click('[data-testid="recognize-apply"]');
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => e.textContent.includes('智能填单已应用识别结果'))`, {
        timeout: 10000,
        label: 'recognition apply toast'
      });
      await sleep(700);
      const applied = await page.evaluate(`(() => {
        const state = window.TradeDocs.store.getState();
        const order = state.orders.find((o) => o.id === ${JSON.stringify(created.id)}) || state.orders[0];
        return {
          modalGone: !document.querySelector('#recognize-modal'),
          hash: location.hash,
          buyer: order.buyer.nameEn,
          buyerCountry: order.buyer.country,
          etd: order.etd,
          eta: order.eta,
          incoterm: order.incoterm,
          currency: order.currency,
          portOfLoading: order.portOfLoading,
          portOfDischarge: order.portOfDischarge,
          cargoSelected: Array.isArray(order.items) ? order.items.length : 0,
          itemIds: (order.items || []).map((item) => item.id),
          itemDefaults: (order.items || []).every((item) => item.productId === '' && item.costPrice === 0 && typeof item.origin === 'string'),
          docMeta: order.docMeta,
          editorTotal: (document.querySelector('[data-charges-total]') || {}).textContent,
          summaryText: (document.querySelector('#summary-body') || {}).textContent || ''
        };
      })()`);
      assert.ok(applied.modalGone, 'modal should close after apply');
      assert.equal(applied.buyer, 'QA RECOGNIZED BUYER LLC', 'edited review value must win on apply');
      assert.equal(applied.buyerCountry, 'UNITED STATES');
      assert.equal(applied.etd, '2026-12-10');
      assert.equal(applied.eta, '2026-12-24');
      // default mode is "仅填充空白字段": the order's existing default incoterm (FOB) is kept.
      assert.equal(applied.incoterm, 'FOB', 'fill-empty must keep existing default incoterm');
      assert.equal(applied.currency, 'USD');
      assert.ok(applied.portOfLoading.includes('NINGBO'));
      assert.ok(applied.portOfDischarge.includes('LOS ANGELES'));
      assert.equal(applied.cargoSelected, 4);
      assert.ok(applied.itemIds.every((id) => /^item_/.test(id)), `item ids: ${JSON.stringify(applied.itemIds)}`);
      assert.ok(applied.itemDefaults, 'recognized items missing productId/costPrice/origin defaults');
      assert.deepEqual(applied.docMeta, {}, 'apply must not touch docMeta');
      assert.equal(applied.editorTotal, 'USD 30,910.00', `editor total = ${applied.editorTotal}`);
      assert.ok(applied.summaryText.includes('THIRTY THOUSAND NINE HUNDRED AND TEN'), 'amount words not synced in summary');
      // persistence across reload
      await page.reload({ timeout: 30000 });
      await page.waitForApp({ timeout: 20000 });
      const persisted = await page.evaluate(`(() => {
        const order = window.TradeDocs.test.getOrder(${JSON.stringify(created.id)});
        return order ? { buyer: order.buyer.nameEn, etd: order.etd, eta: order.eta, items: order.items.length } : null;
      })()`);
      assert.ok(persisted, 'recognized order lost after reload');
      assert.equal(persisted.buyer, 'QA RECOGNIZED BUYER LLC');
      assert.equal(persisted.etd, '2026-12-10');
      assert.equal(persisted.items, 4);
      await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(created.id)}))`);
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000 });
      await sleep(250);
      const shot = await page.screenshot(path.join(SCREENSHOTS, 'recognize-applied.png'), { fullPage: true });
      note(`screenshot: screenshots/recognize-applied.png (${shot.bytes}B)`);
    });

    await check('create-new flow from dashboard "识别建单" creates exactly ONE order (auto draft cleaned)', async () => {
      page.clearErrors();
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      await sleep(250);
      const before = await page.evaluate(`(() => {
        const state = window.TradeDocs.store.getState();
        return { count: state.orders.length, ids: state.orders.map((o) => o.id) };
      })()`);
      await page.click('[data-testid="recognize-open-new"]');
      await page.waitUntil('!!document.querySelector("#recognize-modal")', { timeout: 15000, label: 'recognize modal from dashboard' });
      await loadSampleAndRecognize();
      await page.click('[data-testid="recognize-apply-new"]');
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => e.textContent.includes('已创建新订单并应用'))`, {
        timeout: 10000,
        label: 'apply-new toast'
      });
      await sleep(700);
      const created = await page.evaluate(`(() => {
        const state = window.TradeDocs.store.getState();
        const beforeIds = ${JSON.stringify(before.ids)};
        const newOrders = state.orders.filter((o) => beforeIds.indexOf(o.id) < 0);
        const applied = newOrders[0];
        const ghost = state.orders.filter((o) => beforeIds.indexOf(o.id) < 0 && (!o.buyer || !o.buyer.nameEn) && !(o.items || []).length);
        return {
          orders: state.orders.length,
          hash: location.hash,
          modalGone: !document.querySelector('#recognize-modal'),
          newIds: newOrders.map((o) => o.id),
          id: applied ? applied.id : null,
          buyer: applied ? applied.buyer.nameEn : null,
          etd: applied ? applied.etd : null,
          eta: applied ? applied.eta : null,
          items: applied ? applied.items.length : 0,
          no: applied ? applied.no : null,
          ghostDrafts: ghost.map((o) => ({ id: o.id, no: o.no }))
        };
      })()`);
      assert.equal(created.orders, before.count + 1, `QA-R02 fixed: expected +1 order, got +${created.orders - before.count}`);
      assert.equal(created.newIds.length, 1, `expected exactly 1 new order, got ${JSON.stringify(created.newIds)}`);
      assert.equal(created.ghostDrafts.length, 0, `QA-R02 fixed: leftover ghost drafts ${JSON.stringify(created.ghostDrafts)}`);
      assert.ok(created.hash.includes(created.id), `hash ${created.hash} should target ${created.id}`);
      assert.ok(created.modalGone);
      assert.equal(created.buyer, 'ATLANTIC HOME GOODS LLC');
      assert.equal(created.etd, '2026-12-10');
      assert.equal(created.eta, '2026-12-24');
      assert.equal(created.items, 4);
      assert.ok(/^SO-/.test(created.no), `new order no = ${created.no}`);
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('entry "识别建单" cancel deletes the auto draft, adds 0 orders and returns to origin route', async () => {
      page.clearErrors();
      // dashboard entry → Escape
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      await sleep(250);
      let before = await page.evaluate(`(() => { const s = window.TradeDocs.store.getState(); return { ids: s.orders.map((o) => o.id), hash: location.hash }; })()`);
      await page.click('[data-testid="recognize-open-new"]');
      await page.waitUntil('!!document.querySelector("#recognize-modal")', { timeout: 15000 });
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
      await page.waitUntil('!document.querySelector("#recognize-modal")', { timeout: 10000 });
      await page.waitUntil('location.hash === "#/dashboard"', { timeout: 10000, label: 'back to dashboard after cancel' });
      let after = await page.evaluate(`(() => ({ ids: window.TradeDocs.store.getState().orders.map((o) => o.id), hash: location.hash }))()`);
      assert.deepEqual(after.ids, before.ids, 'dashboard entry cancel must not create/delete orders');
      assert.equal(after.hash, '#/dashboard');

      // orders list entry → footer Cancel
      await page.evaluate('window.TradeDocs.app.navigate("#/orders")');
      await sleep(250);
      before = await page.evaluate(`(() => { const s = window.TradeDocs.store.getState(); return { ids: s.orders.map((o) => o.id), hash: location.hash }; })()`);
      await page.click('[data-testid="recognize-open-new"]');
      await page.waitUntil('!!document.querySelector("#recognize-modal")', { timeout: 15000 });
      await page.evaluate(`(() => { const btn = document.querySelector('.modal-foot [data-action="close-modal"]'); if (btn) btn.click(); })()`);
      await page.waitUntil('!document.querySelector("#recognize-modal")', { timeout: 10000 });
      await page.waitUntil('location.hash === "#/orders"', { timeout: 10000, label: 'back to orders after cancel' });
      after = await page.evaluate(`(() => ({ ids: window.TradeDocs.store.getState().orders.map((o) => o.id), hash: location.hash }))()`);
      assert.deepEqual(after.ids, before.ids, 'orders entry cancel must not create/delete orders');
      assert.equal(after.hash, '#/orders');
      assert.equal(after.ids.filter((id) => !before.ids.includes(id)).length, 0, 'no ghost order after entry cancel');
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('entry "识别建单" apply-current reuses the auto draft: +1 order, populated, no ghost', async () => {
      page.clearErrors();
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      await sleep(250);
      const before = await page.evaluate(`(() => { const s = window.TradeDocs.store.getState(); return { ids: s.orders.map((o) => o.id) }; })()`);
      await page.click('[data-testid="recognize-open-new"]');
      await page.waitUntil('!!document.querySelector("#recognize-modal")', { timeout: 15000 });
      await loadSampleAndRecognize();
      await page.click('[data-testid="recognize-apply"]');
      await page.waitUntil(`Array.from(document.querySelectorAll('[data-testid="toast"]')).some((e) => e.textContent.includes('智能填单已应用识别结果'))`, {
        timeout: 10000,
        label: 'entry apply-current toast'
      });
      await sleep(700);
      const info = await page.evaluate(`(() => {
        const state = window.TradeDocs.store.getState();
        const beforeIds = ${JSON.stringify(before.ids)};
        const newOrders = state.orders.filter((o) => beforeIds.indexOf(o.id) < 0);
        const applied = newOrders[0];
        return {
          orders: state.orders.length,
          newIds: newOrders.map((o) => o.id),
          hash: location.hash,
          buyer: applied ? applied.buyer.nameEn : null,
          items: applied ? applied.items.length : 0,
          ghost: newOrders.filter((o) => (!o.buyer || !o.buyer.nameEn) && !(o.items || []).length).length
        };
      })()`);
      assert.equal(info.orders, before.ids.length + 1, `expected +1 order, got +${info.orders - before.ids.length}`);
      assert.equal(info.newIds.length, 1);
      assert.equal(info.ghost, 0, 'entry apply-current must not leave a ghost draft');
      assert.equal(info.buyer, 'ATLANTIC HOME GOODS LLC');
      assert.equal(info.items, 4);
      assert.ok(info.hash.includes(info.newIds[0]), 'should navigate to the applied order');
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('real file uploads via UI: TXT + CSV (CDP DOM.setFileInputFiles)', async () => {
      const cases = [
        { name: 'order-sample.txt', path: path.join(FIX_REC, 'text', 'order-sample.txt'), expectItems: 2, minFields: 20, expectBuyer: 'PACIFIC TRADING CO., LTD.' },
        { name: 'items-sample.csv', path: path.join(FIX_REC, 'text', 'items-sample.csv'), expectItems: 3, minFields: 0, expectBuyer: null }
      ];
      for (const item of cases) {
        await openRecognitionFromEditor(demoOrderId);
        await page.setFileInput(RECOG_INPUT, item.path);
        await page.waitUntil('document.querySelectorAll(".rec-file").length === 1', { timeout: 10000, label: `${item.name} chip` });
        await page.click('[data-testid="recognize-run"]');
        await page.waitUntil('!!document.querySelector(\'[data-testid="recognize-result"]\')', { timeout: 20000, label: `${item.name} result` });
        await sleep(250);
        const review = await readRecognitionReview();
        assert.equal(review.stats['来源'], 1, `${item.name}: 来源 = ${review.stats['来源']}`);
        assert.ok(review.stats['字符'] > 200, `${item.name}: chars = ${review.stats['字符']}`);
        assert.equal(review.itemCount, item.expectItems, `${item.name}: items = ${review.itemCount}`);
        if (item.minFields) assert.ok(review.fieldCount >= item.minFields, `${item.name}: fields = ${review.fieldCount}`);
        if (item.expectBuyer) assert.equal(review.buyer, item.expectBuyer);
        await closeRecognition();
      }
      if (page.errors().length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('Lead sample DOCX/XLSX uploads parse metadata + 4 items (real-world samples)', async () => {
      const docx = path.join(SAMPLES_REC, '示例-供应商形式发票.docx');
      const xlsx = path.join(SAMPLES_REC, '示例-供应商形式发票.xlsx');
      for (const samplePath of [docx, xlsx]) {
        assert.ok(fs.existsSync(samplePath), `sample missing: ${samplePath}`);
        await openRecognitionFromEditor(demoOrderId);
        await page.setFileInput(RECOG_INPUT, samplePath);
        await page.waitUntil('document.querySelectorAll(".rec-file").length === 1', { timeout: 10000, label: `${path.basename(samplePath)} chip` });
        await page.click('[data-testid="recognize-run"]');
        await page.waitUntil('!!document.querySelector(\'[data-testid="recognize-result"]\')', { timeout: 20000, label: `${path.basename(samplePath)} result` });
        await sleep(300);
        const review = await readRecognitionReview();
        assert.equal(review.stats['来源'], 1);
        assert.ok(review.stats['字段'] >= 20, `${path.basename(samplePath)}: 字段 = ${review.stats['字段']}`);
        assert.equal(review.itemCount, 4, `${path.basename(samplePath)}: items = ${review.itemCount}`);
        assert.equal(review.buyer, 'PACIFIC RIM IMPORTS LLC');
        assert.ok(review.portOfLoading.includes('SHANGHAI'));
        assert.ok(review.portOfDischarge.includes('SYDNEY'));
        assert.equal(review.etd, '2026-12-18');
        assert.equal(review.eta, '2027-01-05');
        await closeRecognition();
      }
    });

    await check('Lead inquiry e-mail TXT upload surfaces buyer + ETD/ETA + items', async () => {
      const emailPath = path.join(SAMPLES_REC, '示例-客户询价邮件.txt');
      assert.ok(fs.existsSync(emailPath), 'inquiry email sample missing');
      await openRecognitionFromEditor(demoOrderId);
      await page.setFileInput(RECOG_INPUT, emailPath);
      await page.waitUntil('document.querySelectorAll(".rec-file").length === 1', { timeout: 10000 });
      await page.click('[data-testid="recognize-run"]');
      await page.waitUntil('!!document.querySelector(\'[data-testid="recognize-result"]\')', { timeout: 20000 });
      await sleep(250);
      const review = await readRecognitionReview();
      assert.equal(review.buyer, 'PACIFIC RIM IMPORTS LLC');
      assert.equal(review.etd, '2026-12-18');
      assert.equal(review.eta, '2027-01-05');
      assert.ok(review.itemCount >= 1, `email items = ${review.itemCount}`);
      await closeRecognition();
    });

    await check('unsupported image/PDF upload shows readable notice and adds no file (§13.1)', async () => {
      await openRecognitionFromEditor(demoOrderId);
      await page.setFileInput(RECOG_INPUT, path.join(FIX_REC, 'fake-image.png'));
      await page.waitUntil('document.querySelectorAll(".rec-notice").length >= 1', { timeout: 8000, label: 'unsupported notice' });
      let info = await page.evaluate(`(() => {
        const host = document.querySelector('#recognize-modal');
        return { notices: Array.from(host.querySelectorAll('.rec-notice')).map((el) => el.innerText.trim()), chips: host.querySelectorAll('.rec-file').length };
      })()`);
      assert.ok(info.notices.join(' ').includes('当前版本仅支持文字/文档'), `image notice: ${JSON.stringify(info.notices)}`);
      assert.equal(info.chips, 0, 'unsupported file must not be added');
      // PDF too
      await page.setFileInput(RECOG_INPUT, path.join(FIX_REC, 'fake-scan.pdf'));
      await sleep(400);
      info = await page.evaluate(`(() => {
        const host = document.querySelector('#recognize-modal');
        return { notices: Array.from(host.querySelectorAll('.rec-notice')).map((el) => el.innerText.trim()), chips: host.querySelectorAll('.rec-file').length };
      })()`);
      assert.ok(info.notices.join(' ').includes('仅支持文字/文档'), `pdf notice: ${JSON.stringify(info.notices)}`);
      assert.equal(info.chips, 0);
      await closeRecognition();
    });

    await check('combined paste + file recognition merges content and reports 来源=2 (QA-R01 fixed)', async () => {
      await openRecognitionFromEditor(demoOrderId);
      await page.fill(RECOG_TEXT, 'Buyer: COMBINED PASTE BUYER LLC');
      await page.setFileInput(RECOG_INPUT, path.join(FIX_REC, 'text', 'items-sample.csv'));
      await page.waitUntil('document.querySelectorAll(".rec-file").length === 1', { timeout: 10000 });
      await page.click('[data-testid="recognize-run"]');
      await page.waitUntil('!!document.querySelector(\'[data-testid="recognize-result"]\')', { timeout: 20000 });
      await sleep(250);
      const review = await readRecognitionReview();
      // content from both sources must be merged
      assert.equal(review.buyer, 'COMBINED PASTE BUYER LLC', 'pasted text fields not merged');
      assert.equal(review.itemCount, 3, 'file table items not merged');
      assert.ok(review.stats['字符'] > 300 && review.stats['字符'] < 500, `combined chars = ${review.stats['字符']}`);
      // QA-R01 fixed: pasted text (1) + uploaded file (1) = 2 sources; chars merged.
      recResults.combinedSources = review.stats['来源'];
      assert.equal(review.stats['来源'], 2, `QA-R01 fixed: 来源 should be 2, got ${review.stats['来源']}`);
      note(`QA-R01 re-verified: combined paste+file stats: 来源=${review.stats['来源']}, 字符=${review.stats['字符']}`);
      await closeRecognition();
    });

    await check('cancel/Escape closes recognition without touching localStorage or orders', async () => {
      await openRecognitionFromEditor(demoOrderId);
      const before = await page.evaluate(`(() => ({ storage: localStorage.getItem('tradedocs.v1'), orders: window.TradeDocs.store.getState().orders.length }))()`);
      await loadSampleAndRecognize();
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
      await page.waitUntil('!document.querySelector("#recognize-modal")', { timeout: 8000 });
      await sleep(200);
      const after = await page.evaluate(`(() => ({ storage: localStorage.getItem('tradedocs.v1'), orders: window.TradeDocs.store.getState().orders.length }))()`);
      assert.equal(after.storage, before.storage, 'localStorage changed by cancelled recognition');
      assert.equal(after.orders, before.orders, 'orders changed by cancelled recognition');
    });

    await check('recognition modal fits 390×844 without page overflow', async () => {
      await page.setViewport(390, 844, { mobile: true });
      await openRecognitionFromEditor(demoOrderId);
      await sleep(250);
      const info = await page.evaluate(`(() => {
        const modal = document.querySelector('#modal-root .modal');
        const r = modal ? modal.getBoundingClientRect() : null;
        const overlay = document.querySelector('.modal-overlay');
        return {
          innerWidth: window.innerWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          modalRect: r ? { left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom } : null,
          overlayOverflowY: overlay ? getComputedStyle(overlay).overflowY : null,
          viewportHeight: window.innerHeight
        };
      })()`);
      assert.equal(info.docScrollWidth, info.innerWidth, `page overflow: ${info.docScrollWidth} > ${info.innerWidth}`);
      assert.ok(info.modalRect, 'modal missing');
      assert.ok(info.modalRect.left >= 0 && info.modalRect.right <= info.innerWidth + 1, `modal outside viewport: ${JSON.stringify(info.modalRect)}`);
      assert.ok(info.modalRect.bottom <= info.viewportHeight + 2, `modal taller than viewport: ${JSON.stringify(info.modalRect)}`);
      const shot = await page.screenshot(path.join(SCREENSHOTS, 'recognize-mobile.png'));
      note(`screenshot: screenshots/recognize-mobile.png (${shot.bytes}B)`);
      await closeRecognition();
      await page.setViewport(1440, 900);
      if (page.errors().length) throw new Error(`console/page errors during recognition flows:\n       ${formatErrors(page)}`);
    });

    /* -------------------------------------------------------------- */
    group('H. Final deliverable screenshots + PDF artifacts (demo data)');
    /* -------------------------------------------------------------- */

    await check('deliverable screenshots re-captured on final demo data (dashboard/settings/editor + preview ci/pl/sc/cs)', async () => {
      await page.setViewport(1440, 900);
      // Ensure pristine demo dataset and demo selected docs.
      await page.evaluate('(window.TradeDocs.store.resetDemo(), true)');
      await page.evaluate('window.TradeDocs.app.navigate("#/dashboard")');
      await page.waitForApp({ timeout: 20000 }).catch(() => {});
      await page.waitUntil('document.querySelectorAll("[data-doc-type]").length === 12', { timeout: 10000 });
      await sleep(300);
      await page.evaluate('window.scrollTo(0, 0)');
      const dash = await page.screenshot(path.join(SCREENSHOTS, 'dashboard.png'), { fullPage: true });

      await page.evaluate('window.TradeDocs.app.navigate("#/settings")');
      await page.waitUntil('!!document.querySelector("[name=\'company.nameEn\']")', { timeout: 10000 });
      await page.evaluate('window.scrollTo(0, 0)');
      const settings = await page.screenshot(path.join(SCREENSHOTS, 'settings.png'), { fullPage: true });

      const demo = await page.evaluate(`window.TradeDocs.store.getState().orders.find((o) => o.id === 'ord_demo_001') || window.TradeDocs.store.getState().orders[0]`);
      await page.evaluate(`window.TradeDocs.app.navigate('#/orders/' + encodeURIComponent(${JSON.stringify(demo.id)}))`);
      await page.waitUntil('!!document.querySelector("#order-form")', { timeout: 10000 });
      await page.evaluate('window.scrollTo(0, 0)');
      await sleep(200);
      const editor = await page.screenshot(path.join(SCREENSHOTS, 'order-editor.png'), { fullPage: true });

      const previewShots = {};
      for (const key of ['ci', 'pl', 'sc', 'cs']) {
        await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demo.id)}, ${JSON.stringify({ print: { selected: [key] } })})`);
        await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(demo.id)})`);
        await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 1', { timeout: 12000 });
        await sleep(350);
        await page.evaluate(`(() => {
          const el = document.querySelector('.doc-sheet');
          const bar = document.querySelector('.preview-toolbar');
          if (!el) return;
          const barHeight = bar ? bar.getBoundingClientRect().height : 0;
          window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - barHeight - 36);
        })()`);
        await sleep(200);
        previewShots[key] = await page.screenshot(path.join(SCREENSHOTS, `preview-${key}.png`));
      }
      // Restore demo selection + capture selected-set PDF once more on pristine data.
      await page.evaluate(`window.TradeDocs.test.fillOrder(${JSON.stringify(demo.id)}, ${JSON.stringify({ print: { selected: ['ci', 'pl', 'sc', 'co'] } })})`);
      await page.evaluate(`window.TradeDocs.test.openPreview(${JSON.stringify(demo.id)})`);
      await page.waitUntil('document.querySelectorAll(".doc-sheet").length === 4', { timeout: 12000 });
      await sleep(300);
      await page.emulateMedia('print');
      const selectedPdf = await page.printPDF(path.join(SCREENSHOTS, 'preview-selected-demo.pdf'));
      await page.emulateMedia('screen');
      if (selectedPdf.pages !== 5) throw new Error(`final selected-set PDF pages = ${selectedPdf.pages}, expected 5`);
      fs.copyFileSync(path.join(ARTIFACTS, 'print-matrix', 'sc.pdf'), path.join(SCREENSHOTS, 'preview-sc-2pages.pdf'));

      for (const shot of [dash, settings, editor, ...Object.values(previewShots)]) {
        const buf = fs.readFileSync(shot.path);
        if (!looksLikePng(buf)) throw new Error(`${path.basename(shot.path)} is not a PNG`);
        if (shot.bytes < 8000) throw new Error(`${path.basename(shot.path)} too small (${shot.bytes}B)`);
      }
      const files = fs.readdirSync(SCREENSHOTS).sort();
      note(`screenshots: ${files.map((f) => `${f}(${fs.statSync(path.join(SCREENSHOTS, f)).size}B)`).join(', ')}`);
    });

    await check('final console/page error sweep: zero errors and zero page exceptions for the whole run', async () => {
      const errors = page.errors();
      if (errors.length) throw new Error(`console/page errors:\n       ${formatErrors(page)}`);
    });

    await check('no external network requests: only same-origin app assets (CONTRACT §1)', async () => {
      const allowedPrefixes = [server.url, 'data:', 'blob:'];
      const external = networkRequests.filter((url) => !allowedPrefixes.some((prefix) => url.startsWith(prefix)));
      if (external.length) throw new Error(`unexpected external requests:\n       ${external.slice(0, 10).join('\n       ')}`);
      note(`network: ${networkRequests.length} request(s), all same-origin/data`);
    });

    await check('file provenance: app files unchanged during run (else visual/print checks re-run on final files)', async () => {
      const endHashes = hashAppFiles();
      const changed = Object.keys(endHashes).filter((file) => endHashes[file] !== startHashes[file]);
      if (changed.length) {
        note(`WARNING files changed during run: ${changed.join(', ')} — re-running print/PDF matrix on final files`);
        for (const key of DOC_KEYS) await printOne(key);
        note('print/PDF matrix re-generated against final files; screenshots were captured at the end of the run');
        throw new Error(`app files changed mid-run (${changed.join(', ')}); rerun full E2E recommended`);
      }
      note(`app file hashes stable across run (${Object.keys(endHashes).length} files)`);
    });

  } finally {
    if (page) page.close();
    if (chrome) await chrome.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/* ================================================================== */
/*  Main                                                               */
/* ================================================================== */

async function main() {
  console.log(`TradeDocs E2E — mode=${mode}, root=${APP_ROOT}`);

  let chromePath;
  try {
    chromePath = findChromePath();
  } catch (err) {
    console.error(`PENDING  ${err.message}`);
    process.exit(2);
  }
  try {
    console.log(`Chrome: ${chromePath}\n`);
    if (mode === 'selfcheck') await runSelfcheck();
    else if (mode === 'full') await runFullE2E();
    else await runAppSmoke();
  } catch (err) {
    results.fail += 1;
    results.failures.push({ name: 'harness setup/teardown', err });
    console.error(`FAIL harness setup/teardown - ${err && err.stack ? err.stack : err}`);
  }
  summarize();
}

await main();
