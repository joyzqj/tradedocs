# 单证通 TradeDocs — 开发契约 (v1)

> 本文件是所有实现者共同遵守的接口契约。**任何跨模块改动先改契约，再通知 Lead。**
> 项目根目录：`C:\Users\Administrator\Desktop\Global Country\trade-docs`
> 编码：UTF-8（无 BOM）。换行：LF。UI 文案：简体中文；单证默认英文，可中英对照。

## 1. 产品目标

一套**免部署、零后端、纯前端**的外贸单证工作台。用户直接双击 `index.html` 或把文件夹放到任意静态空间即可使用；数据保存在浏览器 `localStorage`，一键打印/另存 PDF。

核心流程：**建订单 → 填买方/货物/运输 → 勾选单证 → 一键生成 → 预览/打印 PDF**。
订单是唯一数据源：商业发票、装箱单、形式发票、销售合同、报价单、订舱委托书、装运通知、原产地证、受益人证明、汇票、报关资料清单、成本核算表共享同一订单数据。

硬性约束：
- 无构建步骤、无 npm 依赖、无 CDN、无网络请求、无后端。
- 所有脚本为经典 `<script>`（非 ES module），保证 `file://` 直接打开可用。
- 浏览器：Chrome/Edge 100+、Safari 15.4+、Firefox 100+。
- 桌面优先，≥390px 可用；A4 预览可横向滚动，不得让整页横向溢出。
- 所有用户输入输出必须 HTML 转义（`core.esc`），禁止把未转义字符串拼进 innerHTML。

## 2. 文件所有权（只写自己的文件）

| 所有者 | 文件 |
|---|---|
| **Lead** | `js/core.js`, `js/demo.js`, `docs/CONTRACT.md`, `build_single_file.py`, `README.md`, `dist/*` |
| **ui-dev** | `index.html`, `css/app.css`, `js/store.js`, `js/app.js` |
| **doc-dev** | `js/doc-templates.js`, `css/print.css` |
| **recognize-dev** | `js/recognize.js`（v1.1 智能识别） |
| **qa** | `tests/*`, `screenshots/*`（只读应用文件） |

临时文件只能放 `trade-docs/.scratch/<自己的名字>/`。不要改别人的文件；集成问题报给 Lead。
加载顺序固定：`core.js → demo.js → recognize.js → doc-templates.js → store.js → app.js`。

## 3. 全局命名空间

所有模块挂到 `window.TradeDocs`，并在 Node 下可选 `module.exports`（core / demo / doc-templates 需要，便于单测）：

```js
window.TradeDocs = {
  core,   // Lead
  demo,   // Lead: { data(): state }
  docs,   // doc-dev: { version, list, groups, get(key), render(key, ctx) }
  store,  // ui-dev
  app,    // ui-dev
  test    // ui-dev: 测试辅助（见 §8）
};
```

## 4. 数据模型（localStorage key: `tradedocs.v1`）

```js
state = {
  schemaVersion: 1,
  settings: {
    company: {
      nameEn, nameCn, addressEn, addressCn, city, country, tel, fax, email, website,
      taxId, signer, signerTitle,
      logo: "",   // dataURL 或 ""
      seal: ""    // dataURL 或 ""
    },
    bank: {
      beneficiaryEn, bankNameEn, bankAddressEn, accountNo, swift, iban, bankCode, intermediary
    },
    defaults: {
      currency: "USD", incoterm: "FOB",
      paymentTerms, portOfLoading, portOfDischarge, countryOfOrigin: "CHINA",
      declaration,   // 发票声明英文
      certStatement, // 受益人证明声明
      bilingual: false, showSeal: true
    },
    numbering: { next: { ci:1, pl:1, pi:1, sc:1, qt:1, bk:1, sa:1, co:1, bc:1, dr:1, cd:1, cs:1 }, padding: 4 },
    ui: { lastRoute: "#/dashboard" }
  },
  customers: [customer],
  products: [product],
  orders: [order],
  activeOrderId: "",
  meta: { createdAt, updatedAt }
}
```

### Customer
```js
{ id, code, nameEn, nameCn, addressEn, addressCn, country, contact, tel, email, taxId }
```

