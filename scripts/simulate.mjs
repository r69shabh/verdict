#!/usr/bin/env node
// Seeded traffic simulator for the Sim AA / Sim AB environments. Every simulated visitor is fetched
// through getExperimentFlag (which records the exposure) and then behaves according to a planted
// model. A ledger of exactly what was sent is written to sim-ledgers/ so Flagsmith's counts can be
// checked against ground truth. Never point this at Production.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

if (has('help') || !opt('mode')) {
  console.log(`Usage: FLAGSMITH_SIM_ENVIRONMENT_KEY=<key> node scripts/simulate.mjs --mode aa|ab [options]

  --mode aa|ab        aa: both arms behave the same; ab: the variant gets the planted lift
  --visitors N        simulated visitors (default 1000 for aa, 2000 for ab)
  --seed S            seed for identities and behaviour (default 7)
  --control-rate P    forecast_own rate in control (default 0.30)
  --lift L            relative lift for the variant in ab mode (default 0.25)
  --concurrency C     parallel flag requests (default 6)
  --dry-run           assign arms locally, send nothing, print the expected ledger
  --yes               required for a live run`);
  process.exit(0);
}

const mode = opt('mode');
if (!['aa', 'ab'].includes(mode)) throw new Error('--mode must be aa or ab');
const visitors = Number(opt('visitors', mode === 'aa' ? 1000 : 2000));
const seed = Number(opt('seed', 7));
const controlRate = Number(opt('control-rate', 0.3));
const lift = mode === 'ab' ? Number(opt('lift', 0.25)) : 0;
const concurrency = Number(opt('concurrency', 6));
const dryRun = has('dry-run');
const key = process.env.FLAGSMITH_SIM_ENVIRONMENT_KEY;

// Behaviour model (per visitor, independent draws):
// - forecast_own with p = controlRate (control) or controlRate × (1 + lift) (variant)
// - visitors who did not forecast their own numbers still press Forecast on the example with
//   p = 0.25 in the variant and p = 0.06 in control (a stray click on an incomplete form); in aa mode
//   both arms use 0.12. This is the bias that makes forecast_run a misleading metric.
// - visitors who forecast their own numbers copy the plan with p = 0.35
const RUN_WITHOUT_OWN = mode === 'aa' ? { control: 0.12, worked_example: 0.12 } : { control: 0.06, worked_example: 0.25 };
const COPY_GIVEN_OWN = 0.35;

function rng(label) {
  let state = createHash('sha256').update(`${seed}:${label}`).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const runId = `sim_${mode}_s${seed}_${Date.now().toString(36)}`;
const arms = () => ({ exposed: 0, forecast_own: 0, forecast_run: 0, plan_copied: 0 });
const ledger = { runId, mode, seed, visitors, controlRate, lift, model: { RUN_WITHOUT_OWN, COPY_GIVEN_OWN }, dryRun, startedAt: new Date().toISOString(), notEnrolled: 0, errors: 0, arms: { control: arms(), worked_example: arms() } };

let flagsmith;
if (!dryRun) {
  if (!key) throw new Error('Set FLAGSMITH_SIM_ENVIRONMENT_KEY to the Sim environment key.');
  if (!has('yes')) throw new Error(`About to send ${visitors} simulated visitors to environment key …${key.slice(-4)}. Re-run with --yes if that is a Sim environment.`);
  const { Flagsmith } = await import('@flagsmith/nodejs');
  flagsmith = new Flagsmith({ environmentKey: key, enableEvents: true, eventProcessorConfig: { maxBuffer: 500, flushInterval: 2000 } });
}

async function visit(i) {
  const identifier = `${runId}_${String(i).padStart(5, '0')}`;
  const draw = rng(identifier);
  let arm;
  if (dryRun) {
    arm = draw() < 0.5 ? 'control' : 'worked_example';
  } else {
    const flag = await flagsmith.getExperimentFlag('first_screen', identifier);
    if (!flag.experiment?.inExperiment) return void ledger.notEnrolled++;
    arm = flag.value === 'worked_example' ? 'worked_example' : 'control';
  }
  const tally = ledger.arms[arm];
  tally.exposed++;
  const own = draw() < (arm === 'worked_example' ? controlRate * (1 + lift) : controlRate);
  const send = (event) => {
    tally[event]++;
    if (!dryRun) flagsmith.trackEvent(event, { identifier });
  };
  if (own || draw() < RUN_WITHOUT_OWN[arm]) send('forecast_run');
  if (own) send('forecast_own');
  if (own && draw() < COPY_GIVEN_OWN) send('plan_copied');
}

let next = 0;
let done = 0;
async function worker() {
  while (next < visitors) {
    const i = next++;
    try {
      await visit(i);
    } catch (error) {
      ledger.errors++;
      if (ledger.errors <= 3) console.error(`visitor ${i}: ${error.message}`);
    }
    if (++done % 200 === 0) process.stdout.write(`  ${done}/${visitors}\n`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, visitors) }, worker));
if (flagsmith) await flagsmith.close(30_000);
ledger.finishedAt = new Date().toISOString();

console.log(`\n${dryRun ? 'Dry run' : 'Sent'}: ${runId}`);
for (const [arm, t] of Object.entries(ledger.arms)) {
  const rate = (n) => (t.exposed ? ((100 * n) / t.exposed).toFixed(1) : '0.0');
  console.log(`  ${arm.padEnd(15)} exposed ${String(t.exposed).padStart(5)}   forecast_own ${rate(t.forecast_own)}%   forecast_run ${rate(t.forecast_run)}%   plan_copied ${rate(t.plan_copied)}%`);
}
if (ledger.notEnrolled) console.log(`  not enrolled: ${ledger.notEnrolled}`);
if (ledger.errors) console.log(`  errors: ${ledger.errors}`);
if (!dryRun) {
  mkdirSync('sim-ledgers', { recursive: true });
  writeFileSync(`sim-ledgers/${runId}.json`, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`  ledger: sim-ledgers/${runId}.json`);
}
