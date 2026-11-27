import { describe, expect, it } from 'vitest';
import { decide } from './decision';

const inf = (chanceToWin: number) => ({ lift: 0.1, ciLow: -0.1, ciHigh: 0.3, chanceToWin });

describe('decide applies the pre-registered rule', () => {
  it.each([
    [{ primary: inf(0.99), guardrail: inf(0.6), srmP: 0.4 }, 'ship worked_example'],
    [{ primary: inf(0.99), guardrail: inf(0.03), srmP: 0.4 }, 'keep control'],
    [{ primary: inf(0.02), guardrail: inf(0.5), srmP: 0.4 }, 'keep control'],
    [{ primary: inf(0.7), guardrail: inf(0.5), srmP: 0.4 }, 'inconclusive: keep control'],
    [{ primary: inf(0.99), guardrail: inf(0.9), srmP: 0.0001 }, 'investigate'],
    [{ primary: null, guardrail: null, srmP: null }, 'collecting data'],
  ] as const)('%o → %s', (input, call) => {
    expect(decide(input).call).toBe(call);
  });
});