### Product（包装/重量字段均指**每箱**）
```js
{
  id, code, nameEn, nameCn, hsCode, unit: "PCS", price: 0, currency: "USD",
  pkg: "CARTON", qtyPerCarton: 0, netWeight: 0, grossWeight: 0, cbm: 0,
  origin: "CHINA", specEn: "", remarks: ""
}
```

### Order
```js
{
  id, no,                 // no = 内部订单号，如 SO-2026-0001
  status: "draft" | "done",
  date: "2026-11-19",     // 订单日期 ISO
  createdAt, updatedAt,
  customerId: "",
  buyer: { nameEn, nameCn, addressEn, addressCn, country, contact, tel, email, taxId },
  consignee: "",          // 留空 = 同 buyer
  notifyParty: "",        // 多行文本
  currency: "USD",
  incoterm: "FOB",
  paymentTerms: "",
  portOfLoading: "", portOfDischarge: "", finalDestination: "", countryOfDestination: "",
  transportMode: "SEA",   // SEA | AIR | RAIL | EXPRESS | LAND
  vessel: "", voyage: "", containerNo: "", sealNo: "", blNo: "", bookingNo: "",
  lcNo: "", lcDate: "", lcIssuingBank: "",
  etd: "", eta: "",       // ISO date 或 ""
  shippingMarks: "N/M",
  remarks: "",
  items: [{
    id, productId: "", code, nameEn, nameCn, hsCode, origin, unit,
    qty: 0, unitPrice: 0,
    cartons: 0, qtyPerCarton: 0,
    netWeight: 0, grossWeight: 0, cbm: 0,   // 每箱
    costPrice: 0,                            // 采购成本 RMB/单位（内部成本表）
    remarks: ""
  }],
  charges: { freight: 0, insurance: 0, other: 0, discount: 0 },
  cost: { exchangeRate: 7.1, domestic: 0, bank: 0, misc: 0 },
  docMeta: {                               // 生成单证时写入；缺失时 app 用 core.docNo 生成
    ci: { no: "CI-2026-0001", date: "2026-11-19" },
    // pl, pi, sc, qt, bk, sa, co, bc, dr, cd, cs 同理
  },
  print: { selected: ["ci","pl"], bilingual: false, showSeal: true }
}
```

`order.buyer` 是客户库快照；新订单从选中客户深拷贝，之后互不影响。客户/产品删除不得影响历史订单。

## 5. Core API（Lead 提供，doc-dev/ui-dev 只读调用）

```js
core.uid(prefix = "id") -> string
core.esc(v) -> string
core.clone(v) -> any
core.num(v, fallback = 0) -> number
core.round(n, dp = 2) -> number
core.fmtNum(n, dp = 2) -> string          // "1,234.50"
core.fmtQty(n) -> string                  // 整数无小数；非整数最多3位
core.fmtMoney(n, currency = "USD") -> string   // "USD 12,345.60"（JPY 0位）
core.fmtDate(iso, style = "medium") -> string  // medium: "19 Nov 2026"; iso: "2026-11-19"; long: "19 November 2026"; short: "19/11/2026"
core.todayISO() -> "YYYY-MM-DD"
core.docNo(prefix, seq, dateISO, padding = 4) -> "CI-2026-0001"（年份取 dateISO）
core.byId(list, id) -> item | undefined
core.amountWordsEn(amount, currency) -> "SAY US DOLLARS ... ONLY"
core.amountWordsCn(amount, currency) -> "美元壹万贰仟叁佰肆拾伍元陆角整"
core.calcOrder(order) -> {
  lines: [{ ...item, amount, cartonsCalc, netWeightTotal, grossWeightTotal, cbmTotal }],
  totalQty, totalCartons, totalNetWeight, totalGrossWeight, totalCbm,
  merchandiseTotal, freight, insurance, other, discount, grandTotal,
  amountInWordsEn, amountInWordsCn
}
core.calcCost(order) -> {
  revenueFc, exchangeRate, revenueCny, purchaseCost, domesticCost, bankCost, miscCost,
  totalCost, grossProfit, marginPct
}
core.validateOrder(order) -> [{ level: "error"|"warn", field, message }]
core.CURRENCIES = [{ code, nameEn, nameCn, symbol }]  // USD/EUR/CNY/GBP/JPY/AUD/CAD/HKD/SGD/CHF/AED
core.INCOTERMS = ["EXW","FCA","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"]
core.TRANSPORT_MODES = [{ key, nameEn, nameCn }]
```

