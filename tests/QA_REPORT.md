# TradeDocs — QA Report

**Owner:** qa · **Last updated:** 2026-11-20 01:35 (+08:00) — **v1.1 FINAL after S3 fixes: all gates green** (QA-R01/QA-R02 fixed & re-verified)
**Project:** `trade-docs`（relative paths below；测试报告随源码发布）
**Environment:** Windows · Node v24.17.0 · Chrome 157.0.8103.79 (`C:\Program Files\Google\Chrome\Application\chrome.exe`) · zero npm/external dependencies
**v1.1 frozen snapshot (post task-10):** `js/recognize.js` 133,124 B @01:09:13 SHA `234825A3…` · `js/app.js` 207,160 B @01:26:22 SHA `A4A06D98…` · `index.html` SHA `C80CD4EC…` · `css/app.css` SHA `318FB049…` · `css/print.css` SHA `D7A328EB…` (unchanged) · `js/doc-templates.js` SHA `CA4697EC…` · `js/store.js` `DBA0B63B…` · `js/core.js` `81485892…` · `js/demo.js` `74C8CDC4…`

Severity legend: **S1 blocker** · **S2 major** · **S3 minor** · **S4 low/edge** · **INFO** (no action required).
Status legend: ✅ PASS · 🔧 fixed & re-verified · ⚠️ open (none remaining)

---

# PHASE 1 — core/template unit tests + CDP harness

## 1. Deliverables

| File | Purpose | Status |
|---|---|---|
| `tests/test-core.mjs` | 119 unit tests for `js/core.js` per CONTRACT §5 | ✅ PASS `119/119`, exit 0 |
| `tests/test-templates.mjs` | 47 tests rendering all 12 docs per CONTRACT §6/§7 | ✅ PASS `47/47`, exit 0 |
| `tests/cdp.mjs` | Reusable Chrome DevTools Protocol harness (launch, static server, CDP client, `PageSession`, screenshot/PDF/media/viewport/file-upload/download helpers) | ✅ used by Phase 2 |
| `tests/e2e.mjs` | E2E harness: `--selfcheck`, smoke mode and full integrated `--full` matrix (42 checks) | ✅ `--full` PASS 42/42 |
| `tests/QA_REPORT.md` | This report | — |
| `screenshots/` | Deliverable screenshots + PDF artifacts | ✅ 11 verified files |

## 2. Phase 1 results

```
node tests/test-core.mjs
  PASS  test-core.mjs — 119/119 tests passed                              EXIT=0

node tests/test-templates.mjs        # final run on frozen files
  PASS  test-templates.mjs — 47/47 tests passed (12 documents)            EXIT=0

node tests/e2e.mjs --selfcheck
  PASS  test-e2e.mjs --selfcheck — 13/13 checks passed                    EXIT=0
```

`test-core.mjs` covers `esc`, `num`/`round`, `fmtNum`/`fmtQty`/`fmtMoney`, `fmtDate`, `todayISO`, `docNo`, `integerToEnglish/Chinese`, `amountWordsEn/Cn` (0, 0.05, 999.99, 1000, 1001, 12345.67, contract-max 999,999,999,999.99, JPY 0-decimal, negative, unknown currency), `calcOrder`, `calcCost`, `validateOrder`, `uid`/`clone`/`byId`, demo fixture integrity. Demo order-1 expectations are computed independently: USD 33,390.00 / 20,200 qty / 390 ctns / 3,510 kg net / 4,046 kg gross / 18.2 CBM / margin 42.71%.

`test-templates.mjs` covers registry shape, article contract (`doc-sheet doc-sheet--<key>`, `data-doc`), title/number/date/letterhead, seal+signer, per-type §7 required content, bilingual/seal/signature options, XSS escaping across all 12 docs, empty-order/empty-items robustness, EUR/JPY variants, purity + determinism.

### 2.1 Phase 1 findings — fixed & re-verified

| ID | Severity | Finding | Owner | Status |
|---|---|---|---|---|
| QA-T01 | S2 | PI omitted L/C NO./L/C DATE/L/C ISSUING BANK despite §7.3 "同 CI 主要字段" | doc-dev | 🔧 fixed — template suite 47/47; PI renders `L/C NO.`, `L/C DATE`, `L/C ISSUING BANK` |
| QA-T02 | S3 | DR drawer block omitted signer name/title under `showSignature: true` | doc-dev | 🔧 fixed — template suite 47/47; DR renders signer + title |

