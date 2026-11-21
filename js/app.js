/*!
 * 单证通 TradeDocs — app.js
 * Vanilla SPA: hash router, app shell, dashboard, orders/editor, preview center,
 * customer & product libraries, settings, help, toasts, modals and test hooks.
 */
(function (root) {
  'use strict';

  var TD = root.TradeDocs = root.TradeDocs || {};
  var core = TD.core;
  var store = TD.store;
  var APP_VERSION = '1.1.1';

  if (!core || !store) {
    (root.console || { error: function () {} }).error('[TradeDocs] app.js requires core.js and store.js first');
    return;
  }

  /* ================================================================
   *  Document registry fallback (used until doc-templates.js is present)
   * ================================================================ */

  var DOC_FALLBACK = [
    { key: 'ci', group: 'sales', prefix: 'CI', nameCn: '商业发票', nameEn: 'COMMERCIAL INVOICE', desc: '货物、金额与银行信息，结汇与报关的核心单据' },
    { key: 'pl', group: 'sales', prefix: 'PL', nameCn: '装箱单', nameEn: 'PACKING LIST', desc: '箱数、毛净重与体积，订舱报关必备' },
    { key: 'pi', group: 'sales', prefix: 'PI', nameCn: '形式发票', nameEn: 'PROFORMA INVOICE', desc: '报价确认与预付款依据，可替代形式合同' },
    { key: 'sc', group: 'sales', prefix: 'SC', nameCn: '销售合同', nameEn: 'SALES CONTRACT', desc: '完整合同条款与买卖双方签字栏' },
    { key: 'qt', group: 'sales', prefix: 'QT', nameCn: '报价单', nameEn: 'QUOTATION', desc: '单价、总价、贸易术语与有效期' },
    { key: 'bk', group: 'logistics', prefix: 'BK', nameCn: '订舱委托书', nameEn: 'BOOKING NOTE', desc: '中英对照的托运委托，含箱型箱量与报关要求' },
    { key: 'sa', group: 'logistics', prefix: 'SA', nameCn: '装运通知', nameEn: 'SHIPPING ADVICE', desc: '装运后通知买方船期、提单与货物摘要' },
    { key: 'cd', group: 'logistics', prefix: 'CD', nameCn: '报关资料清单', nameEn: 'CUSTOMS DOCUMENT CHECKLIST', desc: '报关所需资料与关键申报数据核对清单' },
    { key: 'co', group: 'logistics', prefix: 'CO', nameCn: '一般原产地证', nameEn: 'CERTIFICATE OF ORIGIN', desc: '通用版原产地声明，不冒充官方签发证书' },
    { key: 'bc', group: 'sales', prefix: 'BC', nameCn: '受益人证明', nameEn: "BENEFICIARY'S CERTIFICATE", desc: '信用证项下的标准受益人声明' },
    { key: 'dr', group: 'sales', prefix: 'DR', nameCn: '汇票', nameEn: 'BILL OF EXCHANGE', desc: '即期或远期汇票，含金额大写与付款人' },
    { key: 'cs', group: 'internal', prefix: 'CS', nameCn: '成本核算表', nameEn: 'COST SHEET', desc: '内部汇率、采购成本、毛利与单件核算' }
  ];

  var GROUP_LABEL = { sales: '销售与结算', logistics: '物流与报关', internal: '内部管理' };
  var STATUS_LABEL = { draft: '草稿', done: '已完成' };
  var DOC_ICON = {
    ci: 'receipt', pl: 'package', pi: 'file', sc: 'clipboard', qt: 'tag', bk: 'anchor',
    sa: 'send', cd: 'clipboard-check', co: 'globe', bc: 'shield-check', dr: 'bank', cs: 'calculator'
  };
  var NUMERIC_ITEM_FIELDS = ['qty', 'unitPrice', 'cartons', 'qtyPerCarton', 'netWeight', 'grossWeight', 'cbm', 'costPrice'];

  /* ================================================================
   *  Tiny DOM / format helpers
   * ================================================================ */

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }
  var esc = core.esc;

  function money(value, currency) { return core.fmtMoney(value, currency || 'USD'); }
  function qtyText(value) { return core.fmtQty(value); }
  function numText(value, dp) { return core.fmtNum(value, dp === undefined ? 2 : dp); }
  function dateText(iso, style) { return core.fmtDate(iso, style || 'medium') || '—'; }
  function nowClock() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function getDocList() {
    var registry = TD.docs;
    if (registry && Array.isArray(registry.list) && registry.list.length) {
      return registry.list.filter(function (doc) { return doc && doc.key; });
    }
    return DOC_FALLBACK.slice();
  }
  function getDocEntry(key) {
    var list = getDocList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return { key: key, group: 'internal', prefix: String(key || 'DOC').toUpperCase(), nameCn: key, nameEn: key, desc: '' };
  }
  function docKeys() {
    return getDocList().map(function (doc) { return doc.key; });
  }
  function hasDocsEngine() {
    return !!(TD.docs && typeof TD.docs.render === 'function');
  }

  function buyerName(order) {
    var buyer = (order && order.buyer) || {};
    return String(buyer.nameEn || buyer.nameCn || '').trim();
  }
  function orderTotal(order) {
    try { return core.calcOrder(order).grandTotal; } catch (err) { return 0; }
  }
  function statusBadge(status) {
    var done = status === 'done';
    return '<span class="badge badge--' + (done ? 'done' : 'draft') + '"><span class="badge-dot"></span>' + STATUS_LABEL[done ? 'done' : 'draft'] + '</span>';
  }
  function selectedCount(order) {
    if (!order || !order.print || !Array.isArray(order.print.selected)) return 0;
    return order.print.selected.length;
  }

  function readPath(obj, path) {
    return String(path || '').split('.').reduce(function (acc, part) {
      return acc === null || acc === undefined ? undefined : acc[part];
    }, obj);
  }
  function setPath(obj, path, value) {
    var parts = String(path || '').split('.');
    var target = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      target = target[key];
    }
    target[parts[parts.length - 1]] = value;
  }
  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    Object.keys(source).forEach(function (key) {
      var value = source[key];
      if (Array.isArray(value)) {
        target[key] = core.clone(value);
      } else if (value && typeof value === 'object' && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        deepMerge(target[key], value);
      } else if (value !== undefined) {
        target[key] = core.clone(value);
      }
    });
    return target;
  }

  function readControl(el) {
    if (!el) return '';
    if (el.type === 'checkbox') return !!el.checked;
    if (el.getAttribute && el.getAttribute('data-type') === 'number') return core.num(el.value, 0);
    return el.value;
  }

  /* ================================================================
   *  Inline SVG icon set (stroke 1.8, no external assets)
   * ================================================================ */

  var ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    'alert-circle': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    anchor: '<circle cx="12" cy="5" r="3"/><path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    'clipboard-check': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    receipt: '<path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    tag: '<path d="M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
    bank: '<path d="M3 21h18M3 10h18M5 6l7-4 7 4"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    'map-pin': '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
    more: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'file-plus': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 12v6M9 15h6"/>',
    'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    'arrow-left-circle': '<circle cx="12" cy="12" r="10"/><path d="m12 8-4 4 4 4M16 12H8"/>',
    dock: '<path d="M2 20h20"/><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    'dollar-sign': '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    zap: '<path d="M13 2 3 14h8l-1 8 11-13h-8l1-7z"/>',
    'trending-up': '<path d="m23 6-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    'rotate-ccw': '<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    'more-horizontal': '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>'
  };

  function icon(name, size, className) {
    var body = ICONS[name] || ICONS.file;
    var s = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (className ? ' class="' + esc(className) + '"' : '') + '>' + body + '</svg>';
  }

  /* ================================================================
   *  Field builders
   * ================================================================ */

  function field(o) {
    var name = o.name || '';
    var id = o.id || ('f-' + name.replace(/[^a-zA-Z0-9_-]+/g, '-'));
    var value = o.value === undefined || o.value === null ? '' : o.value;
    var label = '<label class="field-label" for="' + esc(id) + '">' + esc(o.label || '') +
      (o.required ? '<span class="req">*</span>' : '') + '</label>';
    var common = ' id="' + esc(id) + '" name="' + esc(name) + '"' +
      (o.path === false ? '' : ' data-path="' + esc(o.path || name) + '"') +
      (o.attrs ? ' ' + o.attrs : '');
    var control = '';
    if (o.type === 'select') {
      var options = (o.options || []).map(function (opt) {
        var v = opt && typeof opt === 'object' ? opt.value : opt;
        var lab = opt && typeof opt === 'object' ? opt.label : opt;
        return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(lab) + '</option>';
      }).join('');
      control = '<select class="select' + (o.className ? ' ' + o.className : '') + '"' + common + '>' + options + '</select>';
    } else if (o.type === 'textarea') {
      control = '<textarea class="textarea' + (o.className ? ' ' + o.className : '') + '"' + common +
        ' placeholder="' + esc(o.placeholder || '') + '"' + (o.rows ? ' rows="' + o.rows + '"' : '') + '>' +
        esc(value) + '</textarea>';
    } else {
      var type = o.type || 'text';
      var extra = '';
      if (type === 'number') {
        extra = ' inputmode="decimal" data-type="number" step="' + esc(o.step === undefined ? '0.01' : o.step) +
          '" min="' + esc(o.min === undefined ? '0' : o.min) + '"';
      }
      if (type === 'date') extra += ' autocomplete="off"';
      control = '<input class="input' + (o.className ? ' ' + o.className : '') + '" type="' + esc(type) + '"' + common +
        extra + ' value="' + esc(value) + '" placeholder="' + esc(o.placeholder || '') + '" autocomplete="off"' +
        (o.readonly ? ' readonly' : '') + (o.disabled ? ' disabled' : '') + '>';
    }
    var wrapClass = 'field' + (o.span === 'full' ? ' field-full' : '');
    return '<div class="' + wrapClass + '">' + label + control +
      (o.hint ? '<div class="field-hint">' + esc(o.hint) + '</div>' : '') + '</div>';
  }

  function switchField(o) {
    return '<label class="switch' + (o.className ? ' ' + o.className : '') + '">' +
      '<input type="checkbox" name="' + esc(o.name || '') + '" data-path="' + esc(o.path || o.name || '') + '"' +
      (o.checked ? ' checked' : '') + '>' +
      '<span>' + esc(o.label || '') + '</span></label>';
  }

  function sectionCard(o) {
    return '<section class="card form-card"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' +
      '<div class="card-head"><div class="card-title">' +
      (o.icon ? '<span class="section-icon">' + icon(o.icon, 16) + '</span>' : '') +
      '<div class="card-title-text"><span class="t">' + esc(o.title || '') + '</span>' +
      (o.sub ? '<span class="s">' + esc(o.sub) + '</span>' : '') + '</div></div>' +
      (o.actions ? '<div class="card-head-actions">' + o.actions + '</div>' : '') +
      '</div><div class="card-body">' + o.body + '</div></section>';
  }

  function emptyState(o) {
    return '<div class="empty' + (o.compact ? ' empty--compact' : '') + '">' +
      '<span class="empty-icon">' + icon(o.icon || 'file', o.compact ? 22 : 26) + '</span>' +
      '<h3>' + esc(o.title || '暂无数据') + '</h3>' +
      '<p>' + esc(o.message || '') + '</p>' +
      (o.actions ? '<div class="empty-actions">' + o.actions + '</div>' : '') + '</div>';
  }

  function moneyCell(value, currency) {
    return '<span class="strong">' + esc(money(value, currency)) + '</span>';
  }

  /* ================================================================
   *  Toast
   * ================================================================ */

  var TOAST_ICON = { success: 'check-circle', error: 'alert-circle', warn: 'alert', info: 'info' };
  var toastTimers = [];

  function toast(message, type, options) {
    var stack = $('#toast-stack');
    if (!stack) return;
    var kind = type || 'info';
    var opts = options || {};
    var node = document.createElement('div');
    node.className = 'toast toast--' + kind;
    node.setAttribute('data-testid', 'toast');
    node.setAttribute('role', 'status');
    node.innerHTML = '<span class="toast-icon">' + icon(TOAST_ICON[kind] || 'info', 14) + '</span>' +
      '<div class="toast-text">' + (opts.title ? '<div class="toast-title">' + esc(opts.title) + '</div>' : '') +
      '<div class="toast-message">' + esc(message) + '</div></div>';
    stack.appendChild(node);
    while (stack.children.length > 4) stack.removeChild(stack.firstChild);
    var timer = setTimeout(function () {
      node.classList.add('is-leaving');
      var removeTimer = setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 200);
      toastTimers.push(removeTimer);
    }, 3000);
    toastTimers.push(timer);
  }

  /* ================================================================
   *  Sidebar drawer & save indicator
   * ================================================================ */

  function isSidebarOpen() { return document.body.classList.contains('sidebar-open'); }
  function setSidebar(open) {
    document.body.classList.toggle('sidebar-open', !!open);
    var backdrop = $('#sidebar-backdrop');
    if (backdrop) backdrop.hidden = !open;
    var toggle = $('.menu-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setSaveState(status) {
    var node = $('#save-state');
    if (!node) return;
    var text = $('#save-state-text');
    node.setAttribute('data-state', status);
    if (text) {
      text.textContent = status === 'saving' ? '保存中…' : status === 'error' ? '保存失败' : '已保存 · ' + nowClock();
    }
    node.title = status === 'error'
      ? '本地保存失败，请导出备份或检查浏览器存储权限'
      : '数据保存在本机浏览器 localStorage';
  }

  /* ================================================================
   *  Modal engine (focus trap-ish, Esc, backdrop, restore focus)
   * ================================================================ */

  var modalState = null;

  function openModal(o) {
    closeModal();
    var opts = o || {};
    var rootEl = $('#modal-root');
    if (!rootEl) return;
    var previousFocus = document.activeElement;
    rootEl.innerHTML = '<div class="modal-overlay no-print" data-modal-overlay>' +
      '<div class="modal' + (opts.size === 'sm' ? ' modal--sm' : opts.size === 'lg' ? ' modal--lg' : opts.size === 'xl' ? ' modal--xl' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><div><h2 class="modal-title" id="modal-title">' + esc(opts.title || '') + '</h2>' +
      (opts.subtitle ? '<div class="modal-sub">' + esc(opts.subtitle) + '</div>' : '') + '</div>' +
      '<button type="button" class="icon-btn icon-btn--sm icon-btn--plain modal-x" data-action="close-modal" aria-label="关闭弹窗">' + icon('x', 16) + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div></div>';

    modalState = {
      onClose: opts.onClose || null,
      onConfirm: opts.onConfirm || null,
      previousFocus: previousFocus,
      closed: false
    };

    var overlay = rootEl.querySelector('[data-modal-overlay]');
    if (overlay) {
      overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay && !opts.static) closeModal(false);
      });
    }
    document.addEventListener('keydown', onModalKeydown, true);
    if (typeof opts.onMount === 'function') {
      try { opts.onMount(rootEl); } catch (err) { console.error('[TradeDocs] modal mount failed', err); }
    }
    var focusTarget = rootEl.querySelector('[data-autofocus]') ||
      rootEl.querySelector('.modal-body input:not([type="hidden"]), .modal-body select, .modal-body textarea') ||
      rootEl.querySelector('.modal-foot .btn--primary, .modal-foot .btn');
    if (focusTarget) {
      setTimeout(function () { try { focusTarget.focus(); } catch (err) { /* ignore */ } }, 20);
    }
  }

  function closeModal(confirmed) {
    if (!modalState) return;
    var stateRef = modalState;
    modalState = null;
    document.removeEventListener('keydown', onModalKeydown, true);
    var rootEl = $('#modal-root');
    if (rootEl) rootEl.innerHTML = '';
    if (stateRef.previousFocus && stateRef.previousFocus.focus) {
      try { stateRef.previousFocus.focus(); } catch (err) { /* ignore */ }
    }
    if (!stateRef.closed) {
      stateRef.closed = true;
      if (typeof stateRef.onClose === 'function') {
        try { stateRef.onClose(!!confirmed); } catch (err) { console.error(err); }
      }
    }
  }

  function onModalKeydown(e) {
    if (!modalState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeModal(false);
      return;
    }
    if (e.key === 'Tab') {
      var rootEl = $('#modal-root');
      if (!rootEl) return;
      var focusables = $$('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])', rootEl)
        .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function confirmDialog(o) {
    var opts = o || {};
    return new Promise(function (resolve) {
      openModal({
        size: 'sm',
        title: opts.title || '请确认',
        body: '<p class="confirm-message">' + esc(opts.message || '') + '</p>' +
          (opts.warning ? '<div class="alert alert--danger confirm-warning">' + icon('alert', 16) + '<span>' + esc(opts.warning) + '</span></div>' : ''),
        footer: '<button type="button" class="btn" data-action="modal-cancel">' + esc(opts.cancelText || '取消') + '</button>' +
          '<button type="button" class="btn ' + (opts.danger ? 'btn--danger-solid' : 'btn--primary') + '" data-action="modal-confirm" data-autofocus>' + esc(opts.confirmText || '确认') + '</button>',
        onConfirm: function () { resolve(true); },
        onClose: function (confirmed) { if (!confirmed) resolve(false); }
      });
    });
  }

  /* ================================================================
   *  Menus
   * ================================================================ */

  function closeAllMenus() {
    $$('.menu.is-open').forEach(function (menu) { menu.classList.remove('is-open'); });
  }

  /* ================================================================
   *  Router
   * ================================================================ */

  var currentRoute = { name: 'dashboard', id: '', docKey: '' };
  var knownRoutes = ['dashboard', 'orders', 'preview', 'customers', 'products', 'settings', 'help'];

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (err) { return value; }
  }

  function parseRoute() {
    var raw = String(location.hash || '').replace(/^#\/?/, '');
    var parts = raw.split('/').filter(function (part) { return part !== ''; }).map(safeDecode);
    var name = parts[0] || 'dashboard';
    if (knownRoutes.indexOf(name) < 0) name = 'dashboard';
    var route = { name: name, id: '', docKey: '' };
    if (name === 'orders') route.id = parts[1] || '';
    if (name === 'preview') { route.id = parts[1] || ''; route.docKey = parts[2] || ''; }
    return route;
  }

  function normalizePath(path) {
    var value = String(path || '');
    if (value.charAt(0) === '#') value = value.slice(1);
    if (value.charAt(0) !== '/') value = '/' + value;
    return '#' + value;
  }

  function navigate(path) {
    var target = normalizePath(path);
    flushPendingEditors();
    if (location.hash === target) {
      renderRoute();
    } else {
      location.hash = target;
    }
  }

  function refreshPage() {
    flushPendingEditors();
    renderRoute();
  }

  function renderRoute() {
    var parsed = parseRoute();
    currentRoute = parsed;
    var inner = $('#view-inner');
    var view = $('#view');
    if (!inner) return;
    var result;
    try {
      if (parsed.name === 'orders') result = parsed.id ? editorPage(parsed.id) : ordersPage();
      else if (parsed.name === 'preview') result = previewPage(parsed.id, parsed.docKey);
      else if (parsed.name === 'customers') result = customersPage();
      else if (parsed.name === 'products') result = productsPage();
      else if (parsed.name === 'settings') result = settingsPage();
      else if (parsed.name === 'help') result = helpPage();
      else result = dashboardPage();
    } catch (err) {
      console.error('[TradeDocs] 页面渲染失败', err);
      result = {
        html: '<div class="page-head"><div class="page-head-main"><div class="page-eyebrow">' + icon('alert-circle', 13) + ' 页面错误</div><h2 class="page-title">页面加载失败</h2></div></div>' +
          '<div class="card"><div class="card-body"><div class="alert alert--danger">' + icon('alert', 16) +
          '<span>渲染时发生错误：' + esc(err && err.message ? err.message : String(err)) + '。你的数据仍然安全保存在本地。</span></div>' +
          '<div class="row" style="margin-top:16px"><a class="btn btn--primary" href="#/dashboard" data-nav="dashboard">返回仪表盘</a>' +
          '<button class="btn" data-action="reload-page">重新加载</button></div></div></div>',
        mount: null,
        title: '页面错误',
        crumbs: '工作台 / 页面错误',
        nav: 'dashboard'
      };
    }
    inner.innerHTML = result.html;
    setChrome(result);
    if (view) view.scrollTop = 0;
    window.scrollTo(0, 0);
    if (typeof result.mount === 'function') {
      try { result.mount(); } catch (err) { console.error('[TradeDocs] 页面挂载失败', err); }
    }
    if (typeof result.afterRender === 'function') {
      try { result.afterRender(); } catch (err) { console.error('[TradeDocs] 页面后处理失败', err); }
    }
    try { store.setLastRoute(location.hash || '#/dashboard'); } catch (err) { /* ignore */ }
  }

  function setChrome(page) {
    var title = page.title || '工作台';
    document.title = title + ' · 单证通 TradeDocs';
    var titleEl = $('#page-title');
    if (titleEl) titleEl.textContent = title;
    var crumbsEl = $('#crumbs');
    if (crumbsEl) crumbsEl.textContent = page.crumbs || '工作台';
    $$('.nav-item[data-nav]').forEach(function (el) {
      var isActive = el.getAttribute('data-nav') === (page.nav || 'dashboard');
      el.classList.toggle('is-active', isActive);
      if (isActive) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  /* ================================================================
   *  Form binding helpers
   * ================================================================ */

  function bindPaths(scope, draft, onInput) {
    if (!scope) return;
    scope.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      var path = el.getAttribute('data-path');
      if (!path) return;
      var value = readControl(el);
      setPath(draft, path, value);
      if (typeof onInput === 'function') onInput(path, el, value);
    });
  }

  function syncFormToDraft(scope, draft) {
    if (!scope || !draft) return;
    $$('[data-path]', scope).forEach(function (el) {
      var path = el.getAttribute('data-path');
      if (!path) return;
      setPath(draft, path, readControl(el));
    });
  }

  function syncItemInputs(scope, draft) {
    if (!scope || !draft || !Array.isArray(draft.items)) return;
    $$('[data-item-field]', scope).forEach(function (el) {
      var index = Number(el.getAttribute('data-item-index'));
      var field = el.getAttribute('data-item-field');
      var item = draft.items[index];
      if (!item || !field) return;
      item[field] = readControl(el);
    });
  }

  /* ================================================================
   *  Dashboard
   * ================================================================ */

  function kpiCard(o) {
    return '<div class="kpi">' +
      '<div class="kpi-top"><span class="kpi-label">' + esc(o.label) + '</span>' +
      '<span class="kpi-icon kpi-icon--' + (o.tone || 'teal') + '">' + icon(o.icon || 'file', 17) + '</span></div>' +
      '<div class="kpi-value">' + esc(o.value) + (o.unit ? '<small>' + esc(o.unit) + '</small>' : '') + '</div>' +
      '<div class="kpi-foot">' + (o.icon2 ? icon(o.icon2, 12) : '') + '<span>' + esc(o.foot || '') + '</span></div></div>';
  }

  function dashboardPage() {
    var state = store.getState() || {};
    var orders = Array.isArray(state.orders) ? state.orders : [];
    var customers = Array.isArray(state.customers) ? state.customers : [];
    var settings = state.settings || {};
    var company = settings.company || {};
    var monthKey = core.todayISO().slice(0, 7);
    var monthDocs = 0;
    orders.forEach(function (order) {
      var meta = (order && order.docMeta) || {};
      Object.keys(meta).forEach(function (key) {
        var doc = meta[key];
        if (doc && doc.date && String(doc.date).slice(0, 7) === monthKey) monthDocs += 1;
      });
    });
    var draftCount = orders.filter(function (order) { return order.status !== 'done'; }).length;
    var recent = orders.slice().sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    }).slice(0, 5);

    var companyName = company.nameCn || company.nameEn || '我的外贸公司';
    var todayLabel = core.fmtDate(core.todayISO(), 'long') + ' · ' + ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date().getDay()];

    var hero = '<section class="hero">' +
      '<div class="hero-main">' +
      '<span class="hero-eyebrow">' + icon('shield-check', 13) + '本地工作台 · 无需联网 · 数据留在本机</span>' +
      '<h2 class="hero-title">你好，<em>' + esc(companyName) + '</em></h2>' +
      '<p class="hero-text">订单数据只录一次，12 类外贸单证自动生成。今天是 ' + esc(todayLabel) + '：从新建一票订单开始，或直接打开最近的订单继续完善。</p>' +
      '<div class="hero-actions">' +
      '<button class="btn btn--light btn--lg" type="button" data-action="new-order">' + icon('plus', 17) + '新建订单</button>' +
      '<button class="btn btn--ghost-light btn--lg" type="button" data-action="recognize-new-order" data-testid="recognize-open-new">' + icon('zap', 16) + '识别建单</button>' +
      '<a class="btn btn--ghost-light btn--lg" href="#/orders">' + icon('file', 16) + '订单管理</a>' +
      '<a class="btn btn--ghost-light btn--lg" href="#/help">' + icon('help', 16) + '使用说明</a>' +
      '</div></div>' +
      '<div class="hero-side">' +
      '<div class="hero-stat"><span>订单总数</span><strong>' + orders.length + '</strong></div>' +
      '<div class="hero-stat"><span>客户档案</span><strong>' + customers.length + '</strong></div>' +
      '<div class="hero-stat"><span>本月单证</span><strong>' + monthDocs + '</strong></div>' +
      '</div></section>';

    var kpis = '<div class="kpi-grid">' +
      kpiCard({ label: '订单总数', value: orders.length, unit: '票', icon: 'file', tone: 'teal', foot: '最近更新 ' + (recent[0] ? dateText(recent[0].updatedAt, 'iso') : '—'), icon2: 'clock' }) +
      kpiCard({ label: '本月单证', value: monthDocs, unit: '份', icon: 'receipt', tone: 'blue', foot: '按单证生成日期统计', icon2: 'calendar' }) +
      kpiCard({ label: '客户数量', value: customers.length, unit: '家', icon: 'users', tone: 'navy', foot: '客户库快照与订单解耦', icon2: 'layers' }) +
      kpiCard({ label: '待完善订单', value: draftCount, unit: '票', icon: 'alert', tone: 'amber', foot: draftCount ? '草稿尚未标记完成' : '全部订单已完成', icon2: 'check-circle' }) +
      '</div>';

    var quickActions = '<div class="quick-grid">' +
      '<button class="quick-item" type="button" data-action="new-order"><span class="quick-icon">' + icon('plus', 17) + '</span>' +
      '<span class="quick-text"><strong>新建订单</strong><span>录入买方与货物明细</span></span><span class="quick-arrow">' + icon('chevron-right', 15) + '</span></button>' +
      '<a class="quick-item" href="#/customers" data-nav="customers"><span class="quick-icon quick-icon--blue">' + icon('users', 17) + '</span>' +
      '<span class="quick-text"><strong>新增客户</strong><span>维护买方档案</span></span><span class="quick-arrow">' + icon('chevron-right', 15) + '</span></a>' +
      '<a class="quick-item" href="#/products" data-nav="products"><span class="quick-icon quick-icon--navy">' + icon('package', 17) + '</span>' +
      '<span class="quick-text"><strong>维护产品</strong><span>HS 编码与箱规重量</span></span><span class="quick-arrow">' + icon('chevron-right', 15) + '</span></a>' +
      '<a class="quick-item" href="#/settings" data-nav="settings"><span class="quick-icon quick-icon--amber">' + icon('settings', 17) + '</span>' +
      '<span class="quick-text"><strong>完善公司资料</strong><span>抬头、银行与印章</span></span><span class="quick-arrow">' + icon('chevron-right', 15) + '</span></a>' +
      '</div>';

    var docCards = getDocList().map(function (doc) {
      return '<button class="doc-card" type="button" data-doc-type="' + esc(doc.key) + '" data-group="' + esc(doc.group || 'sales') + '" data-action="open-doc-type" data-key="' + esc(doc.key) + '">' +
        '<span class="doc-card-top"><span class="doc-icon">' + icon(DOC_ICON[doc.key] || 'file', 18) + '</span><span class="doc-idx">' + esc(doc.prefix || '') + '</span></span>' +
        '<span class="doc-name">' + esc(doc.nameCn || doc.key) + '</span>' +
        '<span class="doc-name-en">' + esc(doc.nameEn || '') + '</span>' +
        '<span class="doc-desc">' + esc(doc.desc || '') + '</span>' +
        '<span class="doc-foot">' + (orders.length ? '查看示例' : '新建并生成') + icon('arrow-right', 14) + '</span></button>';
    }).join('');

    var recentRows = recent.length ? recent.map(function (order) {
      return '<tr data-order-id="' + esc(order.id) + '">' +
        '<td><span class="cell-order-no">' + esc(order.no || '—') + '</span><div class="cell-sub">' + esc(dateText(order.date)) + '</div></td>' +
        '<td><span class="cell-primary">' + esc(buyerName(order) || '未填写买方') + '</span><div class="cell-sub">' + esc((order.buyer && order.buyer.country) || '') + '</div></td>' +
        '<td class="num">' + esc(money(orderTotal(order), order.currency)) + '</td>' +
        '<td>' + statusBadge(order.status) + '</td>' +
        '<td class="actions"><a class="btn btn--sm" href="#/orders/' + esc(encodeURIComponent(order.id)) + '">打开</a></td></tr>';
    }).join('') : '';

    var recentBlock = orders.length
      ? '<div class="card"><div class="card-head"><div class="card-title">' + icon('clock', 16) + '最近订单' +
        '<span class="card-sub">按更新时间排列</span></div><a class="btn btn--sm" href="#/orders">全部订单 ' + icon('arrow-right', 14) + '</a></div>' +
        '<div class="table-wrap table-wrap-rounded"><table class="data"><thead><tr><th>订单号 / 日期</th><th>买方</th><th class="num">订单金额</th><th>状态</th><th class="actions">操作</th></tr></thead>' +
        '<tbody>' + recentRows + '</tbody></table></div></div>'
      : '<div class="card">' + emptyState({
        icon: 'file-plus',
        title: '还没有订单',
        message: '新建第一票订单，填写买方和货物后即可一键生成商业发票、装箱单等 12 类单证。',
        actions: '<button class="btn btn--primary" type="button" data-action="new-order">' + icon('plus', 16) + '新建订单</button>'
      }) + '</div>';

    var html = hero + kpis + quickActions +
      '<div class="section-head"><div><h2 class="section-title">' + icon('layers', 17) + '单证类型</h2>' +
      '<p class="section-sub">共 ' + getDocList().length + ' 类单证，全部由同一订单数据生成 · 点击卡片查看示例或新建</p></div>' +
      '<a class="btn btn--ghost btn--sm" href="#/help">如何生成 ' + icon('arrow-right', 14) + '</a></div>' +
      '<div class="doc-grid">' + docCards + '</div>' +
      '<div class="section-head"><div><h2 class="section-title">' + icon('clock', 17) + '最近订单</h2>' +
      '<p class="section-sub">继续处理最近编辑的订单</p></div></div>' + recentBlock;

    return {
      html: html,
      title: '仪表盘',
      crumbs: '工作台 / 仪表盘',
      nav: 'dashboard',
      mount: null
    };
  }

  /* ================================================================
   *  Orders list
   * ================================================================ */

  var ordersQuery = { q: '', status: 'all' };

  function sortOrders(orders) {
    return orders.slice().sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  function ordersPage() {
    var state = store.getState();
    var orders = sortOrders(state.orders || []);
    var rows = orders.map(function (order) {
      var search = [
        order.no, buyerName(order),
        order.buyer && order.buyer.nameCn, order.buyer && order.buyer.country,
        order.currency, order.incoterm
      ].join(' ').toLowerCase();
      return '<tr data-order-id="' + esc(order.id) + '" data-status="' + esc(order.status) + '" data-search="' + esc(search) + '">' +
        '<td><span class="cell-order-no">' + esc(order.no || '—') + '</span><div class="cell-sub">' + esc(dateText(order.date)) + '</div></td>' +
        '<td><span class="cell-primary">' + esc(buyerName(order) || '未填写买方') + '</span>' +
        '<div class="cell-sub">' + esc([(order.buyer && order.buyer.country), order.incoterm, order.currency].filter(Boolean).join(' · ')) + '</div></td>' +
        '<td><span class="badge badge--' + (selectedCount(order) ? 'brand' : 'neutral') + '">' + selectedCount(order) + ' 类单证</span></td>' +
        '<td class="num">' + esc(money(orderTotal(order), order.currency)) + '</td>' +
        '<td>' + statusBadge(order.status) + '</td>' +
        '<td class="nowrap muted">' + esc(order.updatedAt ? String(order.updatedAt).replace('T', ' ').slice(0, 16) : '—') + '</td>' +
        '<td class="actions"><span class="row-actions">' +
        '<button class="btn btn--sm" type="button" data-action="open-order" data-id="' + esc(order.id) + '">打开</button>' +
        '<button class="icon-btn icon-btn--sm icon-btn--plain" type="button" data-action="duplicate-order" data-id="' + esc(order.id) + '" title="复制订单" aria-label="复制订单 ' + esc(order.no) + '">' + icon('copy', 15) + '</button>' +
        '<button class="icon-btn icon-btn--sm icon-btn--plain icon-btn--danger" type="button" data-action="delete-order" data-id="' + esc(order.id) + '" title="删除订单" aria-label="删除订单 ' + esc(order.no) + '">' + icon('trash', 15) + '</button>' +
        '</span></td></tr>';
    }).join('');

    var table = orders.length
      ? '<div class="table-wrap table-wrap-rounded"><table class="data"><thead><tr>' +
        '<th>订单号 / 日期</th><th>买方</th><th>单证</th><th class="num">订单金额</th><th>状态</th><th>更新时间</th><th class="actions">操作</th>' +
        '</tr></thead><tbody id="orders-tbody">' + rows + '</tbody></table>' +
        '<div class="table-empty" id="orders-filter-empty" hidden>没有匹配的订单，试试其他关键词。</div></div>'
      : '';

    var body = orders.length
      ? '<div class="card"><div class="toolbar">' +
        '<div class="toolbar-search">' + icon('search', 16) +
        '<label class="sr-only" for="orders-search">搜索订单</label>' +
        '<input class="input" id="orders-search" type="search" placeholder="搜索订单号 / 买方 / 国家" value="' + esc(ordersQuery.q) + '" autocomplete="off">' +
        '</div>' +
        '<label class="sr-only" for="orders-status">筛选状态</label>' +
        '<select class="input" id="orders-status">' +
        '<option value="all"' + (ordersQuery.status === 'all' ? ' selected' : '') + '>全部状态</option>' +
        '<option value="draft"' + (ordersQuery.status === 'draft' ? ' selected' : '') + '>草稿</option>' +
        '<option value="done"' + (ordersQuery.status === 'done' ? ' selected' : '') + '>已完成</option>' +
        '</select>' +
        '<span class="toolbar-meta">共 <b class="list-count" id="orders-count">' + orders.length + '</b> 票订单</span>' +
        '</div>' + table + '</div>'
      : '<div class="card">' + emptyState({
        icon: 'file-plus',
        title: '还没有订单',
        message: '每票订单只需录入一次买方、货物与运输信息，即可生成商业发票、装箱单、销售合同等 12 类单证。',
        actions: '<button class="btn btn--primary" type="button" data-action="new-order">' + icon('plus', 16) + '新建订单</button>' +
          '<a class="btn" href="#/help">' + icon('help', 16) + '查看使用说明</a>'
      }) + '</div>';

    var html = '<div class="page-head"><div class="page-head-main">' +
      '<div class="page-eyebrow">' + icon('file', 13) + '订单是唯一数据源</div>' +
      '<h2 class="page-title">订单管理</h2>' +
      '<p class="page-sub">共 ' + orders.length + ' 票订单 · 数据保存在本机浏览器</p></div>' +
      '<div class="page-actions">' +
      '<a class="btn" href="#/dashboard">' + icon('dashboard', 15) + '仪表盘</a>' +
      '<button class="btn" type="button" data-action="recognize-new-order" data-testid="recognize-open-new">' + icon('zap', 15) + '识别建单</button>' +
      '<button class="btn btn--primary" type="button" data-action="new-order">' + icon('plus', 16) + '新建订单</button>' +
      '</div></div>' + body;

    return {
      html: html,
      title: '订单管理',
      crumbs: '工作台 / 订单管理',
      nav: 'orders',
      mount: mountOrdersPage
    };
  }

  function mountOrdersPage() {
    var search = $('#orders-search');
    var status = $('#orders-status');
    if (search) {
      search.addEventListener('input', function () {
        ordersQuery.q = String(this.value || '').trim().toLowerCase();
        filterOrdersRows();
      });
    }
    if (status) {
      status.addEventListener('change', function () {
        ordersQuery.status = this.value;
        filterOrdersRows();
      });
    }
    filterOrdersRows();
  }

  function filterOrdersRows() {
    var tbody = $('#orders-tbody');
    if (!tbody) return;
    var rows = $$('tr[data-order-id]', tbody);
    var visible = 0;
    rows.forEach(function (row) {
      var haystack = String(row.getAttribute('data-search') || '');
      var rowStatus = row.getAttribute('data-status');
      var matchText = !ordersQuery.q || haystack.indexOf(ordersQuery.q) >= 0;
      var matchStatus = ordersQuery.status === 'all' || rowStatus === ordersQuery.status;
      var show = matchText && matchStatus;
      row.hidden = !show;
      if (show) visible += 1;
    });
    var empty = $('#orders-filter-empty');
    if (empty) empty.hidden = visible > 0;
    var count = $('#orders-count');
    if (count) count.textContent = visible;
  }

  function missingOrderPage(title, message) {
    return {
      html: '<div class="page-head"><div class="page-head-main"><div class="page-eyebrow">' + icon('alert-circle', 13) + '订单不存在</div>' +
        '<h2 class="page-title">' + esc(title || '未找到订单') + '</h2></div>' +
        '<div class="page-actions"><a class="btn btn--primary" href="#/orders">返回订单列表</a></div></div>' +
        '<div class="card">' + emptyState({
          icon: 'file',
          title: '订单可能已被删除',
          message: message || '该订单在当前浏览器数据中不存在。可能是链接已过期、数据被清空，或使用了另一台设备的链接。',
          actions: '<a class="btn btn--primary" href="#/orders">' + icon('arrow-left', 15) + '返回订单列表</a>' +
            '<button class="btn" type="button" data-action="new-order">' + icon('plus', 16) + '新建订单</button>'
        }) + '</div>',
      title: '未找到订单',
      crumbs: '工作台 / 订单管理 / 未找到',
      nav: 'orders',
      mount: null
    };
  }

  /* ================================================================
   *  Order editor
   * ================================================================ */

  var activeEditor = null;

  function currencyOptions() {
    return (core.CURRENCIES || []).map(function (c) {
      return { value: c.code, label: c.code + ' · ' + (c.nameCn || c.nameEn) };
    });
  }

  function transportOptions() {
    return (core.TRANSPORT_MODES || []).map(function (mode) {
      return { value: mode.key, label: mode.nameCn + ' · ' + mode.nameEn };
    });
  }

  function incotermOptions() {
    return (core.INCOTERMS || []).map(function (code) { return { value: code, label: code }; });
  }

  function itemInput(index, field, value, o) {
    var opts = o || {};
    var isNum = NUMERIC_ITEM_FIELDS.indexOf(field) >= 0;
    var step = field === 'cbm' ? '0.001' : field === 'qtyPerCarton' || field === 'cartons' ? '1' : '0.01';
    return '<input class="input' + (isNum ? ' input--num' : '') + (opts.className ? ' ' + opts.className : '') + '" ' +
      'type="' + (isNum ? 'number' : 'text') + '"' +
      (isNum ? ' inputmode="decimal" data-type="number" step="' + step + '" min="0"' : '') +
      ' name="items.' + index + '.' + field + '"' +
      ' data-item-index="' + index + '" data-item-field="' + field + '"' +
      ' value="' + esc(value) + '" placeholder="' + esc(opts.placeholder || '') + '"' +
      ' aria-label="' + esc(opts.label || field) + '">';
  }

  function calcSafely(order) {
    try { return core.calcOrder(order); } catch (err) {
      console.error('[TradeDocs] 订单计算失败', err);
      return {
        lines: [], totalQty: 0, totalCartons: 0, totalNetWeight: 0, totalGrossWeight: 0, totalCbm: 0,
        merchandiseTotal: 0, freight: 0, insurance: 0, other: 0, discount: 0, grandTotal: 0,
        amountInWordsEn: '', amountInWordsCn: ''
      };
    }
  }

  function itemsAreaHTML(order) {
    var products = (store.getState().products || []);
    var options = '<option value="">— 从产品库选择 —</option>' + products.map(function (product) {
      var label = (product.code ? product.code + ' · ' : '') + (product.nameCn || product.nameEn || '未命名产品') +
        ' · ' + money(product.price, product.currency || order.currency);
      return '<option value="' + esc(product.id) + '"' + (product === products[0] ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    var picker = '<div class="picker-bar">' +
      '<label class="sr-only" for="product-picker">从产品库选择产品</label>' +
      '<select class="select" id="product-picker" data-testid="product-picker"' + (products.length ? '' : ' disabled') + '>' +
      (products.length ? options : '<option value="">产品库为空，可添加空白行手工录入</option>') + '</select>' +
      '<button class="btn btn--primary" type="button" data-action="add-product" data-testid="add-product">' + icon('plus', 15) + '添加产品</button>' +
      '<button class="btn" type="button" data-action="add-item" data-testid="add-item">' + icon('plus', 15) + '自定义行</button>' +
      '<span class="picker-hint">' + icon('info', 14) + '重量 / 体积按每箱填写 · 表格可左右滚动查看全部列</span>' +
      '</div>';
    return picker + itemsTableHTML(order);
  }

  function itemsTableHTML(order) {
    var calc = calcSafely(order);
    var items = Array.isArray(order.items) ? order.items : [];
    var body = items.length ? items.map(function (item, index) {
      var line = calc.lines[index] || { amount: 0 };
      return '<tr data-item-index="' + index + '">' +
        '<td class="item-no">' + (index + 1) + '</td>' +
        '<td class="item-namecell">' +
        itemInput(index, 'nameEn', item.nameEn, { label: '第 ' + (index + 1) + ' 行品名（英文）', placeholder: 'Product name (EN)' }) +
        itemInput(index, 'nameCn', item.nameCn, { label: '第 ' + (index + 1) + ' 行品名（中文）', placeholder: '品名（中文，选填）', className: 'input--sub' }) +
        itemInput(index, 'hsCode', item.hsCode, { label: '第 ' + (index + 1) + ' 行 HS 编码', placeholder: 'HS code', className: 'input--sub' }) +
        '</td>' +
        '<td class="item-code">' + itemInput(index, 'code', item.code, { label: '产品编码', placeholder: 'CODE' }) + '</td>' +
        '<td class="item-qty">' + itemInput(index, 'qty', item.qty, { label: '数量' }) + '</td>' +
        '<td class="item-unit">' + itemInput(index, 'unit', item.unit, { label: '单位', placeholder: 'PCS' }) + '</td>' +
        '<td class="item-price">' + itemInput(index, 'unitPrice', item.unitPrice, { label: '单价' }) + '</td>' +
        '<td class="item-amountcell"><span class="line-amount" data-line-amount>' + esc(money(line.amount, order.currency)) + '</span>' +
        '<span class="line-sub" data-line-currency>' + esc(order.currency) + '</span></td>' +
        '<td class="item-small">' + itemInput(index, 'cartons', item.cartons, { label: '箱数' }) + '</td>' +
        '<td class="item-small">' + itemInput(index, 'qtyPerCarton', item.qtyPerCarton, { label: '每箱数量' }) + '</td>' +
        '<td class="item-small">' + itemInput(index, 'netWeight', item.netWeight, { label: '每箱净重' }) + '</td>' +
        '<td class="item-small">' + itemInput(index, 'grossWeight', item.grossWeight, { label: '每箱毛重' }) + '</td>' +
        '<td class="item-tiny">' + itemInput(index, 'cbm', item.cbm, { label: '每箱体积' }) + '</td>' +
        '<td class="item-small">' + itemInput(index, 'costPrice', item.costPrice, { label: '采购成本单价' }) + '</td>' +
        '<td class="item-actionscell">' +
        '<button class="icon-btn icon-btn--sm icon-btn--plain" type="button" data-action="duplicate-item" data-index="' + index + '" title="复制本行" aria-label="复制第 ' + (index + 1) + ' 行">' + icon('copy', 14) + '</button>' +
        '<button class="icon-btn icon-btn--sm icon-btn--plain icon-btn--danger" type="button" data-action="delete-item" data-index="' + index + '" title="删除本行" aria-label="删除第 ' + (index + 1) + ' 行">' + icon('trash', 14) + '</button>' +
        '</td></tr>';
    }).join('') :
      '<tr><td colspan="14"><div class="items-empty"><strong>还没有货物明细</strong>' +
      '从上方产品库选择并「添加产品」，或点击「自定义行」手工录入。</div></td></tr>';

    var foot = '<tfoot><tr>' +
      '<td colspan="3" class="label">合计</td>' +
      '<td class="num" data-total-qty>' + esc(qtyText(calc.totalQty)) + '</td>' +
      '<td></td><td></td>' +
      '<td class="num" data-total-amount>' + esc(money(calc.merchandiseTotal, order.currency)) + '</td>' +
      '<td class="num" data-total-cartons>' + esc(qtyText(calc.totalCartons)) + '</td>' +
      '<td></td>' +
      '<td class="num" data-total-net>' + esc(numText(calc.totalNetWeight, 3)) + ' kg</td>' +
      '<td class="num" data-total-gross>' + esc(numText(calc.totalGrossWeight, 3)) + ' kg</td>' +
      '<td class="num" data-total-cbm>' + esc(numText(calc.totalCbm, 3)) + ' m³</td>' +
      '<td></td><td></td></tr></tfoot>';

    return '<div class="items-wrap"><table class="items-table"><thead><tr>' +
      '<th>#</th><th>货品名称 / HS 编码</th><th>产品编码</th><th class="num">数量</th><th>单位</th>' +
      '<th class="num">单价</th><th class="num">金额</th><th class="num">箱数</th><th class="num">每箱数量</th>' +
      '<th class="num">每箱净重</th><th class="num">每箱毛重</th><th class="num">每箱体积</th><th class="num">成本价</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody>' + foot + '</table></div>';
  }

  function docMetaSection(order) {
    var selected = Array.isArray(order.print.selected) ? order.print.selected : [];
    var rows = getDocList().map(function (doc) {
      var meta = (order.docMeta && order.docMeta[doc.key]) || null;
      var on = selected.indexOf(doc.key) >= 0;
      return '<div class="doc-meta-row' + (on ? ' is-on' : '') + '" data-doc-row="' + esc(doc.key) + '">' +
        '<div class="doc-meta-check">' +
        '<input class="checkbox" type="checkbox" data-doc-select="' + esc(doc.key) + '"' + (on ? ' checked' : '') + ' aria-label="选择单证：' + esc(doc.nameCn) + '">' +
        '<span class="doc-meta-name">' + esc(doc.nameCn) + '<small>' + esc(doc.prefix || '') + ' · ' + esc(doc.nameEn || '') + '</small></span>' +
        '</div>' +
        '<div class="doc-meta-field">' +
        '<label class="sr-only" for="docmeta-' + esc(doc.key) + '">' + esc(doc.nameCn) + '编号</label>' +
        '<input class="input" id="docmeta-' + esc(doc.key) + '" type="text" data-doc-meta="' + esc(doc.key) + '" value="' + esc(meta && meta.no ? meta.no : '') + '" placeholder="预览时自动生成">' +
        '<label class="sr-only" for="docdate-' + esc(doc.key) + '">' + esc(doc.nameCn) + '日期</label>' +
        '<input class="input" id="docdate-' + esc(doc.key) + '" type="date" data-doc-meta-date="' + esc(doc.key) + '" value="' + esc(meta && meta.date ? meta.date : (order.date || '')) + '">' +
        '</div>' +
        '<div class="doc-meta-actions">' +
        '<button class="icon-btn icon-btn--sm icon-btn--plain" type="button" data-action="regen-doc-meta" data-key="' + esc(doc.key) + '" title="重新生成编号" aria-label="重新生成' + esc(doc.nameCn) + '编号">' + icon('refresh', 13) + '</button>' +
        '</div></div>';
    }).join('');
    return '<div class="alert alert--info" style="margin-bottom:14px">' + icon('info', 15) +
      '<span>勾选需要生成的单证类型。编号仅在预览 / 打印时消耗，重复预览不会跳号；也可以手动改写编号后保存。</span></div>' +
      '<div class="doc-meta-list">' + rows + '</div>';
  }

  function editorBasicSection(order) {
    return sectionCard({
      icon: 'file',
      title: '基本信息',
      sub: '订单号、日期与交易条件',
      body: '<div class="form-grid form-grid-3">' +
        field({ label: '内部订单号', name: 'no', value: order.no, required: true, placeholder: 'SO-2026-0001', hint: '仅内部使用，不会占用单证编号' }) +
        field({ label: '订单日期', name: 'date', type: 'date', value: order.date, required: true }) +
        field({ label: '订单状态', name: 'status', type: 'select', value: order.status, options: [{ value: 'draft', label: '草稿 · 编辑中' }, { value: 'done', label: '已完成 · 已归档' }] }) +
        field({ label: '币种', name: 'currency', type: 'select', value: order.currency, options: currencyOptions() }) +
        field({ label: '贸易术语（Incoterm）', name: 'incoterm', type: 'select', value: order.incoterm, options: incotermOptions() }) +
        field({ label: '运输方式', name: 'transportMode', type: 'select', value: order.transportMode, options: transportOptions() }) +
        '</div>'
    });
  }

  function editorBuyerSection(order) {
    var customers = store.getState().customers || [];
    var customerOptions = [{ value: '', label: customers.length ? '— 从客户库选择买方（快照） —' : '— 客户库为空，可直接填写下方买方 —' }]
      .concat(customers.map(function (c) {
        return { value: c.id, label: (c.code ? c.code + ' · ' : '') + (c.nameCn || c.nameEn || '未命名客户') };
      }));
    var buyer = order.buyer || {};
    return sectionCard({
      icon: 'users',
      title: '买方与收货人',
      sub: '买方信息为订单快照，修改不会影响客户库',
      actions: '<button class="btn btn--sm" type="button" data-action="buyer-to-customer">' + icon('users', 14) + '存入客户库</button>',
      body: '<div class="form-grid">' +
        field({ label: '客户库', name: 'customerId', id: 'customer-select', type: 'select', value: order.customerId, options: customerOptions, hint: '选择后自动填入买方快照，之后可自由修改' }) +
        field({ label: '买方国家 / 地区', name: 'buyer.country', value: buyer.country, placeholder: 'UNITED STATES' }) +
        field({ label: '买方名称（英文）', name: 'buyer.nameEn', value: buyer.nameEn, required: true, placeholder: 'ATLANTIC HOME GOODS LLC' }) +
        field({ label: '买方名称（中文）', name: 'buyer.nameCn', value: buyer.nameCn, placeholder: '选填' }) +
        field({ label: '买方地址（英文）', name: 'buyer.addressEn', type: 'textarea', value: buyer.addressEn, span: 'full', className: 'textarea--sm', rows: 3, placeholder: 'Street, City, State, ZIP, Country' }) +
        field({ label: '买方地址（中文）', name: 'buyer.addressCn', type: 'textarea', value: buyer.addressCn, span: 'full', className: 'textarea--sm', rows: 2, placeholder: '选填' }) +
        field({ label: '联系人', name: 'buyer.contact', value: buyer.contact }) +
        field({ label: '电话', name: 'buyer.tel', value: buyer.tel, type: 'tel' }) +
        field({ label: '邮箱', name: 'buyer.email', value: buyer.email, type: 'email' }) +
        field({ label: '税号 / VAT', name: 'buyer.taxId', value: buyer.taxId }) +
        field({ label: '收货人（Consignee）', name: 'consignee', type: 'textarea', value: order.consignee, span: 'full', className: 'textarea--sm', rows: 2, placeholder: '留空表示与买方一致；如需不同收货人请填写' }) +
        field({ label: '通知方（Notify Party）', name: 'notifyParty', type: 'textarea', value: order.notifyParty, span: 'full', className: 'textarea--sm', rows: 2, placeholder: 'SAME AS CONSIGNEE' }) +
        '</div>'
    });
  }

  function editorItemsSection(order) {
    return sectionCard({
      id: 'section-items',
      icon: 'package',
      title: '货物明细',
      sub: '金额、箱数、毛净重与体积自动汇总',
      body: '<div id="items-area">' + itemsAreaHTML(order) + '</div>'
    });
  }

  function editorShippingSection(order) {
    return sectionCard({
      icon: 'anchor',
      title: '运输与条款',
      sub: '船期、港口、信用证与唛头',
      body: '<div class="form-grid form-grid-3">' +
        field({ label: '起运港', name: 'portOfLoading', value: order.portOfLoading, placeholder: 'NINGBO, CHINA' }) +
        field({ label: '目的港', name: 'portOfDischarge', value: order.portOfDischarge, placeholder: 'LOS ANGELES, USA' }) +
        field({ label: '最终目的地', name: 'finalDestination', value: order.finalDestination, placeholder: 'LOS ANGELES, CA, USA' }) +
        field({ label: '目的国', name: 'countryOfDestination', value: order.countryOfDestination, placeholder: 'UNITED STATES' }) +
        field({ label: '船名', name: 'vessel', value: order.vessel, placeholder: 'OOCL SUNRISE' }) +
        field({ label: '航次', name: 'voyage', value: order.voyage, placeholder: '026E' }) +
        field({ label: '集装箱号', name: 'containerNo', value: order.containerNo }) +
        field({ label: '封号', name: 'sealNo', value: order.sealNo }) +
        field({ label: '提单号', name: 'blNo', value: order.blNo }) +
        field({ label: '订舱号', name: 'bookingNo', value: order.bookingNo }) +
        field({ label: '开船日期（ETD）', name: 'etd', type: 'date', value: order.etd }) +
        field({ label: '到港日期（ETA）', name: 'eta', type: 'date', value: order.eta }) +
        field({ label: '信用证号', name: 'lcNo', value: order.lcNo }) +
        field({ label: '信用证日期', name: 'lcDate', type: 'date', value: order.lcDate }) +
        field({ label: '开证行', name: 'lcIssuingBank', value: order.lcIssuingBank }) +
        field({ label: '付款方式', name: 'paymentTerms', type: 'textarea', value: order.paymentTerms, span: 'full', className: 'textarea--sm', rows: 2, placeholder: 'T/T 30% deposit, balance against copy of B/L' }) +
        field({ label: '唛头 / 运输标记', name: 'shippingMarks', type: 'textarea', value: order.shippingMarks, span: 'full', className: 'textarea--sm', rows: 3, placeholder: 'N/M 或 SHIPPING MARKS，每行一条', hint: '多行文本，将按原样出现在单证上' }) +
        '</div>'
    });
  }

  function editorChargesSection(order) {
    var calc = calcSafely(order);
    return sectionCard({
      icon: 'dollar-sign',
      title: '费用调整',
      sub: '运费、保险、其他费用与折扣计入订单总额',
      body: '<div class="form-grid form-grid-4">' +
        field({ label: '运费（Freight）', name: 'charges.freight', type: 'number', value: order.charges.freight }) +
        field({ label: '保险费（Insurance）', name: 'charges.insurance', type: 'number', value: order.charges.insurance }) +
        field({ label: '其他费用（Other）', name: 'charges.other', type: 'number', value: order.charges.other }) +
        field({ label: '折扣（Discount）', name: 'charges.discount', type: 'number', value: order.charges.discount }) +
        '</div>' +
        '<div class="totals-strip">' +
        '<span class="total-chip">货物金额 <b data-charges-merchandise>' + esc(money(calc.merchandiseTotal, order.currency)) + '</b></span>' +
        '<span class="total-chip">总额 <b data-charges-total>' + esc(money(calc.grandTotal, order.currency)) + '</b></span>' +
        '<span class="field-hint">总额 = 货物金额 + 运费 + 保险 + 其他 − 折扣，自动同步到所有单证</span>' +
        '</div>'
    });
  }

  function editorDocsSection(order) {
    return sectionCard({
      icon: 'layers',
      title: '单证编号与选择',
      sub: '可覆盖编号 / 日期，或一键重新生成',
      actions: '<span class="badge badge--brand" data-doc-selected-count>' + selectedCount(order) + ' 类已选</span>',
      body: docMetaSection(order)
    });
  }

  function editorCostSection(order) {
    return sectionCard({
      icon: 'calculator',
      title: '内部成本',
      sub: '仅用于毛利核算，不随普通单证外发',
      body: '<div class="cost-grid">' +
        field({ label: '汇率（1 外币 = ? CNY）', name: 'cost.exchangeRate', type: 'number', step: '0.0001', min: 0.0001, value: order.cost.exchangeRate }) +
        field({ label: '国内费用（CNY）', name: 'cost.domestic', type: 'number', value: order.cost.domestic }) +
        field({ label: '银行费用（CNY）', name: 'cost.bank', type: 'number', value: order.cost.bank }) +
        field({ label: '其他费用（CNY）', name: 'cost.misc', type: 'number', value: order.cost.misc }) +
        '</div>' +
        '<div class="cost-summary" id="cost-body">' + costSummaryHTML(order) + '</div>'
    });
  }

  function editorRemarksSection(order) {
    return sectionCard({
      icon: 'edit',
      title: '备注',
      sub: '将作为内部备注 / 部分单证附加说明',
      body: field({ label: '订单备注', name: 'remarks', type: 'textarea', value: order.remarks, rows: 3, placeholder: '例如：请在所有单据上注明订单号；EU 插头版本等特殊要求。' })
    });
  }

  function summaryBodyHTML(order, calc, comp) {
    var calcData = calc || calcSafely(order);
    var completeness = comp || computeCompleteness(order);
    var pct = completeness.pct;
    var barClass = pct >= 85 ? '' : pct >= 60 ? ' meter-bar--warn' : ' meter-bar--bad';
    return '<div class="summary-eyebrow">订单总额</div>' +
      '<div class="summary-total" data-summary-total>' + esc(money(calcData.grandTotal, order.currency)) + '</div>' +
      '<div class="summary-words" data-summary-words>' + esc(calcData.amountInWordsEn || '') + '</div>' +
      '<div class="summary-divider"></div>' +
      '<div class="summary-rows">' +
      summaryRow('品目 / 数量', calcData.lines.length + ' 项 · ' + qtyText(calcData.totalQty)) +
      summaryRow('总箱数', qtyText(calcData.totalCartons) + ' 箱') +
      summaryRow('净重 / 毛重', numText(calcData.totalNetWeight, 3) + ' / ' + numText(calcData.totalGrossWeight, 3) + ' kg') +
      summaryRow('总体积', numText(calcData.totalCbm, 3) + ' m³') +
      summaryRow('运费 / 保险', money(calcData.freight, order.currency) + ' / ' + money(calcData.insurance, order.currency)) +
      '</div>' +
      '<div class="meter-block">' +
      '<div class="meter-head"><span>资料完整度</span><span data-completeness-pct>' + pct + '%</span></div>' +
      '<div class="meter"><div class="meter-bar' + barClass + '" data-completeness-bar style="width:' + Math.max(0, Math.min(100, pct)) + '%"></div></div>' +
      (completeness.missing.length
        ? '<div class="summary-issues" data-summary-issues>' + completeness.missing.slice(0, 4).map(function (label) {
          return '<div class="summary-issue">' + icon('alert', 12) + '<span>待完善：' + esc(label) + '</span></div>';
        }).join('') + '</div>'
        : '<div class="summary-issues"><div class="summary-issue" style="color:var(--ok)">' + icon('check-circle', 12) + '<span>资料完整，可以生成单证</span></div></div>') +
      '</div>' +
      '<div class="summary-actions">' +
      '<button class="btn btn--primary btn--block" type="button" data-action="save-order">' + icon('check', 16) + '保存订单</button>' +
      '<button class="btn btn--block" type="button" data-action="preview-order">' + icon('printer', 16) + '预览单证</button>' +
      '</div>' +
      '<div class="summary-note">自动保存已开启：编辑约 0.5 秒后写入本机浏览器。' +
      (order.updatedAt ? '<br>最近保存：' + esc(String(order.updatedAt).replace('T', ' ').slice(0, 16)) : '') + '</div>';
  }

  function summaryRow(label, value) {
    return '<div class="summary-row"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function costSummaryHTML(order) {
    var calc = calcSafely(order);
    var cost;
    try { cost = core.calcCost(order); } catch (err) {
      cost = { revenueCny: 0, purchaseCost: 0, totalCost: 0, grossProfit: 0, marginPct: 0 };
    }
    var cls = cost.grossProfit >= 0 ? 'pos' : 'neg';
    return '<div class="cost-cell"><span>收入（CNY）</span><b>' + esc(numText(cost.revenueCny, 2)) + '</b></div>' +
      '<div class="cost-cell"><span>采购成本（CNY）</span><b>' + esc(numText(cost.purchaseCost, 2)) + '</b></div>' +
      '<div class="cost-cell"><span>总成本（CNY）</span><b>' + esc(numText(cost.totalCost, 2)) + '</b></div>' +
      '<div class="cost-cell"><span>毛利 / 毛利率</span><b class="' + cls + '">' + esc(numText(cost.grossProfit, 2)) + ' · ' + esc(numText(cost.marginPct, 2)) + '%</b></div>';
  }

  function computeCompleteness(order) {
    var calc = calcSafely(order);
    var buyer = order.buyer || {};
    var items = Array.isArray(order.items) ? order.items : [];
    var settings = store.getState().settings || {};
    var company = settings.company || {};
    var checks = [
      { ok: !!(String(buyer.nameEn || '').trim() || String(buyer.nameCn || '').trim()), label: '买方名称' },
      { ok: !!String(buyer.addressEn || '').trim(), label: '买方地址' },
      { ok: !!core.parseISO(order.date), label: '订单日期' },
      { ok: items.length > 0, label: '货物明细' },
      { ok: items.length > 0 && items.every(function (it) { return !!String(it.nameEn || it.nameCn || '').trim(); }), label: '货物名称' },
      { ok: items.length > 0 && items.every(function (it) { return core.num(it.qty, 0) > 0; }), label: '货物数量' },
      { ok: calc.grandTotal > 0, label: '单价与金额' },
      { ok: items.length > 0 && items.every(function (it) { return core.num(it.cartons, 0) > 0 || core.num(it.qtyPerCarton, 0) > 0; }), label: '箱数 / 箱规' },
      { ok: items.length > 0 && items.every(function (it) { return core.num(it.grossWeight, 0) > 0; }), label: '每箱毛重' },
      { ok: !!(String(order.portOfLoading || '').trim() && String(order.portOfDischarge || '').trim()), label: '起运港 / 目的港' },
      { ok: !!String(order.incoterm || '').trim(), label: '贸易术语' },
      { ok: !!String(order.paymentTerms || '').trim(), label: '付款方式' },
      { ok: !!(String(order.countryOfDestination || '').trim() || String(buyer.country || '').trim()), label: '目的国' },
      { ok: !!String(company.nameEn || company.nameCn || '').trim(), label: '公司抬头' }
    ];
    var okCount = 0;
    var missing = [];
    checks.forEach(function (check) {
      if (check.ok) okCount += 1;
      else missing.push(check.label);
    });
    return { pct: Math.round((okCount / checks.length) * 100), missing: missing, total: checks.length, okCount: okCount };
  }

  function editorHead(order) {
    return '<div class="page-head"><div class="page-head-main">' +
      '<div class="page-eyebrow">' + icon('file', 13) + '<a class="cell-link" href="#/orders">订单管理</a> / 编辑订单</div>' +
      '<h2 class="page-title"><span class="mono" style="font-size:20px">' + esc(order.no || '未命名订单') + '</span>' +
      '<span id="editor-status-badge">' + statusBadge(order.status) + '</span></h2>' +
      '<p class="page-sub" id="editor-updated">更新于 ' + esc(order.updatedAt ? String(order.updatedAt).replace('T', ' ').slice(0, 16) : '刚刚') +
      ' · 买方：' + esc(buyerName(order) || '未填写') + '</p></div>' +
      '<div class="page-actions">' +
      '<a class="btn btn--ghost" href="#/orders">' + icon('arrow-left', 15) + '返回列表</a>' +
      '<div class="menu-wrap">' +
      '<button class="btn" type="button" data-action="toggle-more-menu" aria-haspopup="true">更多' + icon('chevron-down', 14) + '</button>' +
      '<div class="menu">' +
      '<button class="menu-item" type="button" data-action="duplicate-order" data-id="' + esc(order.id) + '">' + icon('copy', 15) + '复制订单</button>' +
      '<button class="menu-item" type="button" data-action="toggle-order-done" data-id="' + esc(order.id) + '">' + icon(order.status === 'done' ? 'rotate-ccw' : 'check-circle', 15) + (order.status === 'done' ? '标记为草稿' : '标记为已完成') + '</button>' +
      '<div class="menu-sep"></div>' +
      '<button class="menu-item menu-item--danger" type="button" data-action="delete-order" data-id="' + esc(order.id) + '">' + icon('trash', 15) + '删除订单</button>' +
      '</div></div>' +
      '<button class="btn btn--recognize" type="button" data-testid="recognize-open" data-action="recognize-open">' + icon('zap', 15) + '智能填单</button>' +
      '<button class="btn" type="button" data-testid="preview-order" data-action="preview-order">' + icon('printer', 15) + '预览单证</button>' +
      '<button class="btn btn--primary" type="button" data-testid="save-order" data-action="save-order">' + icon('check', 16) + '保存订单</button>' +
      '</div></div>';
  }

  function editorPage(orderId) {
    var order = store.getOrder(orderId);
    if (!order) return missingOrderPage('未找到订单');
    activeEditor = {
      orderId: order.id,
      draft: order,
      dirty: false,
      timer: null,
      savedAt: Date.now()
    };
    var html = editorHead(order) +
      '<form id="order-form" class="editor-layout" novalidate autocomplete="off">' +
      '<div class="editor-main">' +
      editorBasicSection(order) +
      editorBuyerSection(order) +
      editorItemsSection(order) +
      editorShippingSection(order) +
      editorChargesSection(order) +
      editorDocsSection(order) +
      editorCostSection(order) +
      editorRemarksSection(order) +
      '</div>' +
      '<aside class="editor-side">' +
      '<div class="card summary"><div data-summary-body id="summary-body">' + summaryBodyHTML(order, calcSafely(order), computeCompleteness(order)) + '</div></div>' +
      '</aside>' +
      '</form>';
    return {
      html: html,
      title: '编辑订单',
      crumbs: '工作台 / 订单管理 / 编辑订单',
      nav: 'orders',
      mount: mountEditorPage
    };
  }

  function updateEditorUpdatedLabel() {
    if (!activeEditor) return;
    var label = $('#editor-updated');
    if (!label) return;
    var order = activeEditor.draft;
    label.textContent = '更新于 ' + (order.updatedAt ? String(order.updatedAt).replace('T', ' ').slice(0, 16) : '刚刚') +
      ' · 买方：' + (buyerName(order) || '未填写');
  }

  function updateEditorSummary() {
    if (!activeEditor) return;
    var order = activeEditor.draft;
    var calc = calcSafely(order);
    var comp = computeCompleteness(order);
    var summary = $('#summary-body');
    if (summary) summary.innerHTML = summaryBodyHTML(order, calc, comp);
    var costBody = $('#cost-body');
    if (costBody) costBody.innerHTML = costSummaryHTML(order);
    var headBadge = $('[data-doc-selected-count]');
    if (headBadge) headBadge.textContent = selectedCount(order) + ' 类已选';
    var editorBadge = $('#doc-selected-count');
    if (editorBadge) editorBadge.textContent = selectedCount(order) + ' 类';
  }

  function setText(selector, value) {
    var el = $(selector);
    if (el) el.textContent = value;
  }

  function refreshEditorComputed() {
    if (!activeEditor) return;
    var order = activeEditor.draft;
    var calc = calcSafely(order);
    $$('#order-form tr[data-item-index]').forEach(function (tr) {
      var index = Number(tr.getAttribute('data-item-index'));
      var line = calc.lines[index];
      var amountEl = tr.querySelector('[data-line-amount]');
      if (line && amountEl) amountEl.textContent = money(line.amount, order.currency);
      var currencyEl = tr.querySelector('[data-line-currency]');
      if (currencyEl) currencyEl.textContent = order.currency;
    });
    setText('[data-total-qty]', qtyText(calc.totalQty));
    setText('[data-total-amount]', money(calc.merchandiseTotal, order.currency));
    setText('[data-total-cartons]', qtyText(calc.totalCartons));
    setText('[data-total-net]', numText(calc.totalNetWeight, 3) + ' kg');
    setText('[data-total-gross]', numText(calc.totalGrossWeight, 3) + ' kg');
    setText('[data-total-cbm]', numText(calc.totalCbm, 3) + ' m³');
    setText('[data-charges-merchandise]', money(calc.merchandiseTotal, order.currency));
    setText('[data-charges-total]', money(calc.grandTotal, order.currency));
    updateEditorSummary();
  }

  function scheduleEditorSave() {
    if (!activeEditor) return;
    activeEditor.dirty = true;
    if (activeEditor.timer) clearTimeout(activeEditor.timer);
    activeEditor.timer = setTimeout(function () {
      if (!activeEditor) return;
      activeEditor.timer = null;
      commitEditor({ silent: true });
    }, 500);
  }

  function syncDocMetaFromDom(form, draft) {
    if (!form || !draft) return;
    var viewed = 0;
    $$('[data-doc-meta]', form).forEach(function (el) {
      var key = el.getAttribute('data-doc-meta');
      if (!key) return;
      viewed += 1;
      draft.docMeta = draft.docMeta || {};
      draft.docMeta[key] = draft.docMeta[key] || { no: '', date: draft.date || core.todayISO() };
      draft.docMeta[key].no = String(el.value || '').trim();
    });
    $$('[data-doc-meta-date]', form).forEach(function (el) {
      var key = el.getAttribute('data-doc-meta-date');
      if (!key) return;
      draft.docMeta = draft.docMeta || {};
      draft.docMeta[key] = draft.docMeta[key] || { no: '' };
      draft.docMeta[key].date = el.value || draft.date || core.todayISO();
    });
    if (viewed) {
      var checked = $$('[data-doc-select]', form).filter(function (el) { return el.checked; })
        .map(function (el) { return el.getAttribute('data-doc-select'); });
      draft.print = draft.print || {};
      draft.print.selected = docKeys().filter(function (key) { return checked.indexOf(key) >= 0; });
    }
    Object.keys(draft.docMeta || {}).forEach(function (key) {
      var meta = draft.docMeta[key];
      if (!meta || (!meta.no && !meta.date)) delete draft.docMeta[key];
    });
  }

  function commitEditor(opts) {
    if (!activeEditor) return null;
    var form = $('#order-form');
    if (form) {
      syncFormToDraft(form, activeEditor.draft);
      syncItemInputs(form, activeEditor.draft);
      syncDocMetaFromDom(form, activeEditor.draft);
    }
    var saved = store.saveOrder(activeEditor.draft);
    if (saved) {
      activeEditor.draft = saved;
      activeEditor.dirty = false;
      updateEditorUpdatedLabel();
    }
    if (!(opts && opts.silent)) refreshEditorComputed();
    return saved;
  }

  function saveEditorExplicit() {
    if (!activeEditor) {
      toast('当前页面没有正在编辑的订单', 'warn');
      return;
    }
    var saved = commitEditor({ silent: true });
    if (!saved) {
      toast('保存失败，请检查浏览器存储权限或空间', 'error');
      return;
    }
    refreshEditorComputed();
    var issues;
    try { issues = core.validateOrder(saved); } catch (err) { issues = []; }
    var errors = issues.filter(function (issue) { return issue.level === 'error'; }).length;
    var warns = issues.length - errors;
    if (errors) toast('订单已保存，但仍有 ' + errors + ' 项必填内容待完善', 'warn', { title: '已保存草稿' });
    else if (warns) toast('订单已保存，有 ' + warns + ' 项信息建议补充', 'success', { title: '已保存' });
    else toast('订单已保存，资料完整', 'success', { title: '已保存' });
  }

  function previewEditorAction() {
    if (!activeEditor) return;
    var form = $('#order-form');
    if (form) {
      syncFormToDraft(form, activeEditor.draft);
      syncItemInputs(form, activeEditor.draft);
      syncDocMetaFromDom(form, activeEditor.draft);
    }
    commitEditor({ silent: true });
    var id = activeEditor.orderId;
    navigate('#/preview/' + encodeURIComponent(id));
  }

  function flushEditorDraft() {
    var editor = activeEditor;
    if (!editor) return;
    activeEditor = null;
    if (editor.timer) {
      clearTimeout(editor.timer);
      editor.timer = null;
    }
    if (editor.dirty) {
      try { store.saveOrder(editor.draft); } catch (err) { console.error('[TradeDocs] 离开编辑器时保存失败', err); }
    }
  }

  function rerenderItems() {
    if (!activeEditor) return;
    var area = $('#items-area');
    if (!area) return;
    area.innerHTML = itemsAreaHTML(activeEditor.draft);
    refreshEditorComputed();
    scheduleEditorSave();
  }

  function addProductFromPicker() {
    if (!activeEditor) return;
    var picker = $('#product-picker');
    var productId = picker ? picker.value : '';
    var product = productId ? store.getProduct(productId) : null;
    if (!product) {
      toast('请先在产品库中维护产品，或使用「自定义行」手工录入', 'warn');
      return;
    }
    var item = {
      id: core.uid('item'),
      productId: product.id,
      code: product.code || '',
      nameEn: product.nameEn || '',
      nameCn: product.nameCn || '',
      hsCode: product.hsCode || '',
      origin: product.origin || 'CHINA',
      unit: product.unit || 'PCS',
      qty: core.num(product.qtyPerCarton, 0) > 0 ? core.num(product.qtyPerCarton, 0) : 0,
      unitPrice: core.num(product.price, 0),
      cartons: core.num(product.qtyPerCarton, 0) > 0 ? 1 : 0,
      qtyPerCarton: core.num(product.qtyPerCarton, 0),
      netWeight: core.num(product.netWeight, 0),
      grossWeight: core.num(product.grossWeight, 0),
      cbm: core.num(product.cbm, 0),
      costPrice: 0,
      remarks: ''
    };
    activeEditor.draft.items.push(item);
    rerenderItems();
    toast('已添加「' + (product.nameCn || product.nameEn) + '」', 'success');
    var rows = $$('#items-area tr[data-item-index]');
    if (rows.length) {
      var last = rows[rows.length - 1];
      if (last.scrollIntoView) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var qtyInput = last.querySelector('[data-item-field="qty"]');
      if (qtyInput) qtyInput.focus();
    }
  }

  function addBlankItem() {
    if (!activeEditor) return;
    activeEditor.draft.items.push({
      id: core.uid('item'), productId: '', code: '', nameEn: '', nameCn: '', hsCode: '',
      origin: 'CHINA', unit: 'PCS', qty: 0, unitPrice: 0, cartons: 0, qtyPerCarton: 0,
      netWeight: 0, grossWeight: 0, cbm: 0, costPrice: 0, remarks: ''
    });
    rerenderItems();
    var rows = $$('#items-area tr[data-item-index]');
    if (rows.length) {
      var last = rows[rows.length - 1];
      if (last.scrollIntoView) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var nameInput = last.querySelector('[data-item-field="nameEn"]');
      if (nameInput) nameInput.focus();
    }
  }

  function duplicateItem(index) {
    if (!activeEditor || !activeEditor.draft.items[index]) return;
    var clone = core.clone(activeEditor.draft.items[index]);
    clone.id = core.uid('item');
    activeEditor.draft.items.splice(index + 1, 0, clone);
    rerenderItems();
  }

  function deleteItem(index) {
    if (!activeEditor || !activeEditor.draft.items[index]) return;
    activeEditor.draft.items.splice(index, 1);
    rerenderItems();
    toast('已删除货物行', 'info');
  }

  function applyCustomerSnapshot(customerId) {
    if (!activeEditor) return;
    var customer = customerId ? store.getCustomer(customerId) : null;
    if (!customer) {
      activeEditor.draft.customerId = '';
      scheduleEditorSave();
      return;
    }
    var buyer = {};
    ['nameEn', 'nameCn', 'addressEn', 'addressCn', 'country', 'contact', 'tel', 'email', 'taxId'].forEach(function (key) {
      buyer[key] = customer[key] || '';
    });
    activeEditor.draft.customerId = customer.id;
    activeEditor.draft.buyer = buyer;
    Object.keys(buyer).forEach(function (key) {
      var input = $('[data-path="buyer.' + key + '"]');
      if (input) input.value = buyer[key];
    });
    var select = $('#customer-select');
    if (select) select.value = customer.id;
    scheduleEditorSave();
    updateEditorSummary();
    toast('已填入客户快照：' + (customer.nameCn || customer.nameEn), 'success');
  }

  function refreshCustomerSelect(selectedId) {
    var select = $('#customer-select');
    if (!select) return;
    var customers = store.getState().customers || [];
    select.innerHTML = '<option value="">— 从客户库选择买方（快照） —</option>' + customers.map(function (customer) {
      return '<option value="' + esc(customer.id) + '">' + esc((customer.code ? customer.code + ' · ' : '') + (customer.nameCn || customer.nameEn || '未命名客户')) + '</option>';
    }).join('');
    select.value = selectedId || '';
  }

  function saveBuyerAsCustomer() {
    if (!activeEditor) return;
    var buyer = activeEditor.draft.buyer || {};
    if (!String(buyer.nameEn || buyer.nameCn || '').trim()) {
      toast('请先填写买方名称，再存入客户库', 'warn');
      return;
    }
    var customer = store.saveCustomer({
      nameEn: buyer.nameEn, nameCn: buyer.nameCn, addressEn: buyer.addressEn, addressCn: buyer.addressCn,
      country: buyer.country, contact: buyer.contact, tel: buyer.tel, email: buyer.email, taxId: buyer.taxId
    });
    if (!customer) {
      toast('存入客户库失败', 'error');
      return;
    }
    activeEditor.draft.customerId = customer.id;
    refreshCustomerSelect(customer.id);
    scheduleEditorSave();
    toast('已将买方信息存入客户库', 'success');
  }

  function toggleDocSelection(key, on) {
    if (!activeEditor || !key) return;
    var order = activeEditor.draft;
    var set = {};
    (order.print.selected || []).forEach(function (k) { set[k] = true; });
    if (on) set[key] = true;
    else delete set[key];
    order.print.selected = docKeys().filter(function (k) { return set[k]; });
    var row = $('[data-doc-row="' + key + '"]');
    if (row) row.classList.toggle('is-on', !!on);
    scheduleEditorSave();
    updateEditorSummary();
  }

  function regenerateDocMeta(key) {
    if (!activeEditor || !key) return;
    var meta;
    try {
      meta = store.regenerateDocMeta(activeEditor.draft, key);
    } catch (err) {
      toast('重新生成编号失败', 'error');
      return;
    }
    activeEditor.draft.docMeta = activeEditor.draft.docMeta || {};
    activeEditor.draft.docMeta[key] = meta;
    var input = $('[data-doc-meta="' + key + '"]');
    if (input) input.value = meta.no;
    var dateInput = $('[data-doc-meta-date="' + key + '"]');
    if (dateInput && !dateInput.value) dateInput.value = meta.date;
    scheduleEditorSave();
    toast('已重新生成编号 ' + meta.no, 'success');
  }

  function updateEditorStatusUI() {
    if (!activeEditor) return;
    var badgeHost = $('#editor-status-badge');
    if (badgeHost) badgeHost.outerHTML = statusBadge(activeEditor.draft.status);
  }

  function mountEditorPage() {
    if (!activeEditor) return;
    var form = $('#order-form');
    if (!form) return;
    bindPaths(form, activeEditor.draft, function (path) {
      if (path === 'status') updateEditorStatusUI();
      scheduleEditorSave();
      refreshEditorComputed();
    });
    form.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      var index = el.getAttribute('data-item-index');
      var itemField = el.getAttribute('data-item-field');
      if (index !== null && itemField) {
        var item = activeEditor.draft.items[Number(index)];
        if (!item) return;
        item[itemField] = readControl(el);
        scheduleEditorSave();
        refreshEditorComputed();
        return;
      }
      var docKey = el.getAttribute('data-doc-meta');
      var docDateKey = el.getAttribute('data-doc-meta-date');
      if (docKey) {
        var order = activeEditor.draft;
        order.docMeta = order.docMeta || {};
        order.docMeta[docKey] = order.docMeta[docKey] || { date: order.date || core.todayISO() };
        order.docMeta[docKey].no = String(el.value || '').trim();
        scheduleEditorSave();
      } else if (docDateKey) {
        var orderRef = activeEditor.draft;
        orderRef.docMeta = orderRef.docMeta || {};
        orderRef.docMeta[docDateKey] = orderRef.docMeta[docDateKey] || { no: '' };
        orderRef.docMeta[docDateKey].date = el.value || '';
        scheduleEditorSave();
      }
    });
    form.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      var docSelect = el.getAttribute('data-doc-select');
      if (docSelect) toggleDocSelection(docSelect, !!el.checked);
      if (el.id === 'customer-select') applyCustomerSnapshot(el.value);
    });
    updateEditorSummary();
    refreshEditorComputed();
  }

  /* ================================================================
   *  Preview center
   * ================================================================ */

  var previewState = null;

  function sanitizeSelected(selected) {
    var keys = docKeys();
    var set = {};
    (Array.isArray(selected) ? selected : []).forEach(function (key) {
      if (keys.indexOf(key) >= 0) set[key] = true;
    });
    return keys.filter(function (key) { return set[key]; });
  }

  function previewPage(orderId, docKey) {
    if (!orderId) return missingOrderPage('未指定订单', '预览链接中缺少订单 ID，请从订单列表重新打开。');
    var order = store.getOrder(orderId);
    if (!order) return missingOrderPage('未找到订单');
    var selected = sanitizeSelected(order.print && order.print.selected);
    if (docKey && docKeys().indexOf(docKey) >= 0 && selected.indexOf(docKey) < 0) {
      selected = sanitizeSelected(selected.concat([docKey]));
      order.print = order.print || {};
      order.print.selected = selected.slice();
      store.saveOrder(order);
      order = store.getOrder(orderId);
    }
    previewState = { orderId: order.id, selected: selected.slice(), docKey: docKey || '' };
    var sheets = buildSheets(order, selected);
    var html = previewToolbarHTML(order, selected) +
      '<div class="preview-canvas"><div id="preview-sheets" class="preview-sheets print-area">' + sheets + '</div></div>';
    return {
      html: html,
      title: '单证预览',
      crumbs: '工作台 / 订单管理 / 单证预览',
      nav: 'orders',
      mount: mountPreviewPage,
      afterRender: function () { if (docKey) scrollToPreviewDoc(docKey); }
    };
  }

  function previewToolbarHTML(order, selected) {
    var chips = getDocList().map(function (doc) {
      var on = selected.indexOf(doc.key) >= 0;
      return '<div class="doc-tab' + (on ? ' is-active' : '') + '" role="tab" tabindex="0" aria-selected="' + (on ? 'true' : 'false') + '"' +
        ' data-doc-tab="' + esc(doc.key) + '" data-action="preview-doc" data-key="' + esc(doc.key) + '" title="' + esc(doc.nameEn) + '">' +
        '<span class="doc-tab-check">' + icon('check', 9) + '</span><span>' + esc(doc.nameCn) + '</span>' +
        '<button type="button" class="doc-tab-x" data-action="preview-remove-doc" data-key="' + esc(doc.key) +
        '" aria-label="移除 ' + esc(doc.nameCn) + '" title="移除 ' + esc(doc.nameCn) + '">' + icon('x', 11) + '</button></div>';
    }).join('');
    var hasEngine = hasDocsEngine();
    return '<div class="preview-toolbar no-print">' +
      '<div class="preview-toolbar-top">' +
      '<div class="preview-info">' +
      '<button class="icon-btn" type="button" data-action="back-to-editor" data-id="' + esc(order.id) + '" title="返回订单编辑" aria-label="返回订单编辑">' + icon('arrow-left', 17) + '</button>' +
      '<div class="preview-info-text"><div class="preview-no">单证预览 ' +
      '<span class="badge badge--brand"><span data-preview-count>' + selected.length + '</span> 类已选</span>' +
      (hasEngine ? '' : '<span class="badge badge--danger">单证引擎未就绪</span>') + '</div>' +
      '<div class="preview-buyer">' + esc(order.no || '未命名订单') + ' · ' + esc(buyerName(order) || '未填写买方') + ' · ' + esc(money(orderTotal(order), order.currency)) + '</div></div>' +
      '</div>' +
      '<div class="preview-controls">' +
      '<label class="switch"><input type="checkbox" data-preview-toggle="bilingual"' + (order.print && order.print.bilingual ? ' checked' : '') + '><span>中英对照</span></label>' +
      '<label class="switch"><input type="checkbox" data-preview-toggle="showSeal"' + (!order.print || order.print.showSeal !== false ? ' checked' : '') + '><span>显示印章</span></label>' +
      '<span class="toolbar-divider"></span>' +
      '<button class="btn btn--sm" type="button" data-action="preview-select-all">全选</button>' +
      '<button class="btn btn--sm" type="button" data-action="preview-clear">清空</button>' +
      '<button class="btn btn--primary" type="button" data-testid="print-docs" data-action="print-docs">' + icon('printer', 15) + '打印 / PDF</button>' +
      '</div></div>' +
      '<div class="preview-toolbar-bottom"><div class="doc-tabs" role="tablist" aria-label="单证类型">' + chips + '</div></div>' +
      '</div>';
  }

  function previewEmptyHTML() {
    return '<div class="card">' + emptyState({
      icon: 'layers',
      title: '还没有选择单证类型',
      message: '在上方工具栏点击单证类型即可添加到预览；已选单证会按标准顺序排列，打印时每种单证自动独占 A4 页面。',
      actions: '<button class="btn btn--primary" type="button" data-action="preview-select-all">' + icon('check', 16) + '全选 12 类单证</button>' +
        '<button class="btn" type="button" data-action="back-to-editor">返回编辑订单</button>'
    }) + '</div>';
  }

  function previewFallbackHTML(order, selected) {
    var items = getDocList().filter(function (doc) { return selected.indexOf(doc.key) >= 0; });
    var snapshot = '<div class="summary-rows" style="margin-top:4px">' +
      summaryRow('订单号', order.no || '—') +
      summaryRow('买方', buyerName(order) || '未填写') +
      summaryRow('订单金额', money(orderTotal(order), order.currency)) +
      summaryRow('货物', (order.items || []).length + ' 项') +
      '</div>';
    return '<div class="preview-fallback" data-testid="preview-fallback">' +
      '<span class="preview-fallback-icon">' + icon('alert', 22) + '</span>' +
      '<h3>单证引擎尚未就绪</h3>' +
      '<p>应用与订单数据已正常加载，但单证渲染模块（<span class="mono">js/doc-templates.js</span>）当前不可用。' +
      '这是开发过程中的临时状态：单证引擎加载完成后刷新页面，即可正常预览与打印。<br>订单数据已保存在本机，不会因为此提示丢失。</p>' +
      '<div class="preview-fallback-list">' + items.map(function (doc) {
        return '<span class="pill">' + esc(doc.nameCn) + ' · ' + esc(doc.prefix || '') + '</span>';
      }).join('') + '</div>' +
      snapshot +
      '<div class="preview-fallback-actions">' +
      '<button class="btn btn--primary" type="button" data-action="reload-page">' + icon('refresh', 15) + '重新加载页面</button>' +
      '<button class="btn" type="button" data-action="back-to-editor" data-id="' + esc(order.id) + '">' + icon('arrow-left', 15) + '返回编辑订单</button>' +
      '</div></div>';
  }

  function docErrorHTML(key, error) {
    var doc = getDocEntry(key);
    return '<div class="doc-error" data-doc-error="' + esc(key) + '">' +
      '<h3>' + icon('alert-circle', 15) + esc(doc.nameCn) + '（' + esc(key) + '）渲染失败</h3>' +
      '<p class="muted" style="font-size:12px">该单证模板抛出错误，其余单证不受影响。请将以下信息反馈给开发人员；订单数据未受影响。</p>' +
      '<pre>' + esc(error && error.message ? error.message : String(error || '未知错误')) + '</pre>' +
      '</div>';
  }

  function buildSheets(order, selected) {
    if (!selected.length) return previewEmptyHTML();
    if (!hasDocsEngine()) return previewFallbackHTML(order, selected);
    var out = '';
    selected.forEach(function (key) {
      var meta;
      try {
        meta = store.ensureDocMeta(order, key);
      } catch (err) {
        console.error('[TradeDocs] 单证编号生成失败：' + key, err);
        meta = { no: '', date: order.date || core.todayISO() };
      }
      try {
        var rendered = TD.docs.render(key, {
          state: store.getState(),
          order: order,
          meta: { no: String(meta.no || ''), date: String(meta.date || order.date || '') },
          opts: {
            bilingual: !!(order.print && order.print.bilingual),
            showSeal: !order.print || order.print.showSeal !== false,
            showSignature: true
          },
          core: core
        });
        if (typeof rendered !== 'string' || !rendered.trim()) throw new Error('单证渲染返回空内容');
        out += '<div class="preview-sheet" data-preview-doc="' + esc(key) + '">' + rendered + '</div>';
      } catch (err) {
        console.error('[TradeDocs] 单证渲染失败：' + key, err);
        out += docErrorHTML(key, err);
      }
    });
    return out;
  }

  function mountPreviewPage() {
    var toolbar = $('.preview-toolbar');
    if (toolbar) {
      toolbar.addEventListener('change', function (e) {
        var el = e.target;
        if (!el || !el.getAttribute) return;
        var toggle = el.getAttribute('data-preview-toggle');
        if (!toggle) return;
        updatePreviewToggle(toggle, !!el.checked);
      });
    }
  }

  function updatePreviewToggle(toggle, value) {
    if (!previewState) return;
    var order = store.getOrder(previewState.orderId);
    if (!order) return;
    order.print = order.print || {};
    order.print.selected = previewState.selected.slice();
    order.print[toggle] = value;
    store.saveOrder(order);
    refreshPreviewSheets();
  }

  function persistPreviewPrint() {
    if (!previewState) return;
    var order = store.getOrder(previewState.orderId);
    if (!order) return;
    order.print = order.print || {};
    order.print.selected = previewState.selected.slice();
    store.saveOrder(order);
  }

  function refreshPreviewSheets() {
    if (!previewState) return;
    var order = store.getOrder(previewState.orderId);
    var container = $('#preview-sheets');
    if (!order || !container) return;
    container.innerHTML = buildSheets(order, previewState.selected);
    syncPreviewChips();
  }

  function syncPreviewChips() {
    if (!previewState) return;
    $$('.doc-tab[data-doc-tab]').forEach(function (el) {
      var on = previewState.selected.indexOf(el.getAttribute('data-doc-tab')) >= 0;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('[data-preview-count]').forEach(function (el) {
      el.textContent = previewState.selected.length;
    });
  }

  function previewAddDoc(key) {
    if (!previewState || !key) return;
    if (previewState.selected.indexOf(key) < 0) {
      previewState.selected = sanitizeSelected(previewState.selected.concat([key]));
      persistPreviewPrint();
      refreshPreviewSheets();
    }
    scrollToPreviewDoc(key);
  }

  function previewRemoveDoc(key) {
    if (!previewState || !key) return;
    var next = previewState.selected.filter(function (k) { return k !== key; });
    if (next.length === previewState.selected.length) return;
    previewState.selected = next;
    persistPreviewPrint();
    refreshPreviewSheets();
  }

  function previewSelectAll() {
    if (!previewState) return;
    previewState.selected = docKeys();
    persistPreviewPrint();
    refreshPreviewSheets();
    toast('已选择全部 ' + previewState.selected.length + ' 类单证', 'info');
  }

  function previewClear() {
    if (!previewState) return;
    previewState.selected = [];
    persistPreviewPrint();
    refreshPreviewSheets();
  }

  function scrollToPreviewDoc(key) {
    if (!key) return;
    setTimeout(function () {
      var target = $('[data-preview-doc="' + key + '"]');
      if (!target || !target.getBoundingClientRect) return;
      var toolbar = $('.preview-toolbar');
      var offset = (toolbar ? toolbar.getBoundingClientRect().height : 0) + 96;
      var top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 80);
  }

  function doPrint() {
    if (!previewState) return;
    if (!previewState.selected.length) {
      toast('请先在工具栏选择要打印的单证', 'warn');
      return;
    }
    if (!hasDocsEngine()) {
      toast('单证引擎尚未加载，暂时无法打印；订单数据已保存', 'error');
      return;
    }
    refreshPreviewSheets();
    setTimeout(function () {
      try {
        window.print();
      } catch (err) {
        toast('无法调用浏览器打印：' + (err && err.message ? err.message : '未知错误'), 'error');
      }
    }, 120);
  }

  /* ================================================================
   *  Customer library
   * ================================================================ */

  var customersQuery = '';

  function customersPage() {
    var customers = (store.getState().customers || []).slice().sort(function (a, b) {
      return String(a.nameEn || a.nameCn || '').localeCompare(String(b.nameEn || b.nameCn || ''));
    });
    var rows = customers.map(function (customer) {
      var search = [customer.code, customer.nameEn, customer.nameCn, customer.country, customer.contact, customer.tel, customer.email].join(' ').toLowerCase();
      return '<tr data-customer-id="' + esc(customer.id) + '" data-search="' + esc(search) + '">' +
        '<td><span class="mono">' + esc(customer.code || '—') + '</span></td>' +
        '<td><span class="cell-primary">' + esc(customer.nameEn || customer.nameCn || '未命名客户') + '</span>' +
        (customer.nameCn && customer.nameEn ? '<div class="cell-sub">' + esc(customer.nameCn) + '</div>' : '') + '</td>' +
        '<td>' + esc(customer.country || '—') + '</td>' +
        '<td>' + esc(customer.contact || '—') + '</td>' +
        '<td><div>' + esc(customer.email || '—') + '</div><div class="cell-sub">' + esc(customer.tel || '') + '</div></td>' +
        '<td class="actions"><span class="row-actions">' +
        '<button class="btn btn--sm" type="button" data-action="edit-customer" data-id="' + esc(customer.id) + '">编辑</button>' +
        '<button class="icon-btn icon-btn--sm icon-btn--plain icon-btn--danger" type="button" data-action="delete-customer" data-id="' + esc(customer.id) + '" title="删除客户" aria-label="删除客户 ' + esc(customer.nameEn || customer.nameCn) + '">' + icon('trash', 15) + '</button>' +
        '</span></td></tr>';
    }).join('');

    var body = customers.length
      ? '<div class="card"><div class="toolbar"><div class="toolbar-search">' + icon('search', 16) +
        '<label class="sr-only" for="customers-search">搜索客户</label>' +
        '<input class="input" id="customers-search" type="search" placeholder="搜索客户名称 / 编号 / 国家 / 联系人" value="' + esc(customersQuery) + '" autocomplete="off">' +
        '</div><span class="toolbar-meta">共 <b class="list-count" id="customers-count">' + customers.length + '</b> 家客户</span></div>' +
        '<div class="table-wrap table-wrap-rounded"><table class="data"><thead><tr>' +
        '<th>客户编号</th><th>公司名称</th><th>国家 / 地区</th><th>联系人</th><th>联系方式</th><th class="actions">操作</th>' +
        '</tr></thead><tbody id="customers-tbody">' + rows + '</tbody></table>' +
        '<div class="table-empty" id="customers-filter-empty" hidden>没有匹配的客户。</div></div></div>'
      : '<div class="card">' + emptyState({
        icon: 'users',
        title: '客户库还是空的',
        message: '把常用买方存入客户库，新建订单时一键带入买方信息快照，之后修改互不影响。',
        actions: '<button class="btn btn--primary" type="button" data-action="new-customer">' + icon('plus', 16) + '新建客户</button>'
      }) + '</div>';

    return {
      html: '<div class="page-head"><div class="page-head-main">' +
        '<div class="page-eyebrow">' + icon('users', 13) + '资料库 · 买方档案</div>' +
        '<h2 class="page-title">客户管理</h2>' +
        '<p class="page-sub">共 ' + customers.length + ' 家客户 · 订单保存的是买方快照，删除客户不会影响历史订单</p></div>' +
        '<div class="page-actions"><button class="btn btn--primary" type="button" data-action="new-customer">' + icon('plus', 16) + '新建客户</button></div></div>' + body,
      title: '客户管理',
      crumbs: '工作台 / 客户管理',
      nav: 'customers',
      mount: function () {
        var search = $('#customers-search');
        if (search) {
          search.addEventListener('input', function () {
            customersQuery = String(this.value || '').trim().toLowerCase();
            filterLibraryRows('#customers-tbody', '#customers-filter-empty', '#customers-count', customersQuery);
          });
        }
        filterLibraryRows('#customers-tbody', '#customers-filter-empty', '#customers-count', customersQuery);
      }
    };
  }

  function filterLibraryRows(tbodySel, emptySel, countSel, query) {
    var tbody = $(tbodySel);
    if (!tbody) return;
    var rows = $$('tr[data-search]', tbody);
    var visible = 0;
    rows.forEach(function (row) {
      var show = !query || String(row.getAttribute('data-search') || '').indexOf(query) >= 0;
      row.hidden = !show;
      if (show) visible += 1;
    });
    var empty = $(emptySel);
    if (empty) empty.hidden = visible > 0;
    var count = $(countSel);
    if (count) count.textContent = visible;
  }

  function openCustomerModal(customerId) {
    var customer = customerId ? store.getCustomer(customerId) : null;
    var isEdit = !!customer;
    var draft = customer || {
      id: '', code: '', nameEn: '', nameCn: '', addressEn: '', addressCn: '',
      country: '', contact: '', tel: '', email: '', taxId: ''
    };
    var body = '<form id="customer-form" autocomplete="off"><div class="form-grid">' +
      field({ label: '客户编号', name: 'code', value: draft.code, path: false, placeholder: 'C-USA-001' }) +
      field({ label: '国家 / 地区', name: 'country', value: draft.country, path: false, placeholder: 'UNITED STATES' }) +
      field({ label: '公司名称（英文）', name: 'nameEn', value: draft.nameEn, path: false, span: 'full', required: true, placeholder: 'ATLANTIC HOME GOODS LLC' }) +
      field({ label: '公司名称（中文）', name: 'nameCn', value: draft.nameCn, path: false, span: 'full', placeholder: '选填' }) +
      field({ label: '地址（英文）', name: 'addressEn', type: 'textarea', value: draft.addressEn, path: false, span: 'full', className: 'textarea--sm', rows: 3 }) +
      field({ label: '地址（中文）', name: 'addressCn', type: 'textarea', value: draft.addressCn, path: false, span: 'full', className: 'textarea--sm', rows: 2 }) +
      field({ label: '联系人', name: 'contact', value: draft.contact, path: false }) +
      field({ label: '电话', name: 'tel', value: draft.tel, path: false }) +
      field({ label: '邮箱', name: 'email', type: 'email', value: draft.email, path: false }) +
      field({ label: '税号 / VAT', name: 'taxId', value: draft.taxId, path: false }) +
      '</div></form>';
    openModal({
      title: isEdit ? '编辑客户' : '新建客户',
      subtitle: '客户信息用于新建订单时快速填入买方快照',
      size: 'lg',
      body: body,
      footer: '<button class="btn" type="button" data-action="close-modal">取消</button>' +
        '<button class="btn btn--primary" type="button" data-action="save-customer" data-id="' + esc(draft.id) + '">' + icon('check', 16) + '保存客户</button>'
    });
  }

  function saveCustomerFromModal(el) {
    var form = $('#customer-form');
    if (!form) return;
    var data = { id: (el && el.getAttribute('data-id')) || '' };
    $$('[name]', form).forEach(function (input) { data[input.name] = input.value; });
    if (!String(data.nameEn || data.nameCn || '').trim()) {
      toast('请填写客户名称（英文或中文）', 'warn');
      var target = $('[name="nameEn"]', form);
      if (target) target.focus();
      return;
    }
    var saved = store.saveCustomer(data);
    if (!saved) {
      toast('客户保存失败', 'error');
      return;
    }
    closeModal();
    toast('客户已保存：' + (saved.nameCn || saved.nameEn), 'success');
    refreshPage();
  }

  async function deleteCustomerAction(id) {
    var customer = store.getCustomer(id);
    if (!customer) return;
    var ok = await confirmDialog({
      title: '删除客户',
      message: '确定删除客户「' + (customer.nameCn || customer.nameEn) + '」吗？历史订单中的买方快照不会受影响。',
      warning: '删除后无法恢复，建议先导出 JSON 备份。',
      confirmText: '删除客户',
      danger: true
    });
    if (!ok) return;
    store.deleteCustomer(id);
    toast('客户已删除', 'success');
    refreshPage();
  }

  /* ================================================================
   *  Product library
   * ================================================================ */

  var productsQuery = '';

  function productsPage() {
    var products = (store.getState().products || []).slice().sort(function (a, b) {
      return String(a.code || a.nameEn || '').localeCompare(String(b.code || b.nameEn || ''));
    });
    var rows = products.map(function (product) {
      var search = [product.code, product.nameEn, product.nameCn, product.hsCode, product.unit, product.pkg].join(' ').toLowerCase();
      return '<tr data-product-id="' + esc(product.id) + '" data-search="' + esc(search) + '">' +
        '<td><span class="mono">' + esc(product.code || '—') + '</span></td>' +
        '<td><span class="cell-primary">' + esc(product.nameCn || product.nameEn || '未命名产品') + '</span>' +
        '<div class="cell-sub">' + esc(product.nameEn || '') + '</div></td>' +
        '<td><span class="mono">' + esc(product.hsCode || '—') + '</span></td>' +
        '<td class="num">' + esc(money(product.price, product.currency)) + '</td>' +
        '<td>' + esc(product.pkg || 'CARTON') + ' / ' + esc(product.unit || 'PCS') + '</td>' +
        '<td class="num">' + esc(qtyText(product.qtyPerCarton)) + '</td>' +
        '<td class="num">' + esc(numText(product.grossWeight, 2)) + ' kg</td>' +
        '<td class="num">' + esc(numText(product.cbm, 3)) + ' m³</td>' +
        '<td class="actions"><span class="row-actions">' +
        '<button class="btn btn--sm" type="button" data-action="edit-product" data-id="' + esc(product.id) + '">编辑</button>' +
        '<button class="icon-btn icon-btn--sm icon-btn--plain icon-btn--danger" type="button" data-action="delete-product" data-id="' + esc(product.id) + '" title="删除产品" aria-label="删除产品 ' + esc(product.nameEn || product.nameCn) + '">' + icon('trash', 15) + '</button>' +
        '</span></td></tr>';
    }).join('');

    var body = products.length
      ? '<div class="card"><div class="toolbar"><div class="toolbar-search">' + icon('search', 16) +
        '<label class="sr-only" for="products-search">搜索产品</label>' +
        '<input class="input" id="products-search" type="search" placeholder="搜索产品名称 / 编码 / HS 编码" value="' + esc(productsQuery) + '" autocomplete="off">' +
        '</div><span class="toolbar-meta">共 <b class="list-count" id="products-count">' + products.length + '</b> 个产品</span></div>' +
        '<div class="table-wrap table-wrap-rounded"><table class="data"><thead><tr>' +
        '<th>产品编号</th><th>产品名称</th><th>HS 编码</th><th class="num">单价</th><th>包装 / 单位</th><th class="num">每箱数量</th><th class="num">每箱毛重</th><th class="num">每箱体积</th><th class="actions">操作</th>' +
        '</tr></thead><tbody id="products-tbody">' + rows + '</tbody></table>' +
        '<div class="table-empty" id="products-filter-empty" hidden>没有匹配的产品。</div></div></div>'
      : '<div class="card">' + emptyState({
        icon: 'package',
        title: '产品库还是空的',
        message: '维护产品名称、HS 编码、包装与每箱重量 / 体积，新建订单时一键添加货物明细。',
        actions: '<button class="btn btn--primary" type="button" data-action="new-product">' + icon('plus', 16) + '新建产品</button>'
      }) + '</div>';

    return {
      html: '<div class="page-head"><div class="page-head-main">' +
        '<div class="page-eyebrow">' + icon('package', 13) + '资料库 · 商品档案</div>' +
        '<h2 class="page-title">产品库</h2>' +
        '<p class="page-sub">共 ' + products.length + ' 个产品 · 重量 / 体积按每箱计 · 删除产品不影响历史订单</p></div>' +
        '<div class="page-actions"><button class="btn btn--primary" type="button" data-action="new-product">' + icon('plus', 16) + '新建产品</button></div></div>' + body,
      title: '产品库',
      crumbs: '工作台 / 产品库',
      nav: 'products',
      mount: function () {
        var search = $('#products-search');
        if (search) {
          search.addEventListener('input', function () {
            productsQuery = String(this.value || '').trim().toLowerCase();
            filterLibraryRows('#products-tbody', '#products-filter-empty', '#products-count', productsQuery);
          });
        }
        filterLibraryRows('#products-tbody', '#products-filter-empty', '#products-count', productsQuery);
      }
    };
  }

  function openProductModal(productId) {
    var product = productId ? store.getProduct(productId) : null;
    var isEdit = !!product;
    var draft = product || {
      id: '', code: '', nameEn: '', nameCn: '', hsCode: '', unit: 'PCS', price: 0, currency: 'USD',
      pkg: 'CARTON', qtyPerCarton: 0, netWeight: 0, grossWeight: 0, cbm: 0, origin: 'CHINA', specEn: '', remarks: ''
    };
    var unitOptions = ['PCS', 'SET', 'PAIR', 'CTN', 'BOX', 'KG', 'M', 'ROLL', 'DOZ', 'TON'].map(function (unit) {
      return { value: unit, label: unit };
    });
    var body = '<form id="product-form" autocomplete="off"><div class="form-grid form-grid-3">' +
      field({ label: '产品编号', name: 'code', value: draft.code, path: false, placeholder: 'MUG-12OZ' }) +
      field({ label: '单位', name: 'unit', type: 'select', value: draft.unit, path: false, options: unitOptions }) +
      field({ label: '币种', name: 'currency', type: 'select', value: draft.currency, path: false, options: currencyOptions() }) +
      field({ label: '品名（英文）', name: 'nameEn', value: draft.nameEn, path: false, span: 'full', required: true, placeholder: 'Ceramic Mug 12 oz' }) +
      field({ label: '品名（中文）', name: 'nameCn', value: draft.nameCn, path: false, span: 'full', placeholder: '陶瓷马克杯 12 盎司' }) +
      field({ label: 'HS 编码', name: 'hsCode', value: draft.hsCode, path: false, placeholder: '6912.00.00' }) +
      field({ label: '单价', name: 'price', type: 'number', value: draft.price, path: false }) +
      field({ label: '原产地', name: 'origin', value: draft.origin, path: false, placeholder: 'CHINA' }) +
      '<div class="field-full" style="margin:2px 0 0"><div class="alert alert--info">' + icon('info', 15) +
      '<span>以下包装 / 重量 / 体积字段均指 <b>每箱</b>：产品加入订单后会自动按箱数汇总净重、毛重与体积。</span></div></div>' +
      field({ label: '包装方式', name: 'pkg', value: draft.pkg, path: false, placeholder: 'CARTON' }) +
      field({ label: '每箱数量', name: 'qtyPerCarton', type: 'number', step: '1', value: draft.qtyPerCarton, path: false }) +
      field({ label: '每箱净重（kg）', name: 'netWeight', type: 'number', step: '0.001', value: draft.netWeight, path: false }) +
      field({ label: '每箱毛重（kg）', name: 'grossWeight', type: 'number', step: '0.001', value: draft.grossWeight, path: false }) +
      field({ label: '每箱体积（m³）', name: 'cbm', type: 'number', step: '0.001', value: draft.cbm, path: false }) +
      field({ label: '规格说明（英文）', name: 'specEn', value: draft.specEn, path: false, span: 'full', placeholder: 'Glazed ceramic, white, 12 oz / 350 ml' }) +
      field({ label: '备注', name: 'remarks', type: 'textarea', value: draft.remarks, path: false, span: 'full', className: 'textarea--sm', rows: 2 }) +
      '</div></form>';
    openModal({
      title: isEdit ? '编辑产品' : '新建产品',
      subtitle: '产品重量与体积均按每箱填写，加入订单后自动汇总',
      size: 'lg',
      body: body,
      footer: '<button class="btn" type="button" data-action="close-modal">取消</button>' +
        '<button class="btn btn--primary" type="button" data-action="save-product" data-id="' + esc(draft.id) + '">' + icon('check', 16) + '保存产品</button>'
    });
  }

  function saveProductFromModal(el) {
    var form = $('#product-form');
    if (!form) return;
    var data = { id: (el && el.getAttribute('data-id')) || '' };
    $$('[name]', form).forEach(function (input) {
      var name = input.name;
      var numeric = ['price', 'qtyPerCarton', 'netWeight', 'grossWeight', 'cbm'].indexOf(name) >= 0;
      data[name] = numeric ? core.num(input.value, 0) : input.value;
    });
    if (!String(data.nameEn || data.nameCn || '').trim()) {
      toast('请填写产品名称（英文或中文）', 'warn');
      var target = $('[name="nameEn"]', form);
      if (target) target.focus();
      return;
    }
    var saved = store.saveProduct(data);
    if (!saved) {
      toast('产品保存失败', 'error');
      return;
    }
    closeModal();
    toast('产品已保存：' + (saved.nameCn || saved.nameEn), 'success');
    refreshPage();
  }

  async function deleteProductAction(id) {
    var product = store.getProduct(id);
    if (!product) return;
    var ok = await confirmDialog({
      title: '删除产品',
      message: '确定删除产品「' + (product.nameCn || product.nameEn) + '」吗？历史订单中的货物明细不会受影响。',
      warning: '删除后无法恢复，建议先导出 JSON 备份。',
      confirmText: '删除产品',
      danger: true
    });
    if (!ok) return;
    store.deleteProduct(id);
    toast('产品已删除', 'success');
    refreshPage();
  }

  /* ================================================================
   *  Settings
   * ================================================================ */

  var activeSettings = null;

  function assetFieldHTML(key, label, hint, dataUrl) {
    return '<div class="asset-field">' +
      '<div class="asset-preview' + (key === 'seal' ? ' asset-preview--seal' : '') + '" id="asset-preview-' + key + '">' +
      (dataUrl ? '<img src="' + esc(dataUrl) + '" alt="' + esc(label) + '">' : '<span class="muted" style="font-size:11px">未设置</span>') +
      '</div>' +
      '<div class="asset-meta"><strong>' + esc(label) + '</strong><span>' + esc(hint) + '</span>' +
      '<div class="asset-actions">' +
      '<button class="btn btn--sm" type="button" data-action="upload-' + key + '">' + icon('upload', 14) + '上传图片</button>' +
      '<button class="btn btn--sm btn--danger" type="button" data-action="remove-' + key + '"' + (dataUrl ? '' : ' hidden') + '>' + icon('trash', 14) + '移除</button>' +
      '</div></div>' +
      '<input type="file" id="' + key + '-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>' +
      '</div>';
  }

  function settingsPage() {
    var settings = store.getState().settings;
    activeSettings = { draft: core.clone(settings), dirty: false, timer: null };
    var s = activeSettings.draft;
    var company = s.company || {};
    var bank = s.bank || {};
    var defaults = s.defaults || {};
    var numbering = s.numbering || {};
    var docList = getDocList();

    var companyCard = sectionCard({
      icon: 'bank',
      title: '公司资料',
      sub: '用于所有单证的抬头、签章与联系方式',
      body: assetFieldHTML('logo', '公司 Logo', '显示在单证抬头。PNG / JPG / SVG，文件不超过 300KB，仅保存在本机。', company.logo) +
        assetFieldHTML('seal', '公司印章', '中英文章图，勾选「显示印章」时盖在单证签章处。建议透明背景 PNG。', company.seal) +
        '<div class="form-grid" style="margin-top:18px">' +
        field({ label: '公司名称（英文）', name: 'company.nameEn', value: company.nameEn, span: 'full', placeholder: 'NINGBO SUNRISE IMP. & EXP. CO., LTD.' }) +
        field({ label: '公司名称（中文）', name: 'company.nameCn', value: company.nameCn, span: 'full', placeholder: '宁波晨阳进出口有限公司' }) +
        field({ label: '英文地址', name: 'company.addressEn', type: 'textarea', value: company.addressEn, span: 'full', className: 'textarea--sm', rows: 2 }) +
        field({ label: '中文地址', name: 'company.addressCn', type: 'textarea', value: company.addressCn, span: 'full', className: 'textarea--sm', rows: 2 }) +
        field({ label: '城市', name: 'company.city', value: company.city }) +
        field({ label: '国家', name: 'company.country', value: company.country }) +
        field({ label: '电话', name: 'company.tel', value: company.tel, type: 'tel' }) +
        field({ label: '传真', name: 'company.fax', value: company.fax }) +
        field({ label: '邮箱', name: 'company.email', value: company.email, type: 'email' }) +
        field({ label: '网站', name: 'company.website', value: company.website }) +
        field({ label: '税号 / 统一社会信用代码', name: 'company.taxId', value: company.taxId, span: 'full' }) +
        field({ label: '签字人', name: 'company.signer', value: company.signer }) +
        field({ label: '签字人职务', name: 'company.signerTitle', value: company.signerTitle }) +
        '</div>'
    });

    var bankCard = sectionCard({
      icon: 'credit-card',
      title: '银行信息',
      sub: '显示在发票、形式发票与汇票等单证',
      body: '<div class="form-grid">' +
        field({ label: '受益人（英文）', name: 'bank.beneficiaryEn', value: bank.beneficiaryEn, span: 'full' }) +
        field({ label: '开户行（英文）', name: 'bank.bankNameEn', value: bank.bankNameEn, span: 'full' }) +
        field({ label: '开户行地址（英文）', name: 'bank.bankAddressEn', value: bank.bankAddressEn, type: 'textarea', span: 'full', className: 'textarea--sm', rows: 2 }) +
        field({ label: '账号', name: 'bank.accountNo', value: bank.accountNo }) +
        field({ label: 'SWIFT Code', name: 'bank.swift', value: bank.swift }) +
        field({ label: 'IBAN', name: 'bank.iban', value: bank.iban }) +
        field({ label: '银行代码', name: 'bank.bankCode', value: bank.bankCode }) +
        field({ label: '中间行', name: 'bank.intermediary', value: bank.intermediary, span: 'full' }) +
        '</div>'
    });

    var defaultsCard = sectionCard({
      icon: 'settings',
      title: '默认条款',
      sub: '新建订单时自动带入，可在订单中单独修改',
      body: '<div class="form-grid form-grid-3">' +
        field({ label: '默认币种', name: 'defaults.currency', type: 'select', value: defaults.currency, options: currencyOptions() }) +
        field({ label: '默认贸易术语', name: 'defaults.incoterm', type: 'select', value: defaults.incoterm, options: incotermOptions() }) +
        field({ label: '原产国', name: 'defaults.countryOfOrigin', value: defaults.countryOfOrigin }) +
        field({ label: '默认起运港', name: 'defaults.portOfLoading', value: defaults.portOfLoading }) +
        field({ label: '默认目的港', name: 'defaults.portOfDischarge', value: defaults.portOfDischarge }) +
        field({ label: '默认付款方式', name: 'defaults.paymentTerms', value: defaults.paymentTerms }) +
        field({ label: '发票声明（英文）', name: 'defaults.declaration', type: 'textarea', value: defaults.declaration, span: 'full', className: 'textarea--sm', rows: 2 }) +
        field({ label: '受益人证明声明（英文）', name: 'defaults.certStatement', type: 'textarea', value: defaults.certStatement, span: 'full', className: 'textarea--sm', rows: 3 }) +
        '<div class="field-full"><div class="row" style="gap:22px">' +
        switchField({ name: 'defaults.bilingual', path: 'defaults.bilingual', label: '单证默认中英对照', checked: !!defaults.bilingual }) +
        switchField({ name: 'defaults.showSeal', path: 'defaults.showSeal', label: '单证默认显示印章', checked: defaults.showSeal !== false }) +
        '</div></div></div>'
    });

    var numberingCard = sectionCard({
      icon: 'layers',
      title: '单证编号规则',
      sub: '编号只在预览 / 打印 / 生成时消耗，可用于连续编号',
      body: '<div class="form-grid form-grid-2"><div class="numbering-padding">' +
      field({ label: '序号位数', name: 'numbering.padding', type: 'number', step: '1', min: 1, value: numbering.padding, hint: '例如 4 位 → CI-2026-0001' }) +
      '</div><div style="display:flex;align-items:flex-end"><div class="alert alert--info" style="width:100%">' + icon('info', 15) +
      '<span>格式：前缀-年份-序号。修改下方下一个序号可控制已用编号的起点。</span></div></div></div>' +
      '<div class="numbering-grid" style="margin-top:14px">' + docList.map(function (doc) {
        return field({
          label: doc.nameCn + ' · ' + doc.prefix,
          name: 'numbering.next.' + doc.key,
          type: 'number',
          step: '1',
          min: 1,
          value: (numbering.next && numbering.next[doc.key]) || 1
        });
      }).join('') + '</div>'
    });

    var backupCard = sectionCard({
      icon: 'download',
      title: '数据备份与迁移',
      sub: 'JSON 备份包含订单、客户、产品与全部设置',
      body: '<div class="backup-actions">' +
        '<button class="btn" type="button" data-testid="export-backup" data-action="export-backup">' + icon('download', 15) + '导出 JSON 备份</button>' +
        '<button class="btn" type="button" data-testid="import-backup" data-action="import-backup">' + icon('upload', 15) + '导入 JSON 备份</button>' +
        '<button class="btn" type="button" data-action="reset-demo">' + icon('refresh', 15) + '恢复演示数据</button>' +
        '<button class="btn btn--danger" type="button" data-action="clear-all">' + icon('trash', 15) + '清空所有数据</button>' +
        '</div><input type="file" id="import-file" accept="application/json,.json" hidden>' +
        '<div class="alert alert--warn backup-note">' + icon('alert', 15) +
        '<span>数据仅保存在本机浏览器。清理浏览器缓存、更换浏览器或使用隐私模式都可能导致数据丢失，请定期导出备份。</span></div>'
    });

    var html = '<div class="page-head"><div class="page-head-main">' +
      '<div class="page-eyebrow">' + icon('settings', 13) + '系统设置</div>' +
      '<h2 class="page-title">设置</h2>' +
      '<p class="page-sub">公司抬头、银行、默认条款与编号规则 · 修改会自动保存</p></div>' +
      '<div class="page-actions">' +
      '<a class="btn btn--ghost" href="#/help">' + icon('help', 15) + '使用说明</a>' +
      '<button class="btn btn--primary" type="button" data-action="save-settings">' + icon('check', 16) + '保存设置</button>' +
      '</div></div>' +
      '<div class="settings-layout">' + companyCard + bankCard + defaultsCard + numberingCard + backupCard + '</div>';

    return {
      html: html,
      title: '设置',
      crumbs: '工作台 / 设置',
      nav: 'settings',
      mount: mountSettingsPage
    };
  }

  function mountSettingsPage() {
    if (!activeSettings) return;
    var viewInner = $('#view-inner');
    if (!viewInner) return;
    bindPaths(viewInner, activeSettings.draft, function () { scheduleSettingsSave(); });
    var logoFile = $('#logo-file');
    if (logoFile) logoFile.addEventListener('change', function () { handleAssetFile(this.files && this.files[0], 'logo'); this.value = ''; });
    var sealFile = $('#seal-file');
    if (sealFile) sealFile.addEventListener('change', function () { handleAssetFile(this.files && this.files[0], 'seal'); this.value = ''; });
    var importFile = $('#import-file');
    if (importFile) importFile.addEventListener('change', function () { handleImportFile(this.files && this.files[0]); this.value = ''; });
  }

  function scheduleSettingsSave() {
    if (!activeSettings) return;
    activeSettings.dirty = true;
    if (activeSettings.timer) clearTimeout(activeSettings.timer);
    activeSettings.timer = setTimeout(function () {
      if (!activeSettings) return;
      activeSettings.timer = null;
      commitSettings();
    }, 500);
  }

  function commitSettings() {
    if (!activeSettings) return false;
    var viewInner = $('#view-inner');
    if (viewInner) syncFormToDraft(viewInner, activeSettings.draft);
    store.saveSettings(activeSettings.draft);
    activeSettings.dirty = false;
    return true;
  }

  function flushSettingsDraft() {
    var settings = activeSettings;
    if (!settings) return;
    activeSettings = null;
    if (settings.timer) {
      clearTimeout(settings.timer);
      settings.timer = null;
    }
    if (settings.dirty) {
      try { store.saveSettings(settings.draft); } catch (err) { console.error('[TradeDocs] 离开设置页时保存失败', err); }
    }
  }

  function saveSettingsExplicit() {
    if (!activeSettings) return;
    commitSettings();
    toast('设置已保存', 'success');
  }

  function updateAssetPreview(key) {
    if (!activeSettings) return;
    var host = $('#asset-preview-' + key);
    var dataUrl = activeSettings.draft.company[key];
    if (host) {
      host.innerHTML = dataUrl
        ? '<img src="' + esc(dataUrl) + '" alt="' + (key === 'logo' ? '公司 Logo' : '公司印章') + '">'
        : '<span class="muted" style="font-size:11px">未设置</span>';
    }
    var removeBtn = document.querySelector('[data-action="remove-' + key + '"]');
    if (removeBtn) removeBtn.hidden = !dataUrl;
  }

  function handleAssetFile(file, key) {
    if (!activeSettings || !file) return;
    if (!/^image\//.test(file.type || '')) {
      toast('请选择图片文件（PNG / JPG / SVG / WebP）', 'error');
      return;
    }
    if (file.size > 300 * 1024) {
      toast('图片不能超过 300KB（当前 ' + Math.ceil(file.size / 1024) + ' KB）', 'error');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      if (!activeSettings) return;
      activeSettings.draft.company[key] = String(reader.result || '');
      updateAssetPreview(key);
      scheduleSettingsSave();
      toast((key === 'logo' ? 'Logo' : '印章') + '已更新，正在自动保存', 'success');
    };
    reader.onerror = function () { toast('图片读取失败，请重试', 'error'); };
    reader.readAsDataURL(file);
  }

  function removeAsset(key) {
    if (!activeSettings) return;
    activeSettings.draft.company[key] = '';
    updateAssetPreview(key);
    scheduleSettingsSave();
    toast((key === 'logo' ? 'Logo' : '印章') + '已移除', 'info');
  }

  function handleImportFile(file) {
    if (!file) return;
    if (activeSettings && activeSettings.timer) {
      clearTimeout(activeSettings.timer);
      activeSettings.timer = null;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var result = store.importJSON(String(reader.result || ''));
      if (!result.ok) {
        toast(result.message, 'error');
        return;
      }
      activeSettings = null;
      toast(result.message, 'success', { title: '导入成功' });
      renderRoute();
    };
    reader.onerror = function () { toast('读取备份文件失败，请重试', 'error'); };
    reader.readAsText(file);
  }

  function exportBackup() {
    if (activeSettings && activeSettings.dirty) commitSettings();
    var text = store.exportJSON();
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'tradedocs-backup-' + core.todayISO() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('JSON 备份已导出', 'success');
    } catch (err) {
      toast('导出失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    }
  }

  function discardPendingEditors() {
    if (activeEditor && activeEditor.timer) clearTimeout(activeEditor.timer);
    activeEditor = null;
    if (activeSettings && activeSettings.timer) clearTimeout(activeSettings.timer);
    activeSettings = null;
  }

  async function resetDemoAction() {
    var ok = await confirmDialog({
      title: '恢复演示数据',
      message: '将使用内置演示数据替换当前全部订单、客户、产品，公司资料与编号规则也会被重置为演示值。',
      warning: '此操作无法撤销，当前数据请先导出 JSON 备份。',
      confirmText: '恢复演示数据',
      danger: true
    });
    if (!ok) return;
    discardPendingEditors();
    store.resetDemo();
    toast('已恢复演示数据', 'success');
    navigate('#/dashboard');
  }

  async function clearAllAction() {
    var ok = await confirmDialog({
      title: '清空所有数据',
      message: '将删除全部订单、客户、产品与公司资料，并重置单证编号，应用回到空白状态。',
      warning: '此操作无法撤销，请务必先导出 JSON 备份。',
      confirmText: '永久清空',
      danger: true
    });
    if (!ok) return;
    discardPendingEditors();
    store.clearAll();
    toast('所有数据已清空', 'success');
    navigate('#/dashboard');
  }

  /* ================================================================
   *  Help page
   * ================================================================ */

  function helpPage() {
    var steps = [
      {
        title: '完善公司资料',
        text: '进入「设置」填写公司中英文抬头、地址、银行信息、签字人，并上传 Logo 与印章（≤300KB）。这些信息会出现在所有单证上。',
        tip: '建议先在设置里确认默认币种、贸易术语与编号规则。'
      },
      {
        title: '新建订单并录入数据',
        text: '点击右上角「新建订单」，从客户库带入买方快照，从产品库添加货物并填写数量、箱数、每箱重量与体积，补充港口、船期与付款条款。',
        tip: '编辑过程会自动保存，也可以随时按 Ctrl / Cmd + S 手动保存。'
      },
      {
        title: '选择单证并打印 PDF',
        text: '勾选需要的单证类型，点击「预览单证」检查 A4 版式，确认无误后在预览页点击「打印 / PDF」，选择另存为 PDF 即可交付或归档。',
        tip: '编号只在预览 / 打印时消耗，重复预览不会跳号。'
      }
    ];
    var stepsHtml = steps.map(function (step, index) {
      return '<div class="card step-card"><span class="step-num">' + (index + 1) + '</span>' +
        '<h3>' + esc(step.title) + '</h3><p>' + esc(step.text) + '</p>' +
        '<div class="step-tip">' + esc(step.tip) + '</div></div>';
    }).join('');

    var printTips = [
      '在预览页点击「打印 / PDF」，或直接按 Ctrl / Cmd + P 调出打印对话框。',
      '目标打印机选择「另存为 PDF」或「Microsoft Print to PDF」。',
      '纸张选择 A4，方向纵向；缩放保持 100% 或「默认」。',
      '边距选择「无」或「默认」，并勾选「背景图形」以保留印章与表格底色（如需要）。',
      '每种单证会自动独占一页，销售合同等长单证会自然分页。'
    ].map(function (tip) {
      return '<li>' + icon('check-circle', 15) + '<span>' + esc(tip) + '</span></li>';
    }).join('');

    var docs = getDocList().map(function (doc) {
      return '<span class="pill" title="' + esc(doc.nameEn) + '">' + esc(doc.nameCn) + '</span>';
    }).join('');

    var faqs = [
      ['数据保存在哪里？会不会上传？', '所有订单、客户、产品与设置都保存在当前浏览器的 localStorage（键名 tradedocs.v1），不会发起任何网络请求，也不会上传服务器。'],
      ['换电脑或换浏览器怎么办？', '在「设置 → 数据备份与迁移」中导出 JSON 备份，在新设备的同一页面导入即可。注意清理浏览器缓存或使用隐私模式可能导致数据丢失。'],
      ['单证编号如何管理和避免跳号？', '编号只在真正预览、打印或生成单证时消耗一次；同一订单重复预览会复用已生成编号。可在设置中调整每个单证类型的下一个序号与位数。'],
      ['智能填单能识别哪些内容？准确吗？', '支持粘贴文字，或上传 TXT / Markdown / CSV / TSV / JSON / Word (.docx) / Excel (.xlsx)，在浏览器本地识别买方、单证号、日期、贸易术语、付款、港口、船期、信用证、唛头、费用与货物明细。识别基于规则与源文件排版，标签清晰、表头规范的资料准确率更高，结果必须逐项核对后再应用。'],
      ['为什么预览页提示「单证引擎尚未就绪」？', '这是开发或部署过程中缺少单证模板文件的临时状态，应用与数据仍正常。待单证模板加载完成后刷新页面即可恢复；可联系技术同事检查 js/doc-templates.js。'],
      ['修改客户库会影响历史订单吗？', '不会。订单保存的是买方信息快照，客户库用于下次新建订单时快速填入；删除客户或产品同样不影响历史订单内容。'],
      ['生成的单证可以直接用于官方申报吗？', '本工具生成的商业发票、装箱单、合同等常规贸易单证可直接用于业务往来；原产地证、报关资料等涉及官方机构的文件请以官方签发版本与最新法规要求为准。']
    ].map(function (faq, index) {
      return '<details class="faq"' + (index === 0 ? ' open' : '') + '><summary>' + esc(faq[0]) + '</summary>' +
        '<div class="faq-body">' + esc(faq[1]) + '</div></details>';
    }).join('');

    var smartFillTips = [
      ['支持粘贴文字与本地文件', 'TXT / Markdown / CSV / TSV / JSON / Word (.docx) / Excel (.xlsx)，单文件不超过 10MB，最多 5 个文件。'],
      ['本地解析，文件不会上传', '识别完全在浏览器内完成，不调用任何接口、不发起网络请求；取消或关闭弹窗不会改动订单数据。'],
      ['先核对再应用', '识别结果只是候选：逐项勾选、修改后，再点「应用到当前订单」或「另存为新订单并应用」，不会自动写入。'],
      ['准确率取决于源文件排版', '标签清晰、表头规范的发票 / 合同识别率更高；图片、扫描 PDF、旧版 .doc/.xls 不支持，请转成文本或粘贴文字。']
    ].map(function (row) {
      return '<li>' + icon('check-circle', 15) + '<span><b>' + esc(row[0]) + '</b>：' + esc(row[1]) + '</span></li>';
    }).join('');

    var html = '<div class="page-head"><div class="page-head-main">' +
      '<div class="page-eyebrow">' + icon('help', 13) + '使用说明</div>' +
      '<h2 class="page-title">三步生成外贸单证</h2>' +
      '<p class="page-sub">免部署 · 零后端 · 本地智能填单 · 数据留在本机浏览器 · 一键打印 PDF</p></div>' +
      '<div class="page-actions"><button class="btn btn--primary" type="button" data-action="new-order">' + icon('plus', 16) + '立即开单</button></div></div>' +
      '<div class="steps" style="margin-bottom:20px">' + stepsHtml + '</div>' +
      '<div class="help-grid">' +
      '<div class="stack">' +
      '<div class="card"><div class="card-head"><div class="card-title">' + icon('printer', 16) + '打印 / 导出 PDF 操作' +
      '<span class="card-sub">预览页与打印使用同一份 A4 版式</span></div></div><div class="card-body">' +
      '<ul class="help-list">' + printTips + '</ul></div></div>' +
      '<div class="card" id="help-recognize"><div class="card-head"><div class="card-title">' + icon('zap', 16) + '智能填单（v1.1 新增）' +
      '<span class="card-sub">粘贴文字或上传本地文件，自动识别订单字段与货物</span></div></div><div class="card-body">' +
      '<div class="rec-privacy" style="margin-bottom:12px">' + icon('shield-check', 14) + '<span>本地解析 · 文件不会上传 · 不上传服务器、不调用任何 API</span></div>' +
      '<ul class="help-list">' + smartFillTips + '</ul>' +
      '<p class="field-hint" style="margin-top:10px">入口：订单编辑页右上角「智能填单」；仪表盘或订单页「识别建单」会先创建草稿再打开识别弹窗。</p>' +
      '</div></div>' +
      '<div class="card"><div class="card-head"><div class="card-title">' + icon('keyboard', 16) + '键盘快捷键与提示</div></div><div class="card-body">' +
      '<ul class="help-list">' +
      '<li>' + icon('check', 14) + '<span><span class="kbd">Ctrl</span> / <span class="kbd">⌘</span> + <span class="kbd">S</span> 保存当前订单或设置</span></li>' +
      '<li>' + icon('check', 14) + '<span><span class="kbd">Esc</span> 关闭弹窗、菜单或移动端导航</span></li>' +
      '<li>' + icon('check', 14) + '<span>订单编辑内容会自动保存，约 0.5 秒写入本机</span></li>' +
      '<li>' + icon('check', 14) + '<span>单证编号仅在预览 / 打印时消耗，重复预览不会跳号</span></li>' +
      '</ul></div></div>' +
      '<div class="card"><div class="card-head"><div class="card-title">' + icon('layers', 16) + '12 类单证一览</div></div>' +
      '<div class="card-body"><div class="row" style="gap:8px">' + docs + '</div></div></div>' +
      '</div>' +
      '<div class="stack">' +
      '<div class="card"><div class="card-head"><div class="card-title">' + icon('help', 16) + '常见问题</div></div>' +
      '<div class="card-body">' + faqs + '</div></div>' +
      '<div class="card"><div class="card-head"><div class="card-title">' + icon('shield', 16) + '官方单证免责声明</div></div><div class="card-body">' +
      '<div class="alert alert--warn">' + icon('alert', 16) +
      '<span>本系统生成的原产地证、报关资料清单等文件为 <b>通用可编辑版式</b>，不冒充任何官方机构签发的证书，也不构成法律、税务或海关申报建议。' +
      '正式提交给海关、商会、银行或进口国机构前，请以官方最新格式与要求为准，并核对全部数据。商业发票、装箱单、销售合同等常规单证的最终内容由使用者负责。</span></div>' +
      '<p class="help-body" style="margin-top:14px">单证通 TradeDocs v' + APP_VERSION + ' · 纯前端本地应用 · 数据存储键 <span class="mono">tradedocs.v1</span></p>' +
      '</div></div>' +
      '</div></div>';

    return {
      html: html,
      title: '使用说明',
      crumbs: '工作台 / 使用说明',
      nav: 'help',
      mount: null
    };
  }

  /* ================================================================
   *  Smart fill (v1.1) — local-only recognition UI
   * ================================================================ */

  var RECOGNIZE_EXT = ['.txt', '.md', '.csv', '.tsv', '.json', '.docx', '.xlsx'];
  var RECOGNIZE_ACCEPT_ATTR = '.txt,.md,.csv,.tsv,.json,.docx,.xlsx';
  var RECOGNIZE_UNSUPPORTED = {
    '.pdf': 'PDF（扫描件/文本型暂不支持）', '.doc': '旧版 Word (.doc)', '.xls': '旧版 Excel (.xls)',
    '.png': '图片', '.jpg': '图片', '.jpeg': '图片', '.webp': '图片', '.gif': '图片', '.bmp': '图片',
    '.tif': '图片', '.tiff': '图片', '.heic': '图片', '.svg': '矢量图'
  };
  var RECOGNIZE_SAMPLE_FALLBACK = [
    'COMMERCIAL INVOICE',
    'Invoice No.: CI-2026-0188      Date: 2026-11-17',
    'Order No.: PO-AH-26-0442',
    'Buyer: ATLANTIC HOME GOODS LLC',
    '350 Fifth Avenue, Suite 2100, New York, NY 10118, United States',
    'Tel: +1 212 555 0148   Email: purchasing@atlantichome.example',
    'Incoterm: CIF    Payment: T/T 30% deposit, balance against copy of B/L',
    'Port of Loading: NINGBO, CHINA    Port of Discharge: LOS ANGELES, USA',
    'Vessel: OOCL SUNRISE    Voyage: 026E',
    'L/C No.: LC26USA0091    L/C Date: 2026-11-09',
    'Shipping Marks: ATLANTIC HOME GOODS / PO NO.: AH-26-0442 / C/NO.: 1-390',
    'Description            HS Code       Qty     Unit   Unit Price   Amount',
    'Ceramic Mug 12 oz      6912.00.00    2400    PCS    1.85         4440.00',
    'Bamboo Cutting Board   4419.19.00    1200    SET    6.40         7680.00',
    'Freight: USD 2,150.00   Insurance: USD 340.00'
  ].join('\n');

  var RECOGNIZE_GROUPS = [
    {
      key: 'buyer', title: '买方', icon: 'users',
      fields: [
        { path: 'buyer.nameEn', label: '买方名称（英文）', kind: 'text' },
        { path: 'buyer.nameCn', label: '买方名称（中文）', kind: 'text' },
        { path: 'buyer.country', label: '国家 / 地区', kind: 'text' },
        { path: 'buyer.contact', label: '联系人', kind: 'text' },
        { path: 'buyer.tel', label: '电话', kind: 'text' },
        { path: 'buyer.email', label: '邮箱', kind: 'text' },
        { path: 'buyer.taxId', label: '税号 / VAT', kind: 'text' },
        { path: 'buyer.addressEn', label: '买方地址（英文）', kind: 'textarea' },
        { path: 'buyer.addressCn', label: '买方地址（中文）', kind: 'textarea' }
      ]
    },
    {
      key: 'basic', title: '基本信息', icon: 'file',
      fields: [
        { path: 'orderNo', label: '订单号', kind: 'text', hint: '仅在目标订单单号为空或选择覆盖时写入' },
        { path: 'date', label: '订单日期', kind: 'date' },
        { path: 'currency', label: '币种', kind: 'currency' },
        { path: 'incoterm', label: '贸易术语', kind: 'incoterm' },
        { path: 'transportMode', label: '运输方式', kind: 'transport' },
        { path: 'paymentTerms', label: '付款方式', kind: 'textarea' },
        { path: 'remarks', label: '备注', kind: 'textarea' }
      ],
      refs: ['invoiceNo', 'poNo', 'contractNo']
    },
    {
      key: 'shipment', title: '运输与信用证', icon: 'anchor',
      fields: [
        { path: 'portOfLoading', label: '起运港', kind: 'text' },
        { path: 'portOfDischarge', label: '目的港', kind: 'text' },
        { path: 'finalDestination', label: '最终目的地', kind: 'text' },
        { path: 'countryOfDestination', label: '目的国', kind: 'text' },
        { path: 'vessel', label: '船名', kind: 'text' },
        { path: 'voyage', label: '航次', kind: 'text' },
        { path: 'etd', label: '开船日期（ETD）', kind: 'date' },
        { path: 'eta', label: '到港日期（ETA）', kind: 'date' },
        { path: 'containerNo', label: '集装箱号', kind: 'text' },
        { path: 'sealNo', label: '封号', kind: 'text' },
        { path: 'blNo', label: '提单号', kind: 'text' },
        { path: 'bookingNo', label: '订舱号', kind: 'text' },
        { path: 'lcNo', label: '信用证号', kind: 'text' },
        { path: 'lcDate', label: '信用证日期', kind: 'date' },
        { path: 'lcIssuingBank', label: '开证行', kind: 'text' },
        { path: 'shippingMarks', label: '唛头 / 运输标记', kind: 'textarea' }
      ]
    },
    {
      key: 'charges', title: '费用', icon: 'dollar-sign',
      fields: [
        { path: 'charges.freight', label: '运费', kind: 'number' },
        { path: 'charges.insurance', label: '保险费', kind: 'number' },
        { path: 'charges.other', label: '其他费用', kind: 'number' },
        { path: 'charges.discount', label: '折扣', kind: 'number' }
      ]
    }
  ];
  var RECOGNIZE_REF_LABELS = { invoiceNo: '发票号', poNo: '采购单号 / PO', contractNo: '合同号' };
  var recognizeState = null;

  function recognizeEngine() {
    return TD.recognize && typeof TD.recognize === 'object' ? TD.recognize : null;
  }
  function recognizeAccept() {
    var engine = recognizeEngine();
    if (engine && Array.isArray(engine.ACCEPT) && engine.ACCEPT.length) return engine.ACCEPT.slice();
    return RECOGNIZE_EXT.slice();
  }
  function recognizeMaxBytes() {
    var engine = recognizeEngine();
    var value = engine ? core.num(engine.MAX_FILE_BYTES, 10 * 1024 * 1024) : 10 * 1024 * 1024;
    return value > 0 ? value : 10 * 1024 * 1024;
  }
  function recognizeMaxFiles() {
    var engine = recognizeEngine();
    var value = engine ? core.num(engine.MAX_FILES, 5) : 5;
    return value > 0 ? value : 5;
  }
  function recognizeSample() {
    var engine = recognizeEngine();
    if (engine && typeof engine.SAMPLE_TEXT === 'string' && engine.SAMPLE_TEXT.trim()) return engine.SAMPLE_TEXT;
    return RECOGNIZE_SAMPLE_FALLBACK;
  }
  function formatBytes(bytes) {
    var n = core.num(bytes, 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
  function isMeaningfulValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    return false;
  }
  function recognizeCurrencyValue() {
    if (!recognizeState) return 'USD';
    var currency = recognizeState.recognition && recognizeState.recognition.fields
      ? readPath(recognizeState.recognition.fields, 'currency') : '';
    var order = recognizeState.orderId ? store.getOrder(recognizeState.orderId) : null;
    return String(currency || (order && order.currency) || 'USD');
  }
  function normalizeRecognizeWarnings(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (warning) {
      if (!warning) return;
      if (typeof warning === 'string') out.push(warning);
      else if (warning.message) out.push(String(warning.message));
      else if (warning.code) out.push(String(warning.code));
    });
    return out;
  }

  function isRecognizeUnusedDraft(order) {
    if (!order || typeof order !== 'object') return false;
    if (Array.isArray(order.items) && order.items.length) return false;
    var buyer = order.buyer || {};
    if (String(buyer.nameEn || buyer.nameCn || '').trim()) return false;
    if (order.docMeta && Object.keys(order.docMeta).length) return false;
    if (String(order.consignee || '').trim()) return false;
    if (String(order.remarks || '').trim()) return false;
    return true;
  }

  function onRecognizeModalClose() {
    var session = recognizeState;
    recognizeState = null;
    if (!session || !session.autoDraftId) return;
    var autoDraftId = session.autoDraftId;
    var returnRoute = session.returnRoute || '#/orders';
    session.autoDraftId = '';
    var isEditorRoute = currentRoute.name === 'orders' && currentRoute.id === autoDraftId;
    var autoDraft = store.getOrder(autoDraftId);
    if (autoDraft && isRecognizeUnusedDraft(autoDraft)) {
      if (activeEditor && activeEditor.orderId === autoDraftId) {
        if (activeEditor.timer) clearTimeout(activeEditor.timer);
        activeEditor = null;
      }
      try {
        store.deleteOrder(autoDraftId);
      } catch (err) {
        console.error('[TradeDocs] 清理识别建单草稿失败', err);
      }
      if (isEditorRoute) navigate(returnRoute);
      return;
    }
    // Keep a draft that already contains user data, but leave its empty editor view.
    if (isEditorRoute) navigate(returnRoute);
  }

  function openRecognizeModal(orderId, sessionOptions) {
    var order = store.getOrder(orderId);
    if (!order) {
      toast('未找到订单，无法使用智能填单', 'error');
      return;
    }
    var opts = sessionOptions || {};
    recognizeState = {
      orderId: order.id,
      orderNo: order.no,
      autoDraftId: opts.autoDraftId ? String(opts.autoDraftId) : '',
      returnRoute: opts.returnRoute || '#/orders',
      files: [],
      text: '',
      step: 'source',
      busy: false,
      error: '',
      notices: [],
      recognition: null,
      edited: {},
      selected: {},
      items: [],
      warnings: [],
      stats: null,
      options: { overwrite: false, itemsMode: 'append' }
    };
    openModal({
      size: 'xl',
      title: '智能填单',
      subtitle: '粘贴文字或上传本地文件，在浏览器内识别订单字段与货物明细 · 本地解析，文件不会上传',
      body: '<div id="recognize-modal" aria-live="polite"></div>',
      footer: '<button class="btn" type="button" data-action="close-modal">取消</button>',
      onClose: function () { onRecognizeModalClose(); }
    });
    mountRecognizeModal();
    renderRecognizeModal();
  }

  function mountRecognizeModal() {
    var host = $('#recognize-modal');
    if (!host || host.getAttribute('data-recognize-bound') === '1') return;
    host.setAttribute('data-recognize-bound', '1');
    host.addEventListener('input', onRecognizeInput);
    host.addEventListener('change', onRecognizeChange);
    host.addEventListener('dragover', function (e) {
      e.preventDefault();
      var drop = e.target.closest ? e.target.closest('.rec-drop') : null;
      if (drop) drop.classList.add('is-dragover');
    });
    host.addEventListener('dragleave', function (e) {
      var drop = e.target.closest ? e.target.closest('.rec-drop') : null;
      if (drop) drop.classList.remove('is-dragover');
    });
    host.addEventListener('drop', function (e) {
      e.preventDefault();
      var drop = e.target.closest ? e.target.closest('.rec-drop') : null;
      if (drop) {
        drop.classList.remove('is-dragover');
        handleRecognizeFiles(e.dataTransfer && e.dataTransfer.files);
      }
    });
  }

  function renderRecognizeModal() {
    if (!recognizeState) return;
    var host = $('#recognize-modal');
    if (!host) return;
    host.innerHTML = recognizeState.step === 'result' ? recognizeResultHTML() : recognizeSourceHTML();
    var foot = $('.modal-foot');
    if (foot) foot.innerHTML = recognizeFooterHTML();
    var modal = host.closest ? host.closest('.modal') : null;
    if (modal) modal.setAttribute('aria-busy', recognizeState.busy ? 'true' : 'false');
  }

  function recognizeFooterHTML() {
    var s = recognizeState;
    if (!s) return '';
    if (s.step === 'result') {
      return '<button class="btn" type="button" data-action="recognize-back">' + icon('arrow-left', 15) + '重新提供资料</button>' +
        '<button class="btn btn--ghost" type="button" data-action="close-modal">取消</button>' +
        '<span class="rec-foot-spacer"></span>' +
        '<button class="btn" type="button" data-testid="recognize-apply" data-action="recognize-apply">' + icon('check', 15) + '应用到当前订单</button>' +
        '<button class="btn btn--primary" type="button" data-testid="recognize-apply-new" data-action="recognize-apply-new">' + icon('plus', 15) + '另存为新订单并应用</button>';
    }
    return '<button class="btn" type="button" data-action="close-modal">取消</button>' +
      '<button class="btn btn--primary" type="button" data-testid="recognize-run" data-action="recognize-run"' +
      (s.busy ? ' disabled' : '') + '>' + (s.busy ? '<span class="rec-btn-spinner" aria-hidden="true"></span>正在本地识别…' : icon('zap', 15) + '识别并核对') + '</button>';
  }

  function recognizeSourceHTML() {
    var s = recognizeState;
    var engine = recognizeEngine();
    var accept = recognizeAccept();
    var maxFiles = recognizeMaxFiles();
    var maxBytes = recognizeMaxBytes();
    var files = s.files.map(function (item, index) {
      return '<span class="rec-file">' + icon('file', 13) +
        '<span class="rec-file-name" title="' + esc(item.name) + '">' + esc(item.name) + '</span>' +
        '<span class="rec-file-size">' + esc(formatBytes(item.size)) + '</span>' +
        '<button type="button" class="rec-file-x" data-action="recognize-remove-file" data-index="' + index + '" aria-label="移除 ' + esc(item.name) + '">' + icon('x', 12) + '</button>' +
        '</span>';
    }).join('');
    var notices = '';
    if (s.notices.length) {
      notices = '<div class="alert alert--warn rec-notice">' + icon('alert', 16) + '<span>' +
        s.notices.map(esc).join('<br>') + '</span></div>';
    }
    if (s.error) {
      notices += '<div class="alert alert--danger rec-notice" role="alert">' + icon('alert-circle', 16) + '<span>' + esc(s.error) + '</span></div>';
    }
    var engineNotice = engine ? '' :
      '<div class="alert alert--warn rec-notice">' + icon('alert', 16) +
      '<span>识别引擎尚未加载（<span class="mono">js/recognize.js</span>）。你仍然可以粘贴文字或准备文件，但需要引擎就绪后才能识别；请刷新页面重试，或联系技术同事。</span></div>';
    var busyOverlay = s.busy
      ? '<div class="rec-loading" role="status">' + icon('refresh', 16) + '<span>正在本地解析文件与文字，不会上传任何内容…</span></div>'
      : '';
    return '<div class="rec-source" data-testid="recognize-source">' +
      '<div class="rec-privacy">' + icon('shield-check', 15) +
      '<div><strong>本地解析 · 文件不会上传</strong><span>识别与字段提取完全在当前浏览器内完成，不调用网络、接口或第三方服务。</span></div></div>' +
      engineNotice + notices + busyOverlay +
      '<div class="rec-drop" data-action="recognize-browse" role="button" tabindex="0" aria-label="拖拽文件或点击选择本地文件">' +
      '<span class="rec-drop-icon">' + icon('upload', 22) + '</span>' +
      '<div class="rec-drop-title">拖拽文件到此处，或 <span class="rec-link">点击选择文件</span></div>' +
      '<div class="rec-drop-hint">支持 ' + esc(accept.join(' / ')) + ' · 单文件 ≤' + esc(formatBytes(maxBytes)) + ' · 最多 ' + maxFiles + ' 个文件</div>' +
      '<div class="rec-drop-hint rec-drop-hint--muted">不支持图片、扫描 PDF、旧版 .doc / .xls；PDF 请先转换为文本或复制文字。</div>' +
      '</div>' +
      '<input class="sr-only" type="file" id="recognize-file-input" data-testid="recognize-input" multiple accept="' + esc(RECOGNIZE_ACCEPT_ATTR) + '" aria-label="选择本地文件">' +
      (files ? '<div class="rec-files"><span class="rec-files-label">已选择 <b>' + s.files.length + '</b> / ' + maxFiles + ' 个文件</span><div class="rec-file-list">' + files + '</div></div>' : '') +
      '<div class="rec-text-block">' +
      '<div class="rec-text-head"><label class="field-label" for="recognize-textarea">粘贴订单 / 发票 / 合同文字</label>' +
      '<span class="rec-char" id="recognize-char-count">' + core.fmtNum(String(s.text || '').length, 0) + ' / 300,000 字符</span></div>' +
      '<textarea class="textarea rec-textarea" id="recognize-textarea" data-testid="recognize-text" placeholder="在此粘贴订单、商业发票、形式发票或合同的文字内容，例如买方、日期、贸易术语、港口、信用证、货物表格等。">' + esc(s.text) + '</textarea>' +
      '<div class="rec-text-actions">' +
      '<button class="btn btn--sm" type="button" data-testid="recognize-sample" data-action="recognize-sample">' + icon('file-text', 14) + '载入示例</button>' +
      '<button class="btn btn--sm btn--ghost" type="button" data-action="recognize-clear">' + icon('trash', 14) + '清空</button>' +
      '<span class="field-hint">可以先上传文件，也可以直接粘贴文字；两者会合并识别。</span>' +
      '</div></div>' +
      '<div class="rec-note">' + icon('info', 14) +
      '<span>识别结果仅作为候选，需要你在下一步逐项核对后手动应用；取消不会修改任何订单数据。</span></div>' +
      '</div>';
  }

  function confidenceBadgeHTML(confidence, title) {
    var level = 'unknown';
    if (typeof confidence === 'number' && isFinite(confidence)) {
      level = confidence >= 0.8 ? 'high' : confidence >= 0.55 ? 'mid' : 'low';
    }
    var pct = typeof confidence === 'number' && isFinite(confidence) ? Math.round(confidence * 100) + '%' : '—';
    return '<span class="rec-conf rec-conf--' + level + '" title="' + esc(title || '识别引擎未提供证据') + '" aria-label="' + esc(title || '识别引擎未提供证据') + '">' +
      '<span class="rec-dot"></span>' + esc(pct) + '</span>';
  }

  function recognizeSelectOptions(kind, value) {
    var options = [];
    if (kind === 'currency') {
      (core.CURRENCIES || []).forEach(function (currency) {
        options.push({ value: currency.code, label: currency.code + ' · ' + (currency.nameCn || currency.nameEn) });
      });
    } else if (kind === 'incoterm') {
      (core.INCOTERMS || []).forEach(function (code) { options.push({ value: code, label: code }); });
    } else if (kind === 'transport') {
      (core.TRANSPORT_MODES || []).forEach(function (mode) { options.push({ value: mode.key, label: mode.nameCn + ' · ' + mode.nameEn }); });
    }
    var raw = String(value === null || value === undefined ? '' : value);
    var found = options.some(function (option) { return option.value === raw; });
    if (raw && !found) options.push({ value: raw, label: raw });
    return options;
  }

  function recognizedFieldRow(field) {
    var s = recognizeState;
    var fields = (s.recognition && s.recognition.fields) || {};
    var raw = readPath(fields, field.path);
    if (!isMeaningfulValue(raw)) return '';
    var selected = s.selected[field.path] !== false;
    var edited = s.edited[field.path];
    if (edited === undefined || edited === null) edited = raw;
    var meta = (s.recognition && s.recognition.meta && s.recognition.meta[field.path]) || null;
    var confidence = meta && typeof meta.confidence === 'number' ? meta.confidence : null;
    var evidence = meta && meta.evidence ? String(meta.evidence) : '';
    var title = evidence || '识别引擎未提供原文证据';
    if (confidence !== null) title += ' · 置信度 ' + Math.round(confidence * 100) + '%';
    var controlAttr = ' class="input rec-input" data-recognized-field="' + esc(field.path) + '" name="recognition.' + esc(field.path) + '"';
    var control;
    if (field.kind === 'textarea') {
      control = '<textarea class="textarea textarea--sm rec-input" rows="2" data-recognized-field="' + esc(field.path) +
        '" name="recognition.' + esc(field.path) + '" aria-label="' + esc(field.label) + '">' + esc(edited) + '</textarea>';
    } else if (field.kind === 'currency' || field.kind === 'incoterm' || field.kind === 'transport') {
      var value = String(edited === null || edited === undefined ? '' : edited);
      control = '<select' + controlAttr + ' aria-label="' + esc(field.label) + '">' +
        recognizeSelectOptions(field.kind, value).map(function (option) {
          return '<option value="' + esc(option.value) + '"' + (option.value === value ? ' selected' : '') + '>' + esc(option.label) + '</option>';
        }).join('') + '</select>';
    } else if (field.kind === 'number') {
      control = '<input' + controlAttr + ' type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(edited) + '" aria-label="' + esc(field.label) + '">';
    } else if (field.kind === 'date') {
      var dateValue = /^\d{4}-\d{2}-\d{2}$/.test(String(edited || '')) ? String(edited) : '';
      control = '<input' + controlAttr + ' type="date" value="' + esc(dateValue) + '" aria-label="' + esc(field.label) + '">';
    } else {
      control = '<input' + controlAttr + ' type="text" value="' + esc(edited) + '" aria-label="' + esc(field.label) + '">';
    }
    return '<div class="rec-field' + (selected ? '' : ' is-off') + '" data-field-row="' + esc(field.path) + '">' +
      '<label class="rec-check"><input type="checkbox" class="checkbox" data-recognized-field-check="' + esc(field.path) + '"' +
      (selected ? ' checked' : '') + ' aria-label="应用字段：' + esc(field.label) + '"></label>' +
      '<span class="rec-field-label">' + esc(field.label) + (field.hint ? '<small>' + esc(field.hint) + '</small>' : '') + '</span>' +
      '<span class="rec-field-control">' + control + '</span>' +
      confidenceBadgeHTML(confidence, title) +
      '</div>';
  }

  function recognizeGroupHTML(group) {
    var s = recognizeState;
    var fields = (s.recognition && s.recognition.fields) || {};
    var body = group.fields.map(recognizedFieldRow).join('');
    var refsHtml = '';
    if (group.refs) {
      var refs = group.refs.map(function (path) {
        var value = readPath(fields, path);
        if (!isMeaningfulValue(value)) return '';
        var meta = (s.recognition.meta && s.recognition.meta[path]) || null;
        var confidence = meta && typeof meta.confidence === 'number' ? meta.confidence : null;
        var title = (meta && meta.evidence ? String(meta.evidence) : '识别引擎未提供原文证据') +
          (confidence !== null ? ' · 置信度 ' + Math.round(confidence * 100) + '%' : '');
        return '<span class="pill rec-ref" title="' + esc(title) + '">' + esc(RECOGNIZE_REF_LABELS[path] || path) + '：' + esc(String(value)) + '</span>';
      }).join('');
      if (refs) refsHtml = '<div class="rec-refs"><span class="rec-refs-label">参考信息（不直接写入订单）</span><div class="row" style="gap:6px">' + refs + '</div></div>';
    }
    var seller = group.key === 'buyer' && fields.seller && (fields.seller.nameEn || fields.seller.addressEn)
      ? '<div class="rec-seller">' + icon('info', 13) + '<span>卖方（仅参考，不会写入公司设置）：' +
        esc([fields.seller.nameEn, fields.seller.addressEn, fields.seller.country].filter(Boolean).join(' · ')) + '</span></div>'
      : '';
    return '<section class="card rec-group" data-rec-group="' + esc(group.key) + '">' +
      '<div class="card-head"><div class="card-title">' + icon(group.icon, 15) + esc(group.title) + '</div></div>' +
      '<div class="card-body rec-group-body">' + (body || '<div class="rec-empty">未识别到该组字段</div>') + refsHtml + seller + '</div></section>';
  }

  function recognizeItemMoney(value) {
    var currency = recognizeCurrencyValue();
    var n = core.num(value, 0);
    return core.fmtMoney(n, currency);
  }

  function recognizeItemsHTML() {
    var s = recognizeState;
    var items = s.items || [];
    var rows = items.map(function (row, index) {
      var item = row.data || {};
      var meta = (s.recognition && s.recognition.meta) || {};
      var nameMeta = meta['items.' + index + '.nameEn'] || meta['items.' + index + '.qty'] || null;
      var confidence = nameMeta && typeof nameMeta.confidence === 'number' ? nameMeta.confidence : null;
      var evidence = nameMeta && nameMeta.evidence ? String(nameMeta.evidence) : '识别引擎未提供原文证据';
      var amount = isMeaningfulValue(item.amount) ? core.num(item.amount, 0)
        : core.round(core.num(item.qty, 0) * core.num(item.unitPrice, 0), 2);
      return '<tr data-recognize-item="' + index + '"' + (row.selected ? ' class="is-on"' : '') + '>' +
        '<td class="rec-item-check"><input type="checkbox" class="checkbox" data-recognize-item-check="' + index + '"' +
        (row.selected ? ' checked' : '') + ' aria-label="包含第 ' + (index + 1) + ' 行货物"></td>' +
        '<td class="item-no">' + (index + 1) + '</td>' +
        '<td><div class="cell-primary">' + esc(item.nameEn || item.nameCn || '—') + '</div>' +
        (item.nameEn && item.nameCn ? '<div class="cell-sub">' + esc(item.nameCn) + '</div>' : '') +
        confidenceBadgeHTML(confidence, evidence + (confidence !== null ? ' · 置信度 ' + Math.round(confidence * 100) + '%' : '')) +
        '</td>' +
        '<td class="mono">' + esc(item.code || '—') + '</td>' +
        '<td class="mono">' + esc(item.hsCode || '—') + '</td>' +
        '<td class="num">' + esc(core.fmtQty(item.qty)) + ' ' + esc(item.unit || '') + '</td>' +
        '<td class="num">' + esc(recognizeItemMoney(item.unitPrice)) + '</td>' +
        '<td class="num">' + esc(recognizeItemMoney(amount)) + '</td>' +
        '<td class="num">' + esc(isMeaningfulValue(item.cartons) ? core.fmtQty(item.cartons) : '—') + '</td>' +
        '<td class="num">' + esc(isMeaningfulValue(item.qtyPerCarton) ? core.fmtQty(item.qtyPerCarton) : '—') + '</td>' +
        '<td class="num">' + esc(isMeaningfulValue(item.netWeight) ? core.fmtNum(item.netWeight, 3) : '—') + '</td>' +
        '<td class="num">' + esc(isMeaningfulValue(item.grossWeight) ? core.fmtNum(item.grossWeight, 3) : '—') + '</td>' +
        '<td class="num">' + esc(isMeaningfulValue(item.cbm) ? core.fmtNum(item.cbm, 3) : '—') + '</td>' +
        '</tr>';
    }).join('');
    var allSelected = items.length > 0 && items.every(function (row) { return row.selected; });
    if (!items.length) {
      return '<section class="card rec-items"><div class="card-head"><div class="card-title">' + icon('package', 15) + '货物明细' +
        '<span class="card-sub">未识别到货物</span></div></div>' +
        '<div class="card-body"><div class="rec-empty">未识别到货物明细。应用后仍可在编辑器中手动添加货物或从产品库选择。</div></div></section>';
    }
    return '<section class="card rec-items"><div class="card-head"><div class="card-title">' + icon('package', 15) + '货物候选' +
      '<span class="card-sub">共 ' + items.length + ' 行 · 勾选需要写入订单的货物 · 表格可横向滚动</span></div>' +
      '<label class="check-row rec-item-all"><input type="checkbox" class="checkbox" data-recognize-item-all="1"' + (allSelected ? ' checked' : '') + '><span>全选</span></label>' +
      '</div><div class="table-wrap rec-items-wrap"><table class="data rec-items-table"><thead><tr>' +
      '<th class="rec-item-check"><span class="sr-only">选择</span></th><th>#</th><th>品名 / 名称</th><th>货号</th><th>HS 编码</th>' +
      '<th class="num">数量</th><th class="num">单价</th><th class="num">金额</th><th class="num">箱数</th><th class="num">每箱数量</th>' +
      '<th class="num">每箱净重 kg</th><th class="num">每箱毛重 kg</th><th class="num">每箱体积 m³</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  function recognizeStatsHTML() {
    var s = recognizeState;
    var stats = (s.recognition && s.recognition.stats) || {};
    var fieldCount = core.num(stats.fieldCount, 0);
    if (!fieldCount) {
      var fields = (s.recognition && s.recognition.fields) || {};
      RECOGNIZE_GROUPS.forEach(function (group) {
        group.fields.forEach(function (field) {
          if (isMeaningfulValue(readPath(fields, field.path))) fieldCount += 1;
        });
      });
    }
    var itemCount = core.num(stats.itemCount, (s.items || []).length);
    var computedSources = s.files.length + (String(s.text || '').trim() ? 1 : 0);
    var sources = core.num(stats.files, 0);
    if (!sources) sources = computedSources;
    if (!sources && s.recognition && Array.isArray(s.recognition.texts)) sources = s.recognition.texts.length;
    var chars = core.num(stats.chars, 0);
    if (!chars) {
      chars = String(s.text || '').length;
      var texts = (s.recognition && Array.isArray(s.recognition.texts)) ? s.recognition.texts : [];
      texts.forEach(function (text) { chars += core.num(text && text.chars, 0) || String((text && text.text) || '').length; });
    }
    return '<div class="rec-stats">' +
      '<span class="rec-stat">' + icon('check-circle', 13) + '字段 <b>' + fieldCount + '</b></span>' +
      '<span class="rec-stat">' + icon('package', 13) + '货物 <b>' + itemCount + '</b></span>' +
      '<span class="rec-stat">' + icon('file', 13) + '来源 <b>' + sources + '</b></span>' +
      '<span class="rec-stat">' + icon('file-text', 13) + '字符 <b>' + core.fmtNum(chars, 0) + '</b></span>' +
      '</div>';
  }

  function recognizeResultHTML() {
    var s = recognizeState;
    var warnings = (s.warnings || []).map(function (message) {
      return '<div class="rec-warning">' + icon('alert', 14) + '<span>' + esc(message) + '</span></div>';
    }).join('');
    var options = '<div class="rec-options">' +
      '<div class="rec-option-group"><span class="rec-option-title">字段应用方式</span>' +
      '<label class="check-row"><input type="radio" name="rec-overwrite" data-recognize-option="overwrite" value="0"' + (s.options.overwrite ? '' : ' checked') + '><span>仅填充空白字段（推荐）</span></label>' +
      '<label class="check-row"><input type="radio" name="rec-overwrite" data-recognize-option="overwrite" value="1"' + (s.options.overwrite ? ' checked' : '') + '><span>覆盖识别字段</span></label>' +
      '</div>' +
      '<div class="rec-option-group"><span class="rec-option-title">货物明细</span>' +
      '<label class="check-row"><input type="radio" name="rec-items-mode" data-recognize-option="itemsMode" value="append"' + (s.options.itemsMode === 'replace' ? '' : ' checked') + '><span>追加到现有货物</span></label>' +
      '<label class="check-row"><input type="radio" name="rec-items-mode" data-recognize-option="itemsMode" value="replace"' + (s.options.itemsMode === 'replace' ? ' checked' : '') + '><span>替换全部货物</span></label>' +
      '</div>' +
      '</div>';
    return '<div class="rec-result" data-testid="recognize-result">' +
      '<div class="rec-result-head"><div>' +
      '<div class="rec-result-title">' + icon('zap', 16) + '识别结果核对 <span class="badge badge--brand">待确认</span></div>' +
      '<div class="rec-result-sub">目标订单：<b class="mono">' + esc(s.orderNo || s.orderId) + '</b> · 应用前不会修改任何数据</div>' +
      '</div>' + recognizeStatsHTML() + '</div>' +
      '<div class="alert alert--info rec-apply-note">' + icon('info', 15) +
      '<span>请核对以下识别结果：取消勾选不需要的字段 / 货物，可直接修改字段值；确认后再点击底部「应用到当前订单」或「另存为新订单并应用」。</span></div>' +
      (warnings ? '<div class="rec-warnings">' + warnings + '</div>' : '') +
      '<div class="rec-groups">' + RECOGNIZE_GROUPS.map(recognizeGroupHTML).join('') + '</div>' +
      recognizeItemsHTML() + options +
      '</div>';
  }

  function onRecognizeInput(e) {
    if (!recognizeState) return;
    var el = e.target;
    if (!el || !el.getAttribute) return;
    if (el.id === 'recognize-textarea') {
      recognizeState.text = el.value;
      var counter = $('#recognize-char-count');
      if (counter) counter.textContent = core.fmtNum(String(el.value || '').length, 0) + ' / 300,000 字符';
      return;
    }
    var path = el.getAttribute('data-recognized-field');
    if (path) recognizeState.edited[path] = el.value;
  }

  function onRecognizeChange(e) {
    if (!recognizeState) return;
    var el = e.target;
    if (!el || !el.getAttribute) return;
    if (el.id === 'recognize-file-input') {
      handleRecognizeFiles(el.files);
      el.value = '';
      return;
    }
    var fieldCheck = el.getAttribute('data-recognized-field-check');
    if (fieldCheck) {
      recognizeState.selected[fieldCheck] = !!el.checked;
      var fieldRow = el.closest ? el.closest('.rec-field') : null;
      if (fieldRow) fieldRow.classList.toggle('is-off', !el.checked);
      return;
    }
    var itemCheck = el.getAttribute('data-recognize-item-check');
    if (itemCheck !== null) {
      var index = Number(itemCheck);
      if (recognizeState.items[index]) {
        recognizeState.items[index].selected = !!el.checked;
        var tr = el.closest ? el.closest('tr') : null;
        if (tr) tr.classList.toggle('is-on', !!el.checked);
        var all = $('[data-recognize-item-all]');
        if (all) all.checked = recognizeState.items.every(function (row) { return row.selected; });
      }
      return;
    }
    if (el.getAttribute('data-recognize-item-all')) {
      var checked = !!el.checked;
      recognizeState.items.forEach(function (row) { row.selected = checked; });
      renderRecognizeModal();
      return;
    }
    var option = el.getAttribute('data-recognize-option');
    if (option === 'overwrite') {
      recognizeState.options.overwrite = el.value === '1';
      return;
    }
    if (option === 'itemsMode') {
      recognizeState.options.itemsMode = el.value === 'replace' ? 'replace' : 'append';
    }
  }

  function handleRecognizeFiles(fileList) {
    if (!recognizeState) return;
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var notices = [];
    var accept = recognizeAccept();
    files.forEach(function (file) {
      var name = String((file && file.name) || '未命名文件');
      var ext = ('.' + name.split('.').pop()).toLowerCase();
      if (RECOGNIZE_UNSUPPORTED[ext]) {
        notices.push('「' + name + '」：当前版本仅支持文字/文档（' + accept.join(' / ') + '）。' + RECOGNIZE_UNSUPPORTED[ext] + ' 请转成 TXT / Word / Excel，或直接粘贴文字。');
        return;
      }
      if (accept.indexOf(ext) < 0) {
        notices.push('「' + name + '」：不支持的格式（' + ext + '）。当前支持 ' + accept.join(' / ') + '。');
        return;
      }
      if (core.num(file.size, 0) > recognizeMaxBytes()) {
        notices.push('「' + name + '」超过单文件 ' + formatBytes(recognizeMaxBytes()) + ' 限制，未添加。');
        return;
      }
      if (recognizeState.files.length >= recognizeMaxFiles()) {
        notices.push('最多上传 ' + recognizeMaxFiles() + ' 个文件，「' + name + '」未添加。');
        return;
      }
      var duplicate = recognizeState.files.some(function (existing) {
        return existing.name === name && existing.size === core.num(file.size, 0);
      });
      if (duplicate) {
        notices.push('「' + name + '」已在待识别列表中。');
        return;
      }
      recognizeState.files.push({ file: file, name: name, size: core.num(file.size, 0) });
    });
    recognizeState.notices = notices;
    recognizeState.error = '';
    renderRecognizeModal();
  }

  async function runRecognizeAction() {
    var s = recognizeState;
    if (!s || s.busy) return;
    var engine = recognizeEngine();
    if (!engine) {
      s.error = '识别引擎尚未加载（js/recognize.js），暂时无法识别。请刷新页面后重试，或联系技术同事。';
      s.step = 'source';
      renderRecognizeModal();
      return;
    }
    var text = String(s.text || '').trim();
    if (!text && !s.files.length) {
      s.error = '请先粘贴文字，或选择至少一个支持的文件，然后再识别。';
      s.step = 'source';
      renderRecognizeModal();
      return;
    }
    s.busy = true;
    s.error = '';
    s.notices = [];
    renderRecognizeModal();
    try {
      var recognition;
      if (s.files.length) {
        var fileList = s.files.map(function (item) { return item.file; });
        if (typeof engine.extractFiles === 'function' && typeof engine.parse === 'function') {
          var extracted = await engine.extractFiles(fileList);
          extracted = extracted || {};
          if (text) {
            var combined = text + '\n\n' + String(extracted.text || '');
            recognition = engine.parse(combined, { tables: extracted.tables || [] });
            if (recognition) {
              recognition.texts = recognition.texts || extracted.files || [];
              // parse() only sees the merged text; correct the source/char stats
              // for the user-visible "来源" counter (paste + N files).
              recognition.stats = recognition.stats && typeof recognition.stats === 'object' ? recognition.stats : {};
              recognition.stats.files = s.files.length + (text ? 1 : 0);
              if (!core.num(recognition.stats.chars, 0)) recognition.stats.chars = combined.length;
              if (Array.isArray(extracted.warnings) && extracted.warnings.length) {
                recognition.warnings = (recognition.warnings || []).concat(extracted.warnings);
              }
            }
          } else if (typeof engine.recognizeFiles === 'function') {
            recognition = await engine.recognizeFiles(fileList);
          } else {
            recognition = engine.parse(String(extracted.text || ''), { tables: extracted.tables || [] });
            if (recognition && Array.isArray(extracted.warnings) && extracted.warnings.length) {
              recognition.warnings = (recognition.warnings || []).concat(extracted.warnings);
            }
          }
        } else if (typeof engine.recognizeFiles === 'function') {
          recognition = await engine.recognizeFiles(fileList);
          if (text) {
            s.notices = ['同时提供了文字和文件，但当前识别引擎缺少合并接口，仅识别了文件内容。'];
          }
        } else {
          throw new Error('识别引擎缺少文件提取接口（extractFiles / recognizeFiles）');
        }
      } else if (typeof engine.recognizeText === 'function') {
        recognition = engine.recognizeText(text);
      } else if (typeof engine.parse === 'function') {
        recognition = engine.parse(text, {});
      } else {
        throw new Error('识别引擎缺少文本解析接口（recognizeText / parse）');
      }
      if (!recognition || typeof recognition !== 'object') throw new Error('识别引擎返回了空结果');
      s.recognition = recognition;
      prepareRecognizeResult(recognition);
      s.step = 'result';
    } catch (err) {
      console.error('[TradeDocs] 智能识别失败', err);
      s.error = '识别失败：' + (err && err.message ? err.message : '未知错误') + '。请检查文件内容后重试，或直接粘贴文字。';
    }
    s.busy = false;
    renderRecognizeModal();
  }

  function prepareRecognizeResult(recognition) {
    var s = recognizeState;
    s.edited = {};
    s.selected = {};
    var fields = recognition.fields || {};
    RECOGNIZE_GROUPS.forEach(function (group) {
      group.fields.forEach(function (field) {
        var value = readPath(fields, field.path);
        if (!isMeaningfulValue(value)) return;
        s.selected[field.path] = true;
        if (field.kind === 'number') s.edited[field.path] = String(core.num(value, 0));
        else s.edited[field.path] = String(value);
      });
    });
    s.items = (Array.isArray(recognition.items) ? recognition.items : []).map(function (item) {
      return { selected: true, data: item && typeof item === 'object' ? item : {} };
    });
    s.warnings = normalizeRecognizeWarnings(recognition.warnings);
    s.stats = recognition.stats || null;
    s.error = '';
  }

  function recognizeSampleAction() {
    if (!recognizeState) return;
    recognizeState.text = recognizeSample();
    recognizeState.notices = [];
    recognizeState.error = '';
    renderRecognizeModal();
    var textarea = $('#recognize-textarea');
    if (textarea) {
      textarea.focus();
      try { textarea.setSelectionRange(textarea.value.length, textarea.value.length); } catch (err) { /* ignore */ }
    }
  }

  function recognizeClearAction() {
    if (!recognizeState) return;
    recognizeState.files = [];
    recognizeState.text = '';
    recognizeState.notices = [];
    recognizeState.error = '';
    recognizeState.recognition = null;
    recognizeState.items = [];
    recognizeState.edited = {};
    recognizeState.selected = {};
    recognizeState.step = 'source';
    renderRecognizeModal();
  }

  function recognizeBackAction() {
    if (!recognizeState) return;
    recognizeState.step = 'source';
    recognizeState.error = '';
    recognizeState.busy = false;
    renderRecognizeModal();
  }

  function recognizeRemoveFileAction(el) {
    if (!recognizeState) return;
    var index = Number(el.getAttribute('data-index'));
    if (!isFinite(index) || index < 0 || index >= recognizeState.files.length) return;
    recognizeState.files.splice(index, 1);
    recognizeState.notices = [];
    renderRecognizeModal();
  }

  function buildEditedRecognition() {
    var s = recognizeState;
    var rec = core.clone(s.recognition || {});
    rec.fields = {};
    RECOGNIZE_GROUPS.forEach(function (group) {
      group.fields.forEach(function (field) {
        if (s.selected[field.path] === false) return;
        var raw = s.edited[field.path];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        var value;
        if (field.kind === 'number') {
          value = core.num(String(raw).replace(/,/g, ''), 0);
        } else {
          value = String(raw).trim();
        }
        setPath(rec.fields, field.path, value);
      });
    });
    rec.items = s.items.filter(function (row) { return row.selected; }).map(function (row) { return core.clone(row.data); });
    return rec;
  }

  function applyRecognizeAction(mode) {
    var s = recognizeState;
    if (!s || !s.recognition) return;
    var engine = recognizeEngine();
    if (!engine || typeof engine.apply !== 'function') {
      s.error = '识别引擎未加载或缺少 apply 接口，无法应用结果。';
      renderRecognizeModal();
      return;
    }
    var rec;
    try {
      rec = buildEditedRecognition();
    } catch (err) {
      console.error('[TradeDocs] 识别结果组装失败', err);
      s.error = '无法整理识别结果：' + (err && err.message ? err.message : '未知错误');
      renderRecognizeModal();
      return;
    }
    var overwriteEl = $('[data-recognize-option="overwrite"]:checked');
    var itemsModeEl = $('[data-recognize-option="itemsMode"]:checked');
    var options = {
      overwrite: overwriteEl ? overwriteEl.value === '1' : !!(s.options && s.options.overwrite),
      itemsMode: itemsModeEl ? (itemsModeEl.value === 'replace' ? 'replace' : 'append') : ((s.options && s.options.itemsMode) || 'append')
    };
    var baseOrder;
    var createdNew = false;
    try {
      if (mode === 'new') {
        baseOrder = store.newOrder();
        createdNew = true;
      } else {
        if (activeEditor && activeEditor.orderId === s.orderId) {
          // Capture any latest editor form values before merging recognition data.
          var editorForm = $('#order-form');
          if (editorForm) {
            syncFormToDraft(editorForm, activeEditor.draft);
            syncItemInputs(editorForm, activeEditor.draft);
            syncDocMetaFromDom(editorForm, activeEditor.draft);
          }
          baseOrder = core.clone(activeEditor.draft);
        } else {
          baseOrder = store.getOrder(s.orderId);
        }
      }
    } catch (err) {
      s.error = '创建目标订单失败：' + (err && err.message ? err.message : '未知错误');
      renderRecognizeModal();
      return;
    }
    if (!baseOrder) {
      s.error = '目标订单不存在，可能已被删除。';
      renderRecognizeModal();
      return;
    }
    var result;
    try {
      result = engine.apply(rec, baseOrder, options);
    } catch (err) {
      console.error('[TradeDocs] 应用识别结果失败', err);
      if (createdNew && baseOrder.id) {
        try { store.deleteOrder(baseOrder.id); } catch (deleteErr) { /* ignore */ }
      }
      s.error = '应用识别结果失败：' + (err && err.message ? err.message : '未知错误');
      renderRecognizeModal();
      return;
    }
    if (!result || !result.order || typeof result.order !== 'object') {
      if (createdNew && baseOrder.id) {
        try { store.deleteOrder(baseOrder.id); } catch (deleteErr) { /* ignore */ }
      }
      s.error = '应用失败：识别引擎未返回订单数据。';
      renderRecognizeModal();
      return;
    }
    var saved;
    try {
      saved = store.saveOrder(result.order);
    } catch (err) {
      s.error = '保存订单失败：' + (err && err.message ? err.message : '未知错误');
      renderRecognizeModal();
      return;
    }
    if (!saved) {
      s.error = '保存订单失败，请检查浏览器存储权限。';
      renderRecognizeModal();
      return;
    }
    var appliedFields = Array.isArray(result.appliedFields) ? result.appliedFields.length : 0;
    var appliedItems = core.num(result.appliedItems, 0);
    var targetId = saved.id;
    var skipped = Array.isArray(result.skipped) ? result.skipped.length : 0;
    // 识别建单 entry flow: the auto-created draft loses the race with the new
    // recognized order. Remove it when it is still untouched so no ghost order remains.
    if (s.autoDraftId && s.autoDraftId !== saved.id) {
      var autoDraft = store.getOrder(s.autoDraftId);
      if (autoDraft && isRecognizeUnusedDraft(autoDraft)) {
        try {
          store.deleteOrder(s.autoDraftId);
        } catch (err) {
          console.error('[TradeDocs] 清理识别建单草稿失败', err);
        }
      }
    }
    s.autoDraftId = '';
    activeEditor = null;
    closeModal();
    navigate('#/orders/' + encodeURIComponent(targetId));
    var message = (mode === 'new' ? '已创建新订单并应用：' : '已应用识别结果：') +
      appliedFields + ' 项字段 · ' + appliedItems + ' 条货物' + (skipped ? ' · 跳过 ' + skipped + ' 项' : '');
    toast(message, 'success', { title: '智能填单' });
  }

  function recognizeNewOrderAction() {
    var returnRoute = currentRoute.name === 'dashboard' ? '#/dashboard' : '#/orders';
    var order;
    try {
      order = store.newOrder();
    } catch (err) {
      toast('创建订单失败：' + (err && err.message ? err.message : '未知错误'), 'error');
      return;
    }
    if (!order) {
      toast('创建订单失败', 'error');
      return;
    }
    navigate('#/orders/' + encodeURIComponent(order.id));
    waitForEditorReady(order.id, function () {
      openRecognizeModal(order.id, { autoDraftId: order.id, returnRoute: returnRoute });
    });
  }

  function waitForEditorReady(orderId, callback) {
    var tries = 0;
    (function poll() {
      if (activeEditor && activeEditor.orderId === orderId && document.querySelector('#order-form')) {
        callback();
        return;
      }
      tries += 1;
      if (tries > 60) return;
      if (currentRoute.name === 'orders' && currentRoute.id === orderId) setTimeout(poll, 40);
      else if (tries <= 1) setTimeout(poll, 40);
    })();
  }

  function recognizeOpenAction() {
    var orderId = activeEditor && activeEditor.orderId
      ? activeEditor.orderId
      : (currentRoute.name === 'orders' && currentRoute.id ? currentRoute.id : '');
    if (!orderId) {
      toast('请先打开一个订单，再使用智能填单', 'warn');
      return;
    }
    openRecognizeModal(orderId);
  }

  /* ================================================================
   *  Shared actions
   * ================================================================ */

  function createNewOrderAction() {
    var order;
    try {
      order = store.newOrder();
    } catch (err) {
      toast('创建订单失败：' + (err && err.message ? err.message : '未知错误'), 'error');
      return;
    }
    if (!order) {
      toast('创建订单失败', 'error');
      return;
    }
    navigate('#/orders/' + encodeURIComponent(order.id));
    toast('新订单已创建，填写买方与货物后即可生成单证', 'info');
  }

  function openOrderAction(id) {
    if (!id) return;
    navigate('#/orders/' + encodeURIComponent(id));
  }

  async function duplicateOrderAction(id) {
    if (!id) return;
    var order = store.getOrder(id);
    if (!order) {
      toast('订单不存在，可能已被删除', 'error');
      return;
    }
    var copy = store.duplicateOrder(id);
    if (!copy) {
      toast('复制订单失败', 'error');
      return;
    }
    toast('已复制订单：' + copy.no, 'success');
    navigate('#/orders/' + encodeURIComponent(copy.id));
  }

  async function deleteOrderAction(id) {
    if (!id) return;
    var order = store.getOrder(id);
    if (!order) {
      toast('订单不存在，可能已被删除', 'error');
      return;
    }
    var ok = await confirmDialog({
      title: '删除订单',
      message: '确定删除订单 ' + (order.no || '') + ' 吗？该订单的全部数据将被移除。',
      warning: '删除后无法恢复，建议先导出 JSON 备份。',
      confirmText: '删除订单',
      danger: true
    });
    if (!ok) return;
    if (activeEditor && activeEditor.orderId === id) {
      if (activeEditor.timer) clearTimeout(activeEditor.timer);
      activeEditor = null;
    }
    store.deleteOrder(id);
    toast('订单已删除', 'success');
    if (currentRoute.name === 'orders' && currentRoute.id) navigate('#/orders');
    else refreshPage();
  }

  function toggleOrderDoneAction(id) {
    if (!id) return;
    var order = store.getOrder(id);
    if (!order) return;
    order.status = order.status === 'done' ? 'draft' : 'done';
    store.saveOrder(order);
    if (activeEditor && activeEditor.orderId === id) {
      activeEditor.draft.status = order.status;
      updateEditorStatusUI();
      refreshEditorComputed();
    } else {
      refreshPage();
    }
    toast(order.status === 'done' ? '订单已标记为已完成' : '订单已改回草稿', 'success');
  }

  function openDocTypeAction(key) {
    if (!key) return;
    var state = store.getState();
    var existingId = state.activeOrderId && store.getOrder(state.activeOrderId)
      ? state.activeOrderId
      : (state.orders && state.orders[0] ? state.orders[0].id : '');
    if (existingId) {
      var order = store.getOrder(existingId);
      order.print = order.print || { selected: [] };
      var selected = Array.isArray(order.print.selected) ? order.print.selected : [];
      if (selected.indexOf(key) < 0) selected = selected.concat([key]);
      order.print.selected = docKeys().filter(function (k) { return selected.indexOf(k) >= 0; });
      store.saveOrder(order);
      navigate('#/preview/' + encodeURIComponent(existingId) + '/' + encodeURIComponent(key));
      return;
    }
    var created = store.newOrder();
    if (!created) {
      toast('创建订单失败', 'error');
      return;
    }
    var draft = store.getOrder(created.id);
    draft.print = draft.print || {};
    draft.print.selected = [key];
    store.saveOrder(draft);
    navigate('#/orders/' + encodeURIComponent(created.id));
    toast('已创建新订单，填写买方与货物后即可生成「' + getDocEntry(key).nameCn + '」', 'info');
  }

  var ACTIONS = {
    'toggle-sidebar': function () { setSidebar(!isSidebarOpen()); },
    'new-order': createNewOrderAction,
    'open-order': function (el) { openOrderAction(el.getAttribute('data-id')); },
    'back-to-editor': function (el) { openOrderAction(el.getAttribute('data-id')); },
    'save-order': function () { saveEditorExplicit(); },
    'preview-order': function () { previewEditorAction(); },
    'duplicate-order': function (el) { duplicateOrderAction(el.getAttribute('data-id')); },
    'delete-order': function (el) { deleteOrderAction(el.getAttribute('data-id')); },
    'toggle-order-done': function (el) { toggleOrderDoneAction(el.getAttribute('data-id')); },
    'toggle-more-menu': function (el) {
      var wrap = el.closest('.menu-wrap');
      var menu = wrap ? wrap.querySelector('.menu') : null;
      if (!menu) return;
      var willOpen = !menu.classList.contains('is-open');
      closeAllMenus();
      if (willOpen) menu.classList.add('is-open');
    },
    'add-product': addProductFromPicker,
    'add-item': addBlankItem,
    'duplicate-item': function (el) { duplicateItem(Number(el.getAttribute('data-index'))); },
    'delete-item': function (el) { deleteItem(Number(el.getAttribute('data-index'))); },
    'buyer-to-customer': saveBuyerAsCustomer,
    'recognize-open': recognizeOpenAction,
    'recognize-new-order': recognizeNewOrderAction,
    'recognize-browse': function () { var input = $('#recognize-file-input'); if (input) input.click(); },
    'recognize-sample': recognizeSampleAction,
    'recognize-clear': recognizeClearAction,
    'recognize-remove-file': function (el) { recognizeRemoveFileAction(el); },
    'recognize-run': function () { runRecognizeAction(); },
    'recognize-back': recognizeBackAction,
    'recognize-apply': function () { applyRecognizeAction('current'); },
    'recognize-apply-new': function () { applyRecognizeAction('new'); },
    'regen-doc-meta': function (el) { regenerateDocMeta(el.getAttribute('data-key')); },
    'open-doc-type': function (el) { openDocTypeAction(el.getAttribute('data-key')); },
    'preview-doc': function (el) { previewAddDoc(el.getAttribute('data-key')); },
    'preview-remove-doc': function (el) { previewRemoveDoc(el.getAttribute('data-key')); },
    'preview-select-all': previewSelectAll,
    'preview-clear': previewClear,
    'print-docs': doPrint,
    'close-modal': function () { closeModal(false); },
    'modal-cancel': function () { closeModal(false); },
    'modal-confirm': function () {
      var fn = modalState && modalState.onConfirm;
      closeModal(true);
      if (typeof fn === 'function') fn();
    },
    'new-customer': function () { openCustomerModal(''); },
    'edit-customer': function (el) { openCustomerModal(el.getAttribute('data-id')); },
    'save-customer': function (el) { saveCustomerFromModal(el); },
    'delete-customer': function (el) { deleteCustomerAction(el.getAttribute('data-id')); },
    'new-product': function () { openProductModal(''); },
    'edit-product': function (el) { openProductModal(el.getAttribute('data-id')); },
    'save-product': function (el) { saveProductFromModal(el); },
    'delete-product': function (el) { deleteProductAction(el.getAttribute('data-id')); },
    'save-settings': saveSettingsExplicit,
    'upload-logo': function () { var file = $('#logo-file'); if (file) file.click(); },
    'remove-logo': function () { removeAsset('logo'); },
    'upload-seal': function () { var file = $('#seal-file'); if (file) file.click(); },
    'remove-seal': function () { removeAsset('seal'); },
    'export-backup': exportBackup,
    'import-backup': function () { var file = $('#import-file'); if (file) file.click(); },
    'reset-demo': resetDemoAction,
    'clear-all': clearAllAction,
    'reload-page': function () { try { location.reload(); } catch (err) { toast('请手动刷新页面', 'warn'); } }
  };

  /* ================================================================
   *  Global event wiring
   * ================================================================ */

  function onDocumentClick(e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('a[data-nav], .brand')) {
      if (isSidebarOpen()) setSidebar(false);
    }
    if (!target.closest('.menu-wrap')) closeAllMenus();
    var actionEl = target.closest('[data-action]');
    if (!actionEl) return;
    var name = actionEl.getAttribute('data-action');
    var fn = ACTIONS[name];
    if (!fn) return;
    e.preventDefault();
    try {
      fn(actionEl, e);
    } catch (err) {
      console.error('[TradeDocs] 操作失败：' + name, err);
      toast('操作失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    }
    if (name !== 'toggle-more-menu') closeAllMenus();
  }

  function onDocumentKeydown(e) {
    if (modalState) return;
    if (e.key === 'Escape') {
      if (isSidebarOpen()) { setSidebar(false); return; }
      closeAllMenus();
      return;
    }
    var mod = e.ctrlKey || e.metaKey;
    if (mod && String(e.key).toLowerCase() === 's') {
      if (currentRoute.name === 'orders' && currentRoute.id) {
        e.preventDefault();
        saveEditorExplicit();
      } else if (currentRoute.name === 'settings') {
        e.preventDefault();
        saveSettingsExplicit();
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('[data-doc-tab][role="tab"]')) {
      e.preventDefault();
      previewAddDoc(e.target.getAttribute('data-doc-tab'));
    }
  }

  function flushPendingEditors() {
    flushEditorDraft();
    flushSettingsDraft();
  }

  /* ================================================================
   *  Test hooks (contract §8)
   * ================================================================ */

  var testApi = {
    createOrder: function (partial) {
      var order = store.newOrder(partial || {});
      if (!order) throw new Error('创建订单失败');
      navigate('#/orders/' + encodeURIComponent(order.id));
      return order;
    },
    fillOrder: function (orderId, patch) {
      var order = store.getOrder(orderId);
      if (!order) throw new Error('订单不存在：' + orderId);
      if (patch && typeof patch === 'object') deepMerge(order, patch);
      var saved = store.saveOrder(order);
      if (!saved) throw new Error('保存订单失败');
      return saved;
    },
    openPreview: function (orderId, docKey) {
      if (activeEditor) flushEditorDraft();
      navigate('#/preview/' + encodeURIComponent(orderId) + (docKey ? '/' + encodeURIComponent(docKey) : ''));
    },
    ensureAllDocMeta: function (orderId) {
      var order = store.getOrder(orderId);
      if (!order) throw new Error('订单不存在：' + orderId);
      getDocList().forEach(function (doc) {
        store.ensureDocMeta(order, doc.key);
      });
      return store.getOrder(orderId);
    },
    renderDocs: function (orderId) {
      var results = {};
      var order = store.getOrder(orderId);
      if (!order) return results;
      var state = store.getState();
      var numbering = state.settings.numbering || { next: {}, padding: 4 };
      var opts = {
        bilingual: !!(order.print && order.print.bilingual),
        showSeal: !order.print || order.print.showSeal !== false,
        showSignature: true
      };
      getDocList().forEach(function (doc) {
        var key = doc.key;
        var stored = order.docMeta && order.docMeta[key];
        var meta = stored && stored.no ? stored : {
          no: core.docNo(doc.prefix || 'DOC', Math.max(1, core.num(numbering.next && numbering.next[key], 1)), order.date || core.todayISO(), core.num(numbering.padding, 4) || 4),
          date: (stored && stored.date) || order.date || core.todayISO()
        };
        try {
          if (!hasDocsEngine()) throw new Error('单证引擎未加载（js/doc-templates.js）');
          var rendered = TD.docs.render(key, {
            state: state,
            order: order,
            meta: { no: String(meta.no || ''), date: String(meta.date || '') },
            opts: opts,
            core: core
          });
          results[key] = {
            ok: typeof rendered === 'string' && rendered.length > 0,
            length: typeof rendered === 'string' ? rendered.length : 0,
            error: null
          };
        } catch (err) {
          results[key] = { ok: false, length: 0, error: err && err.message ? err.message : String(err) };
        }
      });
      return results;
    },
    getOrder: function (orderId) {
      return store.getOrder(orderId);
    }
  };

  /* ================================================================
   *  Public app API + bootstrap
   * ================================================================ */

  TD.app = {
    version: APP_VERSION,
    navigate: navigate,
    refresh: function () { flushPendingEditors(); renderRoute(); },
    currentRoute: function () { return { name: currentRoute.name, id: currentRoute.id, docKey: currentRoute.docKey }; },
    toast: toast
  };
  TD.test = TD.test || {};
  Object.keys(testApi).forEach(function (key) { TD.test[key] = testApi[key]; });

  function replaceHash(hash) {
    try {
      history.replaceState(null, '', hash);
    } catch (err) {
      location.hash = hash;
    }
  }

  function bootstrap() {
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeydown);
    store.onNotice(function (notice) {
      var type = notice.type === 'warn' ? 'warn' : notice.type === 'error' ? 'error' : notice.type === 'success' ? 'success' : 'info';
      toast(notice.message, type);
    });
    store.onSaveState(function (status) { setSaveState(status); });
    window.addEventListener('hashchange', function () {
      flushPendingEditors();
      renderRoute();
    });
    window.addEventListener('beforeunload', function () {
      flushPendingEditors();
      try { store.flush(); } catch (err) { /* ignore */ }
    });

    var hash = String(location.hash || '');
    var firstPart = hash.replace(/^#\/?/, '').split('/')[0];
    if (!hash || hash === '#' || hash === '#/' || knownRoutes.indexOf(firstPart) < 0) {
      replaceHash('#/dashboard');
    }
    renderRoute();
    setSaveState('saved');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})(typeof window !== 'undefined' ? window : globalThis);
