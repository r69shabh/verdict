#!/usr/bin/env node
// Runs the Verdict experiment through the Flagsmith CLI (v2+). Credentials come from `flagsmith login`
// or FLAGSMITH_API_KEY; nothing secret is read or written by this script.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const FLAG = 'first_screen';
const VARIANT = 'worked_example';
const METRICS = [
  { name: 'forecast_own', direction: 'up', expected: 'increase', description: 'Ran a forecast with their own numbers (primary)' },
  { name: 'plan_copied', direction: 'up', expected: 'not_decrease', description: 'Copied the pre-registration or CLI plan (guardrail)' },
  { name: 'forecast_run', direction: 'informational', expected: 'increase', description: 'Pressed Forecast on a complete form, including the untouched example' },
];
const NAME = 'First screen: worked example vs empty form';
const HYPOTHESIS = readFileSync(new URL('../EXPERIMENT.md', import.meta.url), 'utf8').match(/## Hypothesis\n+([^\n]+)/)?.[1]?.trim();

const [command, ...rest] = process.argv.slice(2);
const opt = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
};
const has = (name) => rest.includes(`--${name}`);
const project = opt('project') ?? process.env.FLAGSMITH_PROJECT ?? 'Verdict';

function cli(args, input, quiet = false) {
  const out = execFileSync('flagsmith', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', quiet ? 'pipe' : 'inherit'] });
  return out.trim() ? JSON.parse(out) : null;
}
const api = (path, method = 'GET', body) =>
  cli(['api', `api/v1/${path}`, '-X', method, '--project', project, ...(body ? ['--input', '-'] : [])], body && JSON.stringify(body));
const list = (value) => (Array.isArray(value) ? value : (value?.results ?? []));

function environments() {
  return list(cli(['environment', 'list', '--project', project, '--json'])).map((e) => ({ name: e.name, key: e.api_key ?? e.key }));
}

function environment() {
  const wanted = opt('env');
  if (!wanted) fail('Pass --env <environment name or client-side key>.');
  const env = environments().find((e) => e.name === wanted || e.key === wanted);
  if (!env) fail(`No environment "${wanted}" in project ${project}. Run: node scripts/lab.mjs envs`);
  return env;
}

function feature() {
  const f = cli(['feature', 'get', FLAG, '--project', project, '--json'], undefined, true);
  const option = (f.variants ?? f.multivariate_options ?? []).find((o) => o.key === VARIANT || o.value === VARIANT);
  return { id: f.id, variantId: option?.id, raw: f };
}

function experimentFor(env) {
  const { id } = feature();
  return list(api(`environments/${env.key}/experiments/`)).filter((e) => e.feature === id || e.feature?.id === id).at(-1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function save(env, kind, data) {
  mkdirSync('results/latest', { recursive: true });
  const slug = env.name.toLowerCase().replace(/\W+/g, '-');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `results/${slug}-${kind}-${stamp}.json`;
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  writeFileSync(`results/latest/${slug}.json`, JSON.stringify(data, null, 2) + '\n');
  return file;
}


const pct = (x) => `${(100 * x).toFixed(1)}%`;
const signed = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`;

function summarise(snapshot, ledger) {
  const names = Object.fromEntries((snapshot.experiment.metrics ?? []).map((m) => [m.metric, m.metric_name]));
  const payload = snapshot.results?.results?.payload ?? snapshot.results?.payload;
  if (!payload) return console.log('No computed results yet. Refresh and try again in a minute.');
  const exposures = payload.exposures_timeseries?.points?.reduce((acc, p) => {
    for (const [arm, n] of Object.entries(p.new_identities)) acc[arm] = (acc[arm] ?? 0) + n;
    return acc;
  }, {});
  console.log(`\n${snapshot.environment}: experiment #${snapshot.experiment.id} (${snapshot.experiment.status}), as of ${snapshot.results?.results?.as_of ?? '?'}`);
  console.log(`  exposures ${JSON.stringify(exposures)}${ledger ? `  ledger ${JSON.stringify(Object.fromEntries(Object.entries(ledger.arms).map(([k, v]) => [k, v.exposed])))}` : ''}  SRM p-value ${payload.srm_p_value ?? 'n/a'}`);
  let mismatches = 0;
  for (const metric of payload.metrics) {
    const name = names[metric.metric_id] ?? metric.metric_id;
    const c = metric.variants.control ?? { sum: 0, n: 0 };
    const v = metric.variants[VARIANT] ?? { sum: 0, n: 0 };
    const inf = metric.inference?.[VARIANT];
    const verdict = !inf ? 'collecting data' : inf.chance_to_win >= 0.95 ? 'WINNING' : inf.chance_to_win <= 0.05 ? 'LOSING' : 'inconclusive';
    let check = '';
    if (ledger) {
      const ok = ['control', VARIANT].every((arm) => metric.variants[arm]?.sum === ledger.arms[arm][name] && metric.variants[arm]?.n === ledger.arms[arm].exposed);
      if (!ok) mismatches++;
      check = ok ? '  ledger: exact match' : '  ledger: MISMATCH';
    }
    console.log(`  ${String(name).padEnd(13)} control ${c.sum}/${c.n} (${pct(c.sum / (c.n || 1))})  ${VARIANT} ${v.sum}/${v.n} (${pct(v.sum / (v.n || 1))})  ` +
      (inf ? `lift ${signed(inf.lift)} [${signed(inf.ci_low)}, ${signed(inf.ci_high)}]  chance to win ${pct(inf.chance_to_win)}  ${verdict}` : verdict) + check);
  }
  if (ledger) console.log(mismatches ? `  ${mismatches} metric(s) differ from the ledger` : '  every count matches the simulator ledger');
}

function latest(prefix) {
  const files = readdirSync('results').filter((f) => f.startsWith(prefix)).sort();
  return files.length ? `results/${files.at(-1)}` : null;
}

const commands = {
  envs() {
    for (const env of environments()) {
      const warehouses = list(api(`environments/${env.key}/warehouse-connections/`));
      const exp = (() => { try { return experimentFor(env); } catch { return undefined; } })();
      console.log(`${env.name.padEnd(14)} ${env.key}  warehouse: ${warehouses.map((w) => `${w.warehouse_type}/${w.status} (${w.total_events_received ?? 0} events)`).join(', ') || 'none'}  experiment: ${exp ? `#${exp.id} ${exp.status}` : 'none'}`);
    }
  },

  warehouse() {
    const env = environment();
    const existing = list(api(`environments/${env.key}/warehouse-connections/`));
    if (existing.length) return console.log(`${env.name}: already has ${existing.map((w) => `${w.warehouse_type}/${w.status}`).join(', ')}`);
    const created = api(`environments/${env.key}/warehouse-connections/`, 'POST', { warehouse_type: 'flagsmith', name: 'Flagsmith' });
    console.log(`${env.name}: managed warehouse ${created.status}`);
  },

  flag() {
    let f;
    try { f = feature(); } catch { f = null; }
    if (!f) {
      cli(['feature', 'create', FLAG, '--project', project, '--value', 'control', '--enabled', '--description', 'Verdict first screen: control = empty form, worked_example = pre-filled example', '--json']);
      f = feature();
    }
    if (!f.variantId) {
      cli(['feature', 'variant', 'add', FLAG, '--project', project, '--value', VARIANT, '--key', VARIANT, '--weight', '0', '--json']);
      f = feature();
    }
    console.log(`flag ${FLAG} #${f.id}, variant ${VARIANT} #${f.variantId}`);
  },

  setup() {
    const env = environment();
    const { id, variantId } = feature();
    if (!variantId) fail(`Run "node scripts/lab.mjs flag" first: ${FLAG} has no ${VARIANT} variant.`);
    if (!HYPOTHESIS) fail('EXPERIMENT.md has no "## Hypothesis" line.');
    const existing = list(api(`environments/${env.key}/experiment-metrics/`));
    const ids = METRICS.map((m) => {
      const found = existing.find((e) => e.name === m.name);
      if (found) return found.id;
      return api(`environments/${env.key}/experiment-metrics/`, 'POST', {
        name: m.name, description: m.description, aggregation: 'occurrence', direction: m.direction, definition: { version: 1, event: m.name },
      }).id;
    });
    const current = experimentFor(env);
    if (current) return console.log(`${env.name}: experiment #${current.id} already exists (${current.status})`);
    const exp = api(`environments/${env.key}/experiments/`, 'POST', {
      feature: id,
      name: NAME,
      hypothesis: HYPOTHESIS,
      metrics: METRICS.map((m, i) => ({ metric: ids[i], expected_direction: m.expected })),
      experiment_rollout: {
        enabled: true,
        rollout_percentage: 100,
        feature_state_value: { type: 'string', value: 'control' },
        multivariate_feature_state_values: [{ multivariate_feature_option: variantId, percentage_allocation: 50 }],
      },
    });
    console.log(`${env.name}: created experiment #${exp.id} (${exp.status}). Start it with: node scripts/lab.mjs start --env "${env.name}"`);
  },

  start() {
    const env = environment();
    const exp = experimentFor(env) ?? fail(`${env.name}: no experiment yet. Run setup first.`);
    if (exp.status !== 'running') api(`environments/${env.key}/experiments/${exp.id}/start/`, 'POST', {});
    console.log(`${env.name}: experiment #${exp.id} is ${experimentFor(env).status}`);
  },

  snapshot() {
    for (const name of ['Production', 'Sim AA', 'Sim AB']) {
      rest.splice(0, rest.length, '--env', name, '--refresh');
      commands.results();
    }
  },

  results() {
    const env = environment();
    const exp = experimentFor(env) ?? fail(`${env.name}: no experiment yet.`);
    if (has('refresh')) {
      try {
        api(`environments/${env.key}/experiments/${exp.id}/exposures/refresh/`, 'POST', {});
        api(`environments/${env.key}/experiments/${exp.id}/results/refresh/`, 'POST', {});
        console.log('Refresh requested; Flagsmith allows one every 5 minutes. Results may take a minute to update.');
      } catch {
        console.log('Refresh refused (probably within 5 minutes of the last one). Reading the current results.');
      }
    }
    const snapshot = {
      environment: env.name,
      taken_at: new Date().toISOString(),
      experiment: api(`environments/${env.key}/experiments/${exp.id}/`),
      exposures: api(`environments/${env.key}/experiments/${exp.id}/exposures/`),
      results: api(`environments/${env.key}/experiments/${exp.id}/results/`),
    };
    summarise(snapshot);
    console.log(`  saved ${save(env, 'results', snapshot)}`);
  },

  verify() {
    const env = environment();
    const file = latest(`${env.name.toLowerCase().replace(/\W+/g, '-')}-results-`) ?? fail(`No saved results for ${env.name}. Run results first.`);
    const ledgerFile = opt('ledger') ?? fail('Pass --ledger sim-ledgers/<run>.json');
    summarise(JSON.parse(readFileSync(file, 'utf8')), JSON.parse(readFileSync(ledgerFile, 'utf8')));
    console.log(`  (${file} vs ${ledgerFile})`);
  },

  complete() {
    const env = environment();
    const decision = opt('decision');
    if (!['control', 'variant', 'disable'].includes(decision)) fail('Pass --decision control|variant|disable.');
    if (!has('yes')) fail(`This ends the ${env.name} experiment for good and rolls out "${decision}". Re-run with --yes to confirm.`);
    const exp = experimentFor(env) ?? fail(`${env.name}: no experiment.`);
    const body = { rollout_decision: decision, ...(decision === 'variant' ? { rollout_variant: feature().variantId } : {}) };
    api(`environments/${env.key}/experiments/${exp.id}/complete/`, 'POST', body);
    console.log(`${env.name}: experiment #${exp.id} is ${experimentFor(env).status}; rolled out ${decision}.`);
  },
};

if (!commands[command]) {
  console.log(`Usage: node scripts/lab.mjs <command> [--env <name|key>] [--project ${project}]

  envs                         list environments, warehouse status and experiment status
  warehouse --env <e>          enable the managed Flagsmith warehouse for an environment
  flag                         create the ${FLAG} flag and its ${VARIANT} variant (project-wide, idempotent)
  setup --env <e>              create the three metrics and the experiment (not started)
  start --env <e>              start the experiment (locks the flag)
  results --env <e> [--refresh]  snapshot experiment, exposures and results to results/
  snapshot                     refresh and save results for Production, Sim AA and Sim AB
  verify --env <e> --ledger <file>   compare the latest saved results with a simulator ledger
  complete --env <e> --decision control|variant|disable --yes   end it and roll out the decision`);
  process.exit(command ? 1 : 0);
}
commands[command]();
