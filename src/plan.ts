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
${hypothesis(input, result, names, deadline)}

## Design
- Flag: \`${cleanName(names.flag, 'flag') || 'my_experiment'}\`. Control is the flag's own value, \`${cleanName(names.variant, 'flag') || 'variant'}\` is the change.
- Enrolment: ${pct(input.rolloutShare)} of visitors, split ${pct(1 - input.variantShare)} control / ${pct(input.variantShare)} change.
- Primary metric: \`${cleanName(names.event, 'event') || 'conversion'}\` (occurrence, expected to increase).

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

const sq = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export function cleanName(value: string, kind: 'flag' | 'event') {
  const spaced = value.replace(/\s+/g, '_');
  return kind === 'flag' ? spaced.toLowerCase().replace(/[^a-z0-9_-]/g, '') : spaced.replace(/[^A-Za-z0-9_.-]/g, '');
}

export function hypothesis(input: ForecastInput, result: Forecast, names: PlanNames, deadline: string) {
  return `${names.change} will lift the share of visitors who ${names.success} from ${pct(result.controlRate, 1)} to at least ${pct(result.variantRate, 1)} (+${pct(input.relativeLift)} relative) by ${deadline}.`;
}

export function cliCommands(input: ForecastInput, result: Forecast, names: PlanNames, deadline: string) {
  const flag = cleanName(names.flag, 'flag') || 'my_experiment';
  const variant = cleanName(names.variant, 'flag') || 'variant';
  const event = cleanName(names.event, 'event') || 'conversion';
  const variantShare = Math.round(input.variantShare * 100);
  const rollout = Math.round(input.rolloutShare * 100);
  return `# Pick the project and environment once: flagsmith project list, then
flagsmith init --project <project> --environment <environment key>
ENV=<environment key>

# 1. The flag: control is the flag's own value; the change is a keyed variant
flagsmith feature create ${flag} --value control --enabled
flagsmith feature variant add ${flag} --value ${variant} --key ${variant} --weight 0

# 2. The metric (event names are case-sensitive)
printf '{"name":"%s","aggregation":"occurrence","direction":"up","definition":{"version":1,"event":"%s"}}' ${event} ${event} \\
  | flagsmith api api/v1/environments/$ENV/experiment-metrics/ --input - > /dev/null && echo "Created metric ${event}"

# 3. The experiment, created but not started (starting locks the flag)
FEATURE_ID=$(flagsmith feature get ${flag} --jq '.id')
VARIANT_ID=$(flagsmith feature get ${flag} --jq '.variants[] | select(.key=="${variant}") | .id')
METRIC_ID=$(flagsmith api api/v1/environments/$ENV/experiment-metrics/ --jq '.results[] | select(.name=="${event}") | .id')
EXPERIMENT_ID=$(printf '{"feature":%s,"name":%s,"hypothesis":%s,"metrics":[{"metric":%s,"expected_direction":"increase"}],"experiment_rollout":{"enabled":true,"rollout_percentage":${rollout},"feature_state_value":{"type":"string","value":"control"},"multivariate_feature_state_values":[{"multivariate_feature_option":%s,"percentage_allocation":${variantShare}}]}}' \\
  "$FEATURE_ID" ${sq(JSON.stringify(flag))} ${sq(JSON.stringify(hypothesis(input, result, names, deadline)))} "$METRIC_ID" "$VARIANT_ID" \\
  | flagsmith api api/v1/environments/$ENV/experiments/ --input - --jq '.id')
echo "Created experiment $EXPERIMENT_ID"

# 4. Once the code that records exposures and events is live: start it
flagsmith api api/v1/environments/$ENV/experiments/$EXPERIMENT_ID/start/ -X POST
`;
}
