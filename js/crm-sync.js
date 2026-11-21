/*!
 * 单证通 TradeDocs — crm-sync.js
 * v1.2 客户通（CustomerCRM）同源只读同步引擎。
 *
 *  - 经典 UMD：浏览器挂到 TradeDocs.crmSync，Node 下 module.exports。
 *  - 无 DOM / 无网络 / 无第三方依赖 / 无 eval。
 *  - 只读 localStorage['customer-crm.v1']：绝不写入、修改或删除客户通数据。
 *  - Node 测试可注入 mock storage（只需 getItem）。
 *  - 契约来源：docs/CONTRACT.md §14。
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.TradeDocs = root.TradeDocs || {};
  root.TradeDocs.crmSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  /* ================================================================== */
  /*  0. 常量                                                            */
  /* ================================================================== */

  var VERSION = '1.2.0';
  var STORAGE_KEY = 'customer-crm.v1';
  var SOURCE = 'customer-crm';
  var DEAL_WON = '已成交';
  var DEAL_OPEN = '未成交';

  /* 客户通中文国名 → 英文国名（135 国，来自 CustomerCRM countries-map.json） */
  var COUNTRIES = {
    "中国": "China",
    "中国香港": "Hong Kong",
    "中国台湾": "Taiwan",
    "中国澳门": "Macau",
    "日本": "Japan",
    "韩国": "South Korea",
    "印度": "India",
    "越南": "Vietnam",
    "泰国": "Thailand",
    "马来西亚": "Malaysia",
    "新加坡": "Singapore",
    "印度尼西亚": "Indonesia",
    "菲律宾": "Philippines",
    "巴基斯坦": "Pakistan",
    "孟加拉国": "Bangladesh",
    "斯里兰卡": "Sri Lanka",
    "尼泊尔": "Nepal",
    "缅甸": "Myanmar",
    "柬埔寨": "Cambodia",
    "老挝": "Laos",
    "文莱": "Brunei",
    "蒙古": "Mongolia",
    "哈萨克斯坦": "Kazakhstan",
    "乌兹别克斯坦": "Uzbekistan",
    "阿联酋": "United Arab Emirates",
    "沙特阿拉伯": "Saudi Arabia",
    "卡塔尔": "Qatar",
    "科威特": "Kuwait",
    "阿曼": "Oman",
    "巴林": "Bahrain",
    "约旦": "Jordan",
    "以色列": "Israel",
    "黎巴嫩": "Lebanon",
    "伊拉克": "Iraq",
    "伊朗": "Iran",
    "土耳其": "Turkey",
    "塞浦路斯": "Cyprus",
    "叙利亚": "Syria",
    "也门": "Yemen",
    "阿富汗": "Afghanistan",
    "马尔代夫": "Maldives",
    "德国": "Germany",
    "法国": "France",
    "英国": "United Kingdom",
    "意大利": "Italy",
    "西班牙": "Spain",
    "葡萄牙": "Portugal",
    "荷兰": "Netherlands",
    "比利时": "Belgium",
    "卢森堡": "Luxembourg",
    "瑞士": "Switzerland",
    "奥地利": "Austria",
    "瑞典": "Sweden",
    "挪威": "Norway",
    "丹麦": "Denmark",
    "芬兰": "Finland",
    "冰岛": "Iceland",
    "爱尔兰": "Ireland",
    "波兰": "Poland",
    "捷克": "Czech Republic",
    "斯洛伐克": "Slovakia",
    "匈牙利": "Hungary",
    "罗马尼亚": "Romania",
    "保加利亚": "Bulgaria",
    "希腊": "Greece",
    "塞尔维亚": "Serbia",
    "克罗地亚": "Croatia",
    "斯洛文尼亚": "Slovenia",
    "波黑": "Bosnia and Herzegovina",
    "黑山": "Montenegro",
    "北马其顿": "North Macedonia",
    "阿尔巴尼亚": "Albania",
    "乌克兰": "Ukraine",
    "俄罗斯": "Russia",
    "白俄罗斯": "Belarus",
    "摩尔多瓦": "Moldova",
    "立陶宛": "Lithuania",
    "拉脱维亚": "Latvia",
    "爱沙尼亚": "Estonia",
    "美国": "United States",
    "加拿大": "Canada",
    "墨西哥": "Mexico",
    "巴西": "Brazil",
    "阿根廷": "Argentina",
    "智利": "Chile",
    "秘鲁": "Peru",
    "哥伦比亚": "Colombia",
    "厄瓜多尔": "Ecuador",
    "委内瑞拉": "Venezuela",
    "乌拉圭": "Uruguay",
    "巴拉圭": "Paraguay",
    "玻利维亚": "Bolivia",
    "圭亚那": "Guyana",
    "苏里南": "Suriname",
    "危地马拉": "Guatemala",
    "洪都拉斯": "Honduras",
    "萨尔瓦多": "El Salvador",
    "尼加拉瓜": "Nicaragua",
    "哥斯达黎加": "Costa Rica",
    "巴拿马": "Panama",
    "古巴": "Cuba",
    "多米尼加": "Dominican Republic",
    "海地": "Haiti",
    "牙买加": "Jamaica",
    "特立尼达和多巴哥": "Trinidad and Tobago",
    "巴哈马": "Bahamas",
    "巴巴多斯": "Barbados",
    "澳大利亚": "Australia",
    "新西兰": "New Zealand",
    "斐济": "Fiji",
    "巴布亚新几内亚": "Papua New Guinea",
    "南非": "South Africa",
    "埃及": "Egypt",
    "尼日利亚": "Nigeria",
    "肯尼亚": "Kenya",
    "摩洛哥": "Morocco",
    "阿尔及利亚": "Algeria",
    "突尼斯": "Tunisia",
    "利比亚": "Libya",
    "苏丹": "Sudan",
    "埃塞俄比亚": "Ethiopia",
    "加纳": "Ghana",
    "科特迪瓦": "Cote d'Ivoire",
    "塞内加尔": "Senegal",
    "喀麦隆": "Cameroon",
    "坦桑尼亚": "Tanzania",
    "乌干达": "Uganda",
    "安哥拉": "Angola",
    "莫桑比克": "Mozambique",
    "津巴布韦": "Zimbabwe",
    "赞比亚": "Zambia",
    "博茨瓦纳": "Botswana",
    "纳米比亚": "Namibia",
    "毛里求斯": "Mauritius",
    "马达加斯加": "Madagascar"
  };

  /* 合并时允许「仅补空」的本地字段（地址/联系方式类由用户手工维护） */
  var FILL_ONLY_KEYS = ['addressEn', 'addressCn', 'tel', 'email', 'taxId'];

  /* crmMeta 固定字段（契约 §14.2） */
  var META_KEYS = ['dealStatus', 'followupStatus', 'product', 'productModel', 'mainBusiness', 'firstInquiryAt', 'coreReason', 'savedAt'];

  /* read() 归一化保留的客户通记录字段 */
  var RECORD_KEYS = ['id', 'customerName', 'companyName', 'country', 'product', 'productModel',
    'mainBusiness', 'firstInquiryAt', 'followupStatus', 'dealStatus', 'coreReason', 'createdAt', 'updatedAt'];

  /* ================================================================== */
  /*  1. core 解析（core.js 先于本文件加载）                              */
  /* ================================================================== */

  var _core = null;

  function fallbackCore() {
    return {
      clone: function (value) {
        if (value === null || value === undefined) return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
      },
      uid: function (prefix) {
        return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      }
    };
  }

  function resolveCore() {
    if (_core) return _core;
    try {
      if (root && root.TradeDocs && root.TradeDocs.core && typeof root.TradeDocs.core.clone === 'function') {
        _core = root.TradeDocs.core;
        return _core;
      }
    } catch (e) { /* ignore */ }
    try {
      if (typeof require === 'function') {
        var c = require('./core.js');
        if (c && typeof c.clone === 'function') { _core = c; return _core; }
      }
    } catch (e2) { /* ignore */ }
    _core = fallbackCore();
    return _core;
  }

  /* ================================================================== */
  /*  2. 基础工具                                                        */
  /* ================================================================== */

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanStr(value) {
    if (value === null || value === undefined) return '';
    try {
      if (typeof value === 'string') {
        return value.replace(/[\u00a0\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
      }
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return '';
    } catch (e) {
      return '';
    }
  }

  function nowISO() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  function dedupeWarnings(list) {
    var out = [];
    var seen = {};
    (Array.isArray(list) ? list : []).forEach(function (warning) {
      if (!warning || typeof warning !== 'object') return;
      var code = cleanStr(warning.code) || 'crm-warning';
      var message = cleanStr(warning.message);
      if (!message) return;
      var key = code + '|' + message;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ code: code, message: message });
    });
    return out;
  }

  /** 公司/联系人去重键：忽略大小写、多余空格与常见中英文标点 */
  function normalizeKey(value) {
    var s = cleanStr(value).toLowerCase();
    if (!s) return '';
    s = s.replace(/[.,;:'"()[\]{}\-_/\\&+|·，。；：、（）【】《》“”‘’!?！？]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function defaultStorage() {
    try {
      if (root && root.localStorage) return root.localStorage;
    } catch (e) { /* localStorage 可能被禁用/抛 SecurityError */ }
    return null;
  }

  function sanitizeRecord(raw) {
    var record = {};
    RECORD_KEYS.forEach(function (key) { record[key] = cleanStr(raw[key]); });
    record.dealStatus = record.dealStatus || DEAL_OPEN;
    return record;
  }

  /* ================================================================== */
  /*  3. read(storage) — 只读客户通 localStorage                          */
  /* ================================================================== */

  function read(storage) {
    var warnings = [];
    var result = {
      available: false,
      reason: 'unavailable',
      savedAt: '',
      total: 0,
      won: [],
      customers: [],
      warnings: warnings
    };

    function warn(code, message) {
      warnings.push({ code: code, message: message });
    }

    try {
      var store = storage;
      if (store === undefined || store === null) store = defaultStorage();
      if (!store || typeof store.getItem !== 'function') {
        result.reason = 'unavailable';
        warn('crm-storage-unavailable', '当前环境无法访问本地存储（localStorage），未读取客户通数据。');
        return result;
      }

      var raw;
      try {
        raw = store.getItem(STORAGE_KEY);
      } catch (e) {
        result.reason = 'disabled';
        warn('crm-storage-disabled', '浏览器本地存储不可用或被禁用，无法读取客户通数据。');
        return result;
      }

      if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
        result.reason = 'missing';
        warn('crm-missing', '未检测到客户通数据（本浏览器未使用过客户通，或数据已被清除）。');
        return result;
      }

      var payload;
      try {
        payload = JSON.parse(raw);
      } catch (e2) {
        result.reason = 'corrupt';
        warn('crm-corrupt', '客户通数据格式损坏，无法解析（JSON 无效）。');
        return result;
      }

      var list = null;
      var savedAt = '';
      if (Array.isArray(payload)) {
        list = payload;
      } else if (isPlainObject(payload)) {
        if (Array.isArray(payload.customers)) list = payload.customers;
        else if (Array.isArray(payload.records)) list = payload.records;
        savedAt = cleanStr(payload.savedAt);
        if (payload.version !== undefined && Number(payload.version) !== 1) {
          warn('crm-version', '客户通数据版本为 ' + cleanStr(payload.version) + '，已按当前结构尽力解析。');
        }
      }
      if (!list) {
        result.reason = 'corrupt';
        warn('crm-corrupt', '客户通数据缺少客户列表（customers），无法解析。');
        return result;
      }

      var customers = [];
      var invalid = 0;
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (!isPlainObject(item)) { invalid++; continue; }
        customers.push(sanitizeRecord(item));
      }
      if (invalid > 0) {
        warn('crm-invalid-records', '客户通数据中有 ' + invalid + ' 条记录格式无效，已忽略。');
      }

      result.available = true;
      result.reason = 'ok';
      result.savedAt = savedAt;
      result.total = customers.length;
      result.customers = customers;
      result.won = customers.filter(function (record) { return record.dealStatus === DEAL_WON; });
      if (!customers.length) {
        warn('crm-empty', '客户通中暂无可同步的客户记录。');
      }
      return result;
    } catch (err) {
      result.available = false;
      result.reason = 'error';
      warn('crm-read-error', '读取客户通数据时出现异常：' + (err && err.message ? err.message : '未知错误'));
      return result;
    }
  }

  /* ================================================================== */
  /*  4. mapCustomer(record) — 客户通记录 → 单证通客户                    */
  /* ================================================================== */

  function mapCustomer(record, payloadSavedAt) {
    var src = isPlainObject(record) ? record : {};
    var customerName = cleanStr(src.customerName);
    var companyName = cleanStr(src.companyName);
    var nameEn = companyName || customerName;
    var countryRaw = cleanStr(src.country);
    var country = countryRaw ? (COUNTRIES[countryRaw] || countryRaw) : '';
    var externalId = cleanStr(src.id);
    var code = externalId ? 'CRM-' + externalId.slice(-6).toUpperCase() : '';
    var savedAt = cleanStr(payloadSavedAt) || cleanStr(src.savedAt) || cleanStr(src.updatedAt);

    return {
      id: '',
      code: code,
      nameEn: nameEn,
      nameCn: '',
      addressEn: '',
      addressCn: '',
      country: country,
      contact: customerName,
      tel: '',
      email: '',
      taxId: '',
      source: SOURCE,
      externalId: externalId,
      crmMeta: {
        dealStatus: cleanStr(src.dealStatus) || DEAL_OPEN,
        followupStatus: cleanStr(src.followupStatus),
        product: cleanStr(src.product),
        productModel: cleanStr(src.productModel),
        mainBusiness: cleanStr(src.mainBusiness),
        firstInquiryAt: cleanStr(src.firstInquiryAt),
        coreReason: cleanStr(src.coreReason),
        savedAt: savedAt
      },
      syncedAt: nowISO()
    };
  }

  /* ================================================================== */
  /*  5. merge(existing, records, options) — 纯函数合并                   */
  /* ================================================================== */

  function metaEquals(left, right) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    for (var i = 0; i < META_KEYS.length; i++) {
      var key = META_KEYS[i];
      if (cleanStr(left[key]) !== cleanStr(right[key])) return false;
    }
    return true;
  }

  function displayNameOf(customer) {
    return cleanStr(customer.nameEn) || cleanStr(customer.nameCn) || cleanStr(customer.contact);
  }

  /**
   * 合并客户通记录到单证通客户数组。
   * - 纯函数：深拷贝 existingCustomers，不修改入参。
   * - 返回 { customers, added, updated, linked, skipped, warnings }。
   * - onlyWon（默认 true）：仅处理 dealStatus === '已成交'。
   * - updateExisting（默认 false）：false=自动同步，只补空字段、不覆盖本地值；
   *   true=手动同步，更新 nameEn/contact/country/crmMeta，地址/联系方式仅补空。
   * - selectedIds：null=全部；数组=只处理对应客户通 record.id。
   * - linked 与 updated 互斥计数：首次建立关联计 linked，已关联后的数据变更计 updated。
   * - skipped：未应用记录数（未成交/未选中/无效/已同步无变化/冲突）。
   */
  function merge(existingCustomers, records, options) {
    var core = resolveCore();
    var opts = isPlainObject(options) ? options : {};
    var onlyWon = opts.onlyWon !== false;
    var updateExisting = opts.updateExisting === true;
    var payloadSavedAt = cleanStr(opts.savedAt);
    var selectedIds = null;
    if (Array.isArray(opts.selectedIds)) {
      selectedIds = {};
      opts.selectedIds.forEach(function (id) {
        var key = cleanStr(id);
        if (key) selectedIds[key] = 1;
      });
    }

    var customers = [];
    var sourceList = Array.isArray(existingCustomers) ? existingCustomers : [];
    try {
      var cloned = core.clone(sourceList);
      if (Array.isArray(cloned)) customers = cloned;
    } catch (e) {
      try { customers = JSON.parse(JSON.stringify(sourceList)); } catch (e2) { customers = sourceList.slice(); }
    }
    customers = customers.map(function (customer) { return isPlainObject(customer) ? customer : {}; });

    var added = 0;
    var updated = 0;
    var linked = 0;
    var skipped = 0;
    var warnings = [];

    function warn(code, message) { warnings.push({ code: code, message: message }); }

    var byExternal = {};
    var byName = {};

    function indexCustomer(customer, index) {
      if (!isPlainObject(customer)) return;
      var externalId = cleanStr(customer.externalId);
      if (externalId && byExternal[externalId] === undefined) byExternal[externalId] = index;
      var keys = [customer.nameEn, customer.nameCn, customer.contact];
      for (var i = 0; i < keys.length; i++) {
        var nameKey = normalizeKey(keys[i]);
        if (nameKey && byName[nameKey] === undefined) byName[nameKey] = index;
      }
    }
    customers.forEach(indexCustomer);

    var input = Array.isArray(records) ? records : [];
    for (var r = 0; r < input.length; r++) {
      var raw = input[r];
      if (!isPlainObject(raw)) {
        skipped++;
        warn('crm-invalid-record', '客户通记录格式无效，已跳过。');
        continue;
      }
      try {
        var recordId = cleanStr(raw.id);
        if (selectedIds && (!recordId || !selectedIds[recordId])) { skipped++; continue; }
        var dealStatus = cleanStr(raw.dealStatus) || DEAL_OPEN;
        if (onlyWon && dealStatus !== DEAL_WON) { skipped++; continue; }

        var mapped = mapCustomer(raw, payloadSavedAt);
        if (!mapped.nameEn && !mapped.contact) {
          skipped++;
          warn('crm-no-name', '客户通记录缺少公司名和联系人，已跳过。');
          continue;
        }

        var matchKey = normalizeKey(cleanStr(raw.companyName) || cleanStr(raw.customerName) || mapped.nameEn || mapped.contact);
        var existingIndex = -1;
        if (mapped.externalId && byExternal[mapped.externalId] !== undefined) {
          existingIndex = byExternal[mapped.externalId];
        }
        if (existingIndex < 0 && matchKey && byName[matchKey] !== undefined) {
          existingIndex = byName[matchKey];
        }
        if (existingIndex < 0) {
          var altKeys = [normalizeKey(mapped.nameEn), normalizeKey(mapped.contact)];
          for (var a = 0; a < altKeys.length; a++) {
            if (altKeys[a] && byName[altKeys[a]] !== undefined) { existingIndex = byName[altKeys[a]]; break; }
          }
        }
        if (existingIndex >= customers.length || (existingIndex >= 0 && !isPlainObject(customers[existingIndex]))) {
          existingIndex = -1;
        }

        if (existingIndex < 0) {
          var newCustomer = mapped;
          newCustomer.id = core.uid('cust_crm_');
          newCustomer.syncedAt = nowISO();
          customers.push(newCustomer);
          indexCustomer(newCustomer, customers.length - 1);
          added++;
          continue;
        }

        var target = customers[existingIndex];
        var targetExternal = cleanStr(target.externalId);
        if (targetExternal && mapped.externalId && targetExternal !== mapped.externalId) {
          skipped++;
          warn('crm-conflict', '客户「' + (displayNameOf(target) || '未命名') + '」已关联客户通其他记录，本次未处理。');
          continue;
        }

        var hadLink = !!targetExternal;
        var changes = 0;

        if (updateExisting) {
          // 手动同步：更新 CRM 所属字段（不写空值，避免清空本地资料）
          ['nameEn', 'contact'].forEach(function (key) {
            var desired = cleanStr(mapped[key]);
            if (desired && cleanStr(target[key]) !== desired) {
              target[key] = desired;
              changes++;
            }
          });
          var desiredCountry = cleanStr(mapped.country);
          if (desiredCountry && cleanStr(target.country) !== desiredCountry) {
            target.country = desiredCountry;
            changes++;
          }
          FILL_ONLY_KEYS.forEach(function (key) {
            var desired = cleanStr(mapped[key]);
            if (desired && !cleanStr(target[key])) {
              target[key] = desired;
              changes++;
            }
          });
        } else {
          // 自动同步：只补空字段，绝不覆盖用户已填内容
          ['nameEn', 'contact', 'country'].forEach(function (key) {
            var desired = cleanStr(mapped[key]);
            if (desired && !cleanStr(target[key])) {
              target[key] = desired;
              changes++;
            }
          });
        }

        // CRM 归属标记字段：始终维护，但仅在真正变化时计为变更
        if (mapped.externalId && cleanStr(target.externalId) !== mapped.externalId) {
          target.externalId = mapped.externalId;
          changes++;
        }
        if (!cleanStr(target.source) && mapped.source) {
          target.source = mapped.source;
          changes++;
        }
        if (!isPlainObject(target.crmMeta) || !metaEquals(target.crmMeta, mapped.crmMeta)) {
          target.crmMeta = mapped.crmMeta;
          changes++;
        }

        if (changes > 0) {
          target.syncedAt = nowISO();
          if (!hadLink && mapped.externalId) linked++;
          else updated++;
        } else {
          skipped++;
        }
      } catch (err) {
        skipped++;
        warn('crm-invalid-record', '处理客户通记录时出现异常，已跳过：' + (err && err.message ? err.message : '未知错误'));
      }
    }

    return {
      customers: customers,
      added: added,
      updated: updated,
      linked: linked,
      skipped: skipped,
      warnings: dedupeWarnings(warnings)
    };
  }

  /* ================================================================== */
  /*  6. sync(storage, existing, options) — read + merge 便捷入口         */
  /* ================================================================== */

  function sync(storage, existingCustomers, options) {
    var opts = isPlainObject(options) ? options : {};
    var readResult = read(storage);
    var mergeResult = merge(existingCustomers, readResult.customers, {
      onlyWon: opts.onlyWon !== false,
      updateExisting: opts.updateExisting === true,
      selectedIds: opts.selectedIds === undefined ? null : opts.selectedIds,
      savedAt: readResult.savedAt
    });
    return {
      customers: mergeResult.customers,
      added: mergeResult.added,
      updated: mergeResult.updated,
      linked: mergeResult.linked,
      skipped: mergeResult.skipped,
      warnings: dedupeWarnings((readResult.warnings || []).concat(mergeResult.warnings || [])),
      available: readResult.available,
      reason: readResult.reason,
      savedAt: readResult.savedAt,
      total: readResult.total,
      won: readResult.won,
      wonCount: readResult.won.length
    };
  }

  /* ================================================================== */
  /*  7. 公共 API                                                        */
  /* ================================================================== */

  return {
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    COUNTRIES: COUNTRIES,
    read: read,
    mapCustomer: mapCustomer,
    merge: merge,
    sync: sync
  };
});