计算口径：
- `amount = round(qty * unitPrice, 2)`；`cartonsCalc = item.cartons || ceil(qty / qtyPerCarton)`。
- 重量/体积合计 = `cartonsCalc * 每箱净重/毛重/体积`（保留3位）。
- `grandTotal = merchandiseTotal + freight + insurance + other - discount`，不小于 0。
- 金额大写必须四舍五入到分；支持 0、数千亿以内、负数；不得输出 `NaN`。

## 6. 单证引擎（doc-dev）

### 6.1 注册表
```js
docs.version = "1.0.0";
docs.groups = [
  { key: "sales", nameCn: "销售与结算" },
  { key: "logistics", nameCn: "物流与报关" },
  { key: "internal", nameCn: "内部管理" }
];
docs.list = [
  { key:"ci", group:"sales",      prefix:"CI", nameCn:"商业发票",     nameEn:"COMMERCIAL INVOICE",       desc:"..." },
  { key:"pl", group:"sales",      prefix:"PL", nameCn:"装箱单",       nameEn:"PACKING LIST",             desc:"..." },
  { key:"pi", group:"sales",      prefix:"PI", nameCn:"形式发票",     nameEn:"PROFORMA INVOICE",         desc:"..." },
  { key:"sc", group:"sales",      prefix:"SC", nameCn:"销售合同",     nameEn:"SALES CONTRACT",           desc:"..." },
  { key:"qt", group:"sales",      prefix:"QT", nameCn:"报价单",       nameEn:"QUOTATION",                desc:"..." },
  { key:"bk", group:"logistics",  prefix:"BK", nameCn:"订舱委托书",   nameEn:"BOOKING NOTE",             desc:"..." },
  { key:"sa", group:"logistics",  prefix:"SA", nameCn:"装运通知",     nameEn:"SHIPPING ADVICE",          desc:"..." },
  { key:"cd", group:"logistics",  prefix:"CD", nameCn:"报关资料清单", nameEn:"CUSTOMS DOCUMENT CHECKLIST",desc:"..." },
  { key:"co", group:"logistics",  prefix:"CO", nameCn:"一般原产地证", nameEn:"CERTIFICATE OF ORIGIN",     desc:"..." },
  { key:"bc", group:"sales",      prefix:"BC", nameCn:"受益人证明",   nameEn:"BENEFICIARY'S CERTIFICATE",desc:"..." },
  { key:"dr", group:"sales",      prefix:"DR", nameCn:"汇票",         nameEn:"BILL OF EXCHANGE",         desc:"..." },
  { key:"cs", group:"internal",   prefix:"CS", nameCn:"成本核算表",   nameEn:"COST SHEET",               desc:"..." }
];
docs.get(key) -> entry | undefined;
```

### 6.2 render 契约
```js
docs.render(key, ctx) -> string  // 完整 <article class="doc-sheet doc-sheet--ci" data-doc="ci">…</article>
ctx = {
  state, order,
  meta: { no, date },                       // 单证编号/日期，必有
  opts: { bilingual: false, showSeal: true, showSignature: true },
  core
}
```
要求：
- **纯函数**，不得修改 ctx/state/order，不得访问 DOM、localStorage、网络。
- 每个模板必须优雅处理空字段（空字符串显示留白，不得出现 `undefined`、`null`、`NaN`）。
- 所有动态文本 `core.esc()`；多行地址用 `white-space: pre-line`。
- 根节点必须含 `doc-sheet` 与 `data-doc`，A4 尺寸由 print.css 统一控制。
- 单证内容全英文为主；当 `opts.bilingual` 为 true 时，标题/表头/关键条款中英对照，货物名若有 `nameCn` 则附中文。
- 货币用 `core.fmtMoney`；日期用 `core.fmtDate(meta.date)`；金额大写用 `core.amountWordsEn`。
- 页脚：公司名 + 单证类型 + 页码占位（CSS counter 或固定），不要写死页码。
- 抬头：公司 logo（若有）或公司名；公司中英文名、地址、电话/邮箱/网站。
- 签章：`showSeal && company.seal` 时显示印章；`showSignature` 时显示签字人/职务，否则留手签线。
- 每类单证内容要求见 §7。
- 预览和打印同一 DOM；打印分页由 print.css 的 `@page` / `.doc-sheet` 规则负责，模板内长表格必须用 `<thead>` 让表头跨页重复。

