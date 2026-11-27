// Minimal Chrome DevTools Protocol driver for e2e checks and screenshots. No extra dependencies.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1280, height = 900, scale = 1 } = {}) {
  const binary = CANDIDATES.find((p) => existsSync(p));
  if (!binary) throw new Error('Chrome not found; set CHROME_PATH');
  const profile = mkdtempSync(join(tmpdir(), 'verdict-chrome-'));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(binary, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(150);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  const problems = [];
  const requests = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id) pending.get(m.id)?.(m);
    for (const l of listeners) l(m);
    if (m.method === 'Runtime.exceptionThrown') problems.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  const page = {
    problems,
    requests,
    send,
    async viewport(w, h = height) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: w < 600 });
    },
    async goto(url, settle = 900) {
      await send('Page.navigate', { url });
      await sleep(settle);
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async fill(values) {
      await page.eval(`(() => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const [label, value] of Object.entries(${JSON.stringify(values)})) {
          const input = document.querySelector('input[aria-label="' + label + '"]');
          if (!input) throw new Error('No input labelled ' + label);
          set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(120);
    },
    async click(selector, settle = 400) {
      await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('No element ${selector.replace(/'/g, '')}'); el.click(); })()`);
      await sleep(settle);
    },
    async screenshot(path, { full = true } = {}) {
      const { cssContentSize } = await send('Page.getLayoutMetrics');
      const { data } = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: full,
        ...(full ? { clip: { x: 0, y: 0, width: cssContentSize.width, height: Math.ceil(cssContentSize.height), scale: 1 } } : {}),
      });
      const fs = await import('node:fs');
      fs.writeFileSync(path, Buffer.from(data, 'base64'));
    },
    on(listener) {
      listeners.push(listener);
    },
    async close() {
      ws.close();
      chrome.kill();
      await sleep(200);
      rmSync(profile, { recursive: true, force: true });
    },
  };
  await page.viewport(width, height);
  return page;
}
