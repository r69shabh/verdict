import { describe, expect, it } from 'vitest';
import { check, readingOf, validateCheck } from './interim';

describe('readingOf', () => {
  it('matches Flagsmith on the Sim AB counts', () => {
    const { now, reading } = readingOf({ conversions: 294, visitors: 981 }, { conversions: 381, visitors: 1019 });
    expect(reading).toBe('winning');
    expect(now!.chanceToWin).toBeCloseTo(0.99912, 4);
  });
  it('withholds a reading below the collecting-data floor', () => {
    expect(readingOf({ conversions: 4, visitors: 300 }, { conversions: 9, visitors: 300 }).reading).toBe('collecting');
  });
});

describe('check', () => {
  it('with no time left, the future is the present', () => {
    const result = check({ control: { conversions: 294, visitors: 981 }, variant: { conversions: 381, visitors: 1019 }, visitorsPerDay: 0, days: 0 }, 500);
    expect(result.futures.win).toBe(1);
  });
  it('a dead-even test rarely produces a winner, and more traffic only helps a real effect', () => {
    const even = check({ control: { conversions: 60, visitors: 200 }, variant: { conversions: 60, visitors: 200 }, visitorsPerDay: 400, days: 2 }, 2000);
    expect(even.futures.win).toBeLessThan(0.3);
    const ahead = check({ control: { conversions: 60, visitors: 200 }, variant: { conversions: 75, visitors: 200 }, visitorsPerDay: 400, days: 2 }, 2000);
    expect(ahead.futures.win).toBeGreaterThan(even.futures.win);
    expect(ahead.futures.win + ahead.futures.lose + ahead.futures.inconclusive).toBeCloseTo(1, 10);
  });
  it('flags a broken split', () => {
    const result = check({ control: { conversions: 900, visitors: 9120 }, variant: { conversions: 700, visitors: 6400 }, visitorsPerDay: 0, days: 0 }, 100);
    expect(result.srmP!).toBeLessThan(0.001);
  });
});

describe('validateCheck', () => {
  it('rejects impossible counts', () => {
    expect(validateCheck({ control: { conversions: 20, visitors: 10 }, variant: { conversions: 1, visitors: 10 }, visitorsPerDay: 10, days: 1 })).toEqual([
      'The original: conversions cannot be more than visitors.',
    ]);
  });
});