### 2.2 Core edge findings (Lead-owned `js/core.js`, S4, pinned by tests; no contract violation, shipped output unaffected)

| ID | Finding | Location | Repro |
|---|---|---|---|
| QA-F01 | `fmtNum(1,-1)` throws RangeError (no decimal-place guard) | `core.js:116–124` | `node -e "require('./js/core.js').fmtNum(1,-1)"` |
| QA-F02 | Invalid calendar dates normalised instead of rejected (`2026-02-30` → `2 Mar 2026`); `validateOrder` accepts them | `core.js:161–178` | `test-core` "fmtDate silently normalises…" |
| QA-F03 | `amountWordsEn(1.005)` = "ONE" while `round(1.005,2)` = 1.01 (direct-call only; `calcOrder` feeds rounded totals) | `core.js:231–241`, `:288–308` | `test-core` "half-cent disagrees with round()" |
| QA-F04 | Negative half-tie asymmetry: `round(2.5,0)=3`, `round(-2.5,0)=-2` (totals clamped ≥0) | `core.js:77–83` | `test-core` "round handles negative values" |
| QA-F05 | `docNo(..., padding=0)` falls back to 4 digits because `Number(padding) \|\| 4` | `core.js:183` | `test-core` "docNo treats padding 0 as default 4" |

---

# PHASE 2 — integrated E2E results (FINAL)

**Run command:** `node tests/e2e.mjs --full` · **fresh Chrome profile**, demo seed, 1440×900, `clearViewport` before matrix
**Final result: PASS 42/42 checks, exit 0** on frozen files
**Raw output:** `.scratch/qa/e2e-full-final-output.txt`

## 3. Frozen file snapshot exercised

| File | SHA-256 | Size | mtime |
|---|---|---|---|
| `index.html` | `E46564AAAA4FCAFC8AD726CF11E6DBC93CCB73705CE35221509812BD1749E06D` | 7,829 B | 22:34:46 |
| `css/app.css` | `878F9E19EB195CE56DE69F9B8229E7FE9C7C7F0A07B041DF388C9E67255C959B` | 59,853 B | 22:57:49 |
| `css/print.css` | `D7A328EB123F72377C65AA5329DC1933F2D2AEA6F66CF69B0E844CD934035F96` | 47,037 B | 23:03:31 (unchanged by T03/T04 fix) |
| `js/doc-templates.js` | `CA4697EC224898EAD0CF4C044B1C5EE8D9BFD0C617466D8ED74569D4509586F8` | 89,800 B | 23:26:31 |
| `js/app.js` | `0290D4F57DD561A4B74DE475555F5CB8265BB13D9C44B8311EB6529DCF245833` | 155,942 B | 22:54:34 |
| `js/store.js` | `DBA0B63BCF4A62963E3C4355BE448167427FC0F4BA3C39E203BE0EF0324541F2` | 30,364 B | 22:40:20 |
| `js/core.js` | `814858923FBA89B9C3FFEA2D2F2E64B01BBA4965108216788A4EEBC102FB49FD` | 19,756 B | 22:06:05 |
| `js/demo.js` | `74C8CDC461BF1EF502A3BE0CBFC1D6154CD09F27DB6AEAC922B8C16F44E330FE` | 17,174 B | 22:06:46 |

The E2E file-provenance check verified **all 8 app files unchanged during the run** (no mid-run rebuild of screenshots/PDFs needed).

## 4. Resolved finding: `.doc-desc` CSS class collision (was QA-T03/T04, S2)

