# Run log

Everything that touched the experiments, in order. Times in UTC (IST = UTC+5:30).

| When (UTC) | What |
|---|---|
| 2026-11-26 20:52 | Flagsmith Cloud organisation `r69` (free plan) and project `Verdict` created. |
| 2026-11-26 20:53 | Environments Production, Sim AA, Sim AB created; each got a managed Flagsmith warehouse and one `warehouse_check` event. |
| 2026-11-26 20:54 | Flag `first_screen` (#306269) with variant `worked_example` (#37505); metrics and experiments #782 (Production), #783 (Sim AA), #784 (Sim AB) created, not started. |
| 2026-11-26 20:55 | Smoke environment + experiment #785 started to verify instrumentation (Node SDK and headless browser; 9 test identities). Smoke is never analysed. |
| 2026-11-26 20:57 | Smoke results computed by Flagsmith, confirming exposures, `forecast_own` and `forecast_run` flow end to end. |
| 2026-11-26 20:58 | **Production experiment #782 started.** Live site redeployed with the Production key. Pre-registration was committed before this (commit `b880bd3`, wording fix `20166c8`). |
| 2026-11-26 20:59 | Sim AA #783 started; 1,000 simulated visitors sent (seed 7), ledger `sim-ledgers/sim_aa_s7_mwy1ceio.json`. |
| 2026-11-26 20:59 | Sim AB #784 started; 2,000 simulated visitors sent (seed 11, planted 30% → 37.5%), ledger `sim-ledgers/sim_ab_s11_mwy1ct4c.json`. |
| 2026-11-26 21:00 | Sim AA and Sim AB results refreshed and saved in `results/`. `pnpm lab verify` confirms every exposure and conversion count in Flagsmith equals the simulator ledger. Sim AA: no winner (`forecast_own` chance to win 47.9%). Sim AB: planted +25%, Flagsmith estimates +24.8% [+9.2%, +40.3%], 99.9% chance to win. |
| 2026-11-26 21:02 | Production results refreshed: 0 exposures (link not shared yet). |
| 2026-11-26 21:24 | Generated Verdict CLI commands run for real against the Smoke environment (scratch flag `cli_check`, experiment #792): flag, variant, metric, experiment and start all succeeded. Scratch experiment completed and deleted, metric and flag deleted. |
| 2026-11-26 21:28 | Production results: still 0 exposures. Deployed version `de364dc2` (fixes listed in EXPERIMENT.md Amendments). |

## Disclosures

- Before the live Sim AB run I looked at dry runs with seed 7. The live run used seed 11. Dry runs assign arms locally; the
  live run takes arms from Flagsmith and uses a timestamped run ID in every identifier, so a dry run does not predict the
  live outcome. Seeds were not shopped: each simulation was run once live.
- `verify_no_exposure` is one Production identity created by `getIdentityFlags` to check the experiment is served. That call
  records no exposure, so it is not enrolled in the results.