### 6.3 样式边界
- **所有** `.doc-sheet` 内部样式、A4 尺寸、打印规则只写在 `css/print.css`；`app.css` 不得覆盖单证内部。
- 屏幕预览宽度 210mm、最小高度 297mm、白色背景；预览容器负责缩放，不改变纸张宽度。
- `@media print`：隐藏 `.app-shell`、`.preview-toolbar`、`.toast`、`.modal`、`.no-print`；只显示 `.print-area`；`@page { size: A4; margin: 0 }`；每个 `.doc-sheet` 独占一页，最后一个不额外空白页。
- 打印颜色必须可读（深色文字、细线）；表格不得溢出右边距；长英文单词/地址可换行。
- 文档字体：`Arial, "Helvetica Neue", "Microsoft YaHei", sans-serif`；标题可用 `Georgia, "Times New Roman", serif`；字号 8.5–11pt，必须适合 A4。

## 7. 单证内容要求（缺一不可）

1. **CI 商业发票**：买卖双方、发票号/日期、合同号/信用证号、贸易术语、起运港/目的港、船名航次、唛头、货物表（品名/HS/数量/单位/单价/金额）、合计、金额大写、银行信息、原产地声明、签章。
2. **PL 装箱单**：买卖双方、装箱单号/日期、唛头、货物表（品名/箱数/每箱数量/总数量/净重/毛重/体积）、合计箱数/净重/毛重/体积、签章；**不得出现单价金额**。
3. **PI 形式发票**：同 CI 主要字段，标题 PROFORMA INVOICE，含付款方式、有效期/交货期、银行信息、签章。
4. **SC 销售合同**：合同号/日期、买卖双方完整信息、货物与总价、金额大写、条款（质量、包装、装运、付款、检验、不可抗力、仲裁、适用法律），双方签字栏；可 2 页。
5. **QT 报价单**：报价号/日期、买方、货物单价/总价、贸易术语、付款方式、交货期、报价有效期、备注、签章。
6. **BK 订舱委托书**：Shipper/Consignee/Notify、起运港/目的港、船名航次/开船日、箱型箱量、货物摘要（品名/HS/件数/毛重/体积）、报关/提单要求、联系人；中英对照。
7. **SA 装运通知**：致买方、发票号/合同号、船名航次/提单号/集装箱号/封号、ETD/ETA、装运港/目的港、货物摘要、唛头、通知声明、签章。
8. **CD 报关资料清单**：中文为主，列出报关所需资料与关键申报数据（HS、申报品名、数量、总价、币制、贸易方式、运输方式、目的国、件数/毛重/净重、唛头），资料核对清单（发票/箱单/合同/报关委托书/许可证等），制表人/日期。
9. **CO 一般原产地证**：Exporter/Consignee、运输方式与路线、目的国、唛头与包装、品名/HS/数量/发票号日期、原产地声明、签发栏；采用通用可编辑版式（说明见 README，不冒充官方证书）。
10. **BC 受益人证明**：致买方/开证行、信用证号、发票号、货物、标准声明（货物符合合同/单据已提交/未提交不符单据），可追加订单备注，签章。
11. **DR 汇票**：号码/出票地点日期、金额（数字+大写）、即期/远期、Pay to the order of（卖方银行）、付款人（开证行/买方）、信用证号、出票人签章。
12. **CS 成本核算表**：中文内部版，收入（外币/汇率/人民币）、采购成本、国内费用、银行费用、其他、总成本、毛利、毛利率、单件成本/售价；醒目标注“内部资料 INTERNAL”。

## 8. UI / Store（ui-dev）

### 路由（hash）
```
#/dashboard   #/orders   #/orders/<orderId>   #/preview/<orderId>[/<docKey>]
#/customers   #/products #/settings           #/help
```
- 默认/未知路由 → `#/dashboard`。
- `#/preview/<id>` 渲染该订单 `order.print.selected` 中全部单证，按注册表顺序垂直排列；`docKey` 只用于滚动定位与选中态。打印全部已选单证。
- 刷新/直接访问 hash 必须正确渲染。

