# Verdict

**Will your A/B test reach a verdict before your deadline?** Verdict takes your traffic, baseline
rate, expected lift and deadline, and tells you how likely Flagsmith Experimentation is to call a
winner in time, how much traffic you would need for an 80% chance, and gives you a pre-registration
and the Flagsmith CLI commands to set the experiment up.

Live: https://verdict.rishabhgusain-6.workers.dev · Pre-registration: [EXPERIMENT.md](EXPERIMENT.md)

Built for [Toggle Wars](https://www.wemakedevs.org/hackathons/flagsmith), Track 01: Test Something Real.

## The experiment this app runs on itself

Verdict's first screen is a sentence with blanks. The experiment asks whether filling those blanks
with a worked example gets more visitors to forecast **their own** test than leaving them empty.

| | |
|---|---|
| Flag | `first_screen`: `control` (empty form) vs `worked_example` (pre-filled) |
| Primary metric | `forecast_own`: forecast shown for numbers that are not the untouched example |
| Guardrail | `plan_copied`: should not decrease |
| Informational | `forecast_run`: any press of Forecast, which the example inflates by design |
| Split | 100% of visitors, 50/50, by a random visitor ID |
| Decision rule | ship at ≥95% chance to beat control with no SRM and a healthy guardrail; otherwise keep control |

The full hypothesis, power analysis and decision rule were committed in [EXPERIMENT.md](EXPERIMENT.md)
before the Production experiment started.

Three Flagsmith environments keep real and scripted traffic apart:

- **Production**: real visitors only.
- **Sim AA**: scripted visitors with no difference between arms. Expect no winner and no sample ratio mismatch.
- **Sim AB**: scripted visitors with a planted +25% lift. Expect Flagsmith to recover it.

The simulator writes a ground-truth ledger of every exposure and event it sent
([sim-ledgers/](sim-ledgers/)), so Flagsmith's counts can be checked against what really happened.

Every action on the experiments is in [RUNLOG.md](RUNLOG.md). Results: see [RESULTS.md](RESULTS.md) (written at the end of the hackathon from saved snapshots in [results/](results/)).

## How Flagsmith is used

- **Multivariate flag** `first_screen` serves the two versions of the first screen.
- **`getExperimentFlag`** in the browser SDK records the exposure at the moment the form renders
  ([src/experiment.ts](src/experiment.ts)). Visitors are identified by a random ID in localStorage, so
  bucketing is stable across reloads.
- **`trackEvent`** sends `forecast_own`, `forecast_run` and `plan_copied`. Events flush right away and on
  tab hide, and event requests use `keepalive` so a conversion right before closing the tab still arrives.
- **Experimentation**: three occurrence metrics, one experiment per environment, Flagsmith's managed
  warehouse, results read from the results API.
- **Flagsmith CLI v2** sets everything up and operates it ([scripts/lab.mjs](scripts/lab.mjs)): enable the
  warehouse, create the flag and variant, the metrics and the experiment, start it, snapshot results,
  and complete it with a rollout decision, which ships the winner through the same flag.
- **Node SDK** drives the seeded simulator ([scripts/simulate.mjs](scripts/simulate.mjs)).
- The forecast mirrors Flagsmith's decision rules: a winner at a 95% chance to beat control, and no
  result until every arm has 50 identities and 5 conversions ([src/forecast.ts](src/forecast.ts)).

## The forecast

For each arm the posterior on the conversion rate is approximated by a normal distribution. With true
rates p₀ and p₁ and n₀, n₁ visitors by the deadline, the observed difference has standard error
σ = √(p₀(1−p₀)/n₀ + p₁(1−p₁)/n₁), and Flagsmith calls the change the winner when the difference
exceeds z₀.₉₅·σ. So the chance of a verdict is Φ((p₁−p₀)/σ − 1.645), the chance of calling it the wrong
way is Φ(−(p₁−p₀)/σ − 1.645), and the traffic for an 80% chance solves (p₁−p₀)/σ = 1.645 + 0.842.
[src/forecast.test.ts](src/forecast.test.ts) checks this against a Monte Carlo of the beta-binomial
decision.

## Run it

Requires Node 22 and pnpm 12.

```sh
pnpm install --frozen-lockfile
pnpm dev                      # http://localhost:5173 (no key: empty form, nothing counted)
pnpm test && pnpm build
```

Preview either version without recording anything: `/?preview=control` or `/?preview=worked_example`.

### Set up the experiment in your own Flagsmith project

```sh
brew install Flagsmith/tap/flagsmith      # CLI v2
flagsmith login
pnpm lab envs                             # environments, warehouse and experiment status
pnpm lab warehouse --env Production       # managed warehouse (repeat per environment)
pnpm lab flag                             # first_screen + worked_example variant
pnpm lab setup --env Production           # metrics + experiment, not started
pnpm lab start --env Production
```

Build the app against an environment with its client-side key (public by design):

```sh
VITE_FLAGSMITH_ENVIRONMENT_KEY=<client-side key> pnpm build
pnpm exec wrangler deploy                 # or serve dist/ anywhere static
```

### Send simulated traffic (Sim environments only)

```sh
node scripts/simulate.mjs --mode aa --dry-run                     # see the planted model
FLAGSMITH_SIM_ENVIRONMENT_KEY=<Sim AA key> node scripts/simulate.mjs --mode aa --yes
FLAGSMITH_SIM_ENVIRONMENT_KEY=<Sim AB key> node scripts/simulate.mjs --mode ab --yes
pnpm lab results --env "Sim AB" --refresh
```

## Privacy

No accounts and no personal data. Each browser gets a random ID (`v_<uuid>`) used only to keep the
same version across visits and to join exposures with events in Flagsmith.
