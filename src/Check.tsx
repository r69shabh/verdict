import { useMemo, useState, type CSSProperties } from 'react';
import { check, validateCheck } from './interim';
import { formatDeadline, parseNumber } from './fields';

type Snapshot = { environment: string; results: { results?: { payload?: { metrics: { metric_id: number; variants: Record<string, { n: number; sum: number }> }[] } } }; experiment: { metrics: { metric: number; metric_name: string }[] } };
const snapshots = Object.values(import.meta.glob<Snapshot>('../results/latest/*.json', { eager: true, import: 'default' }));

type Fields = { n0: string; c0: string; n1: string; c1: string; perDay: string; deadline: string };
const EMPTY: Fields = { n0: '', c0: '', n1: '', c1: '', perDay: '', deadline: '' };
const TOGGLE_WARS_END = Date.parse('2026-11-29T14:30:00Z');

function localInput(time: number) {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromSnapshot(name: string): Fields | null {
  const snap = snapshots.find((s) => s.environment === name);
  const metricId = snap?.experiment.metrics.find((m) => m.metric_name === 'forecast_own')?.metric;
  const metric = snap?.results.results?.payload?.metrics.find((m) => m.metric_id === metricId);
  const c = metric?.variants.control;
  const v = metric?.variants.worked_example;
  if (!c || !v) return null;
  const deadline = TOGGLE_WARS_END > Date.now() ? localInput(TOGGLE_WARS_END) : localInput(Date.now() + 86400_000);
  return { n0: String(c.n), c0: String(c.sum), n1: String(v.n), c1: String(v.sum), perDay: name === 'Production' ? '150' : '0', deadline };
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;
const outOf100 = (p: number) => Math.min(99, Math.round(p * 100));

const READING = {
  winning: 'Winning',
  losing: 'Losing',
  inconclusive: 'Inconclusive',
  collecting: 'Collecting data',
} as const;

export function Check() {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields({ ...fields, [key]: e.target.value });
  const filled = Object.values(fields).every((v) => v.trim() !== '');
  const input = filled
    ? {
        control: { visitors: parseNumber(fields.n0, true), conversions: parseNumber(fields.c0, true) },
        variant: { visitors: parseNumber(fields.n1, true), conversions: parseNumber(fields.c1, true) },
        visitorsPerDay: parseNumber(fields.perDay, true),
        days: (new Date(fields.deadline).getTime() - Date.now()) / 86400_000,
      }
    : null;
  const errors = input ? validateCheck(input) : [];
  const result = useMemo(() => (input && errors.length === 0 ? check(input) : null), [JSON.stringify(input), errors.length]);
  const deadlineLabel = formatDeadline(fields.deadline);
  const win = result ? outOf100(result.futures.win) : 0;
  const lose = result ? Math.round(result.futures.lose * 100) : 0;
  const examples = (['Sim AB', 'Production'] as const).filter((name) => fromSnapshot(name));

  const advice = !result
    ? ''
    : result.srmP !== null && result.srmP < 0.001
      ? 'The split between versions is far from what you configured. Fix that before reading anything else.'
      : result.reading === 'winning'
        ? 'Flagsmith would already call the change the winner. Stop when your pre-registered end time arrives, not because it looks good now.'
        : result.reading === 'losing'
          ? 'Flagsmith would already call the change a loser. If your plan allows stopping early for harm, stop now.'
          : result.futures.win >= 0.8
            ? 'Likely to finish with a winner. Keep it running to the end you planned.'
            : result.futures.win >= 0.2
              ? 'It could go either way. Keep it running and plan what you will say if it ends inconclusive.'
              : 'Unlikely to reach a verdict in time. Report it as inconclusive with the interval, or find more traffic.';

  const blank = (key: keyof Fields, label: string, hint: string, kind: 'number' | 'date' = 'number') => (
    <input
      className={`blank ${kind}${fields[key] === '' ? ' empty' : ''}`}
      aria-label={label}
      placeholder={hint}
      value={fields[key]}
      type={kind === 'date' ? 'datetime-local' : 'text'}
      inputMode={kind === 'number' ? 'numeric' : undefined}
      autoComplete="off"
      onChange={set(key)}
    />
  );

  return (
    <div className="page">
      <header className="masthead">
        <a className="wordmark" href="/">Verdict</a>
        <h1>Check a running test: will it reach a verdict in time?</h1>
      </header>
      <main className="desk">
        <form className="sheet" onSubmit={(e) => e.preventDefault()} noValidate>
          <p className="sentence">
            The original has {blank('n0', 'Visitors who saw the original', 'visitors')} visitors and {blank('c0', 'Conversions on the original', 'conversions')}{' '}
            conversions. The change has {blank('n1', 'Visitors who saw the change', 'visitors')} visitors and {blank('c1', 'Conversions on the change', 'conversions')}{' '}
            conversions.
          </p>
          <p className="sentence small">
            About {blank('perDay', 'More visitors per day until the deadline', 'how many')} more visitors a day will join until{' '}
            {blank('deadline', 'Deadline', 'deadline', 'date')}.
          </p>
          {errors.length > 0 && (
            <ul className="errors" role="alert">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {examples.length > 0 && (
            <p className="hint">
              Try it with Verdict’s own experiment:{' '}
              {examples.map((name, i) => (
                <span key={name}>
                  {i > 0 && ' or '}
                  <button type="button" className="link" onClick={() => setFields(fromSnapshot(name)!)}>
                    {name === 'Production' ? 'real visitors so far' : 'the planted-lift simulation'}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
          <p className="hint">Use the counts from your Flagsmith experiment page. Nothing you type here leaves your browser.</p>
        </form>

        <section className="forecast" aria-labelledby="check-title">
          <p className="sr-only" aria-live="polite">{result ? `Reading now: ${READING[result.reading]}. ${win} in 100 futures reach a winner by ${deadlineLabel}.` : ''}</p>
          <div className="field" role="img" aria-label={result ? `${win} of 100 simulated futures end with a winner` : 'No check yet'}>
            {Array.from({ length: 100 }, (_, i) => (
              <span key={i} className={`dot ${!result ? 'idle' : i < win ? 'win' : i >= 100 - lose ? 'lose' : 'open'}`} style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
          {!result ? (
            <div className="forecast-copy">
              <h2 id="check-title" className="forecast-empty">Each dot will be one way the rest of your test could go.</h2>
              <p>Enter what Flagsmith shows for each version so far.</p>
            </div>
          ) : (
            <div className="forecast-copy">
              <h2 id="check-title">
                <span className="big">{win}</span> in 100
              </h2>
              <p>ways the rest of this test could go end with Flagsmith calling the change the winner by {deadlineLabel}.</p>
              <dl className="facts">
                <div>
                  <dt>Flagsmith’s reading now</dt>
                  <dd>{READING[result.reading]}</dd>
                </div>
                <div>
                  <dt>Chance to beat the original</dt>
                  <dd>{result.now ? pct(result.now.chanceToWin) : 'not shown yet'}</dd>
                </div>
                <div>
                  <dt>Lift and 95% interval</dt>
                  <dd>{result.now ? `${signed(result.now.lift)} [${signed(result.now.ciLow)}, ${signed(result.now.ciHigh)}]` : 'not shown yet'}</dd>
                </div>
                <div>
                  <dt>Called the wrong way</dt>
                  <dd>{lose} in 100</dd>
                </div>
              </dl>
              <p className="needs">{advice}</p>
            </div>
          )}
        </section>
      </main>
      <footer className="disclosure">
        <p>
          The reading uses the same calculation Flagsmith Experimentation reports: relative lift with a delta-method interval, and a winner at a 95%
          chance to beat control once every version has 50 visitors and 5 conversions. The futures draw plausible true rates from your counts, add
          the visitors still to come, and apply that rule at the deadline.
        </p>
        <p>
          <a href="/">Plan a new test</a>
          <a href="/lab">Verdict’s own results</a>
          <a href="https://github.com/r69shabh/verdict">Source on GitHub</a>
        </p>
      </footer>
    </div>
  );
}