- **Symptom (QA-T03/T04):** in the integrated app context, BK 订舱委托书 printed 2 pages (1147px sheet, blank trailing page) and CS 成本核算表 printed 2 pages (1176px, footer spilling onto page 2); all-12 PDF was 15 pages instead of 13. Standalone print-only checks did **not** reproduce.
- **Root cause (found by doc-dev):** a CSS class-name collision. Document item tables used `<td class="doc-desc">`, while `css/app.css:813` defines a dashboard document-type-card rule `.doc-desc { min-height:36px; display:-webkit-box; line-height:1.55; font-size:11.5px; -webkit-line-clamp:2; overflow:hidden }`. In the real app (app.css loaded) every document table row grew from **21px to 37px (+16px/row)** → BK +76px (1147px), CS +76px (1176px) — exactly the measured heights/footer maps. The standalone doc harness loaded only `print.css`, which is why it never saw the inflation.
- **Fix (doc-dev, `js/doc-templates.js`):** renamed the table-cell class to `doc-cell-desc` (7 occurrences). No layout/content trimming; `css/print.css` unchanged since 23:03:31. `js/doc-templates.js` now 89,800 B / SHA `CA4697EC…` / mtime 23:26:31.
- **Independent re-validation (qa):** clean instrumented repro on frozen files — fresh Chrome, `clearViewport()`, `resetDemo()` + reload, `devicePixelRatio=1`, `visualViewport.scale=1`, html/body `zoom=1` (no residual device-metrics; innerWidth 1424 due to scrollbar):
  - BK = **1115px, 1 page** (was 1147/2); CS = **1115px, 1 page** (was 1176/2); CI/PL/PI/QT/SA/CO/BC/DR/CD = 1115px/1 page; SC = 2230px/2 pages (accepted).
  - All-12 per-doc heights: all 1115px (SC 2230px); **all-12 PDF = 13 pages** (robust PDF `/Count` = 13, heuristic = 13).
  - Second, brand-new `PageSession` (fresh page) with BK only: 1115px / 1 page.
  - Raw repro report: `.scratch/qa/repro/repro-report.json`; full final matrix output: `.scratch/qa/e2e-full-final-output.txt`.
- **Status:** 🔧 **resolved & re-verified — QA-T03 and QA-T04 closed.** (Initial root-cause hypothesis of test isolation/emulation was incorrect; the heights were real app-context measurements. Historical defect evidence archived in `.scratch/qa/print-probe/` and removed from `screenshots/`.)
- Test-only harness hardening from this episode: mobile-sidebar assertion now waits for the off-canvas transition to settle (`waitUntil` on `getBoundingClientRect().right`) instead of a fixed sleep — no product change.

## 5. Final matrix summary — 42/42 ✅

| Group | Checks | Result |
|---|---|---|
| A. Fresh-profile demo boot + deliverable screenshots | 1–4 | ✅ |
| B. Routes, direct hash deep-links, unknown order/route IDs | 5–8 | ✅ |
| C. New order → customer/product → save → preview; qty/price↔totals/words sync; numbering stability; reload persistence; Ctrl+S; Esc; XSS zero-execution | 9–18 | ✅ |
| D. All 12 documents in UI (contract order) + `TradeDocs.test.renderDocs` DOM-identical | 19–21 | ✅ |
| E. Print media hide/toast/modal + `@page A4`; per-doc PDF matrix; selected-set & all-12 page counts | 22–25 | ✅ |
| F. Settings save + logo/seal dataURL; JSON export→import round-trip + invalid import; clearAll empty states + reload; resetDemo + reload | 26–32 | ✅ |
| G. No page overflow at 1440/1024/768/390; mobile A4 swipe; sidebar drawer; 14-col item-table scroll hint; 12 doc tabs clickable at all widths | 33–38 | ✅ |
| H. Final screenshots on demo data; zero console errors/page exceptions; no external network (188 same-origin/data requests); file provenance stable | 39–42 | ✅ |

**Print matrix (final):** `ci=1p/1115px, pl=1p/1115px, pi=1p/1115px, sc=2p/2230px, qt=1p/1115px, bk=1p/1115px, sa=1p/1115px, cd=1p/1115px, co=1p/1115px, bc=1p/1115px, dr=1p/1115px, cs=1p/1115px` · selected demo set (CI,PL,SC,CO) = **5 pages**, no trailing blank · all-12 = **13 pages**.
Console/page exceptions: **0** for the entire run. Network: **188 requests, all same-origin/`data:`** (CONTRACT §1 no-network satisfied).

## 6. Deliverable artifacts — `screenshots/` (11 files, all verified)

