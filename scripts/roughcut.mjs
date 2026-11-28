#!/usr/bin/env node
// Builds demo/rough-cut.mp4: title cards (rendered with the app's own type) between the clips from
// scripts/record.mjs. Add the voiceover and Flagsmith dashboard footage on top. Requires ffmpeg.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const font = new URL('../node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2', import.meta.url).href;
const cards = [
  ['title', 'Verdict', 'Will your A/B test reach a verdict before your deadline?'],
  ['tests-itself', 'It runs a Flagsmith experiment on itself', 'Empty form or worked example: which gets more people to plan their own test?'],
  ['proof', 'Proving the pipeline first', 'A/A: no false winner. Planted +25%: found at +24.8%. Every count matches the ledger.'],
  ['maths', 'Verdict’s maths is Flagsmith’s maths', 'Reproduces Flagsmith’s results to 9 decimal places. Forecasts calibrated within 0.6 points.'],
  ['check', 'Already running a test?', 'Check whether it will finish in time.'],
  ['end', 'verdict.r69.workers.dev', 'github.com/r69shabh/verdict · Toggle Wars, Track 01'],
];
const page = await launch({ width: 1920, height: 1080 });
for (const [name, title, line] of cards) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: S; src: url('${font}') format('woff2'); font-weight: 400 900; }
    html, body { margin: 0; height: 100%; }
    body { background: #0f2140; color: #eef2f8; font-family: S; display: grid; place-content: center; padding: 0 180px; }
    h1 { font-size: ${name === 'end' ? 76 : 96}px; font-weight: 780; letter-spacing: -0.03em; margin: 0 0 28px; color: ${name === 'title' ? '#ffc83d' : '#eef2f8'}; }
    p { font-size: 40px; line-height: 1.35; margin: 0; color: #c9d3e4; max-width: 30ch; }
  </style><h1>${title}</h1><p>${line}</p>`;
  writeFileSync(`demo/card-${name}.html`, html);
  await page.goto(`file://${process.cwd()}/demo/card-${name}.html`, 700);
  await page.screenshot(`demo/card-${name}.png`, { full: false });
}
await page.close();

const sequence = ['card-title', 'plan', 'card-tests-itself', 'example', 'card-proof', 'lab', 'card-maths', 'card-check', 'check', 'card-end'];
const parts = [];
for (const item of sequence) {
  const out = `demo/part-${item}.mp4`;
  if (item.startsWith('card-')) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-t', '3', '-i', `demo/${item}.png`, '-vf', 'scale=1920:1080,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', out]);
  } else {
    if (!existsSync(`demo/${item}.mp4`)) throw new Error(`demo/${item}.mp4 missing: run node scripts/record.mjs first`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `demo/${item}.mp4`, '-vf', 'scale=1920:1080,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', out]);
  }
  parts.push(`file 'part-${item}.mp4'`);
}
writeFileSync('demo/parts.txt', parts.join('\n') + '\n');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'demo/parts.txt', '-c', 'copy', '-movflags', '+faststart', 'demo/rough-cut.mp4']);
console.log('demo/rough-cut.mp4');
