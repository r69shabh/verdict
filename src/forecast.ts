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
// method on the relative lift. In absolute terms that statistic is (p1 − p0) / √(v1 + (p1/p0)²·v0).
function flagsmithShift(p0: number, p1: number, n0: number, n1: number) {
  const ratio = p1 / p0;
  return (p1 - p0) / Math.sqrt((p1 * (1 - p1)) / n1 + (ratio * ratio * p0 * (1 - p0)) / n0);
}

function outcomeAt(input: ForecastInput, days: number, variantRate: number): Outcome {
  if (!clearsFloorAt(input, days, variantRate)) return { win: 0, inconclusive: 1, lose: 0 };
  const { controlN, variantN } = armSizes(input, days);
  const shift = flagsmithShift(input.baselineRate, variantRate, controlN, variantN);
  const z = normalQuantile(input.threshold ?? FLAGSMITH_THRESHOLD);
  const win = normalCdf(shift - z);
  const lose = normalCdf(-shift - z);
  return { win, lose, inconclusive: Math.max(0, 1 - win - lose) };
}

export function forecast(input: ForecastInput): Forecast {
  const controlRate = input.baselineRate;
  const variantRate = controlRate * (1 + input.relativeLift);
  const { controlN, variantN } = armSizes(input, input.days);

  const z = normalQuantile(input.threshold ?? FLAGSMITH_THRESHOLD) + normalQuantile(TARGET_POWER);
  const delta = variantRate - controlRate;
  const w = input.variantShare;
  const ratio = variantRate / controlRate;
  const varianceUnit = (ratio * ratio * controlRate * (1 - controlRate)) / (1 - w) + (variantRate * (1 - variantRate)) / w;
  let enrolledFor80 = Math.ceil(varianceUnit * (z / delta) ** 2);
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
  const reaches = (lift: number) => {
    const p1 = p0 * (1 + lift);
    if (!clearsFloorAt(input, input.days, p1)) return false;
    const { controlN, variantN } = armSizes(input, input.days);
    return normalCdf(flagsmithShift(p0, p1, controlN, variantN) - normalQuantile(input.threshold ?? FLAGSMITH_THRESHOLD)) >= power;
  };
  let hi = (1 - 1e-6) / p0 - 1;
  if (!reaches(hi)) return null;
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function outcomeAfter(input: ForecastInput, days: number): Outcome {
  return outcomeAt(input, days, input.baselineRate * (1 + input.relativeLift));
}
