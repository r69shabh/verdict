import { describe, expect, it } from 'vitest';
import { inferLift, sampleRatioP } from './stats';

// Counts and outputs copied from Flagsmith's results API for experiments #783 (Sim AA) and #784 (Sim AB).
const fixtures = [
  { name: 'Sim AB forecast_own', c: [294, 981], v: [381, 1019], lift: 0.2475916765135888, low: 0.09237501822885552, high: 0.40280833479832207, win: 0.9991152239212784 },
  { name: 'Sim AB plan_copied', c: [102, 981], v: [137, 1019], lift: 0.2930497027073834, low: -0.01855593101996783, high: 0.6046553364347347, win: 0.9673536893117567 },
  { name: 'Sim AB forecast_run', c: [328, 981], v: [544, 1019], lift: 0.5966873309557431, low: 0.42847523182356956, high: 0.7648994300879166, win: 0.999999999998205 },
] as const;

describe('inferLift reproduces Flagsmith Experimentation', () => {
  it.each(fixtures)('$name', ({ c, v, lift, low, high, win }) => {
    const result = inferLift({ conversions: c[0], visitors: c[1] }, { conversions: v[0], visitors: v[1] })!;
    expect(result.lift).toBeCloseTo(lift, 10);
    expect(result.ciLow).toBeCloseTo(low, 9);
    expect(result.ciHigh).toBeCloseTo(high, 9);
    expect(result.chanceToWin).toBeCloseTo(win, 6);
  });

  it('matches the Sim AA readings', () => {
    const own = inferLift({ conversions: 146, visitors: 497 }, { conversions: 147, visitors: 503 })!;
    expect(own.chanceToWin).toBeCloseTo(0.479, 3);
    expect(own.ciLow).toBeCloseTo(-0.197, 3);
    expect(own.ciHigh).toBeCloseTo(0.187, 3);
    const copied = inferLift({ conversions: 49, visitors: 497 }, { conversions: 58, visitors: 503 })!;
    expect(copied.chanceToWin).toBeCloseTo(0.7851, 3);
  });
});

describe('sampleRatioP', () => {
  it('is unremarkable for the simulations and alarming for a broken split', () => {
    expect(sampleRatioP(981, 1019)).toBeGreaterThan(0.3);
    expect(sampleRatioP(497, 503)).toBeGreaterThan(0.8);
    expect(sampleRatioP(9120, 6400)!).toBeLessThan(0.001);
  });
});
