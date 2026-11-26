import { describe, expect, it } from 'vitest';
import { formatDuration, initialFields, isOwnForecast, parseNumber, toInput } from './fields';

describe('parseNumber', () => {
  it.each([
    ['1,200', false, 1200],
    ['1,200.5', false, 1200.5],
    ['12,5', false, 12.5],
    ['1.200', true, 1200],
    ['1.200', false, 1.2],
    ['1.200,5', false, 1200.5],
    ['12%', false, 12],
    [' 800 ', true, 800],
    ['1e6', true, 1_000_000],
    ['.5', false, 0.5],
    ['abc', false, NaN],
    ['12abc', false, NaN],
    ['', false, NaN],
  ])('%s → %s', (raw, integer, expected) => {
    expect(parseNumber(raw, integer)).toBe(expected);
  });
});

describe('isOwnForecast', () => {
  const now = Date.parse('2026-11-27T00:00:00Z');
  const example = initialFields('worked_example', now);
  it('does not count the untouched example', () => {
    expect(isOwnForecast('worked_example', example, example)).toBe(false);
    expect(isOwnForecast('worked_example', { ...example, change: 'something else' }, example)).toBe(false);
  });
  it('counts any changed number and every control forecast', () => {
    expect(isOwnForecast('worked_example', { ...example, visitors: '900' }, example)).toBe(true);
    expect(isOwnForecast('control', initialFields('control', now), initialFields('control', now))).toBe(true);
  });
  it('turns the worked example into a forecast input', () => {
    const input = toInput(example, now)!;
    expect(input.visitorsPerDay).toBe(800);
    expect(input.baselineRate).toBeCloseTo(0.12);
    expect(input.days).toBeGreaterThan(2);
  });
});

describe('formatDuration', () => {
  it('reads like a person would say it', () => {
    expect(formatDuration(0.2)).toBe('5 hours');
    expect(formatDuration(2.54)).toBe('2.5 days');
    expect(formatDuration(30)).toBe('30 days');
    expect(formatDuration(200)).toBe('7 months');
    expect(formatDuration(103320)).toBe('283 years');
  });
});
