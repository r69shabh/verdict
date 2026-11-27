export const FLAGSMITH_THRESHOLD = 0.95;
export const FLAGSMITH_MIN_IDENTITIES = 50;
export const FLAGSMITH_MIN_CONVERSIONS = 5;
const TARGET_POWER = 0.8;

export type ForecastInput = {
  baselineRate: number;
  relativeLift: number;
  visitorsPerDay: number;
  days: number;
  rolloutShare: number;
  variantShare: number;
  threshold?: number;
};

export type Outcome = { win: number; inconclusive: number; lose: number };

export type Forecast = {
  controlRate: number;
  variantRate: number;
  controlN: number;
  variantN: number;
  clearsFloor: boolean;
  floorDay: number | null;
  outcome: Outcome;
  noEffectOutcome: Outcome;
  enrolledFor80: number | null;
  daysFor80: number | null;
  curve: { day: number; win: number }[];
};

export type InputError = { field: keyof ForecastInput; message: string };

export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError('p must be in (0, 1)');
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const lower = 0.02425;
  const tail = (q: number) =>
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  if (p < lower) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - lower) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}

export function validate(input: ForecastInput): InputError[] {
  const errors: InputError[] = [];
  const check = (field: keyof ForecastInput, ok: boolean, message: string) => {
    if (!Number.isFinite(input[field] as number)) errors.push({ field, message: NOT_A_NUMBER[field] });
    else if (!ok) errors.push({ field, message });
  };
  check('visitorsPerDay', input.visitorsPerDay > 0, 'Visitors per day must be above 0.');
  check('baselineRate', input.baselineRate > 0 && input.baselineRate < 1, 'Today’s rate must be between 0% and 100%.');
  check('relativeLift', input.relativeLift > 0, 'The expected lift must be above 0%.');
  check('days', input.days > 0, 'The deadline must be in the future.');
  check('rolloutShare', input.rolloutShare > 0 && input.rolloutShare <= 1, 'The share of visitors in the test must be between 1% and 100%.');
  check('variantShare', input.variantShare > 0 && input.variantShare < 1, 'The share that sees the change must be between 1% and 99%.');
  const ratesValid = !errors.some((e) => e.field === 'baselineRate' || e.field === 'relativeLift');
  if (ratesValid && input.baselineRate * (1 + input.relativeLift) >= 1)
    errors.push({ field: 'relativeLift', message: 'Today’s rate plus the lift must stay under 100%.' });
  return errors;
}

const NOT_A_NUMBER: Record<keyof ForecastInput, string> = {
  visitorsPerDay: 'Visitors per day must be a number.',
  baselineRate: 'Today’s rate must be a number.',
  relativeLift: 'The expected lift must be a number.',
  days: 'Pick a deadline.',
  rolloutShare: 'The share of visitors in the test must be a number.',
  variantShare: 'The share that sees the change must be a number.',
  threshold: 'The threshold must be a number.',
};

function armSizes(input: ForecastInput, days: number) {
  const enrolled = input.visitorsPerDay * days * input.rolloutShare;
  return { controlN: enrolled * (1 - input.variantShare), variantN: enrolled * input.variantShare };
}

function clearsFloorAt(input: ForecastInput, days: number, variantRate: number): boolean {
  const { controlN, variantN } = armSizes(input, days);
  return (
    controlN >= FLAGSMITH_MIN_IDENTITIES &&
    variantN >= FLAGSMITH_MIN_IDENTITIES &&
    controlN * input.baselineRate >= FLAGSMITH_MIN_CONVERSIONS &&
    variantN * variantRate >= FLAGSMITH_MIN_CONVERSIONS
  );
}

// Flagsmith calls a winner when lift / se(lift) clears the threshold, where se comes from the delta
// method on the relative lift. In absolute terms that statistic is z = (p̂1 − p̂0) / √(v1 + (p̂1/p̂0)²·v0).
// Its distribution is skewed (a high p̂1 also inflates the standard error), so instead of a normal
// approximation the chance of each outcome is integrated: for each plausible observed control rate,
// solve for the variant rate at which z crosses the threshold, and take the normal tail beyond it.
// The 5-conversion floor is applied to the observed rates as well.
const NODES = 48;
const QUANTILES = Array.from({ length: NODES }, (_, i) => normalQuantile((i + 0.5) / NODES));

function zStatistic(a: number, b: number, n0: number, n1: number) {
  return (b - a) / Math.sqrt((b * (1 - b)) / n1 + ((b * b) * (1 - a)) / (a * n0));
}

