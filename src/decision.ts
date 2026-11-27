import type { Inference } from './stats';

export type Decision = {
  call: 'ship worked_example' | 'keep control' | 'inconclusive: keep control' | 'investigate' | 'collecting data';
  why: string;
};

// The decision rule registered in EXPERIMENT.md, in order:
// 1. sample ratio mismatch → act on nothing; 2. ship if primary ≥ 95% and the guardrail is not losing;
// 3. keep control if primary ≤ 5%; 4. otherwise inconclusive, keep control.
export function decide({ primary, guardrail, srmP }: { primary: Inference | null; guardrail: Inference | null; srmP: number | null }): Decision {
  if (srmP !== null && srmP < 0.001) return { call: 'investigate', why: `Sample ratio mismatch (p = ${srmP.toExponential(1)}): the split is broken, so no result is trusted.` };
  if (!primary) return { call: 'collecting data', why: 'Flagsmith has not shown a result yet: every version needs 50 visitors and 5 conversions.' };
  const chance = `${(primary.chanceToWin * 100).toFixed(1)}%`;
  if (primary.chanceToWin >= 0.95) {
    if (guardrail && guardrail.chanceToWin <= 0.05)
      return { call: 'keep control', why: `forecast_own is winning (${chance}) but the plan_copied guardrail is losing, so the change is not shipped.` };
    return { call: 'ship worked_example', why: `forecast_own has a ${chance} chance to beat control and the plan_copied guardrail is not losing.` };
  }
  if (primary.chanceToWin <= 0.05) return { call: 'keep control', why: `forecast_own has only a ${chance} chance to beat control.` };
  return { call: 'inconclusive: keep control', why: `forecast_own has a ${chance} chance to beat control, between the 5% and 95% thresholds.` };
}
