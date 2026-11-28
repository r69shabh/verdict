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

Forecast with Verdict: https://verdict.r69.workers.dev
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

export type Language = 'javascript' | 'react' | 'python' | 'node';
export const LANGUAGES: { id: Language; label: string; file: string }[] = [
  { id: 'javascript', label: 'JavaScript', file: 'experiment.js' },
  { id: 'react', label: 'React', file: 'Experiment.jsx' },
  { id: 'python', label: 'Python', file: 'experiment.py' },
  { id: 'node', label: 'Node.js', file: 'experiment.mjs' },
];

export function instrumentation(names: PlanNames, language: Language) {
  const flag = cleanName(names.flag, 'flag') || 'my_experiment';
  const variant = cleanName(names.variant, 'flag') || 'variant';
  const event = cleanName(names.event, 'event') || 'conversion';
  switch (language) {
    case 'javascript':
      return `import flagsmith from '@flagsmith/flagsmith'; // 12.4.0 or newer

await flagsmith.init({ environmentID: '<client-side key>', enableEvents: true });
await flagsmith.identify(userId); // use the same ID for the exposure and the conversion

// Where the visitor sees the change: evaluates the flag and records the exposure
const flag = flagsmith.getExperimentFlag('${flag}');
const showChange = flag?.value === '${variant}';

// Where success happens
flagsmith.trackEvent('${event}');
await flagsmith.flushEvents(); // events are batched; flush before the page unloads
`;
    case 'react':
      return `import flagsmith from '@flagsmith/flagsmith'; // 12.4.0 or newer
import { FlagsmithProvider, useExperiment, useFlagsmith } from '@flagsmith/flagsmith/react';

export function Root({ userId, children }) {
  return (
    <FlagsmithProvider flagsmith={flagsmith} options={{ environmentID: '<client-side key>', identity: userId, enableEvents: true }}>
      {children}
    </FlagsmithProvider>
  );
}

export function Feature() {
  const flag = useExperiment('${flag}'); // records the exposure when it renders
  const client = useFlagsmith();
  const showChange = flag?.value === '${variant}';
  return <button onClick={() => client.trackEvent('${event}')}>{showChange ? 'New version' : 'Current version'}</button>;
}
`;
    case 'python':
      return `from flagsmith import Flagsmith  # 6.3.0 or newer

flagsmith = Flagsmith(environment_key="<server-side key>", enable_events=True)

# Where the user sees the change: evaluates the flag and records the exposure
flag = flagsmith.get_experiment_flag("${flag}", identifier=user_id)
show_change = flag.value == "${variant}"

# Where success happens (same identifier as the exposure)
flagsmith.track_event("${event}", identifier=user_id)
`;
    case 'node':
      return `import { Flagsmith } from '@flagsmith/nodejs'; // 9.1.0 or newer

const flagsmith = new Flagsmith({ environmentKey: process.env.FLAGSMITH_SERVER_KEY, enableEvents: true });

// Where the user sees the change: evaluates the flag and records the exposure
const flag = await flagsmith.getExperimentFlag('${flag}', userId);
const showChange = flag.value === '${variant}';

// Where success happens (same identifier as the exposure)
flagsmith.trackEvent('${event}', { identifier: userId });
await flagsmith.close(); // sends buffered events before the process exits
`;
  }
}
