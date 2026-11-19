/**
 * TradeDocs — Chrome DevTools Protocol harness (reusable Node helpers)
 *
 * Zero npm dependencies: uses Node >= 20 built-in `fetch` + global `WebSocket`,
 * `node:http`, `node:child_process`, `node:fs`.
 *
 * Typical use from a test file:
 *
 *   import { launchChrome, serveStatic, connectToPage, PageSession } from './cdp.mjs';
 *
 *   const server = await serveStatic(ROOT);
 *   const chrome = await launchChrome();
 *   const { client } = await connectToPage(chrome);
 *   const page = await PageSession.create(client);
 *   try {
 *     await page.navigate(server.url + '/index.html');
 *     await page.waitForApp();
 *     await page.setViewport(390, 844, { mobile: true });
 *     await page.screenshot('screenshots/mobile-dashboard.png');
 *   } finally {
 *     page.close();
 *     await chrome.close();
 *     await server.close();
 *   }
 *
 * The module exposes:
 *   findChromePath, launchChrome, connectToPage, CDPClient,
 *   serveStatic, PageSession, countPdfPages, ms, sleep, ensureDir
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/*  Small utilities                                                    */
/* ------------------------------------------------------------------ */

export const sleep = (msValue) => new Promise((resolve) => setTimeout(resolve, msValue));
export const ms = (value) => `${value}ms`;

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

/** Locate a Chrome/Edge/Chromium executable. Throws when none is found. */
export function findChromePath(explicitPath) {
  const candidates = [explicitPath, ...CHROME_CANDIDATES].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (candidate && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  throw new Error(
    'Chrome executable not found. Set CHROME_PATH to a Chrome/Edge/Chromium binary. ' +
    'Tried:\n  ' + candidates.join('\n  ')
  );
}

/* ------------------------------------------------------------------ */
/*  Static file server (no external deps)                              */
/* ------------------------------------------------------------------ */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

/**
 * Serve a directory over http://127.0.0.1:<random-port>.
 * Returns { url, port, server, close() }. The server binds to loopback only.
 */
export async function serveStatic(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root)) throw new Error(`serveStatic: directory not found: ${root}`);
  const port = options.port || 0;
  const host = options.host || '127.0.0.1';

  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${host}`);
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filePath = path.resolve(root, '.' + pathname);
      if (filePath !== root && !filePath.startsWith(root + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found: ' + pathname);
        return;
      }
      if (stat.isDirectory()) {
        const indexed = path.join(filePath, 'index.html');
        if (fs.existsSync(indexed)) {
          stat = fs.statSync(indexed);
          return sendFile(res, indexed, stat);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found: ' + pathname);
        return;
      }
      sendFile(res, filePath, stat);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error: ' + (err && err.message));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const actualPort = server.address().port;
  return {
    url: `http://${host}:${actualPort}`,
    port: actualPort,
    host,
    server,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      // destroy keep-alive sockets so close() cannot hang
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    })
  };
}

function sendFile(res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache'
  });
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ */
/*  CDP websocket client                                               */
/* ------------------------------------------------------------------ */

function toMessageString(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  return String(data);
}

export class CDPClient {
  constructor(ws) {
    this._ws = ws;
    this._nextId = 0;
    this._pending = new Map();
    this._listeners = new Map();
    this._anyListeners = new Set();
    this._closed = false;
    this._closeReason = null;

    ws.addEventListener('message', (event) => this._onMessage(event.data));
    ws.addEventListener('close', () => this._onClose('websocket closed'));
    ws.addEventListener('error', () => this._onClose('websocket error'));
  }

