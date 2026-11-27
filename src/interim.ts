import { clearsFloor, inferLift, sampleRatioP, type Counts, type Inference } from './stats';

export type CheckInput = {
  control: Counts;
  variant: Counts;
  visitorsPerDay: number;
  days: number;
  threshold?: number;
};

export type Reading = 'winning' | 'losing' | 'inconclusive' | 'collecting';
export type CheckResult = {
  now: Inference | null;
  reading: Reading;
  srmP: number | null;
  futures: { win: number; lose: number; inconclusive: number };
  addedVisitors: number;
};

export function readingOf(control: Counts, variant: Counts, threshold = 0.95): { now: Inference | null; reading: Reading } {
  const now = clearsFloor(control, variant) ? inferLift(control, variant) : null;
  if (!now) return { now: null, reading: 'collecting' };
  return { now, reading: now.chanceToWin >= threshold ? 'winning' : now.chanceToWin <= 1 - threshold ? 'losing' : 'inconclusive' };
}

export function validateCheck(input: CheckInput): string[] {
  const errors: string[] = [];
  const arm = (label: string, c: Counts) => {
    if (!Number.isInteger(c.visitors) || c.visitors < 0) errors.push(`${label}: visitors must be a whole number.`);
    else if (!Number.isInteger(c.conversions) || c.conversions < 0) errors.push(`${label}: conversions must be a whole number.`);
    else if (c.conversions > c.visitors) errors.push(`${label}: conversions cannot be more than visitors.`);
  };
  arm('The original', input.control);
  arm('The change', input.variant);
  if (!Number.isFinite(input.visitorsPerDay) || input.visitorsPerDay < 0) errors.push('Visitors per day must be 0 or more.');
  if (!Number.isFinite(input.days)) errors.push('Pick a deadline.');
  return errors;
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = rand() || 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function gamma(shape: number, rand: () => number): number {
  if (shape < 1) return gamma(shape + 1, rand) * rand() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = gaussian(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function beta(a: number, b: number, rand: () => number) {
  const x = gamma(a, rand);
  return x / (x + gamma(b, rand));
}

function binomial(n: number, p: number, rand: () => number) {
  if (n <= 0) return 0;
  if (n < 60) {
    let k = 0;
    for (let i = 0; i < n; i++) if (rand() < p) k++;
    return k;
  }
  return Math.min(n, Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gaussian(rand))));
}

// Predictive check: draw plausible true rates from each arm's posterior (Beta(1 + conversions,
// 1 + non-conversions)), simulate the visitors still to come, and apply Flagsmith's rule at the deadline.
export function check(input: CheckInput, runs = 4000, seed = 20261129): CheckResult {
  const threshold = input.threshold ?? 0.95;
  const { now, reading } = readingOf(input.control, input.variant, threshold);
  const enrolled = input.control.visitors + input.variant.visitors;
  const variantShare = enrolled > 0 ? input.variant.visitors / enrolled : 0.5;
  const addedVisitors = Math.max(0, input.days) * input.visitorsPerDay;
  const add1 = Math.round(addedVisitors * variantShare);
  const add0 = Math.round(addedVisitors) - add1;
  const rand = rng(seed);
  const futures = { win: 0, lose: 0, inconclusive: 0 };
  for (let r = 0; r < runs; r++) {
    const p0 = beta(1 + input.control.conversions, 1 + input.control.visitors - input.control.conversions, rand);
    const p1 = beta(1 + input.variant.conversions, 1 + input.variant.visitors - input.variant.conversions, rand);
    const control = { visitors: input.control.visitors + add0, conversions: input.control.conversions + binomial(add0, p0, rand) };
    const variant = { visitors: input.variant.visitors + add1, conversions: input.variant.conversions + binomial(add1, p1, rand) };
    const final = readingOf(control, variant, threshold).reading;
    if (final === 'winning') futures.win++;
    else if (final === 'losing') futures.lose++;
    else futures.inconclusive++;
  }
  return {
    now,
    reading,
    srmP: sampleRatioP(input.control.visitors, input.variant.visitors),
    futures: { win: futures.win / runs, lose: futures.lose / runs, inconclusive: futures.inconclusive / runs },
    addedVisitors,
  };
}
