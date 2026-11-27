# Demo video: script and shot list (target 2:45)

Footage marked **[rec]** comes from `pnpm build && pnpm record` (1920×1080 clips in `demo/`, preview mode, nothing
counted). Footage marked **[you]** is a screen recording of the Flagsmith dashboard and a terminal, logged in.
Keep the voiceover plain; the numbers on screen do the convincing.

| Time | Picture | Voiceover |
|---|---|---|
| 0:00 | Verdict home, empty form **[rec: plan, first 2 s]** | "Toggle Wars gives you four days of data. Most A/B tests can't finish in four days, and you only find out on Sunday. Verdict tells you before you start." |
| 0:12 | Typing the sentence, pressing Forecast, dots lighting up **[rec: plan]** | "You describe the test in one sentence: traffic, today's rate, the lift you expect, the deadline. Each dot is one way the test could play out. Here only a handful end with a winner by Sunday; raise the expected lift and watch it change." |
| 0:32 | Scroll to Your plan, press Copy **[rec: plan, end]** | "You leave with a pre-registration and the Flagsmith CLI commands: flag, keyed variant, metric, experiment, start. I ran those commands against Flagsmith before shipping them." |
| 0:45 | Side by side: `/?preview=control` and `/?preview=worked_example` **[rec: example]** | "Verdict runs a Flagsmith experiment on itself. One multivariate flag, first_screen: half of visitors get this empty form, half get a worked example." |
| 0:58 | EXPERIMENT.md on GitHub, then `git log --format='%h %ci %s' -- EXPERIMENT.md` next to the experiment's started_at **[you]** | "Hypothesis: the example raises the share of visitors who forecast their own numbers by 25%. I committed that, the metrics and the decision rule before the experiment started." |
| 1:12 | Flagsmith: Experiments page, then the experiment's metrics **[you]** | "The primary metric only counts forecasts with the visitor's own numbers. Pressing Forecast on the untouched example costs one click, so a naive metric would hand the example a free win." |
| 1:25 | Flagsmith: Sim AB results page with the winner banner and interval **[you]** | "Before trusting real traffic I tested the pipeline. A thousand scripted visitors with no difference: no winner. Two thousand with a planted 25% lift: Flagsmith finds plus 24.8, and the interval contains the truth." |
| 1:42 | `/lab`, scrolling Sim AB then Sim AA **[rec: lab]** | "Every exposure and conversion Flagsmith counted equals what the simulator sent. And there's the trap: the naive metric shows plus 60 for the example." |
| 1:58 | Terminal: `pnpm test -- stats` passing, then the README formula **[you]** | "Verdict's maths is Flagsmith's maths. It reproduces Flagsmith's lift, interval and chance to win from raw counts to nine decimal places. A calibration study across 300 simulated plans puts its forecasts within 0.6 points of Flagsmith's real rule." |
| 2:15 | `/lab` Production section, then `pnpm lab results --env Production` **[you]** | Read the real result and the rule's call, for example: "With N real visitors, the change has an X% chance to beat control. Under the rule I registered, that's inconclusive, so control stays, and Verdict says I'd need about 1,100 visitors to call it." |
| 2:30 | Flagsmith: Sim AB, End experiment, roll out the variant; or `pnpm lab complete --env "Sim AB" --decision variant --yes`; then the flag serving worked_example **[you]** | "Shipping the winner uses the same flag: complete the experiment with a decision and every visitor gets it." |
| 2:40 | `/check` with the planted-lift numbers **[rec: check]** | "If your test is already running, Verdict's check page tells you whether it will finish in time. Link's in the README." |

## Before recording

1. `pnpm release` so `/lab` and RESULTS.md show the latest numbers; note the Production figures for the 2:15 line.
2. `pnpm build && pnpm record` for the [rec] clips.
3. In Flagsmith, open: Experiments list, Sim AB experiment (results + exposures), Production experiment, the `first_screen` flag.
4. Record the [you] parts at 1920×1080, browser zoom 110%, notifications off.
5. Complete Sim AB on camera last: it cannot be restarted.

## Submission checklist

- Public repo: https://github.com/r69shabh/verdict
- README with setup steps and how Flagsmith is used
- Demo video (upload, then add the link to the README top)
- Track: Test Something Real
