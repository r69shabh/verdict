#!/usr/bin/env node
// Records screen footage for the demo video from the built app in preview mode (nothing is counted).
// Writes demo/<scene>.mp4 at 1920×1080. Requires ffmpeg. Usage: pnpm build && node scripts/record.mjs [scene...]
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const PORT = 4322;
const BASE = process.env.DEMO_BASE ?? `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = process.env.DEMO_BASE ? null : spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
await sleep(2500);
mkdirSync('demo', { recursive: true });

async function record(name, act) {
  const page = await launch({ width: 1920, height: 1080 });
  const dir = `demo/.frames-${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  page.on((m) => {
    if (m.method !== 'Page.screencastFrame') return;
    const file = `${dir}/${String(frames.length).padStart(5, '0')}.jpg`;
    writeFileSync(file, Buffer.from(m.params.data, 'base64'));
    frames.push({ file, t: m.params.metadata.timestamp });
    page.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
  });
  const type = async (label, text) => {
    await page.eval(`document.querySelector('input[aria-label="${label}"]').focus()`);
    for (const ch of text) {
      await page.send('Input.insertText', { text: ch });
      await sleep(70 + Math.random() * 60);
    }
    await sleep(250);
  };
  const scrollTo = async (expr) => {
    await page.eval(`window.scrollTo({ top: ${expr}, behavior: 'smooth' })`);
    await sleep(1400);
  };
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await act({ page, type, scrollTo, sleep });
  await sleep(1200);
  await page.send('Page.stopScreencast');
  await page.close();
  const end = frames.at(-1).t + 1;
  const list = frames.map((f, i) => `file '${f.file.replace('demo/', '')}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(3)}`).join('\n');
  writeFileSync('demo/list.txt', `${list}\nfile '${frames.at(-1).file.replace('demo/', '')}'\n`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'demo/list.txt', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', `demo/${name}.mp4`]);
  rmSync(dir, { recursive: true, force: true });
  rmSync('demo/list.txt');
  console.log(`demo/${name}.mp4  (${frames.length} frames)`);
}

const deadline = (() => {
  const end = Date.parse('2026-11-29T14:30:00Z');
  const d = new Date(end > Date.now() + 6 * 3600_000 ? end : Date.now() + 2 * 86400_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
})();

const scenes = {
  async plan({ page, type, scrollTo, sleep }) {
    await page.goto(`${BASE}/?preview=control`, 1500);
    await sleep(1200);
    await type('Visitors per day', '600');
    await type('Baseline conversion rate, percent', '4.2');
    await type('What counts as success', 'check out');
    await type('The change you are testing', 'a one-page checkout');
    await type('Expected relative lift, percent', '15');
    await page.fill({ Deadline: deadline });
    await sleep(600);
    await page.click('.go', 2200);
    await sleep(1500);
    await page.fill({ 'Expected relative lift, percent': '40' });
    await sleep(1800);
    await scrollTo(`document.querySelector('.plan').offsetTop - 24`);
    await sleep(1500);
    await page.click('.block .copy', 1500);
  },
  async example({ page, sleep }) {
    await page.goto(`${BASE}/?preview=worked_example`, 1500);
    await sleep(1500);
    await page.click('.go', 2500);
    await sleep(1500);
  },
  async check({ page, scrollTo, sleep }) {
    await page.goto(`${BASE}/check`, 1500);
    await sleep(1200);
    await page.eval(`[...document.querySelectorAll('button.link')].find((b) => b.textContent.includes('planted')).click()`);
    await sleep(3000);
    await page.fill({ 'Visitors who saw the change': '1019', 'Conversions on the change': '320' });
    await sleep(2500);
  },
  async lab({ scrollTo, page, sleep }) {
    await page.goto(`${BASE}/lab`, 1500);
    await sleep(1500);
    await scrollTo(`document.querySelectorAll('.lab-env')[1].offsetTop - 16`);
    await sleep(3500);
    await scrollTo(`document.querySelectorAll('.lab-env')[2].offsetTop - 16`);
    await sleep(3000);
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenes);
for (const name of wanted) await record(name, scenes[name]);
server?.kill();
