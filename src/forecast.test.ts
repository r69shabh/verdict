import { describe, expect, it } from 'vitest';
import { detectableLift, forecast, normalCdf, normalQuantile, outcomeAfter, validate, type ForecastInput } from './forecast';
import { clearsFloor, inferLift } from './stats';

const base: ForecastInput = {
  baselineRate: 0.3,
  relativeLift: 0.2,
  visitorsPerDay: 600,
  days: 2.5,
  rolloutShare: 1,
  variantShare: 0.5,
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function binomial(n: number, p: number, rand: () => number) {
  let hits = 0;
  for (let i = 0; i < n; i++) if (rand() < p) hits++;
  return hits;
}

describe('normal helpers', () => {
  it('match reference values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.6448536)).toBeCloseTo(0.95, 5);
    expect(normalQuantile(0.95)).toBeCloseTo(1.6448536, 5);
    expect(normalQuantile(0.8)).toBeCloseTo(0.8416212, 5);
    expect(normalQuantile(0.01)).toBeCloseTo(-2.3263479, 5);
  });
});

describe('forecast', () => {
  it('needs ~1,831 enrolled visitors for 80% power at 30% → 36% under Flagsmith’s statistic (a difference-of-rates formula says 1,512)', () => {
    const result = forecast(base);
    expect(result.enrolledFor80).toBeGreaterThan(1800);
    expect(result.enrolledFor80).toBeLessThan(1860);
    expect(result.daysFor80).toBeCloseTo(result.enrolledFor80! / 600, 6);
  });

  it('gives ~5% false winners when there is no real effect', () => {
    const result = forecast(base);
    expect(result.noEffectOutcome.win).toBeCloseTo(0.05, 3);
    expect(result.noEffectOutcome.lose).toBeCloseTo(0.05, 3);
  });

  it('withholds a verdict below Flagsmith’s collecting-data floor', () => {
    const result = forecast({ ...base, visitorsPerDay: 20, days: 2 });
    expect(result.clearsFloor).toBe(false);
    expect(result.outcome.win).toBe(0);
    expect(result.floorDay).toBeNull();
  });

  it('has a non-decreasing win curve', () => {
    const { curve } = forecast(base);
    for (let i = 1; i < curve.length; i++) expect(curve[i]!.win).toBeGreaterThanOrEqual(curve[i - 1]!.win - 1e-12);
    expect(curve.at(-1)!.win).toBeCloseTo(forecast(base).outcome.win, 10);
  });

  it.each([
    ['typical', { ...base, days: 1.5 }],
    ['low baseline', { ...base, baselineRate: 0.05, relativeLift: 0.3, visitorsPerDay: 2000, days: 2 }],
    ['uneven split', { ...base, variantShare: 0.3, days: 2 }],
  ] as const)('agrees with a Monte Carlo of Flagsmith’s exact decision rule (%s)', (_, input) => {
    const result = forecast(input);
    const rand = mulberry32(42);
    const n0 = Math.round(result.controlN);
    const n1 = Math.round(result.variantN);
    const runs = 3000;
    let wins = 0;
    for (let r = 0; r < runs; r++) {
      const control = { conversions: binomial(n0, result.controlRate, rand), visitors: n0 };
      const variant = { conversions: binomial(n1, result.variantRate, rand), visitors: n1 };
      const inference = clearsFloor(control, variant) ? inferLift(control, variant) : null;
      if (inference && inference.chanceToWin >= 0.95) wins++;
    }
    expect(Math.abs(wins / runs - result.outcome.win)).toBeLessThan(0.03);
  });
});

describe('detectableLift', () => {
  it('is the lift that gives exactly an 80% chance by the deadline', () => {
    const lift = detectableLift(base)!;
    expect(outcomeAfter({ ...base, relativeLift: lift }, base.days).win).toBeCloseTo(0.8, 3);
    expect(lift).toBeGreaterThan(0.15);
    expect(lift).toBeLessThan(0.25);
  });
  it('is null when even the largest lift cannot clear the floor', () => {
    expect(detectableLift({ ...base, visitorsPerDay: 10, days: 1 })).toBeNull();
  });
});

describe('validate', () => {
  it('flags impossible inputs', () => {
    expect(validate(base)).toEqual([]);
    expect(validate({ ...base, baselineRate: 0.9, relativeLift: 0.2 }).map((e) => e.field)).toContain('relativeLift');
    expect(validate({ ...base, days: 0 }).map((e) => e.field)).toEqual(['days']);
  });
  it('says a field is not a number instead of piling up range errors', () => {
    const errors = validate({ ...base, baselineRate: NaN, relativeLift: NaN });
    expect(errors.map((e) => e.message)).toEqual(['Today’s rate must be a number.', 'The expected lift must be a number.']);
  });
});
