/*!
 * 单证通 TradeDocs — core.js
 * Pure utilities shared by the app, document templates and tests.
 * Classic script + optional CommonJS export (for Node unit tests).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.TradeDocs = root.TradeDocs || {};
  root.TradeDocs.core = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Constants                                                          */
  /* ------------------------------------------------------------------ */

  var CURRENCIES = [
    { code: 'USD', nameEn: 'US Dollar', nameCn: '美元', symbol: '$', wordsEn: 'US DOLLARS', wordsCn: '美元', subUnitEn: 'CENTS', decimals: 2 },
    { code: 'EUR', nameEn: 'Euro', nameCn: '欧元', symbol: '€', wordsEn: 'EURO', wordsCn: '欧元', subUnitEn: 'CENTS', decimals: 2 },
    { code: 'CNY', nameEn: 'Chinese Yuan', nameCn: '人民币', symbol: '¥', wordsEn: 'CHINESE YUAN', wordsCn: '人民币', subUnitEn: 'FEN', decimals: 2 },
    { code: 'GBP', nameEn: 'Pound Sterling', nameCn: '英镑', symbol: '£', wordsEn: 'POUNDS STERLING', wordsCn: '英镑', subUnitEn: 'PENCE', decimals: 2 },
    { code: 'JPY', nameEn: 'Japanese Yen', nameCn: '日元', symbol: '¥', wordsEn: 'JAPANESE YEN', wordsCn: '日元', subUnitEn: '', decimals: 0 },
    { code: 'AUD', nameEn: 'Australian Dollar', nameCn: '澳元', symbol: 'A$', wordsEn: 'AUSTRALIAN DOLLARS', wordsCn: '澳元', subUnitEn: 'CENTS', decimals: 2 },
    { code: 'CAD', nameEn: 'Canadian Dollar', nameCn: '加元', symbol: 'C$', wordsEn: 'CANADIAN DOLLARS', wordsCn: '加元', subUnitEn: 'CENTS', decimals: 2 },
    { code: 'HKD', nameEn: 'Hong Kong Dollar', nameCn: '港币', symbol: 'HK$', wordsEn: 'HONG KONG DOLLARS', wordsCn: '港币', subUnitEn: 'CENTS', decimals: 2 },
    { code: 'SGD', nameEn: 'Singapore Dollar', nameCn: '新加坡元', symbol: 'S$', wordsEn: 'SINGAPORE DOLLARS', wordsCn: '新加坡元', subUnitEn: 'CENTS', decimals: 2 },
    { code: 'CHF', nameEn: 'Swiss Franc', nameCn: '瑞士法郎', symbol: 'CHF', wordsEn: 'SWISS FRANCS', wordsCn: '瑞士法郎', subUnitEn: 'RAPPEN', decimals: 2 },
    { code: 'AED', nameEn: 'UAE Dirham', nameCn: '阿联酋迪拉姆', symbol: 'AED', wordsEn: 'UAE DIRHAMS', wordsCn: '阿联酋迪拉姆', subUnitEn: 'FILS', decimals: 2 }
  ];

  var INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

  var TRANSPORT_MODES = [
    { key: 'SEA', nameEn: 'BY SEA', nameCn: '海运' },
    { key: 'AIR', nameEn: 'BY AIR', nameCn: '空运' },
    { key: 'RAIL', nameEn: 'BY RAIL', nameCn: '铁路运输' },
    { key: 'EXPRESS', nameEn: 'BY EXPRESS', nameCn: '国际快递' },
    { key: 'LAND', nameEn: 'BY LAND', nameCn: '陆运' }
  ];

  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ------------------------------------------------------------------ */
  /*  Basic helpers                                                      */
  /* ------------------------------------------------------------------ */

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clone(value) {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (e) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function num(value, fallback) {
    var fb = fallback === undefined ? 0 : fallback;
    if (value === '' || value === null || value === undefined) return fb;
    var n = Number(value);
    return Number.isFinite(n) ? n : fb;
  }

  function round(value, dp) {
    var n = num(value, 0);
    var places = dp === undefined ? 2 : dp;
    var f = Math.pow(10, places);
    var r = Math.round((n + (n >= 0 ? Number.EPSILON : -Number.EPSILON)) * f) / f;
    return Object.is(r, -0) ? 0 : r;
  }

  function uid(prefix) {
    var p = prefix || 'id';
    var time = Date.now().toString(36);
    var rand = Math.random().toString(36).slice(2, 8);
    return p + '_' + time + '_' + rand;
  }

  function byId(list, id) {
    if (!Array.isArray(list) || !id) return undefined;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return undefined;
  }

  function currencyInfo(code) {
    var c = String(code || 'USD').toUpperCase();
    for (var i = 0; i < CURRENCIES.length; i++) {
      if (CURRENCIES[i].code === c) return CURRENCIES[i];
    }
    return { code: c, nameEn: c, nameCn: c, symbol: c, wordsEn: c, wordsCn: c, subUnitEn: 'CENTS', decimals: 2 };
  }

  function decimalsOf(currency) {
    return currencyInfo(currency).decimals;
  }

  /* ------------------------------------------------------------------ */
  /*  Number & money formatting                                          */
  /* ------------------------------------------------------------------ */

  function fmtNum(value, dp) {
    var places = dp === undefined ? 2 : dp;
    var n = num(value, 0);
    if (!Number.isFinite(n)) n = 0;
    var fixed = Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: places,
      maximumFractionDigits: places
    });
    return (n < 0 && Number(fixed.replace(/,/g, '')) !== 0 ? '-' : '') + fixed;
  }

  function fmtQty(value) {
    var n = num(value, 0);
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n - Math.round(n)) < 0.0000001) return fmtNum(Math.round(n), 0);
    return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
  }

  function fmtMoney(value, currency) {
    var info = currencyInfo(currency);
    var n = round(num(value, 0), info.decimals);
    var sign = n < 0 ? '-' : '';
    var body = Math.abs(n) >= 0
      ? Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: info.decimals, maximumFractionDigits: info.decimals })
      : '0';
    return sign + info.code + ' ' + body;
  }

  function fmtSigned(value, currency) {
    return fmtMoney(value, currency);
  }

  /* ------------------------------------------------------------------ */
  /*  Dates                                                              */
  /* ------------------------------------------------------------------ */

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseISO(iso) {
    if (!iso) return null;
    if (iso instanceof Date) return isNaN(iso.getTime()) ? null : iso;
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(iso, style) {
    var d = parseISO(iso);
    if (!d) return '';
    var kind = style || 'medium';
    if (kind === 'iso') return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    if (kind === 'short') return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
    if (kind === 'long') return d.getDate() + ' ' + MONTHS_LONG[d.getMonth()] + ' ' + d.getFullYear();
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  }

  function docNo(prefix, seq, dateISO, padding) {
    var p = String(prefix || 'DOC').toUpperCase();
    var d = parseISO(dateISO) || new Date();
    var pad = Math.max(1, Number(padding) || 4);
    var s = Math.max(1, Math.floor(num(seq, 1)));
    var value = String(s);
    while (value.length < pad) value = '0' + value;
    return p + '-' + d.getFullYear() + '-' + value;
  }

  /* ------------------------------------------------------------------ */
  /*  Amount in words — English                                          */
  /* ------------------------------------------------------------------ */

  var ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  var TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  var SCALES = ['', 'THOUSAND', 'MILLION', 'BILLION', 'TRILLION'];

  function under100(n) {
    if (n < 20) return ONES[n];
    var t = Math.floor(n / 10);
    var o = n % 10;
    return TENS[t] + (o ? '-' + ONES[o] : '');
  }

  function under1000(n) {
    var h = Math.floor(n / 100);
    var r = n % 100;
    if (!h) return under100(r);
    return ONES[h] + ' HUNDRED' + (r ? ' AND ' + under100(r) : '');
  }

  function integerToEnglish(n) {
    var value = Math.floor(Math.abs(num(n, 0)));
    if (!Number.isFinite(value)) return 'ZERO';
    if (value === 0) return 'ZERO';
    if (value > 999999999999999) return String(value);
    var groups = [];
    while (value > 0) {
      groups.push(value % 1000);
      value = Math.floor(value / 1000);
    }
    var parts = [];
    for (var i = groups.length - 1; i >= 0; i--) {
      if (!groups[i]) continue;
      parts.push(under1000(groups[i]) + (SCALES[i] ? ' ' + SCALES[i] : ''));
    }
    return parts.join(' ');
  }

  function amountWordsEn(amount, currency) {
    var info = currencyInfo(currency);
    var raw = num(amount, 0);
    var negative = raw < 0;
    var abs = Math.abs(raw);
    var cents = info.decimals === 0 ? 0 : Math.round(abs * 100) % 100;
    var whole = info.decimals === 0 ? Math.round(abs) : Math.floor(Math.round(abs * 100) / 100);
    var body = 'SAY ' + (negative ? 'MINUS ' : '') + info.wordsEn + ' ' + integerToEnglish(whole);
    if (cents > 0) body += ' AND ' + String(cents).replace(/^(\d)$/, '0$1') + '/100';
    return body + ' ONLY';
  }

  /* ------------------------------------------------------------------ */
  /*  Amount in words — Chinese uppercase                                */
  /* ------------------------------------------------------------------ */

  var CN_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  var CN_UNITS = ['', '拾', '佰', '仟'];
  var CN_BIG = ['', '万', '亿', '万亿'];

  function cnGroup(n) {
    var s = '';
    var zero = false;
    for (var pos = 3; pos >= 0; pos--) {
      var d = Math.floor(n / Math.pow(10, pos)) % 10;
      if (d === 0) {
        if (s) zero = true;
      } else {
        if (zero) { s += CN_DIGITS[0]; zero = false; }
        s += CN_DIGITS[d] + CN_UNITS[pos];
      }
    }
    return s;
  }

  function integerToChinese(n) {
    var value = Math.floor(Math.abs(num(n, 0)));
    if (!Number.isFinite(value)) return '零';
    if (value === 0) return '零';
    var groups = [];
    while (value > 0) {
      groups.push(value % 10000);
      value = Math.floor(value / 10000);
    }
    var s = '';
    for (var i = groups.length - 1; i >= 0; i--) {
      var g = groups[i];
      if (g === 0) {
        if (s && !/零$/.test(s)) s += '零';
        continue;
      }
      if (s && (g < 1000) && !/零$/.test(s)) s += '零';
      s += cnGroup(g) + (CN_BIG[i] || '');
    }
    return s.replace(/零+/g, '零').replace(/零+$/, '') || '零';
  }

  function amountWordsCn(amount, currency) {
    var info = currencyInfo(currency);
    var raw = num(amount, 0);
    var negative = raw < 0;
    var abs = Math.abs(raw);
    var cents = info.decimals === 0 ? 0 : Math.round(abs * 100);
    var whole = info.decimals === 0 ? Math.round(abs) : Math.floor(cents / 100);
    var jiao = info.decimals === 0 ? 0 : Math.floor(cents / 10) % 10;
    var fen = info.decimals === 0 ? 0 : cents % 10;
    var s = (negative ? '负' : '') + info.wordsCn;
    s += integerToChinese(whole) + '元';
    if (jiao === 0 && fen === 0) {
      s += '整';
    } else if (jiao === 0) {
      s += '零' + CN_DIGITS[fen] + '分';
    } else {
      s += CN_DIGITS[jiao] + '角';
      s += fen ? CN_DIGITS[fen] + '分' : '整';
    }
    return s;
  }

  /* ------------------------------------------------------------------ */
  /*  Order calculations                                                 */
  /* ------------------------------------------------------------------ */

  function calcOrder(order) {
    var o = order || {};
    var items = Array.isArray(o.items) ? o.items : [];
    var totalQty = 0;
    var totalCartons = 0;
    var totalNetWeight = 0;
    var totalGrossWeight = 0;
    var totalCbm = 0;
    var merchandiseTotal = 0;

    var lines = items.map(function (item) {
      var it = item || {};
      var qty = num(it.qty, 0);
      var unitPrice = num(it.unitPrice, 0);
      var amount = round(qty * unitPrice, 2);
      var perCarton = num(it.qtyPerCarton, 0);
      var cartons = num(it.cartons, 0);
      if (!cartons && perCarton > 0 && qty > 0) cartons = Math.ceil(qty / perCarton);
      cartons = Math.max(0, cartons);
      var netTotal = round(cartons * num(it.netWeight, 0), 3);
      var grossTotal = round(cartons * num(it.grossWeight, 0), 3);
      var cbmTotal = round(cartons * num(it.cbm, 0), 3);
      totalQty += qty;
      totalCartons += cartons;
      totalNetWeight += netTotal;
      totalGrossWeight += grossTotal;
      totalCbm += cbmTotal;
      merchandiseTotal += amount;
      return Object.assign({}, it, {
        amount: amount,
        cartonsCalc: cartons,
        netWeightTotal: netTotal,
        grossWeightTotal: grossTotal,
        cbmTotal: cbmTotal
      });
    });

    merchandiseTotal = round(merchandiseTotal, 2);
    totalQty = round(totalQty, 3);
    totalCartons = round(totalCartons, 3);
    totalNetWeight = round(totalNetWeight, 3);
    totalGrossWeight = round(totalGrossWeight, 3);
    totalCbm = round(totalCbm, 3);

    var charges = o.charges || {};
    var freight = round(num(charges.freight, 0), 2);
    var insurance = round(num(charges.insurance, 0), 2);
    var other = round(num(charges.other, 0), 2);
    var discount = round(num(charges.discount, 0), 2);
    var grandTotal = round(merchandiseTotal + freight + insurance + other - discount, 2);
    if (grandTotal < 0) grandTotal = 0;
    var currency = o.currency || 'USD';

    return {
      lines: lines,
      totalQty: totalQty,
      totalCartons: totalCartons,
      totalNetWeight: totalNetWeight,
      totalGrossWeight: totalGrossWeight,
      totalCbm: totalCbm,
      merchandiseTotal: merchandiseTotal,
      freight: freight,
      insurance: insurance,
      other: other,
      discount: discount,
      grandTotal: grandTotal,
      amountInWordsEn: amountWordsEn(grandTotal, currency),
      amountInWordsCn: amountWordsCn(grandTotal, currency)
    };
  }

  function calcCost(order) {
    var o = order || {};
    var revenue = calcOrder(o);
    var cost = o.cost || {};
    var exchangeRate = num(cost.exchangeRate, 7.1);
    if (!(exchangeRate > 0)) exchangeRate = 7.1;
    var revenueFc = revenue.grandTotal;
    var revenueCny = round(revenueFc * exchangeRate, 2);
    var purchaseCost = 0;
    revenue.lines.forEach(function (line) {
      purchaseCost += num(line.qty, 0) * num(line.costPrice, 0);
    });
    purchaseCost = round(purchaseCost, 2);
    var domesticCost = round(num(cost.domestic, 0), 2);
    var bankCost = round(num(cost.bank, 0), 2);
    var miscCost = round(num(cost.misc, 0), 2);
    var totalCost = round(purchaseCost + domesticCost + bankCost + miscCost, 2);
    var grossProfit = round(revenueCny - totalCost, 2);
    var marginPct = revenueCny > 0 ? round((grossProfit / revenueCny) * 100, 2) : 0;
    return {
      revenueFc: revenueFc,
      exchangeRate: exchangeRate,
      revenueCny: revenueCny,
      purchaseCost: purchaseCost,
      domesticCost: domesticCost,
      bankCost: bankCost,
      miscCost: miscCost,
      totalCost: totalCost,
      grossProfit: grossProfit,
      marginPct: marginPct
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Validation                                                         */
  /* ------------------------------------------------------------------ */

  function validateOrder(order) {
    var issues = [];
    var o = order || {};
    var buyer = o.buyer || {};
    function add(level, field, message) { issues.push({ level: level, field: field, message: message }); }

    if (!String(buyer.nameEn || buyer.nameCn || '').trim()) {
      add('error', 'buyer.nameEn', '请填写买方名称');
    }
    if (!parseISO(o.date)) add('error', 'date', '订单日期无效');
    if (!String(o.no || '').trim()) add('warn', 'no', '尚未生成订单号');

    var items = Array.isArray(o.items) ? o.items : [];
    if (!items.length) add('error', 'items', '请至少添加一项货物');
    items.forEach(function (item, index) {
      var prefix = 'items.' + index + '.';
      var label = '第 ' + (index + 1) + ' 行货物';
      if (!String(item.nameEn || item.nameCn || '').trim()) add('error', prefix + 'nameEn', label + '缺少品名');
      if (num(item.qty, 0) <= 0) add('error', prefix + 'qty', label + '数量必须大于 0');
      if (num(item.unitPrice, 0) < 0) add('error', prefix + 'unitPrice', label + '单价不能为负数');
      if (!String(item.unit || '').trim()) add('warn', prefix + 'unit', label + '缺少单位');
      if (!String(item.hsCode || '').trim()) add('warn', prefix + 'hsCode', label + '缺少 HS 编码');
      if (num(item.cartons, 0) <= 0 && num(item.qtyPerCarton, 0) <= 0) {
        add('warn', prefix + 'cartons', label + '箱数/每箱数量均未填写，装箱单数据不完整');
      }
      if (num(item.grossWeight, 0) <= 0) add('warn', prefix + 'grossWeight', label + '缺少每箱毛重');
    });

    if (!String(o.portOfLoading || '').trim()) add('warn', 'portOfLoading', '请填写起运港');
    if (!String(o.portOfDischarge || '').trim()) add('warn', 'portOfDischarge', '请填写目的港');
    if (!String(o.incoterm || '').trim()) add('warn', 'incoterm', '请选择贸易术语');
    if (!String(o.paymentTerms || '').trim()) add('warn', 'paymentTerms', '请填写付款方式');
    if (!String(o.countryOfDestination || '').trim() && !String(buyer.country || '').trim()) {
      add('warn', 'countryOfDestination', '请填写目的国');
    }
    var totals = calcOrder(o);
    if (totals.grandTotal <= 0) add('warn', 'charges', '订单总金额为 0，请检查单价');
    return issues;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  return {
    CURRENCIES: CURRENCIES,
    INCOTERMS: INCOTERMS,
    TRANSPORT_MODES: TRANSPORT_MODES,
    esc: esc,
    clone: clone,
    num: num,
    round: round,
    uid: uid,
    byId: byId,
    currencyInfo: currencyInfo,
    decimalsOf: decimalsOf,
    fmtNum: fmtNum,
    fmtQty: fmtQty,
    fmtMoney: fmtMoney,
    fmtSigned: fmtSigned,
    todayISO: todayISO,
    fmtDate: fmtDate,
    parseISO: parseISO,
    docNo: docNo,
    integerToEnglish: integerToEnglish,
    integerToChinese: integerToChinese,
    amountWordsEn: amountWordsEn,
    amountWordsCn: amountWordsCn,
    calcOrder: calcOrder,
    calcCost: calcCost,
    validateOrder: validateOrder
  };
});
