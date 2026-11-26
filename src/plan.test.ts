import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forecast, type ForecastInput } from './forecast';
import { cleanName, cliCommands, hypothesis, preRegistration } from './plan';

const input: ForecastInput = { baselineRate: 0.12, relativeLift: 0.25, visitorsPerDay: 800, days: 2.5, rolloutShare: 1, variantShare: 0.5 };
const result = forecast(input);

function runWithStub(script: string) {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-plan-'));
  const stub = `#!/bin/bash
# records every call; answers the --jq lookups with fake ids
echo "ARGS $*" >> "${dir}/calls.log"
for a in "$@"; do if [ "$a" = "-" ]; then cat > "${dir}/body-$RANDOM$RANDOM.json"; fi; done
case "$*" in
  *"--jq .id"*) echo 101 ;;
  *".variants[]"*) echo 202 ;;
  *".results[]"*) echo 303 ;;
esac
`;
  writeFileSync(join(dir, 'flagsmith'), stub, { mode: 0o755 });
  const marker = join(dir, 'pwned');
  writeFileSync(join(dir, 'setup.sh'), script.replace(/<environment key>/g, 'envkey').replace(/<project>/g, 'demo'));
  execFileSync('bash', ['setup.sh'], { cwd: dir, env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MARKER: marker } });
  const bodies = execFileSync('bash', ['-c', `cat ${dir}/body-*.json | wc -l >/dev/null; ls ${dir}/body-*.json`], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((f) => JSON.parse(readFileSync(f, 'utf8')));
  return { bodies, calls: readFileSync(join(dir, 'calls.log'), 'utf8'), pwned: existsSync(marker) };
}

describe('cleanName', () => {
  it('keeps flag keys lowercase and shell-safe', () => {
    expect(cleanName('My Flag; rm -rf /', 'flag')).toBe('my_flag_rm_-rf_');
    expect(cleanName('Sign Up.Done$(x)', 'event')).toBe('Sign_Up.Donex');
  });
});

describe('cliCommands', () => {
  it('produces valid API bodies and never executes text from the visitor', () => {
    const hostile = {
      change: 'A "bold" redesign with `touch $MARKER` and $(touch $MARKER) and \\ backslash and 100% \'quotes\'',
      success: 'sign up 🚀',
      flag: 'Bold Redesign!',
      variant: 'Bold',
      event: 'signed up',
    };
    const deadline = 'Sun, Nov 29, 8:00 PM';
    const { bodies, calls, pwned } = runWithStub(cliCommands(input, result, hostile, deadline));
    expect(pwned).toBe(false);
    const metric = bodies.find((b) => b.aggregation);
    const experiment = bodies.find((b) => b.experiment_rollout);
    expect(metric).toEqual({ name: 'signed_up', aggregation: 'occurrence', direction: 'up', definition: { version: 1, event: 'signed_up' } });
    expect(experiment.feature).toBe(101);
    expect(experiment.hypothesis).toBe(hypothesis(input, result, hostile, deadline));
    expect(experiment.metrics).toEqual([{ metric: 303, expected_direction: 'increase' }]);
    expect(experiment.experiment_rollout.multivariate_feature_state_values).toEqual([{ multivariate_feature_option: 202, percentage_allocation: 50 }]);
    expect(calls).toContain('feature create bold_redesign --value control --enabled');
    expect(calls).toContain('api/v1/environments/envkey/experiments/101/start/ -X POST');
  });
});

describe('preRegistration', () => {
  it('states the decision rule and the power numbers', () => {
    const text = preRegistration(input, result, { change: 'A clearer headline', success: 'sign up', flag: 'headline', variant: 'clear', event: 'signup' }, 'Sunday', '2026-11-27');
    expect(text).toContain('from 12.0% to at least 15.0%');
    expect(text).toContain('`headline`');
    expect(text).toContain('at least 95%');
  });
});