  /** Open a fresh WebSocket to a CDP endpoint. */
  static async connect(wsUrl, { timeout = 15000 } = {}) {
    if (typeof WebSocket !== 'function') {
      throw new Error('Global WebSocket unavailable: Node 22+ is required (or use undici).');
    }
    const ws = await new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try { socket.close(); } catch { /* noop */ }
        reject(new Error(`Timed out connecting to CDP websocket ${wsUrl} after ${timeout}ms`));
      }, timeout);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(socket);
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`Failed to connect to CDP websocket ${wsUrl}`));
      }, { once: true });
    });
    return new CDPClient(ws);
  }

  get closed() { return this._closed; }

  _onClose(reason) {
    if (this._closed) return;
    this._closed = true;
    this._closeReason = reason;
    for (const [, pending] of this._pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`CDP client closed while awaiting ${pending.method} (${reason})`));
    }
    this._pending.clear();
    for (const fn of this._anyListeners) {
      try { fn('__closed__', { reason }); } catch { /* noop */ }
    }
  }

  _onMessage(raw) {
    let message;
    try {
      message = JSON.parse(toMessageString(raw));
    } catch {
      return;
    }
    if (message.id !== undefined && message.id !== null) {
      const pending = this._pending.get(message.id);
      if (!pending) return;
      this._pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        const error = new Error(`CDP ${pending.method} failed: ${message.error.message || 'unknown error'}${message.error.data ? ' — ' + message.error.data : ''}`);
        error.code = message.error.code;
        error.data = message.error.data;
        pending.reject(error);
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method) {
      const listeners = this._listeners.get(message.method);
      if (listeners) {
        for (const fn of Array.from(listeners)) {
          try { fn(message.params || {}, message.method); } catch { /* listener errors never break the client */ }
        }
      }
      for (const fn of Array.from(this._anyListeners)) {
        try { fn(message.method, message.params || {}); } catch { /* noop */ }
      }
    }
  }

  /** Subscribe to one CDP event; returns an unsubscribe function. */
  on(method, handler) {
    if (!this._listeners.has(method)) this._listeners.set(method, new Set());
    this._listeners.get(method).add(handler);
    return () => {
      const set = this._listeners.get(method);
      if (set) set.delete(handler);
    };
  }

  /** Subscribe to every CDP event: fn(method, params). Returns unsubscribe. */
  onAny(handler) {
    this._anyListeners.add(handler);
    return () => this._anyListeners.delete(handler);
  }

  /** Resolve on the next occurrence of a CDP event. */
  once(method, { timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out after ${timeout}ms waiting for CDP event ${method}`));
      }, timeout);
      const off = this.on(method, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  /** Send a CDP command; resolves with the result object. */
  send(method, params = {}, { timeout = 30000 } = {}) {
    if (this._closed) {
      return Promise.reject(new Error(`Cannot send ${method}: ${this._closeReason || 'CDP client closed'}`));
    }
    const id = ++this._nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeout}ms`));
      }, timeout);
      this._pending.set(id, { resolve, reject, method, timer });
      try {
        this._ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(new Error(`Failed to send CDP ${method}: ${err && err.message}`));
      }
    });
  }

  close() {
    try { this._ws.close(); } catch { /* noop */ }
    this._onClose('client closed');
  }
}

/* ------------------------------------------------------------------ */
/*  Chrome launcher                                                    */
/* ------------------------------------------------------------------ */

async function fetchJson(url, { timeout = 3000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function killProcessTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32' && typeof child.pid === 'number') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
      setTimeout(() => {
        try { if (child.exitCode === null) child.kill('SIGKILL'); } catch { /* noop */ }
      }, 1500).unref?.();
    }
  } catch {
    try { child.kill(); } catch { /* noop */ }
  }
}

/**
 * Launch headless Chrome with a temporary profile and remote debugging port.
 * Resolves once /json/version answers. Returns a handle:
 *   { chromePath, port, userDataDir, child, devtools, close() }
 */
