/*!
 * 单证通 TradeDocs — demo.js
 * Realistic demo dataset used on first launch and in QA/screenshots.
 * All companies, people and contact details are fictional.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.TradeDocs = root.TradeDocs || {};
  root.TradeDocs.demo = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function shiftISO(iso, days) {
    var parts = String(iso).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function svgData(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var LOGO_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">',
    '<rect width="96" height="96" rx="20" fill="#0b2239"/>',
    '<path d="M48 21v12M28 33l8 8M68 33l-8 8M21 55h54" stroke="#fbbf24" stroke-width="4" stroke-linecap="round" fill="none"/>',
    '<circle cx="48" cy="49" r="14" fill="#f59e0b"/>',
    '<path d="M20 64c6-5 12-5 18 0s12 5 18 0 12-5 18 0" stroke="#2dd4bf" stroke-width="5" fill="none" stroke-linecap="round"/>',
    '<path d="M20 75c6-5 12-5 18 0s12 5 18 0 12-5 18 0" stroke="#0f766e" stroke-width="5" fill="none" stroke-linecap="round"/>',
    '</svg>'
  ].join('');

  var SEAL_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">',
    '<g fill="none" stroke="#c0392b">',
    '<circle cx="120" cy="120" r="112" stroke-width="6"/>',
    '<circle cx="120" cy="120" r="96" stroke-width="2"/>',
    '</g>',
    '<text x="120" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" letter-spacing="2" fill="#c0392b">NINGBO SUNRISE</text>',
    '<text x="120" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" letter-spacing="1" fill="#c0392b">IMP. &amp; EXP. CO., LTD.</text>',
    '<path d="M120 108l7 15 17 2-12 12 3 17-15-8-15 8 3-17-12-12 17-2z" fill="#c0392b"/>',
    '<text x="120" y="172" text-anchor="middle" font-family="Microsoft YaHei, SimHei, sans-serif" font-size="25" letter-spacing="4" fill="#c0392b">出口业务专用章</text>',
    '<text x="120" y="198" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" letter-spacing="1" fill="#c0392b">EXPORT DEPARTMENT</text>',
    '</svg>'
  ].join('');

  function baseSettings(today) {
    return {
      company: {
        nameEn: 'NINGBO SUNRISE IMP. & EXP. CO., LTD.',
        nameCn: '宁波晨阳进出口有限公司',
        addressEn: '88 Haishu Road, Haishu District, Ningbo 315000, Zhejiang, China',
        addressCn: '中国浙江省宁波市海曙区海曙路88号 315000',
        city: 'Ningbo',
        country: 'CHINA',
        tel: '+86 574 8888 6621',
        fax: '+86 574 8888 6622',
        email: 'sales@sunrise-trade.example',
        website: 'www.sunrise-trade.example',
        taxId: '91330203MA2H8X6K7T',
        signer: 'Emily Chen',
        signerTitle: 'Export Manager',
        logo: svgData(LOGO_SVG),
        seal: svgData(SEAL_SVG)
      },
      bank: {
        beneficiaryEn: 'NINGBO SUNRISE IMP. & EXP. CO., LTD.',
        bankNameEn: 'BANK OF CHINA, NINGBO BRANCH',
        bankAddressEn: '139 Yaohang Street, Haishu District, Ningbo 315000, China',
        accountNo: '3901 5588 0012 3456',
        swift: 'BOCNCNBJ310',
        iban: '',
        bankCode: '',
        intermediary: ''
      },
      defaults: {
        currency: 'USD',
        incoterm: 'FOB',
        paymentTerms: 'T/T 30% deposit, balance against copy of B/L',
        portOfLoading: 'NINGBO, CHINA',
        portOfDischarge: 'LOS ANGELES, USA',
        countryOfOrigin: 'CHINA',
        declaration: 'WE HEREBY CERTIFY THAT THE GOODS MENTIONED ABOVE ARE OF CHINESE ORIGIN AND THAT THE CONTENTS OF THIS INVOICE ARE TRUE AND CORRECT.',
        certStatement: 'WE HEREBY CERTIFY THAT THE GOODS SHIPPED ARE IN CONFORMITY WITH THE CONTRACT, AND THAT ALL DOCUMENTS REQUIRED UNDER THE CREDIT HAVE BEEN PRESENTED / WILL BE PRESENTED STRICTLY IN ACCORDANCE WITH ITS TERMS.',
        bilingual: false,
        showSeal: true
      },
      numbering: {
        next: { ci: 88, pl: 88, pi: 88, sc: 88, qt: 88, bk: 88, sa: 88, co: 88, bc: 88, dr: 88, cd: 88, cs: 88 },
        padding: 4
      },
      ui: { lastRoute: '#/dashboard' }
    };
  }

  function customers() {
    return [
      {
        id: 'cust_atlantic',
        code: 'C-USA-001',
        nameEn: 'ATLANTIC HOME GOODS LLC',
        nameCn: '',
        addressEn: '350 Fifth Avenue, Suite 2100\nNew York, NY 10118\nUnited States',
        addressCn: '',
        country: 'UNITED STATES',
        contact: 'Michael Reed',
        tel: '+1 212 555 0148',
        email: 'purchasing@atlantichome.example',
        taxId: '12-3456789'
      },
      {
        id: 'cust_nordlicht',
        code: 'C-DEU-002',
        nameEn: 'NORDLICHT HANDELS GMBH',
        nameCn: '北光贸易有限公司',
        addressEn: 'Hafenstrasse 27\n20359 Hamburg\nGermany',
        addressCn: '',
        country: 'GERMANY',
        contact: 'Lena Fischer',
        tel: '+49 40 555 0192',
        email: 'einkauf@nordlicht-handels.example',
        taxId: 'DE 812 445 907'
      },
      {
        id: 'cust_kobe',
        code: 'C-JPN-003',
        nameEn: 'KOBE TRADING CO., LTD.',
        nameCn: '神户贸易株式会社',
        addressEn: '2-11-3 Sannomiya, Chuo-ku\nKobe 650-0021\nJapan',
        addressCn: '',
        country: 'JAPAN',
        contact: 'Hiroshi Tanaka',
        tel: '+81 78 555 0136',
        email: 'import@kobetrading.example',
        taxId: '9140001000000'
      },
      {
        id: 'cust_alnoor',
        code: 'C-ARE-004',
        nameEn: 'AL NOOR TRADING LLC',
        nameCn: '',
        addressEn: 'Warehouse 14, Jebel Ali Free Zone\nDubai\nUnited Arab Emirates',
        addressCn: '',
        country: 'UNITED ARAB EMIRATES',
        contact: 'Omar Al Mansoori',
        tel: '+971 4 555 0188',
        email: 'purchase@alnoor-trading.example',
        taxId: '100123456700003'
      }
    ];
  }

  function products() {
    return [
      {
        id: 'prod_mug', code: 'MUG-12OZ', nameEn: 'Ceramic Mug 12 oz', nameCn: '陶瓷马克杯 12 盎司',
        hsCode: '6912.00.00', unit: 'PCS', price: 1.85, currency: 'USD', pkg: 'CARTON',
        qtyPerCarton: 24, netWeight: 8, grossWeight: 9.2, cbm: 0.035, origin: 'CHINA',
        specEn: 'Glazed ceramic, white, 12 oz / 350 ml', remarks: ''
      },
      {
        id: 'prod_board', code: 'CUT-BAM-3', nameEn: 'Bamboo Cutting Board Set', nameCn: '竹制砧板三件套',
        hsCode: '4419.19.00', unit: 'SET', price: 6.40, currency: 'USD', pkg: 'CARTON',
        qtyPerCarton: 12, netWeight: 11.5, grossWeight: 13, cbm: 0.06, origin: 'CHINA',
        specEn: '3-piece set, natural bamboo, food-safe oil finish', remarks: ''
      },
      {
        id: 'prod_bottle', code: 'BTL-500', nameEn: 'Double-wall Stainless Steel Bottle 500 ml', nameCn: '双层不锈钢保温杯 500ml',
        hsCode: '7323.93.00', unit: 'PCS', price: 3.25, currency: 'USD', pkg: 'CARTON',
        qtyPerCarton: 36, netWeight: 9.5, grossWeight: 11.2, cbm: 0.045, origin: 'CHINA',
        specEn: '18/8 stainless steel, 500 ml, matte finish', remarks: ''
      },
      {
        id: 'prod_tote', code: 'BAG-CVS', nameEn: 'Cotton Canvas Tote Bag', nameCn: '全棉帆布手提袋',
        hsCode: '4202.92.00', unit: 'PCS', price: 0.92, currency: 'USD', pkg: 'CARTON',
        qtyPerCarton: 100, netWeight: 7, grossWeight: 8.2, cbm: 0.04, origin: 'CHINA',
        specEn: '12 oz cotton canvas, 38 × 42 cm, natural color', remarks: ''
      },
      {
        id: 'prod_giftbox', code: 'BOX-KRAFT', nameEn: 'Kraft Gift Box (Flat-packed)', nameCn: '牛皮纸礼品盒（平板）',
        hsCode: '4819.10.00', unit: 'PCS', price: 0.31, currency: 'USD', pkg: 'CARTON',
        qtyPerCarton: 200, netWeight: 6.5, grossWeight: 7.4, cbm: 0.055, origin: 'CHINA',
        specEn: 'Brown kraft paper, 25 × 20 × 10 cm, flat-packed', remarks: ''
      },
      {
        id: 'prod_lamp', code: 'LED-DK20', nameEn: 'LED Desk Lamp', nameCn: 'LED 护眼台灯',
        hsCode: '9405.42.00', unit: 'PCS', price: 12.90, currency: 'EUR', pkg: 'CARTON',
        qtyPerCarton: 20, netWeight: 8.5, grossWeight: 10, cbm: 0.078, origin: 'CHINA',
        specEn: '5 W, 3 color temperatures, touch dimmer, EU plug', remarks: ''
      },
      {
        id: 'prod_jar', code: 'JAR-500', nameEn: 'Glass Storage Jar 500 ml', nameCn: '玻璃储物罐 500ml',
        hsCode: '7010.90.00', unit: 'PCS', price: 1.15, currency: 'USD', pkg: 'CARTON',
        qtyPerCarton: 48, netWeight: 10, grossWeight: 11.5, cbm: 0.05, origin: 'CHINA',
        specEn: 'Soda-lime glass, bamboo lid, silicone seal', remarks: ''
      },
      {
        id: 'prod_mat', code: 'MAT-SIL', nameEn: 'Silicone Baking Mat', nameCn: '硅胶烘焙垫',
        hsCode: '3924.10.00', unit: 'PCS', price: 0.78, currency: 'USD', pkg: 'CARTON',
        qtyPerCarton: 120, netWeight: 6, grossWeight: 7, cbm: 0.03, origin: 'CHINA',
        specEn: 'Food-grade silicone, 40 × 30 cm, reusable', remarks: ''
      }
    ];
  }

  function orderItem(product, overrides) {
    return Object.assign({
      id: 'item_' + product.id,
      productId: product.id,
      code: product.code,
      nameEn: product.nameEn,
      nameCn: product.nameCn,
      hsCode: product.hsCode,
      origin: product.origin,
      unit: product.unit,
      qty: 0,
      unitPrice: product.price,
      cartons: 0,
      qtyPerCarton: product.qtyPerCarton,
      netWeight: product.netWeight,
      grossWeight: product.grossWeight,
      cbm: product.cbm,
      costPrice: 0,
      remarks: ''
    }, overrides || {});
  }

  function data() {
    var today = isoToday();
    var year = today.slice(0, 4);
    var prods = products();
    var byCode = {};
    prods.forEach(function (p) { byCode[p.id] = p; });

    var order1Items = [
      orderItem(byCode.prod_mug, { qty: 2400, unitPrice: 1.85, cartons: 100, costPrice: 8.4 }),
      orderItem(byCode.prod_board, { qty: 1200, unitPrice: 6.40, cartons: 100, costPrice: 28.0 }),
      orderItem(byCode.prod_bottle, { qty: 3600, unitPrice: 3.25, cartons: 100, costPrice: 12.8 }),
      orderItem(byCode.prod_tote, { qty: 5000, unitPrice: 0.92, cartons: 50, costPrice: 4.1 }),
      orderItem(byCode.prod_giftbox, { qty: 8000, unitPrice: 0.31, cartons: 40, costPrice: 1.35 })
    ];
    var itemIds = ['mug', 'board', 'bottle', 'tote', 'giftbox'];
    order1Items.forEach(function (it, i) { it.id = 'item_demo1_' + itemIds[i]; });

    var order2Items = [orderItem(byCode.prod_lamp, { qty: 1500, unitPrice: 12.90, cartons: 75, costPrice: 78.0 })];
    order2Items[0].id = 'item_demo2_lamp';

    var order3Items = [
      orderItem(byCode.prod_jar, { qty: 4800, unitPrice: 320, cartons: 100, costPrice: 9.5 }),
      orderItem(byCode.prod_mat, { qty: 6000, unitPrice: 260, cartons: 50, costPrice: 3.2 })
    ];
    order3Items[0].id = 'item_demo3_jar';
    order3Items[1].id = 'item_demo3_mat';

    var customersList = customers();
    var byCust = {};
    customersList.forEach(function (c) { byCust[c.id] = c; });

    function buyerOf(cust) {
      return {
        nameEn: cust.nameEn, nameCn: cust.nameCn,
        addressEn: cust.addressEn, addressCn: cust.addressCn,
        country: cust.country, contact: cust.contact,
        tel: cust.tel, email: cust.email, taxId: cust.taxId
      };
    }

    function meta(prefix, seq) {
      return {
        no: prefix.toUpperCase() + '-' + year + '-' + String(seq).padStart(4, '0'),
        date: shiftISO(today, -2)
      };
    }

    var order1Meta = {
      ci: meta('ci', 87), pl: meta('pl', 87), pi: meta('pi', 87), sc: meta('sc', 87),
      qt: meta('qt', 87), bk: meta('bk', 87), sa: meta('sa', 87), co: meta('co', 87),
      bc: meta('bc', 87), dr: meta('dr', 87), cd: meta('cd', 87), cs: meta('cs', 87)
    };
    order1Meta.co.date = shiftISO(today, -1);
    order1Meta.cd.date = today;
    order1Meta.cs.date = today;

    var order1 = {
      id: 'ord_demo_001',
      no: 'SO-' + year + '-0118',
      status: 'draft',
      date: shiftISO(today, -3),
      createdAt: shiftISO(today, -3) + 'T09:20:00',
      updatedAt: shiftISO(today, -1) + 'T16:40:00',
      customerId: 'cust_atlantic',
      buyer: buyerOf(byCust.cust_atlantic),
      consignee: 'SAME AS BUYER',
      notifyParty: 'SAME AS CONSIGNEE',
      currency: 'USD',
      incoterm: 'CIF',
      paymentTerms: 'BY IRREVOCABLE L/C AT SIGHT',
      portOfLoading: 'NINGBO, CHINA',
      portOfDischarge: 'LOS ANGELES, USA',
      finalDestination: 'LOS ANGELES, CA, USA',
      countryOfDestination: 'UNITED STATES',
      transportMode: 'SEA',
      vessel: 'OOCL SUNRISE',
      voyage: '026E',
      containerNo: 'OOLU1234567',
      sealNo: 'CN8844221',
      blNo: 'OOLU22661188',
      bookingNo: 'NGB2609157',
      lcNo: 'LC26USA0091',
      lcDate: shiftISO(today, -10),
      lcIssuingBank: 'JPMORGAN CHASE BANK, N.A., NEW YORK',
      etd: shiftISO(today, 20),
      eta: shiftISO(today, 34),
      shippingMarks: 'ATLANTIC HOME GOODS\nPO NO.: AH-26-0442\nC/NO.: 1-390\nMADE IN CHINA',
      remarks: 'PLEASE QUOTE OUR ORDER NO. ' + 'SO-' + year + '-0118 ON ALL DOCUMENTS.\nALL GOODS ARE PACKED IN EXPORT-STANDARD CARTONS.',
      items: order1Items,
      charges: { freight: 2150, insurance: 340, other: 0, discount: 0 },
      cost: { exchangeRate: 7.12, domestic: 4200, bank: 850, misc: 0 },
      docMeta: order1Meta,
      print: { selected: ['ci', 'pl', 'sc', 'co'], bilingual: false, showSeal: true }
    };

    var order2 = {
      id: 'ord_demo_002',
      no: 'SO-' + year + '-0119',
      status: 'draft',
      date: shiftISO(today, -1),
      createdAt: shiftISO(today, -1) + 'T11:05:00',
      updatedAt: shiftISO(today, -1) + 'T11:35:00',
      customerId: 'cust_nordlicht',
      buyer: buyerOf(byCust.cust_nordlicht),
      consignee: 'SAME AS BUYER',
      notifyParty: 'SAME AS CONSIGNEE',
      currency: 'EUR',
      incoterm: 'FOB',
      paymentTerms: 'T/T 30% DEPOSIT, BALANCE AGAINST COPY OF B/L',
      portOfLoading: 'NINGBO, CHINA',
      portOfDischarge: 'HAMBURG, GERMANY',
      finalDestination: 'HAMBURG, GERMANY',
      countryOfDestination: 'GERMANY',
      transportMode: 'SEA',
      vessel: 'COSCO HARMONY',
      voyage: '031W',
      containerNo: '',
      sealNo: '',
      blNo: '',
      bookingNo: '',
      lcNo: '',
      lcDate: '',
      lcIssuingBank: '',
      etd: shiftISO(today, 28),
      eta: shiftISO(today, 52),
      shippingMarks: 'NORDLICHT / HAMBURG\nPO NO.: NL-88421\nC/NO.: 1-75',
      remarks: 'EU PLUG VERSION. MANUAL IN GERMAN AND ENGLISH.\nCE / RoHS COMPLIANT.',
      items: order2Items,
      charges: { freight: 0, insurance: 0, other: 0, discount: 0 },
      cost: { exchangeRate: 7.9, domestic: 2800, bank: 500, misc: 0 },
      docMeta: {
        pi: meta('pi', 88),
        ci: meta('ci', 88),
        pl: meta('pl', 88)
      },
      print: { selected: ['pi', 'ci', 'pl'], bilingual: false, showSeal: true }
    };

    var order3 = {
      id: 'ord_demo_003',
      no: 'SO-' + year + '-0107',
      status: 'done',
      date: shiftISO(today, -35),
      createdAt: shiftISO(today, -35) + 'T10:00:00',
      updatedAt: shiftISO(today, -7) + 'T09:10:00',
      customerId: 'cust_kobe',
      buyer: buyerOf(byCust.cust_kobe),
      consignee: 'SAME AS BUYER',
      notifyParty: 'SAME AS CONSIGNEE',
      currency: 'JPY',
      incoterm: 'FOB',
      paymentTerms: 'T/T IN ADVANCE',
      portOfLoading: 'NINGBO, CHINA',
      portOfDischarge: 'KOBE, JAPAN',
      finalDestination: 'KOBE, JAPAN',
      countryOfDestination: 'JAPAN',
      transportMode: 'SEA',
      vessel: 'SITC KOBE',
      voyage: 'V.2519',
      containerNo: '',
      sealNo: '',
      blNo: '',
      bookingNo: '',
      lcNo: '',
      lcDate: '',
      lcIssuingBank: '',
      etd: shiftISO(today, -21),
      eta: shiftISO(today, -7),
      shippingMarks: 'KOBE TRADING\nC/NO.: 1-150\nMADE IN CHINA',
      remarks: 'SHIPPED AND COMPLETED.',
      items: order3Items,
      charges: { freight: 0, insurance: 0, other: 0, discount: 0 },
      cost: { exchangeRate: 0.048, domestic: 1800, bank: 0, misc: 0 },
      docMeta: {},
      print: { selected: ['ci', 'pl'], bilingual: false, showSeal: true }
    };

    return {
      schemaVersion: 1,
      settings: baseSettings(today),
      customers: customersList,
      products: prods,
      orders: [order1, order2, order3],
      activeOrderId: order1.id,
      meta: {
        createdAt: today + 'T08:00:00',
        updatedAt: today + 'T08:00:00',
        demo: true
      }
    };
  }

  return { data: data };
});
