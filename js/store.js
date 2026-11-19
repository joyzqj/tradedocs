/*!
 * 单证通 TradeDocs — store.js
 * Local-first state container: localStorage persistence, demo seeding,
 * corrupt-data recovery, debounced autosave, CRUD, document numbering and backup.
 * Classic script (no modules). Exposes window.TradeDocs.store.
 */
(function (root) {
  'use strict';

  var TD = root.TradeDocs = root.TradeDocs || {};
  var core = TD.core;

  if (!core) {
    // core.js is a hard dependency. Fail loudly but do not break the page.
    (root.console || { error: function () {} }).error('[TradeDocs] core.js must be loaded before store.js');
    TD.store = {
      storageKey: 'tradedocs.v1',
      getState: function () { return null; },
      setState: function () { return null; },
      subscribe: function () { return function () {}; },
      save: function () {},
      newOrder: function () { return null; },
      saveOrder: function () { return null; },
      deleteOrder: function () { return false; },
      duplicateOrder: function () { return null; },
      ensureDocMeta: function () { return { no: '', date: '' }; },
      exportJSON: function () { return '{}'; },
      importJSON: function () { return { ok: false, message: '核心脚本未加载' }; },
      resetDemo: function () {},
      clearAll: function () {}
    };
    return;
  }

  /* ------------------------------------------------------------------ */
  /*  Constants                                                          */
  /* ------------------------------------------------------------------ */

  var STORAGE_KEY = 'tradedocs.v1';
  var BROKEN_KEY = 'tradedocs.broken';
  var SCHEMA_VERSION = 1;
  var SAVE_DELAY = 300; // ms — contract: <= 500ms

  var DOC_KEYS = ['ci', 'pl', 'pi', 'sc', 'qt', 'bk', 'sa', 'cd', 'co', 'bc', 'dr', 'cs'];
  var DOC_PREFIX = {
    ci: 'CI', pl: 'PL', pi: 'PI', sc: 'SC', qt: 'QT', bk: 'BK', sa: 'SA',
    cd: 'CD', co: 'CO', bc: 'BC', dr: 'DR', cs: 'CS'
  };

  var ITEM_STRING_FIELDS = ['code', 'nameEn', 'nameCn', 'hsCode', 'origin', 'unit', 'remarks'];
  var ITEM_NUMBER_FIELDS = ['qty', 'unitPrice', 'cartons', 'qtyPerCarton', 'netWeight', 'grossWeight', 'cbm', 'costPrice'];
  var CHARGE_FIELDS = ['freight', 'insurance', 'other', 'discount'];
  var COST_FIELDS = ['exchangeRate', 'domestic', 'bank', 'misc'];
  var BUYER_FIELDS = ['nameEn', 'nameCn', 'addressEn', 'addressCn', 'country', 'contact', 'tel', 'email', 'taxId'];
  var CUSTOMER_FIELDS = ['id', 'code', 'nameEn', 'nameCn', 'addressEn', 'addressCn', 'country', 'contact', 'tel', 'email', 'taxId'];
  var PRODUCT_STRING_FIELDS = ['id', 'code', 'nameEn', 'nameCn', 'hsCode', 'unit', 'currency', 'pkg', 'origin', 'specEn', 'remarks'];
  var PRODUCT_NUMBER_FIELDS = ['price', 'qtyPerCarton', 'netWeight', 'grossWeight', 'cbm'];

  /* ------------------------------------------------------------------ */
  /*  Internal state                                                     */
  /* ------------------------------------------------------------------ */

  var state = null;
  var changeListeners = [];
  var noticeListeners = [];
  var noticeQueue = [];
  var saveStateListeners = [];
  var saveTimer = null;
  var storageAvailable = true;
  var writeFailureNotified = false;
  var lastSaveStatus = { status: 'saved', at: Date.now() };

  /* ------------------------------------------------------------------ */
  /*  Small helpers                                                      */
  /* ------------------------------------------------------------------ */

  function clone(value) { return core.clone(value); }

  function str(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function nowISO() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function deepAssign(target, source) {
    if (!isPlainObject(source)) return target;
    Object.keys(source).forEach(function (key) {
      var value = source[key];
      if (isPlainObject(value) && isPlainObject(target[key])) {
        deepAssign(target[key], value);
      } else if (value !== undefined) {
        target[key] = clone(value);
      }
    });
    return target;
  }

  function emitChange(previous) {
    var snapshot = state;
    changeListeners.slice().forEach(function (fn) {
      try {
        fn(snapshot, previous);
      } catch (err) {
        if (root.console) root.console.error('[TradeDocs] store subscriber failed', err);
      }
    });
  }

  function emitStatus(status) {
    lastSaveStatus = { status: status, at: Date.now() };
    saveStateListeners.slice().forEach(function (fn) {
      try { fn(status); } catch (err) { /* ignore */ }
    });
  }

  function enqueueNotice(message, type) {
    var notice = { message: message, type: type || 'info' };
    if (noticeListeners.length) {
      noticeListeners.slice().forEach(function (fn) {
        try { fn(notice); } catch (err) { /* ignore */ }
      });
    } else {
      noticeQueue.push(notice);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Schema defaults & normalization                                    */
  /* ------------------------------------------------------------------ */

  function emptyCompany() {
    return {
      nameEn: '', nameCn: '', addressEn: '', addressCn: '', city: '', country: 'CHINA',
      tel: '', fax: '', email: '', website: '', taxId: '', signer: '', signerTitle: '',
      logo: '', seal: ''
    };
  }

  function emptyBank() {
    return {
      beneficiaryEn: '', bankNameEn: '', bankAddressEn: '', accountNo: '',
      swift: '', iban: '', bankCode: '', intermediary: ''
    };
  }

  function emptyDefaults() {
    return {
      currency: 'USD', incoterm: 'FOB', paymentTerms: '', portOfLoading: '',
      portOfDischarge: '', countryOfOrigin: 'CHINA', declaration: '', certStatement: '',
      bilingual: false, showSeal: true
    };
  }

  function emptyNumbering() {
    var next = {};
    DOC_KEYS.forEach(function (key) { next[key] = 1; });
    return { next: next, padding: 4 };
  }

  function defaultSettings() {
    return {
      company: emptyCompany(),
      bank: emptyBank(),
      defaults: emptyDefaults(),
      numbering: emptyNumbering(),
      ui: { lastRoute: '#/dashboard' }
    };
  }

  function normalizeSettings(raw) {
    var settings = defaultSettings();
    if (!isPlainObject(raw)) return settings;
    deepAssign(settings.company, isPlainObject(raw.company) ? raw.company : {});
    deepAssign(settings.bank, isPlainObject(raw.bank) ? raw.bank : {});
    deepAssign(settings.defaults, isPlainObject(raw.defaults) ? raw.defaults : {});
    var numbering = isPlainObject(raw.numbering) ? raw.numbering : {};
    if (isPlainObject(numbering.next)) {
      DOC_KEYS.forEach(function (key) {
        var value = Math.floor(core.num(numbering.next[key], 1));
        settings.numbering.next[key] = value > 0 ? value : 1;
      });
    }
    var padding = Math.floor(core.num(numbering.padding, 4));
    settings.numbering.padding = Math.min(8, Math.max(1, padding || 4));
    var ui = isPlainObject(raw.ui) ? raw.ui : {};
    settings.ui.lastRoute = str(ui.lastRoute) || '#/dashboard';
    settings.defaults.currency = str(settings.defaults.currency) || 'USD';
    settings.defaults.incoterm = str(settings.defaults.incoterm) || 'FOB';
    settings.defaults.countryOfOrigin = str(settings.defaults.countryOfOrigin) || 'CHINA';
    settings.defaults.bilingual = !!settings.defaults.bilingual;
    settings.defaults.showSeal = settings.defaults.showSeal !== false;
    return settings;
  }

  function normalizeBuyer(raw) {
    var buyer = {};
    BUYER_FIELDS.forEach(function (field) {
      buyer[field] = str(isPlainObject(raw) ? raw[field] : '');
    });
    return buyer;
  }

  function normalizeItem(raw) {
    if (!isPlainObject(raw)) return null;
    var item = { id: str(raw.id) || core.uid('item'), productId: str(raw.productId) };
    ITEM_STRING_FIELDS.forEach(function (field) { item[field] = str(raw[field]); });
    ITEM_NUMBER_FIELDS.forEach(function (field) { item[field] = core.num(raw[field], 0); });
    return item;
  }

  function normalizeDocMeta(raw) {
    var meta = {};
    if (!isPlainObject(raw)) return meta;
    DOC_KEYS.forEach(function (key) {
      var entry = raw[key];
      if (isPlainObject(entry) && str(entry.no)) {
        meta[key] = { no: str(entry.no), date: str(entry.date) };
      }
    });
    return meta;
  }

  function normalizePrint(raw) {
    var source = isPlainObject(raw) ? raw : {};
    var selected = Array.isArray(source.selected)
      ? source.selected.map(str).filter(function (key, index, arr) {
        return DOC_KEYS.indexOf(key) >= 0 && arr.indexOf(key) === index;
      })
      : ['ci', 'pl'];
    return {
      selected: selected,
      bilingual: !!source.bilingual,
      showSeal: source.showSeal !== false
    };
  }

  function normalizeOrder(raw) {
    if (!isPlainObject(raw)) return null;
    var order = {
      id: str(raw.id) || core.uid('ord'),
      no: str(raw.no),
      status: raw.status === 'done' ? 'done' : 'draft',
      date: core.fmtDate(raw.date, 'iso') || core.todayISO(),
      createdAt: str(raw.createdAt) || nowISO(),
      updatedAt: str(raw.updatedAt) || nowISO(),
      customerId: str(raw.customerId),
      buyer: normalizeBuyer(raw.buyer),
      consignee: str(raw.consignee),
      notifyParty: str(raw.notifyParty),
      currency: str(raw.currency) || 'USD',
      incoterm: str(raw.incoterm) || 'FOB',
      paymentTerms: str(raw.paymentTerms),
      portOfLoading: str(raw.portOfLoading),
      portOfDischarge: str(raw.portOfDischarge),
      finalDestination: str(raw.finalDestination),
      countryOfDestination: str(raw.countryOfDestination),
      transportMode: str(raw.transportMode) || 'SEA',
      vessel: str(raw.vessel),
      voyage: str(raw.voyage),
      containerNo: str(raw.containerNo),
      sealNo: str(raw.sealNo),
      blNo: str(raw.blNo),
      bookingNo: str(raw.bookingNo),
      lcNo: str(raw.lcNo),
      lcDate: core.fmtDate(raw.lcDate, 'iso') || '',
      lcIssuingBank: str(raw.lcIssuingBank),
      etd: core.fmtDate(raw.etd, 'iso') || '',
      eta: core.fmtDate(raw.eta, 'iso') || '',
      shippingMarks: str(raw.shippingMarks),
      remarks: str(raw.remarks),
      items: Array.isArray(raw.items) ? raw.items.map(normalizeItem).filter(Boolean) : [],
      charges: {},
      cost: {},
      docMeta: normalizeDocMeta(raw.docMeta),
      print: normalizePrint(raw.print)
    };
    CHARGE_FIELDS.forEach(function (field) {
      order.charges[field] = core.num(isPlainObject(raw.charges) ? raw.charges[field] : 0, 0);
    });
    COST_FIELDS.forEach(function (field) {
      var fallback = field === 'exchangeRate' ? 7.1 : 0;
      order.cost[field] = core.num(isPlainObject(raw.cost) ? raw.cost[field] : fallback, fallback);
    });
    return order;
  }

  function normalizeCustomer(raw) {
    if (!isPlainObject(raw)) return null;
    var customer = {};
    CUSTOMER_FIELDS.forEach(function (field) {
      customer[field] = str(raw[field]);
    });
    if (!customer.id) customer.id = core.uid('cust');
    return customer;
  }

  function normalizeProduct(raw) {
    if (!isPlainObject(raw)) return null;
    var product = {};
    PRODUCT_STRING_FIELDS.forEach(function (field) { product[field] = str(raw[field]); });
    if (!product.id) product.id = core.uid('prod');
    PRODUCT_NUMBER_FIELDS.forEach(function (field) { product[field] = core.num(raw[field], 0); });
    product.currency = product.currency || 'USD';
    product.origin = product.origin || 'CHINA';
    product.unit = product.unit || 'PCS';
    product.pkg = product.pkg || 'CARTON';
    return product;
  }

  function normalizeState(raw) {
    if (!isPlainObject(raw)) return null;
    if (!isPlainObject(raw.settings)) return null;
    if (!Array.isArray(raw.orders) || !Array.isArray(raw.customers) || !Array.isArray(raw.products)) return null;
    var normalized = {
      schemaVersion: SCHEMA_VERSION,
      settings: normalizeSettings(raw.settings),
      customers: raw.customers.map(normalizeCustomer).filter(Boolean),
      products: raw.products.map(normalizeProduct).filter(Boolean),
      orders: raw.orders.map(normalizeOrder).filter(Boolean),
      activeOrderId: str(raw.activeOrderId),
      meta: isPlainObject(raw.meta) ? {
        createdAt: str(raw.meta.createdAt) || nowISO(),
        updatedAt: str(raw.meta.updatedAt) || nowISO()
      } : { createdAt: nowISO(), updatedAt: nowISO() }
    };
    if (raw.meta && raw.meta.demo) normalized.meta.demo = true;
    if (!core.byId(normalized.orders, normalized.activeOrderId)) {
      normalized.activeOrderId = normalized.orders.length ? normalized.orders[0].id : '';
    }
    return normalized;
  }

  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      settings: defaultSettings(),
      customers: [],
      products: [],
      orders: [],
      activeOrderId: '',
      meta: { createdAt: nowISO(), updatedAt: nowISO() }
    };
  }

  function demoState() {
    var raw = null;
    try {
      if (TD.demo && typeof TD.demo.data === 'function') raw = TD.demo.data();
    } catch (err) {
      if (root.console) root.console.error('[TradeDocs] demo data failed', err);
    }
    var normalized = raw ? normalizeState(raw) : null;
    return normalized || emptyState();
  }

  /* ------------------------------------------------------------------ */
  /*  Persistence                                                        */
  /* ------------------------------------------------------------------ */

  function detectStorage() {
    try {
      var probe = root.localStorage;
      if (!probe) return null;
      var key = '__tradedocs_probe__';
      probe.setItem(key, '1');
      probe.removeItem(key);
      return probe;
    } catch (err) {
      storageAvailable = false;
      return null;
    }
  }

  var storage = detectStorage();

  if (!storage) {
    storageAvailable = false;
    enqueueNotice('浏览器禁止访问本地存储（隐私模式或安全策略），本次修改仅保存在内存中，刷新后会丢失。', 'error');
  }

  function readRaw() {
    if (!storageAvailable) return { ok: false, value: null };
    try {
      return { ok: true, value: storage.getItem(STORAGE_KEY) };
    } catch (err) {
      storageAvailable = false;
      enqueueNotice('读取本地数据失败，已切换为内存模式。', 'error');
      return { ok: false, value: null };
    }
  }

  function writeRaw(text) {
    if (!storageAvailable) {
      emitStatus('error');
      return false;
    }
    try {
      storage.setItem(STORAGE_KEY, text);
      writeFailureNotified = false;
      return true;
    } catch (err) {
      emitStatus('error');
      if (!writeFailureNotified) {
        writeFailureNotified = true;
        enqueueNotice('本地保存失败（可能是隐私模式或存储空间不足），请及时导出 JSON 备份。', 'error');
      }
      return false;
    }
  }

  function persistNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    emitStatus('saving');
    var text;
    try {
      text = JSON.stringify(state);
    } catch (err) {
      emitStatus('error');
      enqueueNotice('数据序列化失败，本次未写入本地存储。', 'error');
      return false;
    }
    var ok = writeRaw(text);
    emitStatus(ok ? 'saved' : 'error');
    return ok;
  }

  function scheduleSave() {
    emitStatus('saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      persistNow();
    }, SAVE_DELAY);
  }

  function saveNow() {
    return persistNow();
  }

  function backupBroken(rawText) {
    if (!storageAvailable) return;
    try {
      storage.setItem(BROKEN_KEY, rawText);
    } catch (err) { /* ignore quota errors */ }
  }

  function loadState() {
    var raw = readRaw();
    if (!raw.ok) {
      state = demoState();
      persistNow();
      return;
    }
    if (raw.value === null || raw.value === undefined || raw.value === '') {
      // First run — seed the demo data.
      state = demoState();
      persistNow();
      return;
    }
    var parsed = null;
    try {
      parsed = JSON.parse(raw.value);
    } catch (err) {
      parsed = null;
    }
    var normalized = normalizeState(parsed);
    if (!normalized) {
      backupBroken(raw.value);
      state = demoState();
      persistNow();
      enqueueNotice('本地数据无法识别，原始内容已备份到 tradedocs.broken，并重新载入演示数据。', 'error');
      return;
    }
    state = normalized;
  }

  /* ------------------------------------------------------------------ */
  /*  Mutation core                                                      */
  /* ------------------------------------------------------------------ */

  function mutate(fn, options) {
    var prev = state;
    var result = fn(state);
    state.meta.updatedAt = nowISO();
    emitChange(prev);
    if (options && options.persist === false) {
      // Caller explicitly opted out of writing.
    } else {
      saveNow();
    }
    return result;
  }

  function prefixOf(key) {
    var registry = TD.docs;
    if (registry && Array.isArray(registry.list)) {
      var entry = core.byId(registry.list, key) || registry.list.filter(function (doc) {
        return doc && doc.key === key;
      })[0];
      if (entry && entry.prefix) return str(entry.prefix);
    }
    return DOC_PREFIX[key] || str(key || 'DOC').toUpperCase();
  }

  function nextOrderNo(dateISO) {
    var year = (core.parseISO(dateISO) || new Date()).getFullYear();
    var pattern = new RegExp('^SO-' + year + '-(\\d+)$');
    var max = 0;
    state.orders.forEach(function (order) {
      var match = pattern.exec(str(order && order.no));
      if (match) max = Math.max(max, core.num(match[1], 0));
    });
    return core.docNo('SO', max + 1, dateISO || core.todayISO(), 4);
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  var api = {
    storageKey: STORAGE_KEY,
    brokenStorageKey: BROKEN_KEY,
    schemaVersion: SCHEMA_VERSION,
    docKeys: DOC_KEYS.slice(),

    getState: function () {
      return state;
    },

    setState: function (updater, options) {
      var opts = options || {};
      var prev = state;
      var draft = clone(state);
      var next;
      if (typeof updater === 'function') {
        var result = updater(draft);
        next = result === undefined ? draft : result;
      } else if (isPlainObject(updater)) {
        // Object form is treated as a partial patch of the current state.
        next = deepAssign(draft, updater);
      } else {
        return state;
      }
      if (!isPlainObject(next)) return state;
      var normalized = normalizeState(next);
      if (!normalized) {
        enqueueNotice('状态更新被忽略：数据结构不完整。', 'warn');
        return state;
      }
      normalized.meta.updatedAt = nowISO();
      state = normalized;
      emitChange(prev);
      if (opts.persist !== false) scheduleSave();
      return state;
    },

    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      changeListeners.push(fn);
      return function unsubscribe() {
        var index = changeListeners.indexOf(fn);
        if (index >= 0) changeListeners.splice(index, 1);
      };
    },

    onNotice: function (fn) {
      if (typeof fn !== 'function') return function () {};
      noticeListeners.push(fn);
      if (noticeQueue.length) {
        var queued = noticeQueue.slice();
        noticeQueue.length = 0;
        queued.forEach(function (notice) {
          try { fn(notice); } catch (err) { /* ignore */ }
        });
      }
      return function () {
        var index = noticeListeners.indexOf(fn);
        if (index >= 0) noticeListeners.splice(index, 1);
      };
    },

    onSaveState: function (fn) {
      if (typeof fn !== 'function') return function () {};
      saveStateListeners.push(fn);
      try { fn(lastSaveStatus.status); } catch (err) { /* ignore */ }
      return function () {
        var index = saveStateListeners.indexOf(fn);
        if (index >= 0) saveStateListeners.splice(index, 1);
      };
    },

    save: function () {
      return saveNow();
    },

    setLastRoute: function (route) {
      var value = str(route);
      if (!value || state.settings.ui.lastRoute === value) return;
      var prev = state;
      state.settings.ui.lastRoute = value;
      emitChange(prev);
      scheduleSave();
    },

    getOrder: function (id) {
      var order = core.byId(state.orders, str(id));
      return order ? clone(order) : null;
    },

    getCustomer: function (id) {
      var customer = core.byId(state.customers, str(id));
      return customer ? clone(customer) : null;
    },

    getProduct: function (id) {
      var product = core.byId(state.products, str(id));
      return product ? clone(product) : null;
    },

    newOrder: function (partial) {
      var defaults = state.settings.defaults || emptyDefaults();
      var today = core.todayISO();
      var order = normalizeOrder(deepAssign({
        id: core.uid('ord'),
        no: nextOrderNo(today),
        status: 'draft',
        date: today,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        buyer: {},
        currency: defaults.currency || 'USD',
        incoterm: defaults.incoterm || 'FOB',
        paymentTerms: defaults.paymentTerms || '',
        portOfLoading: defaults.portOfLoading || '',
        portOfDischarge: defaults.portOfDischarge || '',
        countryOfDestination: '',
        items: [],
        charges: { freight: 0, insurance: 0, other: 0, discount: 0 },
        cost: { exchangeRate: 7.1, domestic: 0, bank: 0, misc: 0 },
        docMeta: {},
        print: {
          selected: ['ci', 'pl'],
          bilingual: !!defaults.bilingual,
          showSeal: defaults.showSeal !== false
        }
      }, partial || {}));
      order.no = str(partial && partial.no) || order.no || nextOrderNo(order.date);
      mutate(function (st) {
        st.orders.unshift(order);
        st.activeOrderId = order.id;
      });
      return clone(order);
    },

    saveOrder: function (order) {
      if (!isPlainObject(order)) return null;
      var incoming = normalizeOrder(clone(order));
      if (!incoming.no) incoming.no = nextOrderNo(incoming.date);
      var idx = -1;
      for (var i = 0; i < state.orders.length; i++) {
        if (state.orders[i].id === incoming.id) { idx = i; break; }
      }
      if (idx >= 0) incoming.createdAt = state.orders[idx].createdAt || incoming.createdAt;
      incoming.updatedAt = nowISO();
      mutate(function (st) {
        if (idx >= 0) st.orders[idx] = incoming;
        else st.orders.unshift(incoming);
        st.activeOrderId = incoming.id;
      });
      return clone(incoming);
    },

    deleteOrder: function (id) {
      var target = str(id);
      var exists = !!core.byId(state.orders, target);
      if (!exists) return false;
      mutate(function (st) {
        st.orders = st.orders.filter(function (order) { return order.id !== target; });
        if (st.activeOrderId === target) st.activeOrderId = st.orders.length ? st.orders[0].id : '';
      });
      return true;
    },

    duplicateOrder: function (id) {
      var source = core.byId(state.orders, str(id));
      if (!source) return null;
      var copy = normalizeOrder(clone(source));
      copy.id = core.uid('ord');
      copy.no = nextOrderNo(copy.date);
      copy.status = 'draft';
      copy.createdAt = nowISO();
      copy.updatedAt = nowISO();
      copy.docMeta = {};
      copy.items = copy.items.map(function (item) {
        item.id = core.uid('item');
        return item;
      });
      mutate(function (st) {
        st.orders.unshift(copy);
        st.activeOrderId = copy.id;
      });
      return clone(copy);
    },

    ensureDocMeta: function (order, key) {
      if (!order || typeof order !== 'object' || !key) return { no: '', date: '' };
      var docKey = str(key);
      var prev = state;
      var stored = core.byId(state.orders, str(order.id));
      var target = stored || order;
      target.docMeta = isPlainObject(target.docMeta) ? target.docMeta : {};
      var current = target.docMeta[docKey];
      if (current && str(current.no)) {
        var existing = { no: str(current.no), date: str(current.date) || str(order.date) || core.todayISO() };
        if (stored && order !== stored) {
          order.docMeta = order.docMeta || {};
          order.docMeta[docKey] = { no: existing.no, date: existing.date };
        }
        return existing;
      }
      var numbering = state.settings.numbering;
      numbering.next = isPlainObject(numbering.next) ? numbering.next : {};
      var seq = Math.max(1, Math.floor(core.num(numbering.next[docKey], 1)));
      var dateISO = core.fmtDate(order.date, 'iso') || core.todayISO();
      var meta = {
        no: core.docNo(prefixOf(docKey), seq, dateISO, core.num(numbering.padding, 4) || 4),
        date: dateISO
      };
      target.docMeta[docKey] = meta;
      numbering.next[docKey] = seq + 1;
      if (stored && order !== stored) {
        order.docMeta = order.docMeta || {};
        order.docMeta[docKey] = { no: meta.no, date: meta.date };
      }
      state.meta.updatedAt = nowISO();
      emitChange(prev);
      saveNow();
      return clone(meta);
    },

    regenerateDocMeta: function (order, key) {
      if (!order || typeof order !== 'object' || !key) return { no: '', date: '' };
      var target = order;
      target.docMeta = isPlainObject(target.docMeta) ? target.docMeta : {};
      delete target.docMeta[key];
      var stored = core.byId(state.orders, str(order.id));
      if (stored && stored !== target) {
        stored.docMeta = isPlainObject(stored.docMeta) ? stored.docMeta : {};
        delete stored.docMeta[key];
      }
      return this.ensureDocMeta(target, key);
    },

    saveCustomer: function (customer) {
      if (!isPlainObject(customer)) return null;
      var incoming = normalizeCustomer(clone(customer));
      var idx = -1;
      for (var i = 0; i < state.customers.length; i++) {
        if (state.customers[i].id === incoming.id) { idx = i; break; }
      }
      mutate(function (st) {
        if (idx >= 0) st.customers[idx] = incoming;
        else st.customers.unshift(incoming);
      });
      return clone(incoming);
    },

    deleteCustomer: function (id) {
      var target = str(id);
      var exists = !!core.byId(state.customers, target);
      if (!exists) return false;
      mutate(function (st) {
        st.customers = st.customers.filter(function (customer) { return customer.id !== target; });
      });
      return true;
    },

    saveProduct: function (product) {
      if (!isPlainObject(product)) return null;
      var incoming = normalizeProduct(clone(product));
      var idx = -1;
      for (var i = 0; i < state.products.length; i++) {
        if (state.products[i].id === incoming.id) { idx = i; break; }
      }
      mutate(function (st) {
        if (idx >= 0) st.products[idx] = incoming;
        else st.products.unshift(incoming);
      });
      return clone(incoming);
    },

    deleteProduct: function (id) {
      var target = str(id);
      var exists = !!core.byId(state.products, target);
      if (!exists) return false;
      mutate(function (st) {
        st.products = st.products.filter(function (product) { return product.id !== target; });
      });
      return true;
    },

    saveSettings: function (patch) {
      if (!isPlainObject(patch)) return null;
      var prev = state;
      state.settings = normalizeSettings(deepAssign(state.settings, patch));
      state.meta.updatedAt = nowISO();
      emitChange(prev);
      saveNow();
      return clone(state.settings);
    },

    exportJSON: function () {
      return JSON.stringify(state, null, 2);
    },

    importJSON: function (text) {
      var source = str(text);
      if (!source.trim()) return { ok: false, message: '备份文件为空' };
      var parsed;
      try {
        parsed = JSON.parse(source);
      } catch (err) {
        return { ok: false, message: 'JSON 解析失败：' + (err && err.message ? err.message : '格式错误') };
      }
      var normalized = normalizeState(parsed);
      if (!normalized) {
        return { ok: false, message: '文件结构不正确：需要包含 settings、orders、customers、products 字段' };
      }
      var prev = state;
      normalized.meta.updatedAt = nowISO();
      state = normalized;
      emitChange(prev);
      saveNow();
      return {
        ok: true,
        message: '已导入 ' + normalized.orders.length + ' 个订单、' +
          normalized.customers.length + ' 个客户、' + normalized.products.length + ' 个产品'
      };
    },

    resetDemo: function () {
      var prev = state;
      state = demoState();
      emitChange(prev);
      saveNow();
      return clone(state);
    },

    clearAll: function () {
      var prev = state;
      state = emptyState();
      emitChange(prev);
      saveNow();
      return clone(state);
    },

    /** Flush any pending debounced write immediately. */
    flush: function () {
      if (saveTimer) persistNow();
      return state;
    }
  };

  TD.store = api;
  loadState();

  // Never lose a pending write when the page is left.
  if (root.addEventListener) {
    root.addEventListener('beforeunload', function () {
      if (saveTimer) persistNow();
    });
    root.addEventListener('pagehide', function () {
      if (saveTimer) persistNow();
    });
    root.document && root.document.addEventListener('visibilitychange', function () {
      if (root.document.visibilityState === 'hidden' && saveTimer) persistNow();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