function crossing(a: number, lo: number, hi: number, target: number, n0: number, n1: number) {
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (zStatistic(a, mid, n0, n1) >= target) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function tails(p0: number, p1: number, n0: number, n1: number, z: number): Outcome {
  if (n0 < FLAGSMITH_MIN_IDENTITIES || n1 < FLAGSMITH_MIN_IDENTITIES) return { win: 0, inconclusive: 1, lose: 0 };
  const sd0 = Math.sqrt((p0 * (1 - p0)) / n0);
  const sd1 = Math.sqrt((p1 * (1 - p1)) / n1);
  const floor0 = (FLAGSMITH_MIN_CONVERSIONS - 0.5) / n0;
  const floor1 = (FLAGSMITH_MIN_CONVERSIONS - 0.5) / n1;
  const top = 1 - 1e-9;
  let win = 0;
  let lose = 0;
  for (const q of QUANTILES) {
    const a = p0 + sd0 * q;
    if (a < floor0 || a >= 1) continue;
    if (zStatistic(a, top, n0, n1) >= z) {
      const t = Math.max(crossing(a, a, top, z, n0, n1), floor1);
      win += 1 - normalCdf((t - p1) / sd1);
    }
    if (floor1 < a && zStatistic(a, floor1, n0, n1) <= -z) {
      const t = crossing(a, floor1, a, -z, n0, n1);
      lose += normalCdf((t - p1) / sd1) - normalCdf((floor1 - p1) / sd1);
    }
  }
  win /= NODES;
  lose /= NODES;
  return { win, lose, inconclusive: Math.max(0, 1 - win - lose) };
}

function outcomeAt(input: ForecastInput, days: number, variantRate: number): Outcome {
  const { controlN, variantN } = armSizes(input, days);
  return tails(input.baselineRate, variantRate, controlN, variantN, normalQuantile(input.threshold ?? FLAGSMITH_THRESHOLD));
}

export function forecast(input: ForecastInput): Forecast {
  const controlRate = input.baselineRate;
  const variantRate = controlRate * (1 + input.relativeLift);
  const { controlN, variantN } = armSizes(input, input.days);

  const w = input.variantShare;
  const z = normalQuantile(input.threshold ?? FLAGSMITH_THRESHOLD);
  const winWith = (enrolled: number) => tails(controlRate, variantRate, enrolled * (1 - w), enrolled * w, z).win;
  let lo = 1;
  let hi = 1e3;
  while (winWith(hi) < TARGET_POWER && hi < 1e10) hi *= 4;
  for (let i = 0; i < 40 && hi - lo > 1; i++) {
    const mid = Math.sqrt(lo * hi);
    if (winWith(mid) >= TARGET_POWER) hi = mid;
    else lo = mid;
  }
  let enrolledFor80 = Math.ceil(hi);
  const floorEnrolled = Math.max(
    FLAGSMITH_MIN_IDENTITIES / Math.min(w, 1 - w),
    FLAGSMITH_MIN_CONVERSIONS / ((1 - w) * controlRate),
    FLAGSMITH_MIN_CONVERSIONS / (w * variantRate),
  );
  enrolledFor80 = Math.max(enrolledFor80, Math.ceil(floorEnrolled));
  const enrolledPerDay = input.visitorsPerDay * input.rolloutShare;
  const daysFor80 = enrolledPerDay > 0 ? enrolledFor80 / enrolledPerDay : null;
  const floorDay = Math.ceil(floorEnrolled) / enrolledPerDay;

  const steps = Math.max(2, Math.min(48, Math.ceil(input.days * 4)));
  const curve = Array.from({ length: steps + 1 }, (_, i) => {
    const day = (input.days * i) / steps;
    return { day, win: day === 0 ? 0 : outcomeAt(input, day, variantRate).win };
  });

  return {
    controlRate,
    variantRate,
    controlN,
    variantN,
    clearsFloor: clearsFloorAt(input, input.days, variantRate),
    floorDay: floorDay <= input.days ? floorDay : null,
    outcome: outcomeAt(input, input.days, variantRate),
    noEffectOutcome: outcomeAt(input, input.days, controlRate),
    enrolledFor80,
    daysFor80,
    curve,
  };
}

export function detectableLift(input: ForecastInput, power = TARGET_POWER): number | null {
  const p0 = input.baselineRate;
  const reaches = (lift: number) => outcomeAt(input, input.days, p0 * (1 + lift)).win >= power;
  let hi = (1 - 1e-6) / p0 - 1;
  if (!reaches(hi)) return null;
  let lo = 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function outcomeAfter(input: ForecastInput, days: number): Outcome {
  return outcomeAt(input, days, input.baselineRate * (1 + input.relativeLift));
}

// Chance that a change with no effect is called a winner at least once when results are read at `looks`
// equally spaced times up to the deadline and the test stops at the first reading at or above the threshold.
// Simulates the cumulative counts under no effect and applies Flagsmith's statistic and floor at every look.
const peekingCache = new Map<string, number>();

export function peekingFalseWin(input: ForecastInput, looks: number, runs = 4000, seed = 7): number {
  looks = Math.max(1, Math.min(60, Math.round(looks)));
  const p = input.baselineRate;
  const { controlN, variantN } = armSizes(input, input.days);
  const key = [p, Math.round(controlN), Math.round(variantN), looks, runs, seed, input.threshold ?? FLAGSMITH_THRESHOLD].join(':');
  const cached = peekingCache.get(key);
  if (cached !== undefined) return cached;
  const z = normalQuantile(input.threshold ?? FLAGSMITH_THRESHOLD);
  let state = seed;
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  const draw = (n: number) => {
    if (n * p * (1 - p) > 9) return Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gauss()));
    let k = 0;
    for (let i = 0; i < n; i++) if (rand() < p) k++;
    return k;
  };
  let hits = 0;
  for (let r = 0; r < runs; r++) {
    let n0 = 0;
    let n1 = 0;
    let c0 = 0;
    let c1 = 0;
    for (let k = 1; k <= looks; k++) {
      const next0 = Math.round((controlN * k) / looks);
      const next1 = Math.round((variantN * k) / looks);
      c0 += draw(next0 - n0);
      c1 += draw(next1 - n1);
      n0 = next0;
      n1 = next1;
      if (n0 < FLAGSMITH_MIN_IDENTITIES || n1 < FLAGSMITH_MIN_IDENTITIES || c0 < FLAGSMITH_MIN_CONVERSIONS || c1 < FLAGSMITH_MIN_CONVERSIONS) continue;
      if (zStatistic(c0 / n0, c1 / n1, n0, n1) >= z) {
        hits++;
        break;
      }
    }
  }
  peekingCache.set(key, hits / runs);
  return hits / runs;
}