### Store API（供 app 与 QA）
```js
store.storageKey = "tradedocs.v1"
store.getState()
store.setState(updaterFn | object, { persist = true } = {})
store.subscribe(fn)            // 返回取消函数
store.save()                   // 立即写 localStorage
store.newOrder(partial = {})   // 生成 id/no/默认值并加入 state，返回 order
store.saveOrder(order)         // upsert
store.deleteOrder(id)
store.duplicateOrder(id)
store.ensureDocMeta(order, key) // 缺失时按 settings.numbering 生成编号并递增，返回 {no,date}
store.exportJSON()             // string
store.importJSON(text)         // 校验并替换，返回 {ok, message}
store.resetDemo()
store.clearAll()
```
- 首次打开（无数据）自动载入 `TradeDocs.demo.data()`。
- localStorage 写入失败（隐私模式/配额）必须 toast 提示，不得白屏。
- 损坏数据：备份原始值到 `tradedocs.broken`，回退演示数据并提示。
- 自动保存防抖 ≤500ms；离开编辑器不丢数据。
- 单证编号只在“生成/预览/打印”时消耗；重复预览不得跳号。
- 编号格式：`core.docNo(prefix, seq, order.date, settings.numbering.padding)`。

### 页面与交互
- **Dashboard**：品牌欢迎区、4 个 KPI（订单数/本月单证/客户数/待完善订单）、快速开单入口、单证类型卡片（12 类，可点新建或查看示例）、最近订单表。
- **Orders**：搜索（订单号/买方）、状态筛选、新建、打开、复制、删除（确认）。
- **Order editor**：分组卡片式表单：基本信息、买方与收货人、货物明细（可从产品库添加/自定义行/删除/复制行/自动算金额与合计）、运输与条款、单证编号（可选覆盖/重新生成）、内部成本、备注。右侧/顶部粘性汇总卡片显示总金额、件数、毛净重、体积、资料完整度；按钮：保存、预览单证、更多（复制/删除/标记完成）。保存成功有反馈。
- **Preview**：顶部工具栏（返回、单证类型多选、中英对照、显示印章、打印/PDF 按钮），下面 A4 预览。未选单证时给空状态。
- **Products / Customers**：表格 + 新建/编辑抽屉或弹窗 + 删除确认；产品含 HS、包装、每箱重量/体积；客户含地址、联系人。
- **Settings**：公司资料（logo/印章上传，FileReader→dataURL，≤300KB）、银行信息、默认条款、编号规则、数据备份（导出 JSON/导入 JSON/恢复演示/清空）、使用说明入口。
- **Help**：三步上手、打印 PDF 操作、常见问题、官方单证免责声明。
- 键盘：`Ctrl/Cmd+S` 保存当前订单；`Esc` 关闭弹窗。
- 所有删除/重置需确认；所有空状态有引导；toast 3 秒自动消失。
- 移动端：侧栏收起为顶部/抽屉；表格可横向滚动；表单单列；预览页 A4 横向滚动。

### 测试钩子（必须实现，供 QA）
```js
window.TradeDocs.app.navigate("#/orders/xxx")
window.TradeDocs.app.refresh()
window.TradeDocs.test = {
  createOrder(partial) -> order,
  fillOrder(orderId, patch) -> order,      // 深合并后保存
  openPreview(orderId, docKey) -> void,    // 路由跳转
  ensureAllDocMeta(orderId) -> order,
  renderDocs(orderId) -> { key: {ok, length, error} },
  getOrder(orderId) -> order
}
```
DOM 稳定钩子：
- `[data-nav="dashboard|orders|customers|products|settings|help"]`
- `[data-testid="new-order"]`、`"save-order"`、`"preview-order"`、`"print-docs"`、`"toast"`、`"export-backup"`、`"import-backup"`
- 预览：`#preview-sheets`（同时含 `print-area` class），`[data-doc-tab="ci"]`
- 单证根：`.doc-sheet[data-doc="ci"]`
- 编辑器表单：`#order-form`；字段尽量使用 `name="buyer.nameEn"`、`name="currency"`、`name="charges.freight"` 等语义名。
- 订单列表行：`[data-order-id]`；单证类型卡：`[data-doc-type="ci"]`。

## 9. 视觉规范

