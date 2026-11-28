# Launch posts

Lead with the planner link (`/`): that is where the experiment runs. `/check` is useful too, but visitors who only
use it are not enrolled.

## Flagsmith Discord (Toggle Wars channel)

> Built a tool for Toggle Wars Track 01 folks: **Verdict** tells you the chance Flagsmith calls a winner before
> Sunday 8 PM, given your traffic and the lift you expect, and gives you a pre-registration plus the CLI commands
> to set the experiment up.
> https://verdict.r69.workers.dev
>
> Already running? Paste your counts into https://verdict.r69.workers.dev/check and it shows the
> reading Flagsmith would give and whether you're likely to finish in time.
>
> Disclosure: the planner is itself a live Flagsmith experiment (empty form vs worked example), so using it helps
> my test too.

## WeMakeDevs Discord

> Toggle Wars tip from building my entry: Flagsmith's chance-to-win is a delta-method z on the relative lift. A
> textbook sample-size formula underestimates the traffic it needs by about 9%. I built a planner that uses the
> real statistic: https://verdict.r69.workers.dev (it's also my live A/B test, so every forecast helps).

## X / Twitter

1. > Most hackathon A/B tests can't finish in 4 days, and you only find out on Sunday. I built Verdict: plug in your
   > traffic, rate, expected lift and deadline, and see the chance @getflagsmith Experimentation calls a winner in
   > time. https://verdict.r69.workers.dev
2. > The page is itself the experiment: half of you get an empty form, half a worked example. Hypothesis,
   > metrics and decision rule were committed before it started. #ToggleWars @WeMakeDevs
3. > Fun finding: Flagsmith's lift, interval and chance-to-win are reproducible from raw counts to 9 decimals with a
   > delta method on the relative lift. For a 30% → 36% test that means 1,647 visitors, not the 1,512 a standard
   > calculator gives, and a calibration study puts Verdict's forecasts within 0.6 points of the real rule. Code + tests: https://github.com/r69shabh/verdict

## LinkedIn

> For the WeMakeDevs × Flagsmith hackathon I built Verdict, a planner that tells you whether an A/B test can reach a
> verdict before your deadline, using the exact statistic Flagsmith Experimentation applies.
>
> It runs a pre-registered experiment on its own first screen, and before trusting real traffic I checked the
> pipeline with an A/A simulation (no false winner) and a planted +25% lift (recovered at +24.8%, 95% interval
> +9.2% to +40.3%). Every count Flagsmith reported matched the simulator's ledger.
>
> Try it (every forecast is a data point in the live test): https://verdict.r69.workers.dev
