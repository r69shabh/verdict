import type { ForecastInput } from './forecast';
import type { Arm } from './experiment';

export type Fields = {
  visitors: string;
  baseline: string;
  success: string;
  change: string;
  lift: string;
  deadline: string;
  rollout: string;
  split: string;
};

const NUMERIC: (keyof Fields)[] = ['visitors', 'baseline', 'lift', 'deadline', 'rollout', 'split'];
const TOGGLE_WARS_END = Date.parse('2026-11-29T14:30:00Z');

function toLocalInput(time: number) {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function exampleDeadline(now: number) {
  if (TOGGLE_WARS_END - now > 12 * 3600_000) return toLocalInput(TOGGLE_WARS_END);
  const d = new Date(now + 3 * 86400_000);
  d.setHours(20, 0, 0, 0);
  return toLocalInput(d.getTime());
}

export function initialFields(arm: Arm, now = Date.now()): Fields {
  const defaults = { rollout: '100', split: '50' };
  if (arm === 'control') return { visitors: '', baseline: '', success: '', change: '', lift: '', deadline: '', ...defaults };
  return {
    visitors: '800',
    baseline: '12',
    success: 'click “Start free”',
    change: 'a clearer headline',
    lift: '25',
    deadline: exampleDeadline(now),
    ...defaults,
  };
}

export function isOwnForecast(arm: Arm, fields: Fields, example: Fields) {
  return arm === 'control' || NUMERIC.some((key) => fields[key].trim() !== example[key].trim());
}

export function parseNumber(raw: string, integer = false): number {
  let s = raw.trim().replace(/[\s%\u00a0\u202f]/g, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) && (integer || s.includes(','))) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d*,\d+$/.test(s)) s = s.replace(',', '.');
  return /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN;
}

export function toInput(fields: Fields, now = Date.now()): ForecastInput | null {
  if (NUMERIC.some((key) => fields[key].trim() === '')) return null;
  return {
    visitorsPerDay: parseNumber(fields.visitors, true),
    baselineRate: parseNumber(fields.baseline) / 100,
    relativeLift: parseNumber(fields.lift) / 100,
    days: (new Date(fields.deadline).getTime() - now) / 86400_000,
    rolloutShare: parseNumber(fields.rollout) / 100,
    variantShare: parseNumber(fields.split) / 100,
  };
}

export function formatDeadline(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return 'your deadline';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(time);
}

export function formatDuration(days: number) {
  const plural = (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`;
  if (days < 1) return plural(Math.max(1, Math.round(days * 24)), 'hour');
  if (days < 14) return `${days.toFixed(1)} days`;
  if (days < 60) return plural(Math.round(days), 'day');
  if (days < 730) return plural(Math.round(days / 30.44), 'month');
  return plural(Math.round(days / 365.25), 'year');
}
