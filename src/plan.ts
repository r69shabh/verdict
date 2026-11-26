import type { Forecast, ForecastInput } from './forecast';

export type PlanNames = {
  change: string;
  success: string;
  flag: string;
  variant: string;
  event: string;
};

const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;
const count = (value: number) => Math.round(value).toLocaleString('en-US');

export function slug(text: string, fallback: string) {
  const value = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return value || fallback;
}

export function preRegistration(input: ForecastInput, result: Forecast, names: PlanNames, deadline: string, today: string) {
  const days = result.daysFor80 === null ? 'n/a' : `${result.daysFor80.toFixed(1)} days`;
  return `# Experiment: ${names.change}

Registered ${today}, before any results were read.

## Hypothesis
${names.change} will lift the share of visitors who ${names.success} from ${pct(result.controlRate, 1)} to at least ${pct(result.variantRate, 1)} (+${pct(input.relativeLift)} relative) by ${deadline}.

## Design
- Flag: \`${names.flag}\`. Control is the flag's own value, \`${names.variant}\` is the change.
- Enrolment: ${pct(input.rolloutShare)} of visitors, split ${pct(1 - input.variantShare)} control / ${pct(input.variantShare)} change.
- Primary metric: \`${names.event}\` (occurrence, expected to increase).

## Power
- Expected by the deadline: ${count(result.controlN + result.variantN)} enrolled visitors.
- Chance of a winner by then if the lift is real: ${pct(result.outcome.win)}.
- Chance of a false winner if the change does nothing: ${pct(result.noEffectOutcome.win)}.
- Enrolled visitors needed for an 80% chance: ${count(result.enrolledFor80 ?? 0)} (about ${days} at this traffic).

## Decision rule
- Ship the change if its chance to beat control is at least 95% and Flagsmith shows no sample ratio mismatch.
- Keep control if the chance is 5% or lower.
- Anything in between is inconclusive: keep control and report the credible interval.
`;
}

export function cliCommands(input: ForecastInput, names: PlanNames) {
  const variantShare = Math.round(input.variantShare * 100);
  const rollout = Math.round(input.rolloutShare * 100);
  return `# Pick the project and environment once: flagsmith project list, then
flagsmith init --project <project> --environment <environment key>
ENV=<environment key>

# 1. The flag: control is the flag's own value; the change is a keyed variant
flagsmith feature create ${names.flag} --value control --enabled
flagsmith feature variant add ${names.flag} --value ${names.variant} --key ${names.variant} --weight 0

# 2. The metric (event names are case-sensitive)
echo '{"name":"${names.event}","aggregation":"occurrence","direction":"up","definition":{"version":1,"event":"${names.event}"}}' \\
  | flagsmith api api/v1/environments/$ENV/experiment-metrics/ --input -

# 3. The experiment, created but not started (starting locks the flag)
FEATURE_ID=$(flagsmith feature get ${names.flag} --jq '.id')
VARIANT_ID=$(flagsmith feature get ${names.flag} --jq '.variants[0].id')
METRIC_ID=$(flagsmith api api/v1/environments/$ENV/experiment-metrics/ --jq '.results[] | select(.name=="${names.event}") | .id')
cat <<JSON | flagsmith api api/v1/environments/$ENV/experiments/ --input -
{"feature": $FEATURE_ID, "name": "${names.flag}", "hypothesis": "${names.change.replace(/"/g, "'")}",
 "metrics": [{"metric": $METRIC_ID, "expected_direction": "increase"}],
 "experiment_rollout": {"enabled": true, "rollout_percentage": ${rollout},
   "feature_state_value": {"type": "string", "value": "control"},
   "multivariate_feature_state_values": [{"multivariate_feature_option": $VARIANT_ID, "percentage_allocation": ${variantShare}}]}}
JSON

# 4. When the code is live: start it
flagsmith api api/v1/environments/$ENV/experiments/<experiment id>/start/ -X POST
`;
}