export async function launchChrome(options = {}) {
  const chromePath = options.chromePath || findChromePath();
  const windowWidth = (options.windowSize && options.windowSize.width) || 1440;
  const windowHeight = (options.windowSize && options.windowSize.height) || 900;
  const port = options.port || await getFreePort();
  const userDataDir = options.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'tradedocs-e2e-'));
  const extraArgs = options.extraArgs || [];
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--noerrdialogs',
    '--allow-file-access-from-files',
    `--window-size=${windowWidth},${windowHeight}`,
    ...extraArgs,
    'about:blank'
  ];

  const child = spawn(chromePath, args, { stdio: 'ignore', windowsHide: true, detached: false });
  const exitState = { exited: false, code: null, signal: null, spawnError: null };
  child.on('error', (err) => {
    exitState.exited = true;
    exitState.spawnError = err;
  });
  child.on('exit', (code, signal) => {
    exitState.exited = true;
    exitState.code = code;
    exitState.signal = signal;
  });

  const deadline = Date.now() + (options.launchTimeout || 20000);
  let lastError = null;
  let devtools = null;
  while (Date.now() < deadline) {
    if (exitState.exited) break;
    try {
      devtools = await fetchJson(`http://127.0.0.1:${port}/json/version`, { timeout: 1500 });
      break;
    } catch (err) {
      lastError = err;
      await sleep(120);
    }
  }
  if (!devtools) {
    killProcessTree(child);
    throw new Error(
      `Chrome DevTools endpoint did not start on port ${port} ` +
      (exitState.spawnError ? `(spawn error: ${exitState.spawnError.message})`
        : exitState.exited ? `(chrome exited code=${exitState.code})` : '(timeout)') +
      (lastError ? `: ${lastError.message}` : '')
    );
  }

  let cleaned = false;
  const handle = {
    chromePath,
    port,
    userDataDir,
    child,
    devtools,
    get exited() { return exitState.exited; },
    get exitCode() { return exitState.code; },
    async close() {
      if (cleaned) return;
      cleaned = true;
      killProcessTree(child);
      const killDeadline = Date.now() + 5000;
      while (!exitState.exited && Date.now() < killDeadline) await sleep(100);
      // Profile dir removal is best-effort on Windows (Chrome may release locks late).
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
          break;
        } catch {
          await sleep(200);
        }
      }
    }
  };
  return handle;
}

/** Fetch the first page target's WebSocket URL from a running Chrome. */
export async function getPageTarget(port, { timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, { timeout: 1500 });
      const page = Array.isArray(targets)
        ? targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
        : null;
      if (page) return page;
      // No page target yet — ask Chrome to open about:blank (PUT required in modern Chrome).
      try {
        const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
        if (created.ok) {
          const target = await created.json();
          if (target && target.webSocketDebuggerUrl) return target;
        }
      } catch { /* ignore and retry */ }
    } catch (err) {
      lastError = err;
    }
    await sleep(120);
  }
  throw new Error(`No Chrome page target found on port ${port}` + (lastError ? `: ${lastError.message}` : ''));
}

/**
 * Connect to the first page target and return { client, target }.
 * Caller owns client.close().
 */
export async function connectToPage(chromeHandle, { timeout = 15000 } = {}) {
  const target = await getPageTarget(chromeHandle.port, { timeout });
  const client = await CDPClient.connect(target.webSocketDebuggerUrl, { timeout });
  return { client, target };
}

/* ------------------------------------------------------------------ */
/*  Page session                                                       */
/* ------------------------------------------------------------------ */

function stringifyConsoleArg(arg) {
  if (!arg) return '';
  if (arg.value !== undefined) {
    if (typeof arg.value === 'string') return arg.value;
    try { return JSON.stringify(arg.value); } catch { return String(arg.value); }
  }
  if (arg.unserializableValue !== undefined) return arg.unserializableValue;
  if (arg.description) return arg.description;
  if (arg.preview && Array.isArray(arg.preview.properties)) {
    return arg.preview.description || arg.type;
  }
  return arg.type || '';
}

/**
 * High level wrapper around one browser page (CDP).
 * Tracks console errors / page exceptions / log errors for assertions.
 */
export class PageSession {
  constructor(client, target) {
    this.client = client;
    this.target = target || null;
    this.consoleMessages = [];
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.pageErrors = [];
    this.logErrors = [];
    this._unsubs = [];
    this._loadCount = 0;
    this._closed = false;
  }

  static async create(client, target) {
    const page = new PageSession(client, target);
    await page.init();
    return page;
  }

