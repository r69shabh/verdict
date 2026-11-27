import { normalCdf } from './forecast';

export type Counts = { conversions: number; visitors: number };
export type Moments = { n: number; sum: number; sumSquares: number };
export type Inference = { lift: number; ciLow: number; ciHigh: number; chanceToWin: number };

const Z95 = 1.959963984540054;

// Flagsmith Experimentation reports the relative lift mean1/mean0 − 1 with a delta-method standard
// error built from each arm's sample variance (n − 1), a 95% interval of lift ± 1.96·se, and a chance
// to win of Φ(lift / se). This reproduces its published results (see stats.test.ts fixtures).
export function inferFromMoments(control: Moments, variant: Moments): Inference | null {
  if (control.n < 2 || variant.n < 2) return null;
  const mean0 = control.sum / control.n;
  const mean1 = variant.sum / variant.n;
  if (mean0 <= 0) return null;
  const varOfMean = (m: Moments, mean: number) => Math.max(0, (m.sumSquares - m.n * mean * mean) / (m.n - 1)) / m.n;
  const ratio = mean1 / mean0;
  const se = Math.sqrt(varOfMean(variant, mean1) / (mean0 * mean0) + (ratio * ratio * varOfMean(control, mean0)) / (mean0 * mean0));
  if (!(se > 0)) return null;
  const lift = ratio - 1;
  return { lift, ciLow: lift - Z95 * se, ciHigh: lift + Z95 * se, chanceToWin: normalCdf(lift / se) };
}

export function inferLift(control: Counts, variant: Counts): Inference | null {
  const moments = (c: Counts): Moments => ({ n: c.visitors, sum: c.conversions, sumSquares: c.conversions });
  return inferFromMoments(moments(control), moments(variant));
}

// Flagsmith withholds results until every arm has 50 identities and, for occurrence metrics, 5 conversions.
export function clearsFloor(control: Counts, variant: Counts) {
  return control.visitors >= 50 && variant.visitors >= 50 && control.conversions >= 5 && variant.conversions >= 5;
}

// Chi-square goodness of fit of the observed split against the configured share (1 degree of freedom).
export function sampleRatioP(controlVisitors: number, variantVisitors: number, variantShare = 0.5) {
  const total = controlVisitors + variantVisitors;
  if (total === 0) return null;
  const e1 = total * variantShare;
  const e0 = total - e1;
  const chi = (controlVisitors - e0) ** 2 / e0 + (variantVisitors - e1) ** 2 / e1;
  return 2 * (1 - normalCdf(Math.sqrt(chi)));
}