风格：专业、克制、像现代 SaaS（不是后台模板）。中文 UI 字体 `"PingFang SC","Microsoft YaHei",system-ui`。

```css
--bg:#f4f6f8; --surface:#ffffff; --ink:#14213d; --muted:#667085; --line:#e4e7ec;
--brand:#0f766e; --brand-600:#0d9488; --brand-700:#115e59; --navy:#0b2239;
--accent:#f59e0b; --danger:#d92d20; --ok:#067647; --canvas:#e9edf2;
--radius:14px; --shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.06);
```
- 布局：左侧 248px 深色导航（品牌 + 导航 + 底部版本），右侧内容最大宽 1280px；移动端抽屉。
- 顶部栏：面包屑/页面标题、快捷新建、保存状态。
- 卡片圆角 14、细边框、轻阴影；表格行高舒适；按钮主色 teal，次按钮描边。
- 不使用 emoji 作为图标；图标采用内联 SVG（stroke 1.8）。
- 空状态、加载态、toast、确认弹窗都要有。
- 单证预览画布深灰，A4 白纸带阴影；工具栏吸顶。
- 不得使用外部字体/图片；演示 logo/印章已由 demo 数据提供。

## 10. 单文件发布（Lead）

`python build_single_file.py` 将 `index.html` + 本地 CSS/JS 内联为
`dist/单证通-外贸单证系统.html`，该文件必须：
- 双击 `file://` 打开即用，功能与源目录一致；
- 不含任何外部 URL 请求（允许 `data:` 图片）；
- 内联后不出现 `</script>` 截断（构建脚本转义）。

## 11. 验收（qa 执行）

1. `node tests/test-core.mjs` 全绿（金额、大写、日期、合计、校验、编号、成本表）。
2. `node tests/test-templates.mjs`：12 类单证用演示订单渲染，均含正确标题/编号/买方/总额/关键字段，无 `undefined|NaN|\[object`，注入 `<script>` 的字段被转义。
3. `node tests/e2e.mjs`（Chrome headless + CDP，Node 内置 WebSocket/fetch）：
   - 首屏 dashboard 渲染、无 console error、无横向溢出（1440×900 与 390×844）；
   - 新建订单→填买方→加产品→保存→预览→12 类单证全部渲染；
   - 修改数量后金额/大写同步；刷新后数据仍在；
   - 打印媒体下 `.app-shell` 隐藏、`.doc-sheet` 可见；`printToPDF` 成功且页数合理；
   - 导出 JSON 可再导入；清空/恢复演示可用。
4. 截图到 `screenshots/`：dashboard、order-editor、preview-ci、preview-pl、preview-sc、preview-cs、mobile-dashboard、settings。每张人工/视觉检查：文字不重叠、表格不溢出、A4 版式完整、中文无乱码。
5. QA 只报问题，不直接改应用文件；问题写 `tests/QA_REPORT.md` 并发消息给对应 owner/Lead。

## 12. 协作纪律

- 先读本契约，再读 `js/core.js`、`js/demo.js` 的真实实现；接口以代码为准，差异立即报 Lead。
- 只写自己名下的文件；需要依赖时先按契约写调用方，不要改对方文件。
- 代码不用框架、不引依赖；使用 `const/let`、模板字符串、事件委托；避免全局变量泄漏（除 `TradeDocs`）。
- 每完成一个文件/阶段，在共享任务上更新状态；遇到阻塞立即消息 Lead，不空转。
- 交付前 Lead 会统一跑 QA 与单文件构建，任何人不得提前宣告完成。

---

## 13. v1.1 智能识别（本地文本/文档，无网络）

### 13.1 目标与边界

在订单编辑器中提供「智能填单」：用户粘贴文字或上传文件，系统在**浏览器本地**提取文本/表格，用规则识别买方、单证号、日期、贸易术语、付款、港口、船期、信用证、唛头、费用与货物明细；先展示识别结果和置信度，用户确认后填入订单。**不上传文件、不调用任何 API、不需要网络。**

支持：粘贴文本、`.txt/.md/.csv/.tsv/.json/.docx/.xlsx`。
明确不支持：图片、扫描 PDF、旧版 `.doc/.xls`（提示用户另存为 docx/xlsx 或粘贴文字）。PDF 如为文本型也不在 v1.1 范围，避免误导。

