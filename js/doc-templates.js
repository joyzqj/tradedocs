/*!
 * 单证通 TradeDocs — doc-templates.js
 * 12 A4 print-ready trade document templates.
 * Classic script (no modules): browser global TradeDocs.docs, optional CommonJS export.
 * Every render() is a pure function: no DOM, no storage, no network, no mutation.
 * All dynamic values are escaped with ctx.core.esc().
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.TradeDocs = root.TradeDocs || {};
  root.TradeDocs.docs = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* ------------------------------------------------------------------ */
  /*  Registry (CONTRACT §6.1)                                           */
  /* ------------------------------------------------------------------ */

  var GROUPS = [
    { key: 'sales', nameCn: '销售与结算' },
    { key: 'logistics', nameCn: '物流与报关' },
    { key: 'internal', nameCn: '内部管理' }
  ];

  var LIST = [
    { key: 'ci', group: 'sales', prefix: 'CI', nameCn: '商业发票', nameEn: 'COMMERCIAL INVOICE', desc: '买卖双方、货物明细、金额合计、银行信息与原产地声明的结算单据。' },
    { key: 'pl', group: 'sales', prefix: 'PL', nameCn: '装箱单', nameEn: 'PACKING LIST', desc: '箱数、每箱数量、总数量、净重、毛重与体积，不含价格。' },
    { key: 'pi', group: 'sales', prefix: 'PI', nameCn: '形式发票', nameEn: 'PROFORMA INVOICE', desc: '用于报价确认与开立信用证的形式发票，含付款方式、有效期与交货期。' },
    { key: 'sc', group: 'sales', prefix: 'SC', nameCn: '销售合同', nameEn: 'SALES CONTRACT', desc: '买卖双方、货物与总价、金额大写及质量/包装/装运/付款/检验/不可抗力/仲裁/适用法律等条款。' },
    { key: 'qt', group: 'sales', prefix: 'QT', nameCn: '报价单', nameEn: 'QUOTATION', desc: '货物单价/总价、贸易术语、付款方式、交货期与报价有效期。' },
    { key: 'bk', group: 'logistics', prefix: 'BK', nameCn: '订舱委托书', nameEn: 'BOOKING NOTE', desc: '中英对照订舱委托：Shipper/Consignee/Notify、船名航次、箱型箱量、货物摘要与报关提单要求。' },
    { key: 'sa', group: 'logistics', prefix: 'SA', nameCn: '装运通知', nameEn: 'SHIPPING ADVICE', desc: '船名航次/提单号/集装箱号/封号、ETD/ETA 与货物摘要的装运通知。' },
    { key: 'cd', group: 'logistics', prefix: 'CD', nameCn: '报关资料清单', nameEn: 'CUSTOMS DOCUMENT CHECKLIST', desc: '中文报关资料清单：关键申报数据、货物明细与资料核对清单。' },
    { key: 'co', group: 'logistics', prefix: 'CO', nameCn: '一般原产地证', nameEn: 'CERTIFICATE OF ORIGIN', desc: '通用可编辑原产地证版式（非官方证书）：Exporter/Consignee、运输路线、货物与原产地声明。' },
    { key: 'bc', group: 'sales', prefix: 'BC', nameCn: '受益人证明', nameEn: "BENEFICIARY'S CERTIFICATE", desc: '致买方/开证行的受益人证明，含信用证号、发票号与标准声明。' },
    { key: 'dr', group: 'sales', prefix: 'DR', nameCn: '汇票', nameEn: 'BILL OF EXCHANGE', desc: '标准汇票措辞：金额数字+大写、即期/远期、Pay to the order of、付款人与出票人签章。' },
    { key: 'cs', group: 'internal', prefix: 'CS', nameCn: '成本核算表', nameEn: 'COST SHEET', desc: '中文内部成本核算：外币收入、汇率、人民币收入、采购/国内/银行费用、毛利与毛利率。' }
  ];

  function findEntry(key) {
    var k = String(key || '');
    for (var i = 0; i < LIST.length; i++) {
      if (LIST[i].key === k) return LIST[i];
    }
    return undefined;
  }

  function get(key) {
    return findEntry(key);
  }

  /* ------------------------------------------------------------------ */
  /*  Small safe value helpers                                           */
  /* ------------------------------------------------------------------ */

  function txt(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function hasText(value) {
    return txt(value).trim() !== '';
  }

  function esc(p, value) {
    return p.core.esc(value);
  }

  function biq(p) {
    return p.bilingual === true || p.alwaysBi === true;
  }

  /* Label: English first, Chinese underneath when bilingual. */
  function L(p, en, cn) {
    var label = esc(p, en);
    if (!biq(p)) return label;
    return label + '<span class="doc-bi-cn">' + esc(p, cn) + '</span>';
  }

  /* Label: Chinese first, English underneath (Chinese-primary documents). */
  function Lz(p, cn, en) {
    return esc(p, cn) + '<span class="doc-bi-en">' + esc(p, en) + '</span>';
  }

  function dateText(p, iso) {
    if (!hasText(iso)) return '';
    return p.core.fmtDate(iso, 'medium') || '';
  }

  function addDays(p, iso, days) {
    var d = p.core.parseISO(iso);
    if (!d) return '';
    var next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    next.setDate(next.getDate() + days);
    return p.core.fmtDate(next, 'medium') || '';
  }

  /* ------------------------------------------------------------------ */
  /*  Order-derived values (read-only, never mutate ctx/order)           */
  /* ------------------------------------------------------------------ */

  function incoterm(p) {
    return txt(p.order.incoterm) || txt(p.defaults.incoterm);
  }

  function paymentTerms(p) {
    return txt(p.order.paymentTerms) || txt(p.defaults.paymentTerms);
  }

  function portOfLoading(p) {
    return txt(p.order.portOfLoading) || txt(p.defaults.portOfLoading);
  }

  function portOfDischarge(p) {
    return txt(p.order.portOfDischarge) || txt(p.defaults.portOfDischarge);
  }

  function originValue(p) {
    var items = p.order.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && hasText(items[i].origin)) return txt(items[i].origin);
    }
    return txt(p.defaults.countryOfOrigin) || 'CHINA';
  }

  function destinationCountry(p) {
    return txt(p.order.countryOfDestination) || txt(p.buyer.country);
  }

  function vesselText(p) {
    var vessel = txt(p.order.vessel).trim();
    var voyage = txt(p.order.voyage).trim();
    if (vessel && voyage) return vessel + ' / VOY. ' + voyage;
    if (vessel) return vessel;
    if (voyage) return 'VOY. ' + voyage;
    return '';
  }

  function transportEntry(p) {
    var list = p.core.TRANSPORT_MODES || [];
    var key = txt(p.order.transportMode).toUpperCase();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].key === key) return list[i];
    }
    return undefined;
  }

  function transportEn(p) {
    var entry = transportEntry(p);
    return entry ? txt(entry.nameEn) : txt(p.order.transportMode);
  }

  function transportCn(p) {
    var entry = transportEntry(p);
    return entry ? txt(entry.nameCn) : '';
  }

  function relatedNo(p, key, fallback) {
    var dm = p.order.docMeta;
    if (dm && dm[key] && hasText(dm[key].no)) return txt(dm[key].no);
    return txt(fallback);
  }

  function relatedDate(p, key, fallback) {
    var dm = p.order.docMeta;
    if (dm && dm[key] && hasText(dm[key].date)) return txt(dm[key].date);
    return txt(fallback);
  }

  function invoiceNo(p) {
    return relatedNo(p, 'ci', p.key === 'ci' ? p.meta.no : '');
  }

  function contractNo(p) {
    return txt(p.order.no) || relatedNo(p, 'sc', '');
  }

  /* ------------------------------------------------------------------ */
  /*  Parties (empty consignee/notify fall back gracefully)              */
  /* ------------------------------------------------------------------ */

  function sameAs(raw, target) {
    var re = new RegExp('^\\s*SAME\\s+AS\\s+(THE\\s+)?' + target + '\\s*$', 'i');
    return re.test(txt(raw));
  }

  function buyerName(p) {
    return txt(p.buyer.nameEn) || txt(p.buyer.nameCn);
  }

  function partyName(p, party) {
    if (!party) return '';
    if (party.textLines !== undefined) return txt(party.refName);
    return txt(party.nameEn) || txt(party.nameCn);
  }

  function consigneeParty(p) {
    var raw = txt(p.order.consignee);
    if (!hasText(raw)) return p.buyer;
    if (sameAs(raw, 'BUYER')) return { textLines: 'SAME AS BUYER', refName: buyerName(p) };
    return { textLines: raw };
  }

  function notifyParty(p) {
    var raw = txt(p.order.notifyParty);
    if (hasText(raw)) {
      if (sameAs(raw, 'CONSIGNEE')) {
        return { textLines: 'SAME AS CONSIGNEE', refName: partyName(p, consigneeParty(p)) };
      }
      if (sameAs(raw, 'BUYER')) return { textLines: 'SAME AS BUYER', refName: buyerName(p) };
      return { textLines: raw };
    }
    var consignee = txt(p.order.consignee);
    if (!hasText(consignee)) return p.buyer;
    if (sameAs(consignee, 'BUYER')) return { textLines: 'SAME AS BUYER', refName: buyerName(p) };
    return { textLines: consignee };
  }

  function partyBody(p, party) {
    if (!party) return '';
    if (party.textLines !== undefined) {
      if (!hasText(party.textLines)) return '';
      var textHtml = '<div class="doc-party-text doc-pre">' + esc(p, party.textLines) + '</div>';
      if (hasText(party.refName)) {
        textHtml += '<div class="doc-party-line doc-party-line--ref">' + esc(p, party.refName) + '</div>';
      }
      return textHtml;
    }
    var rows = [];
    var name = txt(party.nameEn) || txt(party.nameCn);
    if (hasText(name)) rows.push('<div class="doc-party-name">' + esc(p, name) + '</div>');
    var nameCn = txt(party.nameCn);
    if (hasText(nameCn) && nameCn !== name) {
      rows.push('<div class="doc-party-name-cn">' + esc(p, nameCn) + '</div>');
    }
    var addr = txt(party.addressEn) || txt(party.addressCn);
    if (hasText(addr)) rows.push('<div class="doc-party-line doc-pre">' + esc(p, addr) + '</div>');
    var country = txt(party.country);
    if (hasText(country) && addr.toUpperCase().indexOf(country.toUpperCase()) < 0) {
      rows.push('<div class="doc-party-line">' + esc(p, country) + '</div>');
    }
    var bits = [];
    if (hasText(party.contact)) bits.push('ATTN: ' + txt(party.contact));
    if (hasText(party.tel)) bits.push('TEL: ' + txt(party.tel));
    if (hasText(party.email)) bits.push('EMAIL: ' + txt(party.email));
    if (bits.length) rows.push('<div class="doc-party-line">' + esc(p, bits.join('   ')) + '</div>');
    if (hasText(party.taxId)) rows.push('<div class="doc-party-line">' + esc(p, 'TAX ID: ' + txt(party.taxId)) + '</div>');
    return rows.join('');
  }

  function partyBlock(p, titleEn, titleCn, party) {
    return '<section class="doc-party">' +
      '<div class="doc-party-title">' + L(p, titleEn, titleCn) + '</div>' +
      '<div class="doc-party-body">' + partyBody(p, party) + '</div>' +
      '</section>';
  }

  function partiesRow(p, defs, extraClass) {
    var html = '<div class="doc-parties' + (extraClass ? ' ' + extraClass : '') + '">';
    for (var i = 0; i < defs.length; i++) {
      html += partyBlock(p, defs[i][0], defs[i][1], defs[i][2]);
    }
    return html + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /*  Page chrome                                                        */
  /* ------------------------------------------------------------------ */

  function letterhead(p) {
    var co = p.company || {};
    var logo = hasText(co.logo)
      ? '<div class="doc-letterhead-logo"><img class="doc-logo-img" alt="" src="' + esc(p, co.logo) + '"></div>'
      : '';
    var nameCn = txt(co.nameCn);
    var nameEn = txt(co.nameEn);
    var names = [];
    if (hasText(nameCn)) {
      names.push('<div class="doc-company-name doc-company-name--zh">' + esc(p, nameCn) + '</div>');
      if (hasText(nameEn)) names.push('<div class="doc-company-name-en">' + esc(p, nameEn) + '</div>');
    } else if (hasText(nameEn)) {
      names.push('<div class="doc-company-name doc-company-name--en">' + esc(p, nameEn) + '</div>');
    }
    var addr = p.chinese
      ? (txt(co.addressCn) || txt(co.addressEn))
      : (txt(co.addressEn) || txt(co.addressCn));
    if (!hasText(addr)) {
      addr = [txt(co.city), txt(co.country)].filter(hasText).join(', ');
    }
    var contactBits = [];
    if (hasText(co.tel)) contactBits.push('TEL ' + txt(co.tel));
    if (hasText(co.fax)) contactBits.push('FAX ' + txt(co.fax));
    if (hasText(co.email)) contactBits.push('EMAIL ' + txt(co.email));
    if (hasText(co.website)) contactBits.push('WEB ' + txt(co.website));
    var contact = contactBits.length
      ? '<div class="doc-company-meta">' + esc(p, contactBits.join('   ·   ')) + '</div>'
      : '';
    var addrHtml = hasText(addr)
      ? '<div class="doc-company-addr doc-pre">' + esc(p, addr) + '</div>'
      : '';
    return '<header class="doc-letterhead">' +
      logo +
      '<div class="doc-letterhead-names">' + names.join('') + '</div>' +
      addrHtml +
      contact +
      '<div class="doc-letterhead-rule" aria-hidden="true"></div>' +
      '</header>';
  }

  function titleBlock(p, opts) {
    var o = opts || {};
    var en = o.en || p.entry.nameEn;
    var cn = o.cn || p.entry.nameCn;
    var showCn = o.forceCn === true || biq(p);
    var html = '<div class="doc-title-block">';
    if (o.zh === true) {
      html += '<h1 class="doc-title doc-title--zh">' + esc(p, cn) + '</h1>';
      if (showCn) html += '<div class="doc-title-sub">' + esc(p, en) + '</div>';
    } else {
      html += '<h1 class="doc-title">' + esc(p, en) + '</h1>';
      if (showCn) html += '<div class="doc-title-cn">' + esc(p, cn) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function metaGrid(p, items, extraClass, zh) {
    var html = '<div class="doc-meta-grid' + (extraClass ? ' ' + extraClass : '') + '">';
    for (var i = 0; i < items.length; i++) {
      var value = txt(items[i][2]);
      html += '<div class="doc-meta-item">' +
        '<div class="doc-meta-label">' + (zh ? Lz(p, items[i][1], items[i][0]) : L(p, items[i][0], items[i][1])) + '</div>' +
        '<div class="doc-meta-value' + (hasText(value) ? '' : ' doc-meta-value--empty') + '">' + esc(p, value) + '</div>' +
        '</div>';
    }
    return html + '</div>';
  }

  function detailsGrid(p, rows, cols, zh) {
    var html = '<div class="doc-details' + (cols === 3 ? ' doc-details--3' : '') + '">';
    for (var i = 0; i < rows.length; i++) {
      html += '<div class="doc-field">' +
        '<div class="doc-field-label">' + (zh ? Lz(p, rows[i][1], rows[i][0]) : L(p, rows[i][0], rows[i][1])) + '</div>' +
        '<div class="doc-field-value">' + esc(p, txt(rows[i][2])) + '</div>' +
        '</div>';
    }
    return html + '</div>';
  }

  function blockTitle(p, en, cn, zh) {
    return '<div class="doc-block-title">' + (zh ? Lz(p, cn, en) : L(p, en, cn)) + '</div>';
  }

  function sectionTitle(p, en, cn, zh) {
    return '<div class="doc-section-title">' + (zh ? Lz(p, cn, en) : L(p, en, cn)) + '</div>';
  }

  function marksBlock(p) {
    var marks = txt(p.order.shippingMarks);
    if (!hasText(marks)) marks = 'N/M';
    return '<div class="doc-marks">' +
      blockTitle(p, 'SHIPPING MARKS', '唛头') +
      '<div class="doc-marks-body doc-pre">' + esc(p, marks) + '</div>' +
      '</div>';
  }

  function remarksBlock(p) {
    if (!hasText(p.order.remarks)) return '';
    return '<div class="doc-remarks">' +
      blockTitle(p, 'REMARKS', '备注') +
      '<div class="doc-remarks-body doc-pre">' + esc(p, txt(p.order.remarks)) + '</div>' +
      '</div>';
  }

  function noteBlock(p, titleEn, titleCn, body, zh) {
    return '<div class="doc-note">' +
      blockTitle(p, titleEn, titleCn, zh) +
      '<div class="doc-note-body doc-pre">' + esc(p, txt(body)) + '</div>' +
      '</div>';
  }

  function paymentBlock(p) {
    var terms = paymentTerms(p);
    if (!hasText(terms)) return '';
    return noteBlock(p, 'PAYMENT TERMS', '付款方式', terms);
  }

  function declarationBlock(p, text, cfg) {
    var c = cfg || {};
    var fallback = 'WE HEREBY CERTIFY THAT THE GOODS MENTIONED ABOVE ARE OF ' + originValue(p) +
      ' ORIGIN AND THAT THE CONTENTS OF THIS INVOICE ARE TRUE AND CORRECT.';
    var body = hasText(text) ? txt(text) : fallback;
    return '<div class="doc-declaration">' +
      blockTitle(p, c.en || 'DECLARATION', c.cn || '声明') +
      '<div class="doc-declaration-body">' + esc(p, body) + '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /*  Signature / seal                                                   */
  /* ------------------------------------------------------------------ */

  function stampBlock(p) {
    if (!p.showSeal) return '';
    var seal = p.company.seal;
    if (hasText(seal)) {
      return '<div class="doc-stamp">' +
        '<div class="doc-stamp-slot"><img class="doc-seal" alt="" src="' + esc(p, seal) + '"></div>' +
        '<div class="doc-stamp-caption">' + L(p, 'COMPANY SEAL', '公司盖章') + '</div>' +
        '</div>';
    }
    return '<div class="doc-stamp">' +
      '<div class="doc-stamp-slot doc-stamp-slot--empty"></div>' +
      '<div class="doc-stamp-caption">' + L(p, 'COMPANY SEAL', '公司盖章') + '</div>' +
      '</div>';
  }

  function signColumn(p, cfg) {
    var c = cfg || {};
    var html = '<div class="doc-sign-col">';
    html += '<div class="doc-sign-caption">' + L(p, c.titleEn || 'FOR AND ON BEHALF OF THE SELLER', c.titleCn || '卖方签字') + '</div>';
    if (hasText(c.entity)) {
      html += '<div class="doc-sign-company">' + esc(p, txt(c.entity)) + '</div>';
    }
    html += '<div class="doc-sign-line"></div>';
    if (c.showSigner !== false && p.showSignature && (hasText(p.company.signer) || hasText(p.company.signerTitle))) {
      html += '<div class="doc-sign-name">' + esc(p, txt(p.company.signer));
      if (hasText(p.company.signerTitle)) {
        html += '<span class="doc-sign-title">' + esc(p, txt(p.company.signerTitle)) + '</span>';
      }
      html += '</div>';
    } else {
      html += '<div class="doc-sign-hint">' + L(p, c.hintEn || 'AUTHORIZED SIGNATURE', c.hintCn || '授权签字') + '</div>';
    }
    html += '<div class="doc-sign-date-line">' + L(p, 'DATE', '日期') + ': ______________________</div>';
    html += '</div>';
    return html;
  }

  function signatureSection(p) {
    return '<div class="doc-signatures">' +
      signColumn(p, { entity: p.company.nameEn || p.company.nameCn }) +
      stampBlock(p) +
      '</div>';
  }

  function dualSignatureSection(p) {
    var buyerName = txt(p.buyer.nameEn) || txt(p.buyer.nameCn);
    return '<div class="doc-signatures doc-signatures--dual">' +
      signColumn(p, { entity: p.company.nameEn || p.company.nameCn, titleEn: 'FOR AND ON BEHALF OF THE SELLER', titleCn: '卖方签字盖章' }) +
      signColumn(p, { entity: buyerName, showSigner: false, titleEn: 'FOR AND ON BEHALF OF THE BUYER', titleCn: '买方签字盖章' }) +
      stampBlock(p) +
      '</div>';
  }

  function footer(p, totalPages) {
    var total = totalPages || 1;
    var company = txt(p.company.nameEn) || txt(p.company.nameCn);
    var docName = p.chinese
      ? (txt(p.entry.nameCn) + ' / ' + txt(p.entry.nameEn))
      : (txt(p.entry.nameEn) + (biq(p) ? ' / ' + txt(p.entry.nameCn) : ''));
    var pageLabel = p.chinese
      ? '第 <span class="doc-page-no"></span> 页 / 共 ' + total + ' 页'
      : 'PAGE <span class="doc-page-no"></span> OF ' + total;
    return '<footer class="doc-footer">' +
      '<span class="doc-footer-company">' + esc(p, company) + '</span>' +
      '<span class="doc-footer-doc">' + esc(p, docName) + '</span>' +
      '<span class="doc-footer-page">' + pageLabel + '</span>' +
      '</footer>';
  }

  /* ------------------------------------------------------------------ */
  /*  Tables                                                             */
  /* ------------------------------------------------------------------ */

  function itemDescHtml(p, line) {
    var parts = [];
    var name = txt(line.nameEn) || txt(line.nameCn);
    if (hasText(name)) {
      var extras = [];
      if (!biq(p) && hasText(line.code)) extras.push('<span class="doc-item-code">' + esc(p, txt(line.code)) + '</span>');
      if (!biq(p) && hasText(line.specEn)) extras.push('<span class="doc-item-spec">' + esc(p, txt(line.specEn)) + '</span>');
      parts.push('<div class="doc-item-name">' + esc(p, name) + (extras.length ? ' ' + extras.join(' ') : '') + '</div>');
    }
    var nameCn = txt(line.nameCn);
    if (biq(p) && hasText(nameCn) && nameCn !== name) {
      parts.push('<div class="doc-item-sub">' + esc(p, nameCn) + '</div>');
    }
    if (hasText(line.remarks)) parts.push('<div class="doc-item-note">' + esc(p, txt(line.remarks)) + '</div>');
    return parts.join('');
  }

  function emptyRow(p, cols) {
    return '<tr><td colspan="' + cols + '" class="doc-empty">' + L(p, 'NO ITEMS RECORDED', '暂无货物明细') + '</td></tr>';
  }

  function invoiceItemsTable(p) {
    var head = '<thead><tr>' +
      '<th class="doc-col-no">' + L(p, 'NO.', '序号') + '</th>' +
      '<th class="doc-col-desc">' + L(p, 'DESCRIPTION OF GOODS', '货物名称') + '</th>' +
      '<th class="doc-col-hs">' + L(p, 'HS CODE', '海关编码') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'QTY', '数量') + '</th>' +
      '<th class="doc-col-unit">' + L(p, 'UNIT', '单位') + '</th>' +
      '<th class="doc-col-price doc-r">' + L(p, 'UNIT PRICE (' + txt(p.currency) + ')', '单价') + '</th>' +
      '<th class="doc-col-amount doc-r">' + L(p, 'AMOUNT (' + txt(p.currency) + ')', '金额') + '</th>' +
      '</tr></thead>';
    var rows = [];
    var lines = p.calc.lines || [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      rows.push('<tr>' +
        '<td class="doc-c">' + (i + 1) + '</td>' +
        '<td class="doc-cell-desc">' + itemDescHtml(p, line) + '</td>' +
        '<td class="doc-c">' + esc(p, txt(line.hsCode)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.qty)) + '</td>' +
        '<td class="doc-c">' + esc(p, txt(line.unit)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.unitPrice, 2)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.amount, 2)) + '</td>' +
        '</tr>');
    }
    if (!rows.length) rows.push(emptyRow(p, 7));
    return '<table class="doc-table doc-table--items invoice-table"><colgroup>' +
      '<col class="doc-col-no"><col class="doc-col-desc"><col class="doc-col-hs">' +
      '<col class="doc-col-qty"><col class="doc-col-unit"><col class="doc-col-price"><col class="doc-col-amount">' +
      '</colgroup>' + head + '<tbody>' + rows.join('') + '</tbody></table>';
  }

  function totalRows(p) {
    var c = p.calc;
    var rows = [
      { en: 'MERCHANDISE TOTAL', cn: '货值合计', value: p.core.fmtMoney(c.merchandiseTotal, p.currency) }
    ];
    if (c.freight) rows.push({ en: 'FREIGHT', cn: '运费', value: p.core.fmtMoney(c.freight, p.currency) });
    if (c.insurance) rows.push({ en: 'INSURANCE', cn: '保险费', value: p.core.fmtMoney(c.insurance, p.currency) });
    if (c.other) rows.push({ en: 'OTHER CHARGES', cn: '其他费用', value: p.core.fmtMoney(c.other, p.currency) });
    if (c.discount) rows.push({ en: 'DISCOUNT', cn: '折扣', value: p.core.fmtMoney(-c.discount, p.currency) });
    rows.push({ en: 'TOTAL AMOUNT', cn: '合计金额', value: p.core.fmtMoney(c.grandTotal, p.currency), strong: true });
    return rows;
  }

  function totalsTable(p, rows) {
    var html = '<table class="doc-table doc-table--totals"><tbody>';
    for (var i = 0; i < rows.length; i++) {
      html += '<tr' + (rows[i].strong ? ' class="doc-totals-strong"' : '') + '>' +
        '<th>' + L(p, rows[i].en, rows[i].cn) + '</th>' +
        '<td class="doc-r">' + esc(p, rows[i].value) + '</td>' +
        '</tr>';
    }
    return html + '</tbody></table>';
  }

  function amountWordsBlock(p, cfg) {
    var c = cfg || {};
    var html = '<div class="doc-amount-words">' +
      '<div class="doc-amount-words-label">' + L(p, c.enLabel || 'AMOUNT IN WORDS', c.cnLabel || '金额大写') + '</div>' +
      '<div class="doc-amount-words-value">' + esc(p, p.calc.amountInWordsEn) + '</div>';
    if (c.cn === true) {
      html += '<div class="doc-amount-words-cn">' + esc(p, p.calc.amountInWordsCn) + '</div>';
    }
    return html + '</div>';
  }

  function invoiceSummary(p, cfg) {
    var c = cfg || {};
    return '<div class="doc-summary">' +
      '<div class="doc-summary-words">' + amountWordsBlock(p, { cn: c.cnWords === true }) + '</div>' +
      '<div class="doc-summary-totals">' + totalsTable(p, totalRows(p)) + '</div>' +
      '</div>';
  }

  function bankBlock(p) {
    var b = p.bank || {};
    var rows = [
      ['BENEFICIARY', '收款人', txt(b.beneficiaryEn) || txt(p.company.nameEn)],
      ['BANK NAME', '开户银行', b.bankNameEn],
      ['BANK ADDRESS', '银行地址', b.bankAddressEn],
      ['ACCOUNT NO.', '银行账号', b.accountNo],
      ['SWIFT CODE', 'SWIFT 代码', b.swift],
      ['IBAN', 'IBAN', b.iban],
      ['INTERMEDIARY BANK', '中转银行', b.intermediary]
    ];
    var any = false;
    for (var i = 0; i < rows.length; i++) {
      if (hasText(rows[i][2])) { any = true; break; }
    }
    if (!any) return '';
    var html = '<div class="doc-bank">' +
      blockTitle(p, 'BANKING DETAILS', '银行信息') +
      '<div class="doc-bank-grid">';
    for (var j = 0; j < rows.length; j++) {
      if (!hasText(rows[j][2])) continue;
      var label = esc(p, rows[j][0]);
      html += '<div class="doc-bank-item">' +
        '<span class="doc-bank-label">' + label + '</span>' +
        '<span class="doc-bank-value">' + esc(p, txt(rows[j][2])) + '</span>' +
        '</div>';
    }
    return html + '</div></div>';
  }

  /* ------------------------------------------------------------------ */
  /*  Common detail rows                                                 */
  /* ------------------------------------------------------------------ */

  function shipmentRows(p) {
    return [
      ['INCOTERM', '贸易术语', incoterm(p)],
      ['PORT OF LOADING', '起运港', portOfLoading(p)],
      ['PORT OF DISCHARGE', '目的港', portOfDischarge(p)],
      ['FINAL DESTINATION', '最终目的地', txt(p.order.finalDestination)],
      ['VESSEL / VOYAGE', '船名航次', vesselText(p)],
      ['TRANSPORT MODE', '运输方式', transportEn(p)],
      ['ETD', '预计开船日', dateText(p, p.order.etd)],
      ['COUNTRY OF ORIGIN', '原产国', originValue(p)]
    ];
  }

  /* ------------------------------------------------------------------ */
  /*  Sheet / page wrappers                                              */
  /* ------------------------------------------------------------------ */

  function sheet(p, body, extraClass) {
    return '<article class="doc-sheet doc-sheet--' + p.key +
      (p.bilingual ? ' doc-sheet--bilingual' : '') +
      (extraClass ? ' ' + extraClass : '') +
      '" data-doc="' + p.key + '" role="document" aria-label="' + esc(p, p.entry.nameEn) + '">' +
      body + '</article>';
  }

  function pageStart(p, extraClass) {
    return '<div class="doc-page' + (extraClass ? ' ' + extraClass : '') + '">';
  }

  function pageEnd() {
    return '</div>';
  }

  /* ------------------------------------------------------------------ */
  /*  prepare() + render()                                               */
  /* ------------------------------------------------------------------ */

  function prepare(key, ctx) {
    var core = ctx && ctx.core;
    if (!core || typeof core.esc !== 'function' || typeof core.calcOrder !== 'function') {
      throw new TypeError('TradeDocs.docs.render(key, ctx): ctx.core (TradeDocs.core) is required');
    }
    var entry = findEntry(key);
    if (!entry) {
      throw new Error('TradeDocs.docs.render: unknown document type "' + txt(key) + '"');
    }
    var state = ctx.state || {};
    var settings = state.settings || {};
    var order = ctx.order || {};
    var meta = ctx.meta || {};
    var opts = ctx.opts || {};
    var p = {
      key: key,
      entry: entry,
      core: core,
      state: state,
      settings: settings,
      order: order,
      meta: meta,
      opts: opts,
      company: settings.company || {},
      bank: settings.bank || {},
      defaults: settings.defaults || {},
      buyer: order.buyer || {},
      calc: core.calcOrder(order),
      cost: core.calcCost(order),
      currency: txt(order.currency) || txt((settings.defaults || {}).currency) || 'USD',
      bilingual: opts.bilingual === true,
      showSeal: opts.showSeal !== false,
      showSignature: opts.showSignature !== false,
      chinese: key === 'cd' || key === 'cs',
      alwaysBi: key === 'bk' || key === 'cd' || key === 'cs',
      dateISO: hasText(meta.date) ? txt(meta.date) : txt(order.date),
      dateText: ''
    };
    p.dateText = dateText(p, p.dateISO);
    return p;
  }

  function render(key, ctx) {
    var p = prepare(key, ctx);
    var renderer = RENDERERS[p.key];
    return renderer(p);
  }

  /* ------------------------------------------------------------------ */
  /*  Render dispatch (template functions are hoisted below)             */
  /* ------------------------------------------------------------------ */

  var RENDERERS = {
    ci: renderCI,
    pl: renderPL,
    pi: renderPI,
    sc: renderSC,
    qt: renderQT,
    bk: renderBK,
    sa: renderSA,
    cd: renderCD,
    co: renderCO,
    bc: renderBC,
    dr: renderDR,
    cs: renderCS
  };

  /* ================================================================== */
  /*  CI — Commercial Invoice (§7.1)                                     */
  /* ================================================================== */

  function renderCI(p) {
    var meta = [
      ['INVOICE NO.', '发票号', p.meta.no],
      ['DATE', '日期', p.dateText],
      ['CONTRACT NO.', '合同号', contractNo(p)],
      ['L/C NO.', '信用证号', txt(p.order.lcNo)],
      ['L/C DATE', '开证日期', dateText(p, p.order.lcDate)],
      ['INCOTERM', '贸易术语', incoterm(p)],
      ['CURRENCY', '币制', p.currency],
      ['TRANSPORT', '运输方式', transportEn(p)]
    ];
    var parties = partiesRow(p, [
      ['BUYER', '买方', p.buyer],
      ['CONSIGNEE', '收货人', consigneeParty(p)],
      ['NOTIFY PARTY', '通知人', notifyParty(p)]
    ]);
    var shipment = detailsGrid(p, [
      ['PORT OF LOADING', '起运港', portOfLoading(p)],
      ['PORT OF DISCHARGE', '目的港', portOfDischarge(p)],
      ['FINAL DESTINATION', '最终目的地', txt(p.order.finalDestination)],
      ['COUNTRY OF DESTINATION', '目的国', destinationCountry(p)],
      ['VESSEL / VOYAGE', '船名航次', vesselText(p)],
      ['ETD', '预计开船日', dateText(p, p.order.etd)],
      ['COUNTRY OF ORIGIN', '原产国', originValue(p)],
      ['L/C ISSUING BANK', '开证银行', p.order.lcIssuingBank]
    ]);
    var bottomMain = bankBlock(p) + declarationBlock(p, p.defaults.declaration);
    var body =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta) +
      parties +
      shipment +
      '<div class="doc-duo">' + marksBlock(p) + paymentBlock(p) + '</div>' +
      invoiceItemsTable(p) +
      invoiceSummary(p, { cnWords: p.bilingual }) +
      '<div class="doc-bottom">' +
        '<div class="doc-bottom-main">' + bottomMain + '</div>' +
        '<div class="doc-bottom-side">' + signatureSection(p) + '</div>' +
      '</div>' +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  PL — Packing List (§7.2, no prices)                                */
  /* ================================================================== */

  function packingTable(p) {
    var head = '<thead><tr>' +
      '<th class="doc-col-no">' + L(p, 'NO.', '序号') + '</th>' +
      '<th class="doc-col-desc">' + L(p, 'DESCRIPTION OF GOODS', '货物名称') + '</th>' +
      '<th class="doc-col-cno">' + L(p, 'CARTON NOS.', '箱号') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'CTNS', '箱数') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'QTY/CTN', '每箱数量') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'TOTAL QTY', '总数量') + '</th>' +
      '<th class="doc-col-w doc-r">' + L(p, 'N.W. (KGS)', '净重') + '</th>' +
      '<th class="doc-col-w doc-r">' + L(p, 'G.W. (KGS)', '毛重') + '</th>' +
      '<th class="doc-col-cbm doc-r">' + L(p, 'MEAS. (CBM)', '体积') + '</th>' +
      '</tr></thead>';
    var lines = p.calc.lines || [];
    var rows = [];
    var cursor = 1;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var ctns = Math.round(p.core.num(line.cartonsCalc, 0));
      var range = '';
      if (ctns > 0) {
        range = cursor + ' - ' + (cursor + ctns - 1);
        cursor += ctns;
      }
      rows.push('<tr>' +
        '<td class="doc-c">' + (i + 1) + '</td>' +
        '<td class="doc-cell-desc">' + itemDescHtml(p, line) + '</td>' +
        '<td class="doc-c">' + esc(p, range) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.cartonsCalc)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.qtyPerCarton)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.qty)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.netWeightTotal, 3)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.grossWeightTotal, 3)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.cbmTotal, 3)) + '</td>' +
        '</tr>');
    }
    if (!rows.length) rows.push(emptyRow(p, 9));
    var c = p.calc;
    var foot = '<tfoot><tr class="doc-totals-strong">' +
      '<td colspan="3">' + L(p, 'TOTAL', '合计') + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtQty(c.totalCartons)) + '</td>' +
      '<td class="doc-r"></td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtQty(c.totalQty)) + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtNum(c.totalNetWeight, 3)) + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtNum(c.totalGrossWeight, 3)) + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtNum(c.totalCbm, 3)) + '</td>' +
      '</tr></tfoot>';
    return '<table class="doc-table doc-table--items packing-table"><colgroup>' +
      '<col class="doc-col-no"><col class="doc-col-desc"><col class="doc-col-cno">' +
      '<col class="doc-col-qty"><col class="doc-col-qty"><col class="doc-col-qty">' +
      '<col class="doc-col-w"><col class="doc-col-w"><col class="doc-col-cbm">' +
      '</colgroup>' + head + '<tbody>' + rows.join('') + '</tbody>' + foot + '</table>';
  }

  function statsRow(p, items) {
    var html = '<div class="doc-stats">';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="doc-stat">' +
        '<div class="doc-stat-value">' + esc(p, items[i][2]) + '</div>' +
        '<div class="doc-stat-label">' + L(p, items[i][0], items[i][1]) + '</div>' +
        '</div>';
    }
    return html + '</div>';
  }

  function renderPL(p) {
    var meta = [
      ['PACKING LIST NO.', '装箱单号', p.meta.no],
      ['DATE', '日期', p.dateText],
      ['INVOICE NO.', '发票号', invoiceNo(p)],
      ['CONTRACT NO.', '合同号', contractNo(p)]
    ];
    var parties = partiesRow(p, [
      ['BUYER', '买方', p.buyer],
      ['CONSIGNEE', '收货人', consigneeParty(p)]
    ], 'doc-parties--2');
    var shipment = detailsGrid(p, [
      ['PORT OF LOADING', '起运港', portOfLoading(p)],
      ['PORT OF DISCHARGE', '目的港', portOfDischarge(p)],
      ['FINAL DESTINATION', '最终目的地', txt(p.order.finalDestination)],
      ['VESSEL / VOYAGE', '船名航次', vesselText(p)],
      ['ETD', '预计开船日', dateText(p, p.order.etd)],
      ['COUNTRY OF ORIGIN', '原产国', originValue(p)],
      ['COUNTRY OF DESTINATION', '目的国', destinationCountry(p)],
      ['INCOTERM', '贸易术语', incoterm(p)]
    ]);
    var stats = statsRow(p, [
      ['TOTAL CARTONS', '总箱数', p.core.fmtQty(p.calc.totalCartons) + ' CARTONS'],
      ['TOTAL NET WEIGHT', '总净重', p.core.fmtNum(p.calc.totalNetWeight, 3) + ' KGS'],
      ['TOTAL GROSS WEIGHT', '总毛重', p.core.fmtNum(p.calc.totalGrossWeight, 3) + ' KGS'],
      ['TOTAL MEASUREMENT', '总体积', p.core.fmtNum(p.calc.totalCbm, 3) + ' CBM']
    ]);
    var body =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta) +
      parties +
      shipment +
      '<div class="doc-duo">' + marksBlock(p) +
        noteBlock(p, 'PACKING NOTE', '包装说明', 'THE GOODS ARE PACKED IN EXPORT-STANDARD CARTONS SUITABLE FOR LONG-DISTANCE OCEAN TRANSPORT AND PROTECTED AGAINST MOISTURE AND ROUGH HANDLING.') +
      '</div>' +
      packingTable(p) +
      stats +
      remarksBlock(p) +
      signatureSection(p) +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  PI — Proforma Invoice (§7.3)                                       */
  /* ================================================================== */

  function validityText(p) {
    var until = addDays(p, p.dateISO, 30);
    if (hasText(until)) return 'VALID UNTIL ' + until + ' (30 DAYS FROM THE DATE OF THIS INVOICE).';
    return '30 DAYS FROM THE DATE OF THIS PROFORMA INVOICE.';
  }

  function deliveryText(p) {
    var etd = dateText(p, p.order.etd);
    if (hasText(etd)) return 'ON OR ABOUT ' + etd + ', SUBJECT TO ORDER CONFIRMATION.';
    return 'WITHIN 30 DAYS AFTER RECEIPT OF THE DOWN PAYMENT.';
  }

  function renderPI(p) {
    var meta = [
      ['PROFORMA INVOICE NO.', '形式发票号', p.meta.no],
      ['DATE', '日期', p.dateText],
      ['CONTRACT NO.', '合同号', contractNo(p)],
      ['L/C NO.', '信用证号', txt(p.order.lcNo)],
      ['L/C DATE', '开证日期', dateText(p, p.order.lcDate)],
      ['L/C ISSUING BANK', '开证银行', txt(p.order.lcIssuingBank)],
      ['INCOTERM', '贸易术语', incoterm(p)],
      ['CURRENCY', '币制', p.currency]
    ];
    var parties = partiesRow(p, [
      ['BUYER', '买方', p.buyer],
      ['CONSIGNEE', '收货人', consigneeParty(p)],
      ['NOTIFY PARTY', '通知人', notifyParty(p)]
    ]);
    var shipment = detailsGrid(p, [
      ['PORT OF LOADING', '起运港', portOfLoading(p)],
      ['PORT OF DISCHARGE', '目的港', portOfDischarge(p)],
      ['FINAL DESTINATION', '最终目的地', txt(p.order.finalDestination)],
      ['COUNTRY OF DESTINATION', '目的国', destinationCountry(p)],
      ['VESSEL / VOYAGE', '船名航次', vesselText(p)],
      ['ETD', '预计开船日', dateText(p, p.order.etd)],
      ['COUNTRY OF ORIGIN', '原产国', originValue(p)],
      ['DELIVERY TIME', '交货期', deliveryText(p)]
    ]);
    var termsNote = noteBlock(p, 'TERMS & VALIDITY', '条款与有效期',
      validityText(p) +
      '\nPAYMENT TERMS: ' + (hasText(paymentTerms(p)) ? paymentTerms(p) : 'TO BE CONFIRMED') +
      '\nTHIS PROFORMA INVOICE IS ISSUED FOR THE BUYER\'S CONFIRMATION ONLY AND IS NOT A TAX INVOICE.');
    var body =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta) +
      parties +
      shipment +
      '<div class="doc-duo">' + marksBlock(p) + termsNote + '</div>' +
      invoiceItemsTable(p) +
      invoiceSummary(p, { cnWords: p.bilingual }) +
      '<div class="doc-bottom">' +
        '<div class="doc-bottom-main">' + bankBlock(p) + '</div>' +
        '<div class="doc-bottom-side">' + signatureSection(p) + '</div>' +
      '</div>' +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  SC — Sales Contract, 2 A4 pages (§7.4)                             */
  /* ================================================================== */

  function sellerParty(p) {
    return {
      nameEn: p.company.nameEn,
      nameCn: p.company.nameCn,
      addressEn: p.company.addressEn,
      addressCn: p.company.addressCn,
      country: p.company.country,
      contact: p.company.signer,
      tel: p.company.tel,
      email: p.company.email,
      taxId: p.company.taxId
    };
  }

  function scClauses(p) {
    return [
      {
        en: 'QUALITY', cn: '质量',
        body: 'THE QUALITY OF THE GOODS SHALL CONFORM TO THE SPECIFICATIONS AND SAMPLES CONFIRMED BY BOTH PARTIES. ANY CLAIM REGARDING QUALITY SHALL BE RAISED IN WRITING WITHIN 30 DAYS AFTER THE ARRIVAL OF THE GOODS AT THE PORT OF DESTINATION, SUPPORTED BY AN INSPECTION REPORT ISSUED BY A RECOGNISED SURVEYOR.',
        cnBody: '货物质量应符合双方确认的规格与样品；质量异议须在货物到达目的港后 30 天内书面提出，并附认可的检验机构报告。'
      },
      {
        en: 'PACKING', cn: '包装',
        body: 'THE GOODS SHALL BE PACKED IN EXPORT-STANDARD CARTONS SUITABLE FOR LONG-DISTANCE OCEAN TRANSPORT AND PROTECTED AGAINST MOISTURE AND ROUGH HANDLING. SHIPPING MARKS SHALL BE STENCILLED ON EACH PACKAGE AS AGREED BY BOTH PARTIES.',
        cnBody: '货物应以适合长途海运的出口标准纸箱包装，防潮防震；每件包装按双方约定刷唛。'
      },
      {
        en: 'SHIPMENT', cn: '装运',
        body: 'THE SELLER SHALL SHIP THE GOODS ON OR ABOUT THE ETD STIPULATED IN THIS CONTRACT. PARTIAL SHIPMENT AND TRANSHIPMENT ARE NOT ALLOWED UNLESS OTHERWISE AGREED IN WRITING. THE SELLER SHALL ADVISE THE BUYER OF THE SHIPMENT DETAILS IMMEDIATELY AFTER LOADING.',
        cnBody: '卖方应按合同约定日期装运；未经书面同意不得分批装运或转运；装船后立即通知买方装运细节。'
      },
      {
        en: 'PAYMENT', cn: '付款',
        body: function () {
          return 'THE BUYER SHALL PAY ' + esc(p, paymentTerms(p) || 'T/T') +
            '. THE SELLER SHALL PRESENT A COMMERCIAL INVOICE, PACKING LIST, FULL SET OF CLEAN ON BOARD BILL OF LADING, CERTIFICATE OF ORIGIN AND, IF APPLICABLE, AN INSURANCE POLICY.';
        },
        cnBody: '买方按合同约定的付款方式支付货款；卖方提交商业发票、装箱单、全套清洁已装船提单、原产地证及（如适用）保险单。'
      },
      {
        en: 'INSPECTION', cn: '检验',
        body: 'THE SELLER\'S INSPECTION AT THE PORT OF LOADING SHALL BE FINAL AS TO QUANTITY AND PACKING. THE BUYER MAY INSPECT THE GOODS AT THE PORT OF DESTINATION; ANY DISCREPANCY SHALL BE NOTIFIED TO THE SELLER WITHIN 15 DAYS AFTER ARRIVAL.',
        cnBody: '以装运港检验的数量与包装为准；买方可在目的港复检，异议须在到货后 15 天内通知卖方。'
      },
      {
        en: 'FORCE MAJEURE', cn: '不可抗力',
        body: 'NEITHER PARTY SHALL BE LIABLE FOR DELAY OR FAILURE TO PERFORM CAUSED BY FORCE MAJEURE, INCLUDING BUT NOT LIMITED TO WAR, FLOOD, FIRE, EARTHQUAKE, EPIDEMIC, GOVERNMENTAL RESTRICTIONS OR STRIKES. THE AFFECTED PARTY SHALL NOTIFY THE OTHER PARTY WITHIN 14 DAYS AND PROVIDE A CERTIFICATE ISSUED BY THE COMPETENT AUTHORITY.',
        cnBody: '因战争、洪水、火灾、地震、疫情、政府限制或罢工等不可抗力导致的迟延或不能履行，双方互不承担责任；受影响方须在 14 天内通知对方并提供主管机关证明。'
      },
      {
        en: 'ARBITRATION', cn: '仲裁',
        body: 'ALL DISPUTES ARISING OUT OF OR IN CONNECTION WITH THIS CONTRACT SHALL BE SUBMITTED TO THE CHINA INTERNATIONAL ECONOMIC AND TRADE ARBITRATION COMMISSION (CIETAC) FOR ARBITRATION IN ACCORDANCE WITH ITS RULES THEN IN EFFECT. THE ARBITRAL AWARD SHALL BE FINAL AND BINDING UPON BOTH PARTIES.',
        cnBody: '本合同项下争议提交中国国际经济贸易仲裁委员会（CIETAC）按其现行规则仲裁，裁决为终局并对双方有约束力。'
      },
      {
        en: 'APPLICABLE LAW', cn: '适用法律',
        body: 'THIS CONTRACT SHALL BE GOVERNED BY AND CONSTRUED IN ACCORDANCE WITH THE LAWS OF THE PEOPLE\'S REPUBLIC OF CHINA. THE UNITED NATIONS CONVENTION ON CONTRACTS FOR THE INTERNATIONAL SALE OF GOODS (CISG) SHALL NOT APPLY.',
        cnBody: '本合同适用中华人民共和国法律；《联合国国际货物销售合同公约》（CISG）不适用。'
      },
      {
        en: 'DOCUMENTS AND OTHERS', cn: '单据及其他',
        body: 'THE SELLER SHALL PROVIDE THE DOCUMENTS STIPULATED IN THIS CONTRACT. ANY AMENDMENT SHALL BE MADE IN WRITING AND SIGNED BY BOTH PARTIES. THIS CONTRACT IS MADE IN TWO ORIGINALS, ONE FOR EACH PARTY, BOTH BEING EQUALLY AUTHENTIC.',
        cnBody: '卖方提供合同约定的单据；任何修改须书面并经双方签署；本合同一式两份，双方各执一份，同等有效。'
      }
    ];
  }

  function documentsBlock(p) {
    var docs = [
      ['COMMERCIAL INVOICE', '商业发票', '3 COPIES'],
      ['PACKING LIST', '装箱单', '3 COPIES'],
      ['FULL SET OF CLEAN ON BOARD OCEAN BILL OF LADING', '全套清洁已装船海运提单', '3 ORIGINALS'],
      ['CERTIFICATE OF ORIGIN', '一般原产地证', '1 ORIGINAL'],
      ['INSURANCE POLICY', '保险单', 'IF APPLICABLE']
    ];
    var html = '<div class="doc-docs"><div class="doc-block-title">' + L(p, 'DOCUMENTS REQUIRED', '议付单据') + '</div><ul class="doc-doc-list">';
    for (var i = 0; i < docs.length; i++) {
      html += '<li><span class="doc-doc-name">' + esc(p, docs[i][0]) + '</span><span class="doc-doc-qty">' + esc(p, docs[i][2]) + '</span></li>';
    }
    return html + '</ul></div>';
  }

  function scTermsGrid(p) {
    var partial = 'NOT ALLOWED';
    if (/partial/i.test(txt(p.order.remarks))) partial = 'AS PER REMARKS';
    var rows = [
      ['PORT OF LOADING', '起运港', portOfLoading(p)],
      ['PORT OF DISCHARGE', '目的港', portOfDischarge(p)],
      ['SHIPMENT DATE', '装运期', dateText(p, p.order.etd)],
      ['PARTIAL SHIPMENT / TRANSHIPMENT', '分批 / 转运', partial],
      ['PACKING', '包装', 'EXPORT-STANDARD CARTONS'],
      ['COUNTRY OF ORIGIN', '原产国', originValue(p)],
      ['INSURANCE', '保险', /^CIF|^CIP/i.test(incoterm(p)) ? 'TO BE COVERED BY THE SELLER FOR 110% OF THE INVOICE VALUE' : 'TO BE COVERED BY THE BUYER'],
      ['PAYMENT TERMS', '付款方式', paymentTerms(p)]
    ];
    return detailsGrid(p, rows);
  }

  function continuationHeader(p) {
    return '<div class="doc-cont-header">' +
      '<div class="doc-cont-company">' + esc(p, txt(p.company.nameEn) || txt(p.company.nameCn)) + '</div>' +
      '<div class="doc-cont-meta">' + L(p, 'SALES CONTRACT NO. ' + txt(p.meta.no) + ' — CONTINUED', '销售合同续页') + '</div>' +
      '</div>';
  }

  function clauseList(p) {
    var clauses = scClauses(p);
    var html = '<ol class="doc-clauses">';
    for (var i = 0; i < clauses.length; i++) {
      var body = typeof clauses[i].body === 'function' ? clauses[i].body() : esc(p, clauses[i].body);
      html += '<li class="doc-clause">' +
        '<div class="doc-clause-head"><span class="doc-clause-no">' + (i + 1) + '.</span>' +
        '<span class="doc-clause-title">' + L(p, clauses[i].en, clauses[i].cn) + '</span></div>' +
        '<p class="doc-clause-body">' + body + '</p>' +
        (p.bilingual ? '<p class="doc-clause-cn">' + esc(p, clauses[i].cnBody) + '</p>' : '') +
        '</li>';
    }
    return html + '</ol>';
  }

  function renderSC(p) {
    var meta = [
      ['CONTRACT NO.', '合同号', p.meta.no],
      ['DATE', '日期', p.dateText],
      ['PLACE', '签订地点', txt(p.company.city) ? txt(p.company.city) + ', ' + txt(p.company.country) : 'NINGBO, CHINA'],
      ['ORDER NO.', '订单号', txt(p.order.no)],
      ['INCOTERM', '贸易术语', incoterm(p)],
      ['CURRENCY', '币制', p.currency]
    ];
    var intro = '<p class="doc-intro">' + L(
      p,
      'THIS SALES CONTRACT IS MADE BY AND BETWEEN THE SELLER AND THE BUYER, WHEREBY THE SELLER AGREES TO SELL AND THE BUYER AGREES TO BUY THE UNDERMENTIONED COMMODITIES ON THE TERMS AND CONDITIONS SET FORTH BELOW.',
      '买卖双方经友好协商，同意按下列条款买卖下述商品并签订本合同。'
    ) + '</p>';
    var page1 =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta, 'doc-meta-grid--3') +
      partiesRow(p, [
        ['SELLER', '卖方', sellerParty(p)],
        ['BUYER', '买方', p.buyer]
      ], 'doc-parties--2') +
      intro +
      invoiceItemsTable(p) +
      invoiceSummary(p, { cnWords: p.bilingual }) +
      sectionTitle(p, 'TERMS OF DELIVERY', '交货条款') +
      scTermsGrid(p) +
      '<div class="doc-duo">' + marksBlock(p) + documentsBlock(p) + '</div>' +
      footer(p, 2);
    var page2 =
      continuationHeader(p) +
      '<div class="doc-subtitle">' + L(p, 'TERMS AND CONDITIONS', '合同条款') + '</div>' +
      clauseList(p) +
      dualSignatureSection(p) +
      footer(p, 2);
    var body = pageStart(p) + page1 + pageEnd() + pageStart(p) + page2 + pageEnd();
    return sheet(p, body, 'doc-sheet--multi');
  }

  /* ================================================================== */
  /*  QT — Quotation (§7.5)                                              */
  /* ================================================================== */

  function sellerQuotationParty(p) {
    return {
      nameEn: p.company.nameEn,
      nameCn: p.company.nameCn,
      addressEn: p.company.addressEn,
      addressCn: p.company.addressCn,
      country: p.company.country,
      tel: p.company.tel,
      email: p.company.email
    };
  }

  function quotationHeader(p) {
    return detailsGrid(p, [
      ['INCOTERM', '贸易术语', incoterm(p)],
      ['PAYMENT TERMS', '付款方式', paymentTerms(p)],
      ['PORT OF LOADING', '起运港', portOfLoading(p)],
      ['PORT OF DISCHARGE', '目的港', portOfDischarge(p)],
      ['DELIVERY TIME', '交货期', deliveryText(p)],
      ['VALIDITY', '报价有效期', '30 DAYS FROM THE DATE HEREOF'],
      ['PACKING', '包装', 'EXPORT-STANDARD CARTONS'],
      ['COUNTRY OF ORIGIN', '原产国', originValue(p)]
    ]);
  }

  function renderQT(p) {
    var meta = [
      ['QUOTATION NO.', '报价单号', p.meta.no],
      ['DATE', '报价日期', p.dateText],
      ['VALID UNTIL', '有效期至', addDays(p, p.dateISO, 30)],
      ['CURRENCY', '币制', p.currency],
      ['TRANSPORT', '运输方式', transportEn(p)],
      ['REFERENCE', '参考编号', txt(p.order.no)]
    ];
    var body =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta, 'doc-meta-grid--3') +
      partiesRow(p, [
        ['QUOTATION TO', '致（买方）', p.buyer],
        ['QUOTATION FROM', '报价方（卖方）', sellerQuotationParty(p)]
      ], 'doc-parties--2') +
      invoiceItemsTable(p) +
      '<div class="doc-summary doc-summary--right">' +
        '<div class="doc-summary-totals">' + totalsTable(p, totalRows(p)) + '</div>' +
      '</div>' +
      quotationHeader(p) +
      remarksBlock(p) +
      signatureSection(p) +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  BK — Booking Note, bilingual (§7.6)                                */
  /* ================================================================== */

  function sellerShipperParty(p) {
    return {
      nameEn: p.company.nameEn,
      addressEn: p.company.addressEn,
      addressCn: p.company.addressCn,
      country: p.company.country,
      contact: p.company.signer,
      tel: p.company.tel,
      email: p.company.email
    };
  }

  function bkDescHtml(p, line) {
    var name = txt(line.nameEn) || txt(line.nameCn);
    return '<div class="doc-item-name">' + esc(p, name) + '</div>';
  }

  function containerSuggestion(p) {
    var cbm = p.calc.totalCbm;
    if (!(cbm > 0)) return '';
    if (cbm <= 28) return "1 × 20'GP";
    if (cbm <= 58) return "1 × 40'GP";
    return Math.ceil(cbm / 68) + " × 40'HC";
  }

  function freightTerms(p) {
    var it = incoterm(p).toUpperCase();
    if (/^(CFR|CIF|CPT|CIP|DAP|DPU|DDP)/.test(it)) return 'FREIGHT PREPAID / 运费预付';
    return 'FREIGHT COLLECT / 运费到付';
  }

  function bkCargoTable(p) {
    var head = '<thead><tr>' +
      '<th class="doc-col-no">' + L(p, 'NO.', '序号') + '</th>' +
      '<th class="doc-col-desc">' + L(p, 'DESCRIPTION OF GOODS', '品名') + '</th>' +
      '<th class="doc-col-hs">' + L(p, 'HS CODE', '海关编码') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'PKGS', '件数') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'QTY', '数量') + '</th>' +
      '<th class="doc-col-w doc-r">' + L(p, 'G.W. (KGS)', '毛重') + '</th>' +
      '<th class="doc-col-cbm doc-r">' + L(p, 'MEAS. (CBM)', '体积') + '</th>' +
      '</tr></thead>';
    var rows = [];
    var lines = p.calc.lines || [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      rows.push('<tr>' +
        '<td class="doc-c">' + (i + 1) + '</td>' +
        '<td class="doc-cell-desc">' + bkDescHtml(p, line) + '</td>' +
        '<td class="doc-c">' + esc(p, txt(line.hsCode)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.cartonsCalc)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.qty)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.grossWeightTotal, 3)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.cbmTotal, 3)) + '</td>' +
        '</tr>');
    }
    if (!rows.length) rows.push(emptyRow(p, 7));
    var c = p.calc;
    var foot = '<tfoot><tr class="doc-totals-strong">' +
      '<td colspan="3">' + L(p, 'TOTAL', '合计') + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtQty(c.totalCartons)) + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtQty(c.totalQty)) + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtNum(c.totalGrossWeight, 3)) + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtNum(c.totalCbm, 3)) + '</td>' +
      '</tr></tfoot>';
    return '<table class="doc-table doc-table--items booking-table"><colgroup>' +
      '<col class="doc-col-no"><col class="doc-col-desc"><col class="doc-col-hs">' +
      '<col class="doc-col-qty"><col class="doc-col-qty"><col class="doc-col-w"><col class="doc-col-cbm">' +
      '</colgroup>' + head + '<tbody>' + rows.join('') + '</tbody>' + foot + '</table>';
  }

  function contactBlock(p) {
    var bits = [];
    if (hasText(p.company.signer)) {
      bits.push('联系 CONTACT: ' + txt(p.company.signer) + (hasText(p.company.signerTitle) ? '（' + txt(p.company.signerTitle) + '）' : ''));
    }
    if (hasText(p.company.tel)) bits.push('电话 TEL: ' + txt(p.company.tel));
    if (hasText(p.company.email)) bits.push('邮箱 EMAIL: ' + txt(p.company.email));
    if (hasText(p.order.etd)) bits.push('开船日 ETD: ' + dateText(p, p.order.etd));
    return bits.length
      ? '<div class="doc-contact">' + esc(p, bits.join('    ·    ')) + '</div>'
      : '';
  }

  function renderBK(p) {
    var meta = [
      ['BOOKING NO.', '委托书编号', p.meta.no],
      ['DATE', '日期', p.dateText],
      ['ORDER NO.', '订单号', txt(p.order.no)],
      ['CONTAINER NO.', '集装箱号', txt(p.order.containerNo)],
      ['SEAL NO.', '封号', txt(p.order.sealNo)],
      ['TRANSPORT MODE', '运输方式', transportCn(p) + (hasText(transportCn(p)) && hasText(transportEn(p)) ? ' / ' : '') + transportEn(p)]
    ];
    var parties = partiesRow(p, [
      ['SHIPPER', '托运人', sellerShipperParty(p)],
      ['CONSIGNEE', '收货人', consigneeParty(p)],
      ['NOTIFY PARTY', '通知人', notifyParty(p)]
    ]);
    var shipment = detailsGrid(p, [
      ['PORT OF LOADING', '起运港', portOfLoading(p)],
      ['PORT OF DISCHARGE', '目的港', portOfDischarge(p)],
      ['VESSEL / VOYAGE', '船名航次', vesselText(p)],
      ['ETD', '预计开船日', dateText(p, p.order.etd)],
      ['CONTAINER TYPE / QTY', '箱型箱量', [containerSuggestion(p), txt(p.order.containerNo) ? 'CNTR: ' + txt(p.order.containerNo) : ''].filter(hasText).join('  /  ')],
      ['FREIGHT TERMS', '运费条款', freightTerms(p)],
      ['COUNTRY OF DESTINATION', '目的国', destinationCountry(p)],
      ['FINAL DESTINATION', '最终目的地', txt(p.order.finalDestination)]
    ]);
    var reqs = noteBlock(p, 'CUSTOMS & B/L REQUIREMENTS', '报关与提单要求',
      'CUSTOMS: THE SHIPPER ARRANGES EXPORT DECLARATION; ALL PACKAGES MUST CARRY THE SHIPPING MARKS ABOVE.\n' +
      'B/L: 3 ORIGINALS + 3 COPIES, CONSIGNED TO ORDER, NOTIFY PARTY AS ABOVE, FREIGHT PREPAID / COLLECT, SHOWING CNTR / SEAL NO. AND MARKS.');
    var body =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta, 'doc-meta-grid--3') +
      parties +
      shipment +
      marksBlock(p) +
      sectionTitle(p, 'CARGO SUMMARY', '货物摘要') +
      bkCargoTable(p) +
      reqs +
      contactBlock(p) +
      signatureSection(p) +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  SA — Shipping Advice (§7.7)                                        */
  /* ================================================================== */

  function saCargoTable(p) {
    var head = '<thead><tr>' +
      '<th class="doc-col-no">' + L(p, 'NO.', '序号') + '</th>' +
      '<th class="doc-col-desc">' + L(p, 'DESCRIPTION OF GOODS', '货物名称') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'QTY', '数量') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'CTNS', '箱数') + '</th>' +
      '<th class="doc-col-w doc-r">' + L(p, 'N.W. (KGS)', '净重') + '</th>' +
      '<th class="doc-col-w doc-r">' + L(p, 'G.W. (KGS)', '毛重') + '</th>' +
      '<th class="doc-col-cbm doc-r">' + L(p, 'MEAS. (CBM)', '体积') + '</th>' +
      '</tr></thead>';
    var rows = [];
    var lines = p.calc.lines || [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      rows.push('<tr>' +
        '<td class="doc-c">' + (i + 1) + '</td>' +
        '<td class="doc-cell-desc">' + itemDescHtml(p, line) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.qty)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.cartonsCalc)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.netWeightTotal, 3)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.grossWeightTotal, 3)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.cbmTotal, 3)) + '</td>' +
        '</tr>');
    }
    if (!rows.length) rows.push(emptyRow(p, 7));
    return '<table class="doc-table doc-table--items advice-table"><colgroup>' +
      '<col class="doc-col-no"><col class="doc-col-desc"><col class="doc-col-qty">' +
      '<col class="doc-col-qty"><col class="doc-col-w"><col class="doc-col-w"><col class="doc-col-cbm">' +
      '</colgroup>' + head + '<tbody>' + rows.join('') + '</tbody></table>';
  }

  function renderSA(p) {
    var meta = [
      ['SHIPPING ADVICE NO.', '装运通知号', p.meta.no],
      ['DATE', '日期', p.dateText],
      ['INVOICE NO.', '发票号', invoiceNo(p)],
      ['CONTRACT NO.', '合同号', contractNo(p)],
      ['B/L NO.', '提单号', txt(p.order.blNo)],
      ['BOOKING NO.', '订舱号', txt(p.order.bookingNo)]
    ];
    var toBlock = '<div class="doc-to">' +
      '<div class="doc-to-label">' + L(p, 'TO', '致') + '</div>' +
      '<div class="doc-to-body">' + partyBody(p, p.buyer) + '</div>' +
      '</div>';
    var intro = '<p class="doc-intro">' + L(
      p,
      'WE HEREBY ADVISE YOU THAT THE GOODS COVERED BY THE CAPTIONED INVOICE HAVE BEEN SHIPPED AS FOLLOWS. PLEASE ARRANGE INSURANCE COVER IF THE GOODS ARE NOT INSURED BY THE SELLER.',
      '兹通知贵方，上述发票项下货物已按下列内容装运。如货物非由卖方投保，请自行安排保险。'
    ) + '</p>';
    var shipment = detailsGrid(p, [
      ['VESSEL / VOYAGE', '船名航次', vesselText(p)],
      ['B/L NO.', '提单号', txt(p.order.blNo)],
      ['CONTAINER NO.', '集装箱号', txt(p.order.containerNo)],
      ['SEAL NO.', '封号', txt(p.order.sealNo)],
      ['ETD', '预计开船日', dateText(p, p.order.etd)],
      ['ETA', '预计到港日', dateText(p, p.order.eta)],
      ['PORT OF LOADING', '装运港', portOfLoading(p)],
      ['PORT OF DISCHARGE', '目的港', portOfDischarge(p)],
      ['FINAL DESTINATION', '最终目的地', txt(p.order.finalDestination)],
      ['TRANSPORT MODE', '运输方式', transportEn(p)],
      ['COUNTRY OF ORIGIN', '原产国', originValue(p)],
      ['TOTAL PACKAGES', '总件数', p.core.fmtQty(p.calc.totalCartons) + ' CTNS']
    ]);
    var declaration = declarationBlock(p,
      'WE HEREBY CERTIFY THAT THE GOODS HAVE BEEN SHIPPED ON BOARD IN APPARENT GOOD ORDER AND CONDITION, AND THAT ALL DOCUMENTS REQUIRED UNDER THE CONTRACT WILL BE FORWARDED AS AGREED. THE BUYER IS REQUESTED TO EFFECT INSURANCE COVER IF THE GOODS ARE NOT INSURED BY THE SELLER.',
      { en: 'DECLARATION', cn: '声明' });
    var body =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta, 'doc-meta-grid--3') +
      toBlock +
      intro +
      shipment +
      saCargoTable(p) +
      '<div class="doc-duo">' + marksBlock(p) + remarksBlock(p) + '</div>' +
      declaration +
      signatureSection(p) +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  CD — Customs Document Checklist, Chinese primary (§7.8)            */
  /* ================================================================== */

  function cdDescHtml(p, line) {
    var cn = txt(line.nameCn);
    var en = txt(line.nameEn);
    var name = cn || en;
    if (!hasText(name)) return '';
    var inline = [];
    if (hasText(en) && en !== name) inline.push('<span class="doc-item-code">' + esc(p, en) + '</span>');
    if (hasText(line.code)) inline.push('<span class="doc-item-code">' + esc(p, txt(line.code)) + '</span>');
    return '<div class="doc-item-name">' + esc(p, name) + (inline.length ? ' ' + inline.join(' ') : '') + '</div>';
  }

  function cdItemsTable(p) {
    var head = '<thead><tr>' +
      '<th class="doc-col-no">序号</th>' +
      '<th class="doc-col-desc">申报品名<span class="doc-bi-en">DESCRIPTION</span></th>' +
      '<th class="doc-col-hs">HS 编码<span class="doc-bi-en">HS CODE</span></th>' +
      '<th class="doc-col-qty doc-r">数量<span class="doc-bi-en">QTY</span></th>' +
      '<th class="doc-col-unit">单位<span class="doc-bi-en">UNIT</span></th>' +
      '<th class="doc-col-unit">币制<span class="doc-bi-en">CUR.</span></th>' +
      '<th class="doc-col-amount doc-r">总价<span class="doc-bi-en">AMOUNT</span></th>' +
      '</tr></thead>';
    var rows = [];
    var lines = p.calc.lines || [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      rows.push('<tr>' +
        '<td class="doc-c">' + (i + 1) + '</td>' +
        '<td class="doc-cell-desc">' + cdDescHtml(p, line) + '</td>' +
        '<td class="doc-c">' + esc(p, txt(line.hsCode)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.qty)) + '</td>' +
        '<td class="doc-c">' + esc(p, txt(line.unit)) + '</td>' +
        '<td class="doc-c">' + esc(p, txt(p.currency)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.amount, 2)) + '</td>' +
        '</tr>');
    }
    if (!rows.length) rows.push(emptyRow(p, 7));
    return '<table class="doc-table doc-table--items cd-table"><colgroup>' +
      '<col class="doc-col-no"><col class="doc-col-desc"><col class="doc-col-hs">' +
      '<col class="doc-col-qty"><col class="doc-col-unit"><col class="doc-col-unit"><col class="doc-col-amount">' +
      '</colgroup>' + head + '<tbody>' + rows.join('') + '</tbody></table>';
  }

  function zhSignRow(p) {
    var prepared = p.showSignature ? txt(p.company.signer) : '';
    return '<div class="doc-cd-sign">' +
      '<div class="doc-cd-sign-item"><span class="doc-cd-sign-label">制表人 PREPARED BY</span>' +
        '<span class="doc-cd-sign-value' + (prepared ? '' : ' doc-cd-sign-value--blank') + '">' + esc(p, prepared) + '</span></div>' +
      '<div class="doc-cd-sign-item"><span class="doc-cd-sign-label">复核 REVIEWED BY</span>' +
        '<span class="doc-cd-sign-line doc-sign-line"></span></div>' +
      '<div class="doc-cd-sign-item"><span class="doc-cd-sign-label">日期 DATE</span>' +
        '<span class="doc-cd-sign-value">' + esc(p, p.dateText) + '</span></div>' +
      '</div>';
  }

  function checkListBlock(p) {    var groups = [
      {
        cn: '必备资料', en: 'REQUIRED DOCUMENTS',
        items: [
          ['商业发票（正本）', 'COMMERCIAL INVOICE'],
          ['装箱单（正本）', 'PACKING LIST'],
          ['销售合同（副本）', 'SALES CONTRACT'],
          ['报关委托书', 'CUSTOMS POWER OF ATTORNEY'],
          ['报关单草单', 'DRAFT CUSTOMS DECLARATION'],
          ['申报要素表', 'DECLARATION ELEMENTS']
        ]
      },
      {
        cn: '按需资料', en: 'DOCUMENTS AS REQUIRED',
        items: [
          ['一般原产地证', 'CERTIFICATE OF ORIGIN'],
          ['出口许可证 / 配额', 'EXPORT LICENSE / QUOTA'],
          ['检验检疫证书', 'INSPECTION & QUARANTINE CERT.'],
          ['保险单', 'INSURANCE POLICY'],
          ['提单 / 场站收据副本', 'B/L COPY / DOCK RECEIPT'],
          ['其他资料', 'OTHERS']
        ]
      }
    ];
    var html = '<div class="doc-checks">';
    for (var g = 0; g < groups.length; g++) {
      html += '<section class="doc-check-group">';
      html += '<div class="doc-check-group-title">' + esc(p, groups[g].cn) + '<span class="doc-bi-en">' + esc(p, groups[g].en) + '</span></div>';
      html += '<ul class="doc-check-list">';
      for (var i = 0; i < groups[g].items.length; i++) {
        html += '<li class="doc-check-item"><span class="doc-check-box"></span>' +
          '<span class="doc-check-text">' + esc(p, groups[g].items[i][0]) +
          '<span class="doc-check-en">' + esc(p, groups[g].items[i][1]) + '</span></span></li>';
      }
      html += '</ul></section>';
    }
    return html + '</div>';
  }

  function renderCD(p) {
    var meta = [
      ['CHECKLIST NO.', '清单编号', p.meta.no],
      ['DATE', '制表日期', p.dateText],
      ['ORDER NO.', '订单号', txt(p.order.no)],
      ['INVOICE NO.', '报关发票号', invoiceNo(p)]
    ];
    var declaration = detailsGrid(p, [
      ['DECLARED VALUE', '申报总金额', p.core.fmtMoney(p.calc.grandTotal, p.currency)],
      ['TOTAL PACKAGES', '总件数（箱）', p.core.fmtQty(p.calc.totalCartons) + ' 箱 / CTNS'],
      ['TOTAL GROSS WEIGHT', '总毛重', p.core.fmtNum(p.calc.totalGrossWeight, 3) + ' KGS'],
      ['TOTAL NET WEIGHT', '总净重', p.core.fmtNum(p.calc.totalNetWeight, 3) + ' KGS'],
      ['TOTAL MEASUREMENT', '总体积', p.core.fmtNum(p.calc.totalCbm, 3) + ' CBM'],
      ['TRADE MODE', '贸易方式', '一般贸易'],
      ['TRANSPORT MODE', '运输方式', transportCn(p) || transportEn(p)],
      ['DESTINATION', '目的国', destinationCountry(p)],
      ['BUYER / CONSIGNEE', '买方 / 收货人', buyerName(p)],
      ['ORDER NO.', '订单号', txt(p.order.no)],
      ['INVOICE NO.', '报关发票号', invoiceNo(p)],
      ['GOODS ITEMS', '商品项数', String((p.calc.lines || []).length) + ' 项 / ITEMS']
    ], 4, true);
    var stamp = p.showSeal ? stampBlock(p) : '';
    var signArea = zhSignRow(p);
    var body =
      letterhead(p) +
      titleBlock(p, { zh: true }) +
      metaGrid(p, meta, null, true) +
      sectionTitle(p, 'DECLARED DATA', '关键申报数据', true) +
      declaration +
      sectionTitle(p, 'GOODS DETAIL', '货物明细', true) +
      cdItemsTable(p) +
      '<div class="doc-duo">' + marksBlock(p) +
        noteBlock(p, 'DECLARATION NOTE', '申报说明', '以上数据依据订单及商业发票整理，报关前请与报关行核对。HS 编码及申报要素以海关最新规定为准。', true) +
      '</div>' +
      sectionTitle(p, 'DOCUMENT CHECKLIST', '资料核对清单', true) +
      checkListBlock(p) +
      '<div class="doc-bottom doc-bottom--cd">' +
        '<div class="doc-bottom-main">' + signArea + '</div>' +
        '<div class="doc-bottom-side">' + stamp + '</div>' +
      '</div>' +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  CO — Certificate of Origin, generic editable layout (§7.9)         */
  /* ================================================================== */

  function coBox(p, num, titleEn, titleCn, bodyHtml, extraClass) {
    return '<section class="doc-co-box' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<div class="doc-co-head"><span class="doc-co-num">' + num + '</span>' +
      '<span class="doc-co-title">' + L(p, titleEn, titleCn) + '</span></div>' +
      '<div class="doc-co-body">' + bodyHtml + '</div>' +
      '</section>';
  }

  function coGoodsTable(p) {
    var head = '<thead><tr>' +
      '<th class="doc-col-desc">' + L(p, 'DESCRIPTION OF GOODS', '货物描述') + '</th>' +
      '<th class="doc-col-hs">' + L(p, 'HS CODE', '海关编码') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'QTY', '数量') + '</th>' +
      '<th class="doc-col-qty doc-r">' + L(p, 'CTNS', '件数') + '</th>' +
      '</tr></thead>';
    var rows = [];
    var lines = p.calc.lines || [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      rows.push('<tr>' +
        '<td class="doc-cell-desc">' + itemDescHtml(p, line) + '</td>' +
        '<td class="doc-c">' + esc(p, txt(line.hsCode)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.qty)) + ' ' + esc(p, txt(line.unit)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.cartonsCalc)) + ' CTNS</td>' +
        '</tr>');
    }
    if (!rows.length) rows.push(emptyRow(p, 4));
    return '<table class="doc-table doc-table--items co-table"><colgroup>' +
      '<col class="doc-col-desc"><col class="doc-col-hs"><col class="doc-col-qty"><col class="doc-col-qty">' +
      '</colgroup>' + head + '<tbody>' + rows.join('') + '</tbody></table>';
  }

  function renderCO(p) {
    var meta = [
      ['CERTIFICATE NO.', '证书编号', p.meta.no],
      ['INVOICE NO.', '发票号', invoiceNo(p)],
      ['INVOICE DATE', '发票日期', dateText(p, relatedDate(p, 'ci', p.dateISO))],
      ['DATE OF ISSUE', '签发日期', p.dateText]
    ];
    var route = 'BY ' + (transportEn(p) || 'SEA');
    var routeDetail = route + ' FROM ' + (portOfLoading(p) || '—') + ' TO ' + (portOfDischarge(p) || '—');
    if (hasText(vesselText(p))) routeDetail += ' BY ' + vesselText(p);
    if (hasText(dateText(p, p.order.etd))) routeDetail += ' ON ' + dateText(p, p.order.etd);
    var disclaimer = 'GENERIC EDITABLE LAYOUT — FOR REFERENCE ONLY. THIS FORM DOES NOT REPRESENT AN OFFICIAL CERTIFICATE OF ORIGIN AND MUST BE ISSUED AND CERTIFIED BY THE COMPETENT AUTHORITY.';
    var disclaimerCn = '通用可编辑版式，仅供参考，不冒充官方原产地证书；正式证书须由签证机构签发。';
    var boxes = '<div class="doc-co-grid">' +
      coBox(p, '1', 'EXPORTER', '出口商', partyBody(p, sellerParty(p)), 'doc-co-box--half') +
      coBox(p, '2', 'CONSIGNEE', '收货人', partyBody(p, p.buyer), 'doc-co-box--half') +
      coBox(p, '3', 'MEANS OF TRANSPORT AND ROUTE', '运输方式与路线', '<div class="doc-pre">' + esc(p, routeDetail) + '</div>', 'doc-co-box--half') +
      coBox(p, '4', 'COUNTRY / REGION OF DESTINATION', '目的国家 / 地区', '<div>' + esc(p, destinationCountry(p) || '') + '</div>', 'doc-co-box--half') +
      coBox(p, '5', 'FOR CERTIFYING AUTHORITY USE ONLY', '签发机构填写栏', '<div class="doc-co-blank doc-co-blank--tall"></div>', 'doc-co-box--full') +
      coBox(p, '6', 'MARKS AND NUMBERS', '唛头及号码', '<div class="doc-pre">' + esc(p, txt(p.order.shippingMarks) || 'N/M') + '</div>', 'doc-co-box--full') +
      coBox(p, '7', 'NUMBER AND KIND OF PACKAGES; DESCRIPTION OF GOODS', '包装件数及货物描述', coGoodsTable(p), 'doc-co-box--full') +
      coBox(p, '8', 'DECLARATION BY THE EXPORTER', '出口商声明',
        '<p class="doc-co-statement">' + esc(p, 'THE UNDERSIGNED HEREBY DECLARES THAT THE GOODS DESCRIBED ABOVE WERE PRODUCED / MANUFACTURED IN ' + originValue(p) + ' AND COMPLY WITH THE ORIGIN REQUIREMENTS OF THE DESTINATION COUNTRY.') + '</p>' +
        '<div class="doc-co-sign">' +
          '<div class="doc-co-sign-item"><span class="doc-sign-caption">' + L(p, 'PLACE / DATE', '地点 / 日期') + '</span><span class="doc-sign-value">' + esc(p, [txt(p.company.city), p.dateText].filter(hasText).join(', ')) + '</span></div>' +
          '<div class="doc-co-sign-item"><span class="doc-sign-caption">' + L(p, 'AUTHORIZED SIGNATURE', '授权签字') + '</span><span class="doc-sign-line"></span><span class="doc-sign-value">' + esc(p, txt(p.company.signer)) + '</span></div>' +
        '</div>' +
        (p.showSeal ? stampBlock(p) : ''),
        'doc-co-box--half') +
      coBox(p, '9', 'CERTIFICATION', '签证机构证明',
        '<div class="doc-co-statement doc-co-statement--muted">' + L(p, 'TO BE COMPLETED BY THE ISSUING AUTHORITY.', '由签发机构填写。') + '</div>' +
        '<div class="doc-co-cert">' +
          '<div class="doc-co-blank">' + L(p, 'PLACE / DATE', '地点 / 日期') + ':</div>' +
          '<div class="doc-co-blank doc-co-blank--tall">' + L(p, 'AUTHORIZED SIGNATURE AND STAMP', '授权签字及印章') + ':</div>' +
        '</div>',
        'doc-co-box--half') +
      '</div>';
    var body =
      letterhead(p) +
      titleBlock(p) +
      '<p class="doc-disclaimer">' + esc(p, disclaimer) + (p.bilingual ? '<br>' + esc(p, disclaimerCn) : '') + '</p>' +
      metaGrid(p, meta) +
      boxes +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  BC — Beneficiary's Certificate (§7.10)                             */
  /* ================================================================== */

  function renderBC(p) {
    var meta = [
      ['CERTIFICATE NO.', '证明编号', p.meta.no],
      ['DATE', '日期', p.dateText],
      ['L/C NO.', '信用证号', txt(p.order.lcNo)],
      ['L/C DATE', '开证日期', dateText(p, p.order.lcDate)],
      ['INVOICE NO.', '发票号', invoiceNo(p)],
      ['CONTRACT NO.', '合同号', contractNo(p)],
      ['L/C ISSUING BANK', '开证银行', txt(p.order.lcIssuingBank)],
      ['ORDER NO.', '订单号', txt(p.order.no)]
    ];
    var statements = [];
    var custom = txt(p.defaults.certStatement).replace(/^\s*WE\s+HEREBY\s+CERTIFY\s+THAT\s+/i, '').trim();
    if (hasText(custom)) {
      statements.push(custom);
      statements.push('NO DISCREPANT DOCUMENTS HAVE BEEN PRESENTED UNDER THE ABOVE CREDIT.');
    } else {
      statements.push('THE GOODS DESCRIBED IN THE ABOVE INVOICE HAVE BEEN SHIPPED IN CONFORMITY WITH THE TERMS AND CONDITIONS OF THE SAID CREDIT / CONTRACT.');
      statements.push('ALL DOCUMENTS REQUIRED UNDER THE CREDIT HAVE BEEN PRESENTED / WILL BE PRESENTED STRICTLY IN ACCORDANCE WITH THE TERMS OF THE SAID CREDIT.');
      statements.push('NO DISCREPANT DOCUMENTS HAVE BEEN PRESENTED UNDER THE ABOVE CREDIT.');
    }
    var statementHtml = '<ol class="doc-statements">';
    for (var i = 0; i < statements.length; i++) {
      statementHtml += '<li>' + esc(p, statements[i]) + '</li>';
    }
    statementHtml += '</ol>';
    var body =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta) +
      '<div class="doc-to">' +
        '<div class="doc-to-label">' + L(p, 'TO', '致') + '</div>' +
        '<div class="doc-to-body">' + partyBody(p, p.buyer) + '</div>' +
      '</div>' +
      '<div class="doc-statement-wrap">' +
        '<div class="doc-certify-lead">' + L(p, 'WE HEREBY CERTIFY THAT:', '兹证明如下：') + '</div>' +
        statementHtml +
      '</div>' +
      sectionTitle(p, 'GOODS SHIPPED', '装运货物') +
      invoiceItemsTable(p) +
      '<div class="doc-duo">' + marksBlock(p) + remarksBlock(p) + '</div>' +
      '<div class="doc-bottom">' +
        '<div class="doc-bottom-main">' + noteBlock(p, 'CERTIFICATE NOTE', '证明说明', 'THIS CERTIFICATE IS ISSUED FOR THE PURPOSE OF THE ABOVE CREDIT AND IS NOT TRANSFERABLE.') + '</div>' +
        '<div class="doc-bottom-side">' + signatureSection(p) + '</div>' +
      '</div>' +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  DR — Bill of Exchange (§7.11)                                      */
  /* ================================================================== */

  function tenorText(p) {
    var terms = paymentTerms(p).toUpperCase();
    var m = terms.match(/(\d+)\s*DAYS?/);
    if (m && m[1]) return 'AT ' + String(Number(m[1])) + ' DAYS AFTER SIGHT';
    if (/SIGHT/.test(terms)) return 'AT SIGHT';
    return 'AT SIGHT';
  }

  function draweeText(p) {
    if (hasText(p.order.lcIssuingBank)) return txt(p.order.lcIssuingBank);
    var name = txt(p.buyer.nameEn) || txt(p.buyer.nameCn);
    var addr = txt(p.buyer.addressEn) || txt(p.buyer.addressCn);
    return [name, addr].filter(hasText).join('\n');
  }

  function payeeText(p) {
    return txt(p.bank.bankNameEn) || txt(p.company.nameEn) || txt(p.company.nameCn);
  }

  function renderDR(p) {
    var amount = p.core.fmtMoney(p.calc.grandTotal, p.currency);
    var meta = [
      ['NO.', '号码', p.meta.no],
      ['PLACE AND DATE OF ISSUE', '出票地点及日期', [txt(p.company.city) || 'NINGBO, CHINA', p.dateText].filter(hasText).join(', ')],
      ['TENOR', '付款期限', tenorText(p)],
      ['BILL AMOUNT', '汇票金额', amount],
      ['BUYER / APPLICANT', '买方 / 申请人', buyerName(p)],
      ['ORDER NO.', '订单号', txt(p.order.no)],
      ['L/C NO.', '信用证号', txt(p.order.lcNo)],
      ['L/C ISSUING BANK', '开证银行', txt(p.order.lcIssuingBank)]
    ];
    var drawnUnder = hasText(p.order.lcNo)
      ? 'DRAWN UNDER ' + esc(p, txt(p.order.lcIssuingBank) || 'THE ISSUING BANK') + ' IRREVOCABLE L/C NO. ' + esc(p, txt(p.order.lcNo)) + (hasText(p.order.lcDate) ? ' DATED ' + esc(p, dateText(p, p.order.lcDate)) : '') + '.'
      : 'DRAWN UNDER CONTRACT / ORDER NO. ' + esc(p, contractNo(p) || '—') + '.';
    var wording = 'AT ' + esc(p, tenorText(p)) + ' OF THIS FIRST OF EXCHANGE (THE SECOND OF THE SAME TENOR AND DATE BEING UNPAID) PAY TO THE ORDER OF ' +
      '<span class="doc-boiler-strong">' + esc(p, payeeText(p)) + '</span> THE SUM OF ' +
      '<span class="doc-boiler-strong">' + esc(p, p.calc.amountInWordsEn) + '</span>';
    var body =
      letterhead(p) +
      titleBlock(p) +
      metaGrid(p, meta) +
      '<div class="doc-exchange">' +
        '<div class="doc-exchange-row"><span class="doc-exchange-label">' + L(p, 'BILL OF EXCHANGE FOR', '汇票金额') + '</span><span class="doc-exchange-amount">' + esc(p, amount) + '</span></div>' +
      '</div>' +
      '<div class="doc-boiler">' + wording + '</div>' +
      '<div class="doc-drawn">' + drawnUnder + '</div>' +
      '<div class="doc-drawn">VALUE RECEIVED AND CHARGE TO THE SAME.</div>' +
      '<div class="doc-drawee">' +
        '<div class="doc-drawee-block"><div class="doc-block-title">' + L(p, 'TO (DRAWEE)', '付款人') + '</div><div class="doc-drawee-body doc-pre">' + esc(p, draweeText(p)) + '</div></div>' +
        '<div class="doc-drawee-accept"><div class="doc-block-title">' + L(p, 'ACCEPTED / PAYER', '承兑 / 付款人') + '</div><div class="doc-drawee-lines"></div></div>' +
      '</div>' +
      '<div class="doc-bank-record">' +
        '<div class="doc-block-title">' + L(p, 'BANK / NEGOTIATION RECORD', '银行记录') + '</div>' +
        '<div class="doc-bank-record-line"></div>' +
        '<div class="doc-bank-record-line"></div>' +
      '</div>' +
      '<div class="doc-bottom">' +
        '<div class="doc-bottom-main">' +
          '<div class="doc-endorsement"><div class="doc-block-title">' + L(p, 'ENDORSEMENTS', '背书') + '</div><div class="doc-endorsement-lines"></div></div>' +
        '</div>' +
        '<div class="doc-bottom-side">' +
          '<div class="doc-drawer">' +
            '<div class="doc-sign-caption">' + L(p, 'DRAWER / SIGNATURE AND STAMP', '出票人签字盖章') + '</div>' +
            '<div class="doc-sign-line"></div>' +
            '<div class="doc-sign-company">' + esc(p, txt(p.company.nameEn) || txt(p.company.nameCn)) + '</div>' +
            (p.showSignature && (hasText(p.company.signer) || hasText(p.company.signerTitle))
              ? '<div class="doc-sign-name">' + esc(p, txt(p.company.signer)) +
                (hasText(p.company.signerTitle) ? '<span class="doc-sign-title">' + esc(p, txt(p.company.signerTitle)) + '</span>' : '') +
                '</div>'
              : '<div class="doc-sign-hint">' + L(p, 'AUTHORIZED SIGNATURE', '授权签字') + '</div>') +
            stampBlock(p) +
          '</div>' +
        '</div>' +
      '</div>' +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  /* ================================================================== */
  /*  CS — Cost Sheet, Chinese internal (§7.12)                          */
  /* ================================================================== */

  function csCostTable(p) {
    var cost = p.cost;
    var rows = [
      { cn: '采购成本', en: 'PURCHASE COST', value: cost.purchaseCost },
      { cn: '国内费用', en: 'DOMESTIC EXPENSES', value: cost.domesticCost },
      { cn: '银行费用', en: 'BANK CHARGES', value: cost.bankCost },
      { cn: '其他费用', en: 'OTHER EXPENSES', value: cost.miscCost }
    ];
    var html = '<table class="doc-table doc-table--cost"><colgroup><col><col class="doc-col-amount"></colgroup>' +
      '<thead><tr><th>项目 <span class="doc-bi-en">ITEM</span></th><th class="doc-r">金额（人民币 CNY）<span class="doc-bi-en">AMOUNT (CNY)</span></th></tr></thead><tbody>';
    for (var i = 0; i < rows.length; i++) {
      html += '<tr><td>' + esc(p, rows[i].cn) + '<span class="doc-bi-en">' + esc(p, rows[i].en) + '</span></td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(rows[i].value, 2)) + '</td></tr>';
    }
    html += '<tr class="doc-totals-strong"><td>成本合计 <span class="doc-bi-en">TOTAL COST</span></td><td class="doc-r">' + esc(p, p.core.fmtNum(cost.totalCost, 2)) + '</td></tr>';
    return html + '</tbody></table>';
  }

  function csDescHtml(p, line) {
    var name = txt(line.nameCn) || txt(line.nameEn);
    return '<div class="doc-item-name">' + esc(p, name) + '</div>';
  }

  function csLineTable(p) {
    var rate = p.cost.exchangeRate;
    var head = '<thead><tr>' +
      '<th class="doc-col-no">序号</th>' +
      '<th class="doc-col-desc">品名<span class="doc-bi-en">ITEM</span></th>' +
      '<th class="doc-col-qty doc-r">数量<span class="doc-bi-en">QTY</span></th>' +
      '<th class="doc-col-qty doc-r">采购单价（RMB）<span class="doc-bi-en">UNIT COST</span></th>' +
      '<th class="doc-col-amount doc-r">采购成本（RMB）<span class="doc-bi-en">PURCHASE COST</span></th>' +
      '<th class="doc-col-qty doc-r">外销单价<span class="doc-bi-en">UNIT PRICE</span></th>' +
      '<th class="doc-col-amount doc-r">外销金额<span class="doc-bi-en">AMOUNT</span></th>' +
      '<th class="doc-col-amount doc-r">单件毛利（RMB）<span class="doc-bi-en">UNIT GP</span></th>' +
      '</tr></thead>';
    var rows = [];
    var lines = p.calc.lines || [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var purchase = p.core.round(p.core.num(line.qty, 0) * p.core.num(line.costPrice, 0), 2);
      var unitGp = p.core.round(p.core.num(line.unitPrice, 0) * rate - p.core.num(line.costPrice, 0), 2);
      rows.push('<tr>' +
        '<td class="doc-c">' + (i + 1) + '</td>' +
        '<td class="doc-cell-desc">' + csDescHtml(p, line) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtQty(line.qty)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.costPrice, 2)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(purchase, 2)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.unitPrice, 2)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(line.amount, 2)) + '</td>' +
        '<td class="doc-r">' + esc(p, p.core.fmtNum(unitGp, 2)) + '</td>' +
        '</tr>');
    }
    if (!rows.length) rows.push(emptyRow(p, 8));
    return '<table class="doc-table doc-table--items cost-lines"><colgroup>' +
      '<col class="doc-col-no"><col class="doc-col-desc"><col class="doc-col-qty"><col class="doc-col-qty">' +
      '<col class="doc-col-amount"><col class="doc-col-qty"><col class="doc-col-amount"><col class="doc-col-amount">' +
      '</colgroup>' + head + '<tbody>' + rows.join('') + '</tbody></table>';
  }

  function renderCS(p) {
    var cost = p.cost;
    var profitWord = cost.grossProfit >= 0 ? '盈利 PROFIT' : '亏损 LOSS';
    var advice = cost.marginPct >= 15
      ? '毛利率健康，可按现价执行。'
      : (cost.marginPct > 0
        ? '毛利偏低，建议复核采购成本或调整报价。'
        : '存在亏损风险，建议暂缓执行并重新核算成本。');
    var meta = [
      ['COST SHEET NO.', '核算表编号', p.meta.no],
      ['ORDER NO.', '订单号', txt(p.order.no)],
      ['CUSTOMER', '客户', txt(p.buyer.nameEn) || txt(p.buyer.nameCn)],
      ['DATE', '制表日期', p.dateText],
      ['CURRENCY', '币制', p.currency],
      ['EXCHANGE RATE', '汇率', p.core.fmtNum(cost.exchangeRate, 4)]
    ];
    var incomeTable = '<table class="doc-table doc-table--cost"><colgroup><col><col class="doc-col-amount"><col class="doc-col-qty"><col class="doc-col-amount"></colgroup>' +
      '<thead><tr><th>项目 <span class="doc-bi-en">ITEM</span></th>' +
      '<th class="doc-r">外销收入 <span class="doc-bi-en">REVENUE</span></th>' +
      '<th class="doc-r">汇率 <span class="doc-bi-en">RATE</span></th>' +
      '<th class="doc-r">折人民币（CNY）<span class="doc-bi-en">REVENUE (CNY)</span></th></tr></thead>' +
      '<tbody><tr><td>外销收入 <span class="doc-bi-en">EXPORT REVENUE</span></td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtMoney(cost.revenueFc, p.currency)) + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtNum(cost.exchangeRate, 4)) + '</td>' +
      '<td class="doc-r">' + esc(p, p.core.fmtNum(cost.revenueCny, 2)) + '</td></tr></tbody></table>';
    var stats = '<div class="doc-stats doc-stats--3">' +
      '<div class="doc-stat"><div class="doc-stat-value">' + esc(p, p.core.fmtNum(cost.grossProfit, 2)) + '</div><div class="doc-stat-label">毛利（人民币）<span class="doc-bi-en">GROSS PROFIT (CNY)</span></div></div>' +
      '<div class="doc-stat"><div class="doc-stat-value">' + esc(p, p.core.fmtNum(cost.marginPct, 2)) + '%</div><div class="doc-stat-label">毛利率<span class="doc-bi-en">MARGIN</span></div></div>' +
      '<div class="doc-stat"><div class="doc-stat-value doc-stat-value--sm">' + esc(p, profitWord) + '</div><div class="doc-stat-label">盈亏判断<span class="doc-bi-en">RESULT</span></div></div>' +
      '</div>';
    var words = '<div class="doc-amount-words doc-amount-words--cn">' +
      '<div class="doc-amount-words-label">人民币大写<span class="doc-bi-en">AMOUNT IN WORDS (CNY)</span></div>' +
      '<div class="doc-amount-words-value">' + esc(p, p.core.amountWordsCn(cost.revenueCny, 'CNY')) + '</div>' +
      '</div>';
    var remark = '本单外销收入人民币 ' + p.core.fmtNum(cost.revenueCny, 2) + '，总成本 ' + p.core.fmtNum(cost.totalCost, 2) +
      '，毛利 ' + p.core.fmtNum(cost.grossProfit, 2) + '，毛利率 ' + p.core.fmtNum(cost.marginPct, 2) + '%。' + advice;
    var signArea = zhSignRow(p);
    var body =
      letterhead(p) +
      titleBlock(p, { zh: true }) +
      '<div class="doc-internal">内部资料 · INTERNAL USE ONLY</div>' +
      metaGrid(p, meta, 'doc-meta-grid--3', true) +
      sectionTitle(p, 'REVENUE', '收入', true) +
      incomeTable +
      sectionTitle(p, 'COST', '成本', true) +
      csCostTable(p) +
      stats +
      sectionTitle(p, 'UNIT COST / PRICE', '单件成本与售价', true) +
      csLineTable(p) +
      words +
      noteBlock(p, 'ANALYSIS', '核算结论', remark, true) +
      '<div class="doc-bottom doc-bottom--cd">' +
        '<div class="doc-bottom-main">' + signArea + '</div>' +
        '<div class="doc-bottom-side">' + (p.showSeal ? stampBlock(p) : '') + '</div>' +
      '</div>' +
      footer(p, 1);
    return sheet(p, pageStart(p) + body + pageEnd());
  }

  return {
    version: VERSION,
    groups: GROUPS,
    list: LIST,
    get: get,
    render: render
  };
});
