import { describe, expect, it } from 'vitest';
import { forecast } from './forecast';
import { clearsFloor, inferLift } from './stats';

// A smaller version of scripts/calibrate.mjs, so a regression in the forecast fails CI.
describe('forecast calibration against Flagsmith’s rule', () => {
  it('stays within 1.5 points on average across random plans', () => {
    let state = 424242;
    const rand = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
    const binomial = (n: number, p: number) => {
      if (n * p * (1 - p) > 9) return Math.min(n, Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gauss())));
      let k = 0;
      for (let i = 0; i < n; i++) if (rand() < p) k++;
      return k;
    };
    const errors: number[] = [];
    while (errors.length < 80) {
      const input = {
        baselineRate: Math.exp(Math.log(0.02) + rand() * Math.log(25)),
        relativeLift: 0.05 + rand() * 0.55,
        visitorsPerDay: Math.exp(Math.log(30) + rand() * Math.log(5000 / 30)),
        days: 0.5 + rand() * 6.5,
        rolloutShare: 1,
        variantShare: 0.3 + rand() * 0.4,
      };
      if (input.baselineRate * (1 + input.relativeLift) >= 0.95) continue;
      const f = forecast(input);
      const n0 = Math.round(f.controlN);
      const n1 = Math.round(f.variantN);
      let wins = 0;
      const runs = 600;
      for (let r = 0; r < runs; r++) {
        const control = { visitors: n0, conversions: binomial(n0, f.controlRate) };
        const variant = { visitors: n1, conversions: binomial(n1, f.variantRate) };
        if (clearsFloor(control, variant) && (inferLift(control, variant)?.chanceToWin ?? 0) >= 0.95) wins++;
      }
      errors.push(Math.abs(f.outcome.win - wins / runs));
    }
    const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(mae).toBeLessThan(0.015);
    expect(Math.max(...errors)).toBeLessThan(0.07);
  });
});