约束：
- 新文件 `js/recognize.js` 为经典 UMD 脚本；浏览器 `TradeDocs.recognize` + Node `module.exports`。加载顺序在 `core.js` 之后、`doc-templates.js` 之前。
- 不使用 DOM/网络/第三方库；DOCX/XLSX 用自写 ZIP 解析 + `DecompressionStream('deflate-raw')`。Node 24 同样可测。
- 所有文本提取/解析是纯函数（读取 File 的异步除外），不修改传入 order。
- 识别结果只作为候选，必须经用户确认后才写入订单；不得自动保存/覆盖。
- 限制：单文件 ≤10MB、最多 5 个文件、合并文本 ≤300,000 字符；超出给 warning，不崩溃。

### 13.2 API

```js
TradeDocs.recognize = {
  version: "1.1.0",
  ACCEPT: [".txt", ".md", ".csv", ".tsv", ".json", ".docx", ".xlsx"],
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  MAX_FILES: 5,
  MAX_TEXT_CHARS: 300000,
  SAMPLE_TEXT: "……",                     // 供 UI「载入示例」和测试的完整样例
  async extractFile(file) -> { name, ext, size, text, tables, warnings },   // tables: string[][]
  async extractFiles(fileList) -> { text, tables, files: [], warnings },   // 依次提取并合并
  parse(text, { tables = [] } = {}) -> recognition,                        // 同步纯函数
  recognizeText(text) -> recognition,
  async recognizeFiles(fileList) -> recognition,                          // extractFiles + parse
  apply(recognition, order, options) -> { order, appliedFields: [], appliedItems: 0, skipped: [] }
};
```

`options`：`{ overwrite:false, itemsMode:"append"|"replace" }`。
- `overwrite=false`：目标字段为空（undefined/null/""；数值 0 视为空）才写入；`true` 时覆盖。
- `itemsMode="append"` 追加；`"replace"` 替换 items。新 item 必须经 `core.uid("item")` 生成 id，补齐 `productId:""`, `costPrice:0`, `origin` 等字段，金额由 UI/订单计算，不直接信任识别 amount。
- `apply` 必须深拷贝 order（`core.clone`），不得修改入参；不修改 `docMeta`、`print`、`id/no`。

### 13.3 recognition 数据结构

```js
{
  fields: {
    orderNo, date, invoiceNo, poNo, contractNo,          // 信息候选；仅 orderNo→order.no
    currency, incoterm, paymentTerms, transportMode,
    lcNo, lcDate, lcIssuingBank,
    portOfLoading, portOfDischarge, finalDestination, countryOfDestination,
    vessel, voyage, containerNo, sealNo, blNo, bookingNo,
    etd, eta,
    shippingMarks, remarks,
    buyer: { nameEn, nameCn, addressEn, addressCn, country, contact, tel, email, taxId },
    seller: { nameEn, addressEn, country, tel, email, taxId },   // 仅展示，不写公司设置
    charges: { freight, insurance, other, discount }             // number|null
  },
  items: [{
    nameEn, nameCn, code, hsCode, qty, unit, unitPrice, amount,
    cartons, qtyPerCarton, netWeight, grossWeight, cbm
  }],
  meta: { "buyer.nameEn": { confidence: 0..1, evidence: "≤120字" }, "items.0.qty": {...} },
  warnings: [{ code, message }],
  stats: { files, chars, fieldCount, itemCount },
  texts: [{ name, chars, excerpt }]
}
```

- 未识别字段输出 `null`（字符串用 `""` 也可，但 UI 必须判空）；所有数字使用 number；不得输出 `undefined`。
- `meta` 覆盖所有非空 field（含 `items.<i>.<field>`）、`buyer.*`、`charges.*`；`confidence` 0–1，标签精确匹配高、自由正则低。
- `stats.fieldCount` 计非空标量字段+buyer 子字段；`stats.itemCount` = items.length。

### 13.4 解析要求