| File | Size | Dimensions / pages | Notes |
|---|---|---|---|
| `dashboard.png` | 396,566 B | 1440×1731 | full page, demo KPIs / 12 doc cards / recent orders |
| `settings.png` | 279,577 B | 1440×3241 | full page, company/bank/defaults/numbering/backup |
| `order-editor.png` | 440,628 B | 1440×4671 | full page, demo order-1 editor + summary + doc selectors |
| `preview-ci.png` | 196,688 B | 1440×900 | A4 commercial invoice |
| `preview-pl.png` | 199,290 B | 1440×900 | A4 packing list |
| `preview-sc.png` | 199,735 B | 1440×900 | A4 sales contract (page 1 of 2) |
| `preview-cs.png` | 191,735 B | 1440×900 | A4 cost sheet |
| `mobile-dashboard.png` | 140,227 B | 390×844 | mobile viewport, sidebar collapsed |
| `preview-selected-demo.pdf` | 359,728 B | **5 pages** | demo 4 selected docs (CI,PL,SC,CO), no trailing blank |
| `preview-sc-2pages.pdf` | 186,845 B | **2 pages** | SC alone (accepted behavior) |
| `preview-all-12.pdf` | 916,206 B | **13 pages** | all 12 docs (11×1 + SC×2) |

Verified by `.scratch/qa/verify-artifacts.mjs`: 8 PNGs at expected dimensions (all >5 KB), 3 PDFs with exact robust `/Count` page counts (5 / 2 / 13), 0 unexpected files, **0 failures**.
Visual review (manual): dashboard/settings/editor layouts clean — no text overlap, cards aligned, Chinese renders correctly, item-table scroll hint present, editor summary + 12 doc selectors complete; preview A4 sheets intact with aligned tables, readable fonts, logo/seal rendered; mobile dashboard stacks cleanly with no horizontal overflow. No visual defects remain. Historical BK/CS 2-page evidence archived at `.scratch/qa/print-probe/` (not part of the deliverable set).

## 7. Final gate status — all green ✅

| Gate | Owner | Status |
|---|---|---|
| `node tests/test-core.mjs` | qa | ✅ 119/119, exit 0 |
| `node tests/test-templates.mjs` | doc-dev | ✅ 47/47, exit 0 |
| `node tests/e2e.mjs --selfcheck` | qa | ✅ 13/13, exit 0 |
| `node tests/e2e.mjs --full` integrated matrix | qa | ✅ **42/42, exit 0** |
| Deliverable screenshots + PDFs refreshed & verified | qa | ✅ 11 files, `verify-artifacts.mjs` 0 failures |
| QA-T01/T02/T03/T04 | doc-dev | ✅ all fixed & re-verified |
| **Phase 2 / task-4** | qa | ✅ **COMPLETE** |

## 8. Rerun instructions (exact expectations)

```powershell
cd "C:\Users\Administrator\Desktop\Global Country\trade-docs"
node tests/test-core.mjs          # PASS 119/119
node tests/test-templates.mjs     # PASS 47/47
node tests/e2e.mjs --selfcheck    # PASS 13/13
node tests/e2e.mjs                # app smoke, PASS 13/13
node tests/e2e.mjs --full         # PASS 42/42 (fresh profile; ~2.5 min)
```

QA never edits application files; all findings were reported to the owning agent/Lead with file, line, repro and evidence. Raw logs: `.scratch/qa/e2e-full-final-output.txt`, `.scratch/qa/repro/repro-report.json`, `.scratch/qa/repro-output.txt`.

---

# v1.1 QA — SMART RECOGNITION (智能填单) — FINAL

**Run window:** 2026-11-20 01:05–01:24 (initial) + 01:27–01:33 (post-fix re-validation) (+08:00) · fresh Chrome profile · CONTRACT §13 · code frozen (recognize.js task-9 @01:09:13; app.js task-10 @01:26:22)

## v1.1 results

| Gate | Command | Result |
|---|---|---|
| Core unit (regression) | `node tests/test-core.mjs` | ✅ PASS `119/119`, exit 0 |
| Template unit (regression) | `node tests/test-templates.mjs` | ✅ PASS `47/47`, exit 0 |
| Recognition unit (new) | `node tests/test-recognize.mjs` | ✅ PASS `48/48`, exit 0 |
| CDP harness self-check | `node tests/e2e.mjs --selfcheck` | ✅ PASS `13/13`, exit 0 |
| Full integrated E2E (42 v1.0 + 14 v1.1) | `node tests/e2e.mjs --full` | ✅ **PASS 56/56**, exit 0 |
| Artifact verification | `.scratch/qa/verify-artifacts.mjs` | ✅ 15 files (12 PNG + 3 PDF), 0 failures |

