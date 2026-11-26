# Verdict — project notes

Toggle Wars (WeMakeDevs × Flagsmith) hackathon entry, Track 01 "Test Something Real". Solo entrant: r69shabh.
Deadline: Sun 29 Nov 2026, 20:00 IST (target submit 17:00 IST). Hackathon rules: one team, one project, one track.

## Commands (Node 22, pnpm 12.3.4)
- `pnpm install --frozen-lockfile`
- `pnpm dev` / `pnpm test` / `pnpm typecheck` / `pnpm build`
- `pnpm deploy` — builds and deploys static assets to the `verdict` Worker on workers.dev (owner approved). Production key comes from gitignored `.env.production.local`.
- `pnpm release` — refresh result snapshots (results/latest/ feeds /lab), then build + deploy. Log every deploy in RUNLOG.md.
- `pnpm simulate -- --help` — seeded traffic simulator against a Sim environment (needs FLAGSMITH_SIM_ENVIRONMENT_KEY).
- `pnpm lab` — operate the experiment via the Flagsmith CLI (envs, warehouse, flag, setup, start, results, complete).

## Experiment invariants
- Flag `first_screen`: control value `control` (empty form), variant key/value `worked_example`.
- Events (case-sensitive): `forecast_own` (primary), `forecast_run` (informational), `plan_copied` (guardrail, should not decrease).
- EXPERIMENT.md is the pre-registration; do not edit hypothesis/metrics after the Production experiment starts.
- Production traffic = real visitors only. Simulated traffic goes only to the Sim AA / Sim AB environments.
- Never commit Flagsmith admin/server keys or flagsmith.env. Client-side env key is supplied at build time via VITE_FLAGSMITH_ENVIRONMENT_KEY.
- Pin dependency versions published ≥7 days before install.
