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

const num = (value: string) => Number(value.replace(/[,\s%]/g, ''));

export function toInput(fields: Fields, now = Date.now()): ForecastInput | null {
  if (NUMERIC.some((key) => fields[key].trim() === '')) return null;
  return {
    visitorsPerDay: num(fields.visitors),
    baselineRate: num(fields.baseline) / 100,
    relativeLift: num(fields.lift) / 100,
    days: (new Date(fields.deadline).getTime() - now) / 86400_000,
    rolloutShare: num(fields.rollout) / 100,
    variantShare: num(fields.split) / 100,
  };
}

export function formatDeadline(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return 'your deadline';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(time);
}