Raw full-run logs: `.scratch/qa/e2e-full-v11-output.txt` (pre-fix) and `.scratch/qa/e2e-full-v11-rerun-output.txt` (post-fix, **56/56**) · unit logs: `.scratch/qa/test-recognize-output.txt`.
Zero console errors / page exceptions in the whole run; 219 network requests, all same-origin/`data:`; all app files (incl. recognize.js + fixed app.js) unchanged during run (file-provenance check).

## Recognition unit coverage (`tests/test-recognize.mjs`, 48 tests)

API/limits/ACCEPT/version 1.1.0; SAMPLE_TEXT = **32 fields / 4 items** (buyer, seller, ports, vessel, L/C, ETD `2026-12-10` / ETA `2026-12-24`, marks, remarks, charges); meta flat-map confidence 0–1 + evidence ≤120 chars for every non-empty field incl. ETD/ETA, item metas; no undefined/NaN; TXT/MD/CSV/TSV/JSON extraction+parse (items/cartons/N.W./G.W./CBM); real DOCX (`tests/fixtures/order-sample.docx`, Chinese `order-cn.docx`, `metadata-items.docx`) and XLSX (`items-sample.xlsx`); **DOCX regressions for Lead-found task-9 bug**: `twotables-empty.docx` (table + self-closing `<w:p/>` + table) → **2 tables / 3 items**, `metatable-itemtable-empty.docx` → **2 tables / 3 items + fields**, control `twotables-text.docx` → 2 tables; Lead sample `samples/智能识别示例/示例-供应商形式发票.docx` → **2 tables / 4 items / 21 fields incl. ports+ETD/ETA**; corrupted DOCX/XLSX → `zip-invalid` warning (no throw); image/PDF/.doc/.xls → `unsupported-format`; >10MB → `file-too-large`; >5 files → `too-many-files`; empty → `empty-file`; text 300k cap → `text-truncated`/`text-too-long`; merge `extractFiles` (files/chars/tables/filenames) and `recognizeFiles` stats; tab + pipe pasted tables; email narrative probe; `apply()` fill-empty/overwrite, append/replace, purity (order+recognition unchanged), `core.uid("item")` ids, productId/costPrice/origin defaults, invalid-date skip + invalid-number sanitisation, charges, XSS stays inert data, empty/undefined tolerance, no undefined leaks.

Fixtures are committed under `tests/fixtures/` and reproducible via `tests/fixtures/generate-fixtures.py` (bundled python-docx/openpyxl).

## E2E v1.1 group (14 checks, all green)

Modal entry/status/privacy/accept + source step; 载入示例 fills textarea + `2,006 / 300,000` counter; recognize → review **32 fields / 4 items** incl. ETD/ETA, confidence badges, stats `字段32/货物4/来源1/字符2,006`; apply to current order (edited preview value wins, buyer/ETD/ETA/ports/charges/4 items applied, totals `USD 30,910.00` + amount words, fill-empty keeps existing default incoterm, persisted after reload); dashboard 识别建单 → 另存为新订单并应用 creates **exactly ONE order** (auto draft cleaned, no ghost); entry 识别建单 → cancel deletes auto draft, **+0 orders**, returns to `#/dashboard` / `#/orders`; entry 识别建单 → apply-current **reuses the auto draft** (+1 populated order, no ghost); real file uploads via CDP `DOM.setFileInputFiles` for TXT/CSV/docx/xlsx + Lead samples (DOCX/XLSX → 4 items + metadata, inquiry e-mail TXT → buyer + ETD/ETA + items); unsupported image/PDF notice with no file added; combined paste+file merges content and reports **来源 2**; Escape cancel on editor-entry leaves localStorage + orders untouched; recognition modal fits 390×844 without page overflow; zero console errors.

## v1.1 findings (QA-R01/R02 fixed & re-verified; parser notes non-blocking)

