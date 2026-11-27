#!/usr/bin/env node
// Calibration study: for random test plans, compare Verdict's forecast chance of a winner with how often
// Flagsmith's exact rule (src/stats.ts, verified against Flagsmith's results API) calls a winner on
// simulated counts. Writes docs/CALIBRATION.md and docs/calibration.svg.
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { forecast } = await server.ssrLoadModule('/src/forecast.ts');
const { clearsFloor, inferLift } = await server.ssrLoadModule('/src/stats.ts');
await server.close();

const SCENARIOS = Number(process.argv[2] ?? 300);
const RUNS = Number(process.argv[3] ?? 1000);
let state = 20261127;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
const logUniform = (a, b) => Math.exp(Math.log(a) + rand() * (Math.log(b) - Math.log(a)));
function binomial(n, p) {
  if (n * p * (1 - p) > 9) return Math.min(n, Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gauss())));
  let k = 0;
  for (let i = 0; i < n; i++) if (rand() < p) k++;
  return k;
}

const rows = [];
while (rows.length < SCENARIOS) {
  const input = {
    baselineRate: logUniform(0.02, 0.5),
    relativeLift: 0.05 + rand() * 0.55,
    visitorsPerDay: logUniform(30, 5000),
    days: 0.5 + rand() * 6.5,
    rolloutShare: 1,
    variantShare: 0.3 + rand() * 0.4,
  };
  if (input.baselineRate * (1 + input.relativeLift) >= 0.95) continue;
  const f = forecast(input);
  const n0 = Math.round(f.controlN);
  const n1 = Math.round(f.variantN);
  let wins = 0;
  for (let r = 0; r < RUNS; r++) {
    const control = { visitors: n0, conversions: binomial(n0, f.controlRate) };
    const variant = { visitors: n1, conversions: binomial(n1, f.variantRate) };
    if (clearsFloor(control, variant) && (inferLift(control, variant)?.chanceToWin ?? 0) >= 0.95) wins++;
  }
  rows.push({ predicted: f.outcome.win, observed: wins / RUNS, minConversions: Math.min(n0 * f.controlRate, n1 * f.variantRate), minN: Math.min(n0, n1) });
}

const errors = rows.map((r) => Math.abs(r.predicted - r.observed));
const mae = errors.reduce((a, b) => a + b, 0) / rows.length;
const within5 = errors.filter((e) => e <= 0.05).length / rows.length;
const bins = Array.from({ length: 10 }, (_, i) => {
  const inBin = rows.filter((r) => r.predicted >= i / 10 && (r.predicted < (i + 1) / 10 || (i === 9 && r.predicted <= 1)));
  const mean = (k) => inBin.reduce((a, r) => a + r[k], 0) / (inBin.length || 1);
  return { range: `${i * 10}–${(i + 1) * 10}%`, n: inBin.length, predicted: mean('predicted'), observed: mean('observed') };
});

const W = 420;
const pad = 40;
const px = (v) => pad + v * W;
const py = (v) => pad + W - v * W;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + pad * 2} ${W + pad * 2}" font-family="system-ui, sans-serif" font-size="12">
<rect width="100%" height="100%" fill="#f5f7fa"/>
<line x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(1)}" stroke="#47566f" stroke-dasharray="4 4"/>
<line x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(0)}" stroke="#c3ccd8"/>
<line x1="${px(0)}" y1="${py(0)}" x2="${px(0)}" y2="${py(1)}" stroke="#c3ccd8"/>
${rows.map((r) => `<circle cx="${px(r.predicted).toFixed(1)}" cy="${py(r.observed).toFixed(1)}" r="2.6" fill="#2747d8" fill-opacity="0.45"/>`).join('\n')}
${bins.filter((b) => b.n).map((b) => `<circle cx="${px(b.predicted).toFixed(1)}" cy="${py(b.observed).toFixed(1)}" r="6" fill="#ffc83d" stroke="#0f2140" stroke-width="1.5"/>`).join('\n')}
<text x="${px(0.5)}" y="${W + pad * 2 - 8}" text-anchor="middle" fill="#13213a">Verdict's forecast chance of a winner</text>
<text transform="translate(14 ${py(0.5)}) rotate(-90)" text-anchor="middle" fill="#13213a">How often Flagsmith's rule called one</text>
<text x="${px(0)}" y="${py(0) + 16}" text-anchor="middle" fill="#47566f">0%</text><text x="${px(1)}" y="${py(0) + 16}" text-anchor="middle" fill="#47566f">100%</text>
<text x="${px(0) - 8}" y="${py(1) + 4}" text-anchor="end" fill="#47566f">100%</text>
</svg>
`;
writeFileSync('docs/calibration.svg', svg);

const md = `# Calibration