  async init() {
    this._unsubs.push(this.client.on('Page.loadEventFired', () => { this._loadCount += 1; }));
    this._unsubs.push(this.client.on('Runtime.consoleAPICalled', (params) => {
      const text = (params.args || []).map(stringifyConsoleArg).join(' ');
      const entry = { type: params.type, text, timestamp: Date.now() };
      this.consoleMessages.push(entry);
      if (params.type === 'error') this.consoleErrors.push(entry);
      if (params.type === 'warning') this.consoleWarnings.push(entry);
    }));
    this._unsubs.push(this.client.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails || {};
      const description = (details.exception && (details.exception.description || details.exception.value)) || details.text || 'Uncaught exception';
      this.pageErrors.push({ text: String(description), timestamp: Date.now() });
    }));
    this._unsubs.push(this.client.on('Log.entryAdded', (params) => {
      const entry = params.entry || {};
      if (entry.level === 'error') {
        this.logErrors.push({ source: entry.source, text: entry.text, url: entry.url, timestamp: Date.now() });
      }
    }));
    await Promise.all([
      this.client.send('Page.enable'),
      this.client.send('Runtime.enable')
    ]);
    try { await this.client.send('Log.enable'); } catch { /* Log domain optional */ }
  }

  /** All error-like records collected so far (console errors, exceptions, log errors). */
  errors() {
    return [
      ...this.consoleErrors.map((e) => ({ kind: 'console.error', text: e.text })),
      ...this.pageErrors.map((e) => ({ kind: 'pageerror', text: e.text })),
      ...this.logErrors.map((e) => ({ kind: 'log.error', text: e.text, url: e.url }))
    ];
  }

  clearErrors() {
    this.consoleMessages.length = 0;
    this.consoleErrors.length = 0;
    this.consoleWarnings.length = 0;
    this.pageErrors.length = 0;
    this.logErrors.length = 0;
  }

  /** Wait until a JS expression evaluates truthy. Throws on timeout. */
  async waitUntil(expression, { timeout = 10000, interval = 100, label } = {}) {
    const deadline = Date.now() + timeout;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const value = await this.evaluate(expression);
        if (value) return value;
      } catch (err) {
        lastError = err;
      }
      await sleep(interval);
    }
    throw new Error(
      `Timed out after ${timeout}ms waiting for ${label || expression}` +
      (lastError ? ` (last error: ${lastError.message})` : '')
    );
  }

  /** Evaluate an expression in the page; returns the JSON value. */
  async evaluate(expression, { awaitPromise = true, returnByValue = true, timeout = 30000 } = {}) {
    const result = await this.client.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue,
      userGesture: true,
      includeCommandLineAPI: false
    }, { timeout });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      const message = (details.exception && (details.exception.description || details.exception.value)) || details.text || 'evaluation exception';
      throw new Error(`Page evaluate failed: ${message}`);
    }
    return result.result ? result.result.value : undefined;
  }

  async evaluateAsync(fnSource, ...args) {
    const expression = `(${fnSource})(${args.map((a) => JSON.stringify(a)).join(',')})`;
    return this.evaluate(expression);
  }

  async currentUrl() { return this.evaluate('location.href'); }
  async title() { return this.evaluate('document.title'); }
  async hash() { return this.evaluate('location.hash'); }
  async innerWidth() { return this.evaluate('window.innerWidth'); }
  async scrollWidth() { return this.evaluate('document.documentElement.scrollWidth'); }
  async exists(selector) { return this.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`); }
  async count(selector) { return this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`); }
  async text(selector) {
    return this.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? (el.innerText || el.textContent || '') : null; })()`);
  }
  async click(selector) {
    return this.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  }
  /**
   * Fill a form control by semantic `name` (contract §8) or CSS selector.
   * Uses the native value setter and dispatches input/change/blur events so
   * vanilla-JS listeners see the change.
   */
  async fill(nameOrSelector, value) {
    const expression = `(() => {
      const target = ${JSON.stringify(nameOrSelector)};
      let el = null;
      try { el = document.querySelector(target); } catch (e) { el = null; }
      if (!el) {
        el = Array.from(document.querySelectorAll('[name]')).find((node) => node.getAttribute('name') === target) || null;
      }
      if (!el) return false;
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      const next = ${JSON.stringify(value)};
      if (setter && setter.set) setter.set.call(el, next);
      else el.value = next;
      for (const type of ['input', 'change', 'blur']) {
        el.dispatchEvent(new Event(type, { bubbles: true }));
      }
      return true;
    })()`;
    return this.evaluate(expression);
  }

  /** Navigate the page and wait for document readyState === complete. */
  async navigate(url, { timeout = 30000 } = {}) {
    const before = this._loadCount;
    await this.client.send('Page.navigate', { url }, { timeout });
    try {
      await this.waitUntil(`document.readyState === 'complete'`, { timeout, label: `document ready (${url})` });
    } catch (err) {
      // Fall back to the load event in case readyState polling raced a redirect.
      if (this._loadCount === before) throw err;
    }
    return this.currentUrl();
  }

  async reload({ ignoreCache = false, timeout = 30000 } = {}) {
    const before = this._loadCount;
    await this.client.send('Page.reload', { ignoreCache }, { timeout });
    try {
      await this.waitUntil(`document.readyState === 'complete'`, { timeout, label: 'document reload' });
    } catch (err) {
      if (this._loadCount === before) throw err;
    }
  }

  /** Wait for window.TradeDocs.app to be ready (contract §8). */
  async waitForApp({ timeout = 15000 } = {}) {
    await this.waitUntil('!!(window.TradeDocs && window.TradeDocs.app)', {
      timeout,
      label: 'window.TradeDocs.app'
    });
    return this.evaluate('typeof window.TradeDocs.app');
  }

  /** Navigate the SPA via the contract test hook (stable across UI refactors). */
  async appNavigate(hash, { timeout = 10000 } = {}) {
    await this.evaluate(`window.TradeDocs.app.navigate(${JSON.stringify(hash)})`);
    await this.waitUntil(`location.hash === ${JSON.stringify(hash)}`, { timeout, label: `route ${hash}` });
  }

  /** Set/clear device metrics. */
  async setViewport(width, height, { mobile = false, deviceScaleFactor = 1 } = {}) {
    await this.client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
      screenWidth: width,
      screenHeight: height
    });
    if (mobile) {
      await this.client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    } else {
      await this.client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
  }

  async clearViewport() {
    await this.client.send('Emulation.clearDeviceMetricsOverride');
    await this.client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  /** Emulate media type ('print' | 'screen' | ''). */
  async emulateMedia(media) {
    await this.client.send('Emulation.setEmulatedMedia', { media, features: [] });
  }

  /** Capture a PNG screenshot to filePath. Returns { path, bytes }. */
  async screenshot(filePath, { fullPage = false, timeout = 30000 } = {}) {
    const result = await this.client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: !!fullPage,
      fromSurface: true
    }, { timeout });
    ensureDir(path.dirname(path.resolve(filePath)));
    const buffer = Buffer.from(result.data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { path: filePath, bytes: buffer.length };
  }

  /** Print the page to PDF at filePath. Returns { path, bytes, pages }. */
  async printPDF(filePath, { printBackground = true, preferCSSPageSize = true, landscape = false, timeout = 45000 } = {}) {
    const result = await this.client.send('Page.printToPDF', {
      printBackground,
      preferCSSPageSize,
      landscape,
      displayHeaderFooter: false,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0
    }, { timeout });
    ensureDir(path.dirname(path.resolve(filePath)));
    const buffer = Buffer.from(result.data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { path: filePath, bytes: buffer.length, pages: countPdfPages(buffer) };
  }

  /** Set files on an <input type="file"> (CDP DOM.setFileInputFiles). */
  async setFileInput(selector, filePath) {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute)) throw new Error(`setFileInput: file not found: ${absolute}`);
    await this.client.send('DOM.enable');
    const doc = await this.client.send('DOM.getDocument', { depth: -1, pierce: true });
    const found = await this.client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
    if (!found || !found.nodeId) throw new Error(`setFileInput: selector not found: ${selector}`);
    await this.client.send('DOM.setFileInputFiles', { files: [absolute], nodeId: found.nodeId });
    return absolute;
  }

  /** Allow downloads to a directory (headless Chrome). */
  async setDownloadBehavior(downloadPath) {
    ensureDir(downloadPath);
    try {
      await this.client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(downloadPath) });
      return;
    } catch {
      await this.client.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.resolve(downloadPath),
        eventsEnabled: true
      });
    }
  }

  /** One-shot DOM metric probe used by overflow assertions. */
  async layoutMetrics() {
    return this.evaluate(`(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
      bodyClientWidth: document.body ? document.body.clientWidth : 0,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    }))()`);
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    for (const unsub of this._unsubs.splice(0)) {
      try { unsub(); } catch { /* noop */ }
    }
    try { this.client.close(); } catch { /* noop */ }
  }
}

/* ------------------------------------------------------------------ */
/*  PDF helpers                                                        */
/* ------------------------------------------------------------------ */

/** Approximate page count of a PDF buffer (counts page objects). */
export function countPdfPages(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer);
  if (!text.startsWith('%PDF')) return 0;
  const pageObjectMatches = text.match(/\/Type\s*\/Page[^s]/g);
  return pageObjectMatches ? pageObjectMatches.length : 0;
}

export function looksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF';
}

export function looksLikePng(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
}

/** Absolute path of the trade-docs project root (parent of tests/). */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