- 中英文标签：`Buyer/To/Messrs/买方/客户`、`Invoice No./发票号`、`Order No./订单号`、`Date/日期`、`Incoterm/贸易术语`、`Payment/付款`、`Port of Loading/起运港`、`Port of Discharge/目的港`、`Vessel/船名`、`Voyage/航次`、`ETD/开船日期`、`ETA/到港日期`、`L/C No./信用证号`、`Shipping Marks/唛头` 等，大小写不敏感。
- 币种：USD/EUR/CNY/GBP/JPY 等（来自显式字段或金额符号）；贸易术语：EXW/FCA/FOB/CFR/CIF/CPT/CIP/DAP/DPU/DDP。
- 日期：`2026-11-17`、`2026/11/17`、`17 Nov 2026`、`Nov 17, 2026`、`2026年11月17日`；统一为 `YYYY-MM-DD`。
- 表格识别：CSV/TSV/XLSX 优先按表头映射 columns：Description/品名、HS Code/HS、Qty/数量、Unit/单位、Unit Price/单价、Amount/金额、Cartons/箱数、N.W./净重、G.W./毛重、CBM/体积、Item No./货号。表头中文/英文均可。
- 文本行兜底：如 `Ceramic Mug 12 oz 2,400 PCS USD 1.85 4,440.00`、`HS 6912.00.00`；至少能识别品名+数量+单价或金额中的两项，否则不加入 items。
- 数值清洗：去掉 `,`、货币符号、`USD` 等；百分比/日期不要误判为价格；金额与数量冲突时优先列对齐结果。
- 买方地址：捕获标签后连续多行直到空行/下一个大写标签；不得把卖方地址当买方。
- 置信度建议：显式标签 0.9；表头列映射 0.85；自由正则 0.6；模糊/猜测 0.4。evidence 为原始片段。
- 文件提取：
  - DOCX：解析 `word/document.xml`，段落换行、表格单元格用 `\t`、行用 `\n`；解码 XML 实体；保留中文。
  - XLSX：解析 sharedStrings + 每个 sheet 的行列，生成 `tables` 与 TSV 文本；支持 inlineStr、数字、布尔；忽略样式/公式缓存即可。
  - CSV/TSV：支持引号、逗号/制表符/分号分隔，返回 tables 和文本。
  - JSON：数组对象转表格；对象转 key/value 文本。
  - 损坏/加密/旧版文件：返回 warning，不抛异常。

### 13.5 UI（ui-dev）

- 入口：订单编辑器顶部操作区「智能填单」（`data-testid="recognize-open"`）；仪表盘/订单页「识别建单」（新建草稿后打开）。
- 弹窗步骤：① 提供资料（拖拽/选择文件、粘贴文本框、载入示例、清空）→ ② 核对结果（字段分组 + 置信度/证据 + 可编辑值 + 货物候选勾选 + warnings + 统计）→ ③ 应用（选项：仅填充空白/覆盖识别字段、追加/替换货物；按钮：应用到当前订单、另存为新订单）。
- 文件 accept 与提示严格按 §13.1；图片/PDF/.doc/.xls 提示「当前版本仅支持文字/文档，请转成 TXT/Word/Excel 或粘贴文字」。
- 本地隐私标识：「本地解析 · 文件不会上传」；识别过程中 loading，失败显示可读错误，不白屏。
- 所有预览值 innerHTML 前 `core.esc`；字段输入框可编辑（apply 用编辑后的值）；证据用 `title` 或详情弹层。
- 不覆盖原有功能与测试。新增稳定钩子：`recognize-open, recognize-input, recognize-text, recognize-sample, recognize-run, recognize-result, recognize-apply, recognize-apply-new, data-recognized-field, data-recognize-item`。
- 帮助页新增「智能填单」：支持格式、隐私说明、识别准确率由源文件排版决定、必须核对。

### 13.6 验收（qa v1.1）

- Node 单测 `tests/test-recognize.mjs`：SAMPLE_TEXT 解析出 buyer/ports/items/LC/金额；CSV/TSV/JSON；真实 DOCX/XLSX（tests/fixtures，python-docx/openpyxl 生成）提取；损坏文件 warning；apply 纯函数/覆盖模式/追加/替换/ID；`undefined` 泄漏检查。
- E2E 扩展：打开弹窗→载入示例→识别→核对→应用→编辑器字段和货物行出现；上传 txt/csv/docx/xlsx（CDP 文件上传）；不支持图片提示；取消不改数据；无外部网络请求、无 console error。
- 原有 119 core / 47 template / 42 E2E 必须继续全绿。
- Lead 重新构建单文件（7+1 个脚本）与 v1.1.0 发布包。