| ID | Severity | Finding | Owner | Status |
|---|---|---|---|---|
| QA-R01 | S3 | Combined paste+file review showed “来源 1” instead of 2. **Fix (task-10, app.js @01:26:22):** combined branch now sets `recognition.stats.files = files + (paste?1:0)` and `stats.chars = combined.length` when missing; stats renderer falls back to computed sources `s.files.length + (paste?1:0)`. **Verified:** E2E `combined paste + file recognition merges content and reports 来源=2` → 来源 **2**, 字符 376, pasted buyer + 3 CSV items merged. | ui-dev | 🔧 fixed & re-verified |
| QA-R02 | S3 | Dashboard/orders 识别建单 left a ghost empty draft (+2 orders). **Fix (task-10, app.js @01:26:22):** entry records `autoDraftId`/`returnRoute`; apply-new deletes the untouched auto draft; cancel/Escape/X/backdrop deletes the empty auto draft and returns to origin route; editor-entry flows never delete pre-existing orders. **Verified:** E2E checks 43–45 → create-new **+1 order / 0 ghosts**, entry-cancel **+0 orders / returns `#/dashboard` & `#/orders`**, entry-apply-current **+1 populated order / 0 ghosts**, editor apply-current unchanged. | ui-dev | 🔧 fixed & re-verified |
| QA-R03 | S4 | Chinese-labelled DOCX items: `nameEn` fragments (“12”, “500ml”) while `nameCn`, qty, unitPrice and all rows are correct — display-quality only. | recognize-dev | ℹ️ noted |
| QA-R04 | S4 | Free-form email narrative is outside the label/table parser scope (`From:`/signature not mapped to buyer/contact) — the shipped inquiry-email sample itself parses fine (buyer + ETD/ETA + 2 items), so this is a non-required edge. | recognize-dev | ℹ️ noted |
| QA-R05 | S3 | Pasted pipe/markdown tables are detected (rows, unitPrice, amount) but columns shift: qty/unit lost and description keeps `\|` fragments; an `items-derived` warning is shown and the review UI allows correction. Tab/space/CSV/XLSX tables map correctly. | recognize-dev | ℹ️ noted (non-blocking) |
| QA-R06 | S4 | JSON `items[]` rows: `nameEn` absorbs trailing numeric cells (e.g. “Ceramic Mug 12 oz 4440”); qty/unitPrice/hsCode correct. | recognize-dev | ℹ️ noted |

> **v1.1 signoff:** all gates green on frozen files (`js/app.js` SHA `A4A06D98…` @01:26:22, `js/recognize.js` SHA `234825A3…` @01:09:13). QA-R01/R02 confirmed fixed independently in headless Chrome (E2E 56/56); remaining QA-R03–R06 are non-blocking parser-quality notes outside the demo flow. Ready for v1.1 release packaging.

## v1.1 deliverable artifacts

New screenshots: `recognize-source.png` (source step: privacy/format/limit/sample), `recognize-result.png` (review: stats 32/4/1/2,006 + grouped fields + confidence + apply buttons), `recognize-applied.png` (full-page editor after apply: buyer/ETD/ETA/4 items/total USD 30,910.00 + words), `recognize-mobile.png` (390×844 modal, no page overflow). Existing v1.0 screenshots and PDFs refreshed on current files: `dashboard`, `settings`, `order-editor`, `preview-ci/pl/sc/cs`, `mobile-dashboard`, `preview-selected-demo.pdf` (5 pages), `preview-sc-2pages.pdf` (2), `preview-all-12.pdf` (13). All 15 files verified (`.scratch/qa/verify-artifacts.mjs`, 0 failures). Historical v1.0 bug evidence remains archived in `.scratch/qa/print-probe/`.

## v1.1 rerun instructions

```powershell
cd "C:\Users\Administrator\Desktop\Global Country\trade-docs"
node tests/test-core.mjs          # PASS 119/119
node tests/test-templates.mjs     # PASS 47/47
node tests/test-recognize.mjs     # PASS 48/48
node tests/e2e.mjs --selfcheck    # PASS 13/13
node tests/e2e.mjs --full         # PASS 56/56 (42 v1.0 regression + 14 v1.1 recognition)
```

QA never edits application files; v1.1 findings were reported to ui-dev/Lead with file, line, repro and evidence and re-tested after the task-10 fix (green). Recognized results are always reviewed/edited before applying (contract §13.1); no network requests are made by the recognition engine.