Is "60 in 100" really 60 in 100? \`node scripts/calibrate.mjs ${SCENARIOS} ${RUNS}\` draws ${SCENARIOS} random test plans
(baseline 2–50%, lift 5–60%, 30–5,000 visitors a day, half a day to a week, split 30–70%), asks Verdict for the
chance of a winner by the deadline, then simulates each plan ${RUNS.toLocaleString('en-US')} times and applies Flagsmith's exact
rule to the simulated counts: no result until every arm has 50 visitors and 5 conversions, then a winner at a 95%
chance to beat control computed the way Flagsmith computes it ([src/stats.ts](../src/stats.ts), which reproduces
Flagsmith's results API to 9 decimal places).

![Calibration plot](calibration.svg)

Blue dots are plans; yellow dots are the averages per 10% band of the forecast. On the dashed line, the forecast
is exactly right.

- Mean absolute difference between forecast and simulated frequency: **${(mae * 100).toFixed(1)} percentage points**.
- Plans forecast within 5 points: **${(within5 * 100).toFixed(0)}%**. Each simulated frequency has its own Monte Carlo error of up to
  ${(50 / Math.sqrt(RUNS)).toFixed(1)} points.

| Forecast band | Plans | Mean forecast | How often Flagsmith's rule called a winner |
|---|---|---|---|
${bins.map((b) => `| ${b.range} | ${b.n} | ${b.n ? (b.predicted * 100).toFixed(1) + '%' : '—'} | ${b.n ? (b.observed * 100).toFixed(1) + '%' : '—'} |`).join('\n')}

## What this study changed

The first version of the forecast treated Flagsmith's statistic as normally distributed. This study showed it was
too cautious at the extremes: plans it put at 15% actually won about 5% of the time, and plans at 85% won about 92%
(mean error 5.0 points). The cause is that Flagsmith's standard error is estimated from the same counts, so a high
observed variant rate also widens the interval and the statistic is skewed. The forecast now integrates the
statistic's actual distribution, solving for the variant rate at which it crosses the threshold for each plausible
control rate, and applies the 5-conversion floor to the observed counts. That brought the mean error to the level
of the Monte Carlo noise.
`;
writeFileSync('docs/CALIBRATION.md', md);
console.log(`MAE ${(mae * 100).toFixed(2)} pts, within 5 pts ${(within5 * 100).toFixed(0)}%`);
if (process.env.SPLIT)
  for (const [label, test] of [['near floor (<15 expected conversions)', (r) => r.minConversions < 15], ['clear of floor', (r) => r.minConversions >= 15]]) { const g = rows.filter(test); console.log(label, g.length, 'MAE', (g.reduce((a, r) => a + Math.abs(r.predicted - r.observed), 0) / g.length * 100).toFixed(2)); for (const r of g.filter((r) => r.predicted < 0.2).slice(0, 8)) console.log('   ', (r.predicted*100).toFixed(1), (r.observed*100).toFixed(1), r.minConversions.toFixed(1), r.minN); }
console.table(bins.map((b) => ({ band: b.range, n: b.n, forecast: (b.predicted * 100).toFixed(1), observed: (b.observed * 100).toFixed(1) })));
