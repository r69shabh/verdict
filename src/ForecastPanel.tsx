import type { CSSProperties } from 'react';
import { outcomeAfter, type Forecast, type ForecastInput } from './forecast';

type Props = {
  input: ForecastInput | null;
  result: Forecast | null;
  deadlineLabel: string;
  sweep: number;
};

const count = (value: number) => Math.round(value).toLocaleString('en-US');

function dots(result: Forecast | null) {
  if (!result) return Array<'idle'>(100).fill('idle');
  const win = Math.round(result.outcome.win * 100);
  const lose = Math.round(result.outcome.lose * 100);
  return Array.from({ length: 100 }, (_, i) => (i < win ? 'win' : i >= 100 - lose ? 'lose' : 'open'));
}

function Curve({ input, result, deadlineLabel }: { input: ForecastInput; result: Forecast; deadlineLabel: string }) {
  const horizon = Math.max(input.days, Math.min(result.daysFor80 ?? input.days, input.days * 3)) * 1.08;
  const steps = 64;
  const width = 320;
  const height = 112;
  const x = (day: number) => (day / horizon) * width;
  const y = (p: number) => height - p * height;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const day = (horizon * i) / steps;
    return `${x(day).toFixed(1)},${y(day === 0 ? 0 : outcomeAfter(input, day).win).toFixed(1)}`;
  });
  const deadlineX = x(input.days);
  return (
    <figure className="curve">
      <svg viewBox={`0 -14 ${width} ${height + 30}`} role="img" aria-label={`Chance of a winner rises to ${Math.round(result.outcome.win * 100)}% by ${deadlineLabel}`}>
        <line className="curve-guide" x1="0" x2={width} y1={y(0.8)} y2={y(0.8)} />
        <text className="curve-note" x={width} y={y(0.8) - 5} textAnchor="end">80%</text>
        <line className="curve-axis" x1="0" x2={width} y1={height} y2={height} />
        <polyline className="curve-line" points={points.join(' ')} />
        <line className="curve-deadline" x1={deadlineX} x2={deadlineX} y1="-6" y2={height} />
        <circle className="curve-dot" cx={deadlineX} cy={y(result.outcome.win)} r="4" />
        <text className="curve-note" x={deadlineX} y={height + 14} textAnchor={deadlineX > width * 0.75 ? 'end' : 'middle'}>
          {deadlineLabel}
        </text>
      </svg>
      <figcaption>Chance of a winner, from now until {result.daysFor80 && result.daysFor80 > input.days ? 'well past' : ''} your deadline</figcaption>
    </figure>
  );
}

export function ForecastPanel({ input, result, deadlineLabel, sweep }: Props) {
  const states = dots(result);
  const win = result ? Math.round(result.outcome.win * 100) : null;
  return (
    <section className="forecast" aria-live="polite" aria-labelledby="forecast-title">
      <div className={`field ${sweep ? 'sweep' : ''}`} key={sweep} role="img" aria-label={result ? `${win} of 100 simulated futures reach a verdict` : 'No forecast yet'}>
        {states.map((state, i) => (
          <span key={i} className={`dot ${state}`} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>

      {!result || !input ? (
        <div className="forecast-copy">
          <h2 id="forecast-title" className="forecast-empty">Each dot will be one way your test could play out.</h2>
          <p>Fill in your numbers and press Forecast my test.</p>
        </div>
      ) : !result.clearsFloor ? (
        <div className="forecast-copy">
          <h2 id="forecast-title">
            <span className="big">0</span> in 100
          </h2>
          <p>
            By {deadlineLabel} each version gets about {count(result.controlN)} visitors and {count(result.controlN * result.controlRate)} conversions.
            Flagsmith shows no result until every version has at least 50 visitors and 5 conversions.
          </p>
          <p className="needs">
            You need about {count(result.enrolledFor80 ?? 0)} visitors in the test for an 80% chance{result.daysFor80 ? `, ${result.daysFor80.toFixed(1)} days at your traffic` : ''}.
          </p>
        </div>
      ) : (
        <div className="forecast-copy">
          <h2 id="forecast-title">
            <span className="big">{win}</span> in 100
          </h2>
          <p>
            ways this test could play out end with Flagsmith calling your change the winner by {deadlineLabel}, if it really lifts conversion as
            much as you expect.
          </p>
          <ul className="legend">
            <li><span className="dot win" /> Winner called</li>
            <li><span className="dot open" /> Still inconclusive</li>
            <li><span className="dot lose" /> Called the wrong way</li>
          </ul>
          <Curve input={input} result={result} deadlineLabel={deadlineLabel} />
          <p className="needs">
            {result.daysFor80 !== null && result.daysFor80 <= input.days
              ? `You have the runway: about ${count(result.enrolledFor80 ?? 0)} visitors in the test gives an 80% chance, and you should have ${count(result.controlN + result.variantN)}.`
              : `For an 80% chance you need about ${count(result.enrolledFor80 ?? 0)} visitors in the test, ${result.daysFor80?.toFixed(1)} days at your traffic.`}{' '}
            If your change does nothing, {Math.round(result.noEffectOutcome.win * 100)} in 100 would still crown a false winner.
          </p>
        </div>
      )}
    </section>
  );
}
