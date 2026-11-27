#!/usr/bin/env node
// End-to-end checks against the built app (`pnpm build` first). Uses preview mode, so nothing is sent
// to Flagsmith; the run fails if any request reaches a Flagsmith host.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch } from './browser.mjs';

const PORT = 4318;
const BASE = `http://127.0.0.1:${PORT}`;
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {}
  await sleep(250);
}

const failures = [];
let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

const LABELS = {
  visitors: 'Visitors per day',
  baseline: 'Baseline conversion rate, percent',
  lift: 'Expected relative lift, percent',
  deadline: 'Deadline',
  rollout: 'Share of visitors in the test, percent',
  split: 'Share of the test that sees the change, percent',
  success: 'What counts as success',
  change: 'The change you are testing',
};
const inDays = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setHours(20, 0, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T20:00`;
};
const labelled = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [LABELS[k], v]));
const pageHealth = (page) =>
  page.eval(`(() => {
    const text = document.body.innerText.replace('/dev/null', '');
    const bad = ['NaN', 'Infinity', 'undefined'].filter((w) => new RegExp('\\\\b' + w + '\\\\b').test(text));
    const wide = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return { bad, wide };
  })()`);

async function axe(page, label) {
  await page.eval(axeSource);
  const result = await page.eval(`axe.run(document, { resultTypes: ['violations'] }).then((r) => r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id + ': ' + v.nodes.length))`);
  assert(result.length === 0, `${label} accessibility: ${result.join(', ')}`);
}

const page = await launch({ width: 1280 });
console.log('Planner');
await step('empty form renders without a forecast', async () => {
  await page.goto(`${BASE}/?preview=control`);
  assert((await page.eval(`document.querySelectorAll('input.blank').length`)) === 8, 'expected 8 blanks');
  assert((await page.eval(`document.querySelector('input[aria-label="Visitors per day"]').value`)) === '', 'control must start empty');
  assert(/one way your test could play out/.test(await page.eval(`document.querySelector('.forecast h2').textContent`)), 'empty panel copy');
  await axe(page, 'empty form');
});
await step('a filled form gives a forecast, a plan and a CLI block', async () => {
  await page.fill(labelled({ visitors: '600', baseline: '30', lift: '20', deadline: inDays(2), success: 'sign up', change: 'A clearer headline' }));
  await page.click('.go');
  const headline = await page.eval(`document.querySelector('.forecast h2').textContent`);
  assert(/^\d{1,2} in 100$/.test(headline.trim()), `headline was "${headline}"`);
  const blocks = await page.eval(`[...document.querySelectorAll('.plan pre')].map((p) => p.textContent)`);
  assert(blocks.length === 2 && blocks[0].includes('## Decision rule') && blocks[1].includes('flagsmith feature create a_clearer_headline'), 'plan blocks');
  await axe(page, 'forecast');
});
await step('worked example is pre-filled and forecasts as is', async () => {
  await page.goto(`${BASE}/?preview=worked_example`);
  assert((await page.eval(`document.querySelector('input[aria-label="Visitors per day"]').value`)) === '800', 'example visitors');
  await page.click('.go');
  assert(/in 100/.test(await page.eval(`document.querySelector('.forecast h2').textContent`)), 'forecast shown');
});
await step('preview mode says nothing is counted', async () => {
  assert(/Nothing you do here is counted/.test(await page.eval(`document.querySelector('.disclosure').textContent`)), 'disclosure');
});

const worst = [
  { visitors: '1,000,000', baseline: '50', lift: '1', deadline: inDays(1) },
  { visitors: '5', baseline: '0.5', lift: '10', deadline: inDays(1) },
  { visitors: '500', baseline: '99', lift: '5', deadline: inDays(2) },
  { visitors: 'abc', baseline: 'ten', lift: '?', deadline: inDays(2) },
  { visitors: '50', baseline: '2', lift: '5', deadline: '2031-01-01T00:00' },
  { visitors: '10000', baseline: '10', lift: '20', deadline: inDays(3), rollout: '1', split: '1' },
  { visitors: '1.200', baseline: '12,5', lift: '7,5', deadline: inDays(3) },
  { visitors: '-500', baseline: '-3', lift: '-20', deadline: inDays(-1) },
  { visitors: '900', baseline: '8', lift: '1000', deadline: inDays(2), success: 'x'.repeat(300), change: '$(touch /tmp/x) "quoted" \\\\ 🚀' },
];
for (const width of [1280, 390]) {
  await step(`worst-case inputs at ${width}px: no NaN, no overflow, no script errors`, async () => {
    await page.viewport(width);
    for (const values of worst) {
      await page.goto(`${BASE}/?preview=control`, 500);
      await page.fill(labelled(values));
      await page.click('.go', 250);
      const health = await pageHealth(page);
      assert(health.bad.length === 0, `${JSON.stringify(values)} showed ${health.bad}`);
      assert(!health.wide, `${JSON.stringify(values)} overflowed the page`);
    }
    assert(page.problems.length === 0, page.problems.join(' | '));
  });
}
await page.viewport(1280);

console.log('Lab and check');
await step('/lab shows all three environments', async () => {
  await page.goto(`${BASE}/lab`);
  const titles = await page.eval(`[...document.querySelectorAll('.lab-env h2')].map((h) => h.textContent)`);
  assert(['Production', 'Sim AB', 'Sim AA'].every((t) => titles.includes(t)), `got ${titles}`);
  await axe(page, 'lab');
});
await step('/check reproduces the Sim AB reading', async () => {
  await page.goto(`${BASE}/check`);
  await page.eval(`[...document.querySelectorAll('button.link')].find((b) => b.textContent.includes('planted')).click()`);
  await sleep(400);
  const facts = await page.eval(`[...document.querySelectorAll('.facts dd')].map((d) => d.textContent)`);
  assert(facts[0] === 'Winning' && facts[1] === '99.9%', `got ${facts}`);
  await axe(page, 'check');
});

await step('preview pages never contacted Flagsmith', async () => {
  const hits = page.requests.filter((u) => /flagsmith\.com/.test(u));
  assert(hits.length === 0, hits.join(', '));
});

await page.close();
server.kill();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
