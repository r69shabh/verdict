import { describe, expect, it } from 'vitest';
import { forecast, normalCdf, normalQuantile, validate, type ForecastInput } from './forecast';

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
  it('needs ~1,512 enrolled visitors for 80% power at 30% → 36%', () => {
    const result = forecast(base);
    expect(result.enrolledFor80).toBeGreaterThan(1490);
    expect(result.enrolledFor80).toBeLessThan(1530);
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

  it('agrees with a Monte Carlo of the same Bayesian decision rule', () => {
    const input = { ...base, days: 1.5 };
    const result = forecast(input);
    const rand = mulberry32(42);
    const n = Math.round(result.controlN);
    const runs = 2000;
    let wins = 0;
    for (let r = 0; r < runs; r++) {
      const a = binomial(n, result.controlRate, rand);
      const b = binomial(n, result.variantRate, rand);
      const [ma, va] = betaMoments(1 + a, 1 + n - a);
      const [mb, vb] = betaMoments(1 + b, 1 + n - b);
      if (normalCdf((mb - ma) / Math.sqrt(va + vb)) > 0.95) wins++;
    }
    expect(Math.abs(wins / runs - result.outcome.win)).toBeLessThan(0.035);
  });
});

function betaMoments(alpha: number, beta: number): [number, number] {
  const sum = alpha + beta;
  return [alpha / sum, (alpha * beta) / (sum * sum * (sum + 1))];
}

describe('validate', () => {
  it('flags impossible inputs', () => {
    expect(validate(base)).toEqual([]);
    expect(validate({ ...base, baselineRate: 0.9, relativeLift: 0.2 }).map((e) => e.field)).toContain('relativeLift');
    expect(validate({ ...base, days: 0 }).map((e) => e.field)).toEqual(['days']);
  });
});
