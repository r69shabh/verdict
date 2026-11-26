# Pre-registration: does a worked example get more people to plan their own test?

Registered 27 November 2026, before the Production experiment started and before any results were read.
The git history of this file is the timestamp. After the Production experiment starts, this file only
gains a dated "Amendments" entry; nothing above that line changes.

## Question

Verdict's whole job is to get a visitor to put their own experiment into it. Its first screen is a
sentence with blanks. Does showing that sentence already filled in with a worked example get more
visitors to forecast their own numbers than showing it empty?

## Hypothesis
Pre-filling the planner with a worked example will raise the share of visitors who forecast their own numbers (forecast_own) by at least 25% relative to the empty form, during 27–29 November 2026.

Why it might work: an empty form full of statistical inputs (baseline rate, lift) stalls people who
are not sure what a sensible value is. An example shows the expected shape, and the visitor only has
to change the numbers that differ.

Why it might not: visitors may read the example's forecast and leave without entering anything of
their own, or anchor on the example values. That is why the primary metric only counts forecasts
made with the visitor's own numbers.

## Design

| | |
|---|---|
| Flag | `first_screen` (multivariate) |
| Control | `control`: the sentence with empty blanks (placeholders only name what goes there) |
| Variant | `worked_example`: the same sentence pre-filled with 800 visitors/day, 12%, +25%, Sunday 20:00 |
| Enrolment | 100% of visitors, split 50/50, bucketed by a random visitor ID kept in localStorage |
| Exposure | recorded by `getExperimentFlag` at the moment the form first renders |
| Unit | visitor (identity); occurrence metrics count each visitor at most once |

Both variants share everything else: copy, layout, the advanced rollout and split blanks (100 and 50
in both), the results panel, and the plan output.

## Metrics

| Metric | Event | Role | Expected |
|---|---|---|---|
| Forecast with own numbers | `forecast_own` | primary | increase |
| Plan copied | `plan_copied` | guardrail | should not decrease |
| Pressed Forecast | `forecast_run` | informational | n/a |

- `forecast_own` fires once per visitor when a forecast is shown for inputs that are not the
  untouched example. In the control every forecast is the visitor's own, because there is no example.
- `forecast_run` fires when Forecast is pressed, including on the untouched example. It is reported
  because it is the metric a naive version of this test would use, and it is biased toward the
  variant: pressing Forecast on the example costs one click.
- `plan_copied` fires when a visitor copies the pre-registration or the CLI commands.

## Environments

| Environment | Traffic | Purpose |
|---|---|---|
| Production | real visitors only (shared on the Flagsmith and WeMakeDevs Discords, X, LinkedIn) | answers the question |
| Sim AA | ~1,000 scripted visitors, both arms behave identically (30% `forecast_own`) | checks the pipeline: expect no winner and no sample ratio mismatch |
| Sim AB | ~2,000 scripted visitors, a planted effect: 30% control vs 37.5% variant | checks Flagsmith recovers a known +25% lift inside its credible interval |

The simulator (`scripts/simulate.mjs`) is seeded and writes a ground-truth ledger of every exposure
and event it sent, so Flagsmith's counts can be checked against it. Simulated results say nothing
about real visitors; they only show that the instrumentation and the analysis work.

My own testing uses `?preview=control` or `?preview=worked_example`, which records nothing.

## Power (computed with Verdict itself)

Assuming a 30% control rate and the hypothesised +25% lift (30% → 37.5%), split 50/50:

| Traffic in the test | Chance Flagsmith calls a winner |
|---|---|
| 300 visitors (150/day for 2 days) | 40% |
| 600 visitors (300/day for 2 days) | 62% |
| 977 visitors | 80% |
| 2,000 visitors (Sim AB) | 97% |

If the change does nothing, there is a 5% chance Flagsmith still calls a winner at the final look.
Real traffic is unlikely to reach 977 visitors in two days, so an inconclusive Production result is
a likely and acceptable outcome.

## Decision rule

Read at the end, Sunday 29 November 2026 around 16:00 IST, from Flagsmith's results page:

1. If Flagsmith shows a sample ratio mismatch warning, act on nothing; investigate first.
2. Ship `worked_example` if its chance to beat control on `forecast_own` is at least 95% and the
   `plan_copied` guardrail is not losing (chance to beat control above 5%).
3. Keep control if the chance on `forecast_own` is 5% or lower.
4. Anything in between is inconclusive: keep control, report the lift and its credible interval, and
   say how much more traffic Verdict estimates is needed.

Rolling out uses the same flag: the experiment is completed in Flagsmith with the chosen decision, so
every visitor gets the chosen version on their next visit.

## Amendments

None yet.
