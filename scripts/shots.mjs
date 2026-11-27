#!/usr/bin/env node
// Regenerates docs/screenshots from the built app in preview mode (nothing is sent to Flagsmith).
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { launch } from './browser.mjs';

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const out = (name) => `docs/screenshots/${name}.png`;
const shrink = (file, width) => execFileSync('magick', [file, '-resize', `${width}x`, '-strip', file]);

const page = await launch({ width: 1440, height: 900, scale: 2 });
await page.goto(`${BASE}/?preview=control`, 1200);
await page.screenshot(out('planner-empty'), { full: false });
await page.goto(`${BASE}/?preview=worked_example`, 1200);
await page.click('.go', 1200);
await page.screenshot(out('planner-forecast'), { full: false });
await page.eval(`window.scrollTo(0, document.querySelector('.plan').offsetTop - 24)`);
await sleep(300);
await page.screenshot(out('planner-plan'), { full: false });
await page.goto(`${BASE}/check`, 1000);
await page.eval(`[...document.querySelectorAll('button.link')].find((b) => b.textContent.includes('planted')).click()`);
await sleep(800);
await page.screenshot(out('check'), { full: false });
await page.goto(`${BASE}/lab`, 1000);
await page.eval(`window.scrollTo(0, document.querySelectorAll('.lab-env')[1].offsetTop - 16)`);
await sleep(300);
await page.screenshot(out('lab'), { full: false });
await page.viewport(390, 844);
await page.goto(`${BASE}/?preview=worked_example`, 1000);
await page.click('.go', 1000);
await page.screenshot(out('mobile'), { full: false });
await page.close();
server.kill();
for (const name of ['planner-empty', 'planner-forecast', 'planner-plan', 'check', 'lab']) shrink(out(name), 1600);
shrink(out('mobile'), 520);
console.log('screenshots written to docs/screenshots/');
