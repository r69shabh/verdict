# Notes for the Flagsmith team

Things I ran into while building on Experimentation (beta), with the evidence. Offered as feedback, not complaints:
the product made a rigorous experiment possible in a day.

## Statistics

- **Chance to win is reproducible as a delta-method z on the relative lift.** From each variant's `n`, `sum` and
  `sum_squares`, lift = m₁/m₀ − 1, se = √(v₁/m₀² + (m₁/m₀)²·v₀/m₀²) with sample variances (n − 1), interval
  lift ± 1.96·se, and chance to win Φ(lift/se) reproduce the results API to 9 decimal places
  ([src/stats.test.ts](../src/stats.test.ts)). The docs describe the engine as Bayesian; documenting the exact
  computation (or the prior, if there is one) would help people plan sample sizes. With this statistic a 30% → 36%
  test needs about 1,831 visitors for 80% power, versus 1,512 from the usual difference-of-rates formula.
- **`srm_p_value` was `null`** for experiments with 1,000 and 2,000 identities and a clean 50/50 split
  ([results/latest/sim-ab.json](../results/latest/sim-ab.json)). The docs say the check runs from 100 identities.
  Verdict computes its own chi-square p-value meanwhile.
- **Peeking.** The docs say peeking is safe. With this statistic, reading daily and stopping at the first 95% raises
  the false-winner rate for a no-effect change from 5% to about 12% over four looks and 29% over 72 hourly looks
  (`peekingFalseWin` in [src/forecast.ts](../src/forecast.ts)). A note in the docs, or a fixed-horizon option, would
  protect hackathon-style users who refresh constantly.

## SDKs

- **Events can be lost on page close in the browser.** The JS SDK's event processor sends with plain `fetch` on a
  10-second timer. A conversion right before the tab closes is dropped unless the app flushes on `visibilitychange`
  and the request uses `keepalive`. Verdict passes a custom `fetch` that adds `keepalive` for the events host
  ([src/experiment.ts](../src/experiment.ts)); doing that by default (or using `sendBeacon`) would make browser
  conversion counts more reliable.
- **`getExperimentFlag` and remounts.** In React StrictMode an effect that calls `init` twice fetched flags twice
  and recorded two exposures (deduplicated by the backend, but still double requests against the plan quota). A
  note in the React docs, or idempotent `init`, would help.

## CLI and API

- **Variant naming differs between surfaces.** `flagsmith feature get --json` returns `variants[]` with `key` and
  `value`; the experiment API returns `feature.multivariate_options[]` with `key` and `string_value`. Scripts that
  move between the two need both.
- **Warehouse already present.** Environments created with `flagsmith environment create` came with a managed
  warehouse connection in status `created`, so the "Enable" step in the docs was not needed. The first event was
  processed within about a minute, well inside the "up to a few hours" in the docs.
- **The results refresh limit also covers `exposures/refresh`**, returning `429` within 5 minutes of the last
  refresh. Expected, but worth a line in the API docs next to the endpoint.
- **What worked very well:** `flagsmith api` with `--input -` and `--jq` made the whole lifecycle (metric, experiment,
  start, results, complete with a rollout decision) scriptable in [scripts/lab.mjs](../scripts/lab.mjs), and
  `complete` with `rollout_decision` is a clean way to ship the winner through the same flag.
