type Inference = { lift: number; ci_low: number; ci_high: number; chance_to_win: number } | null;
type MetricResult = {
  metric_id: number;
  variants: Record<string, { n: number; sum: number }>;
  inference: Record<string, Inference>;
};
type Snapshot = {
  environment: string;
  taken_at: string;
  experiment: { id: number; status: string; started_at: string | null; ended_at: string | null; rollout_decision: string | null; metrics: { metric: number; metric_name: string; expected_direction: string; direction: string }[] };
  exposures: { exposures?: { payload?: { excluded_identities?: number; timeseries?: { points: { new_identities: Record<string, number> }[] } } } };
  results: { results?: { as_of: string; payload?: { metrics: MetricResult[]; srm_p_value: number | null } } };
};
type Ledger = { runId: string; mode: 'aa' | 'ab'; lift: number; visitors: number; arms: Record<string, Record<string, number>> };

const VARIANT = 'worked_example';
const ENVIRONMENTS = [
  { name: 'Production', ledger: null, about: 'Real visitors only. This is the result that answers the question.' },
  { name: 'Sim AB', ledger: 'ab', about: 'Scripted visitors with a planted +25% lift on forecast_own. Flagsmith should find it.' },
  { name: 'Sim AA', ledger: 'aa', about: 'Scripted visitors with no difference between the versions. Flagsmith should call no winner.' },
] as const;
const ROLE: Record<string, string> = { forecast_own: 'Primary', plan_copied: 'Guardrail', forecast_run: 'Informational' };

const snapshots = Object.entries(import.meta.glob<Snapshot>('../results/latest/*.json', { eager: true, import: 'default' }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, s]) => s);
const ledgers = Object.values(import.meta.glob<Ledger>('../sim-ledgers/*.json', { eager: true, import: 'default' }));

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;
const time = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '—';

function verdict(inf: Inference, expected: string, direction: string) {
  if (!inf) return { label: 'Collecting data', tone: 'quiet' };
  if (direction === 'informational') return { label: 'Not used', tone: 'quiet' };
  if (expected === 'not_decrease') return inf.chance_to_win <= 0.05 ? { label: 'Harmed', tone: 'bad' } : { label: 'Not harmed', tone: 'good' };
  if (inf.chance_to_win >= 0.95) return { label: 'Winning', tone: 'good' };
  if (inf.chance_to_win <= 0.05) return { label: 'Losing', tone: 'bad' };
  return { label: 'Inconclusive', tone: 'quiet' };
}

function Interval({ inf, domain, planted }: { inf: Inference; domain: [number, number]; planted?: number }) {
  const width = 240;
  const x = (v: number) => ((v - domain[0]) / (domain[1] - domain[0])) * width;
  return (
    <svg className="interval" viewBox={`0 0 ${width} 28`} role="img" aria-label={inf ? `Lift ${signed(inf.lift)}, 95% interval ${signed(inf.ci_low)} to ${signed(inf.ci_high)}` : 'No interval yet'}>
      <line className="interval-zero" x1={x(0)} x2={x(0)} y1="2" y2="26" />
      {planted !== undefined && <line className="interval-planted" x1={x(planted)} x2={x(planted)} y1="4" y2="24" />}
      {inf && (
        <>
          <line className="interval-bar" x1={x(inf.ci_low)} x2={x(inf.ci_high)} y1="14" y2="14" />
          <circle className="interval-point" cx={x(inf.lift)} cy="14" r="4.5" />
        </>
      )}
    </svg>
  );
}

function Environment({ name, about, ledgerMode }: { name: string; about: string; ledgerMode: 'aa' | 'ab' | null }) {
  const snapshot = snapshots.filter((s) => s.environment === name).at(-1);
  if (!snapshot) return null;
  const payload = snapshot.results.results?.payload;
  const exposurePayload = snapshot.exposures.exposures?.payload;
  const exposed = (exposurePayload?.timeseries?.points ?? []).reduce<Record<string, number>>((acc, p) => {
    for (const [arm, n] of Object.entries(p.new_identities)) acc[arm] = (acc[arm] ?? 0) + n;
    return acc;
  }, {});
  const ledger = ledgerMode ? ledgers.find((l) => l.mode === ledgerMode) : undefined;
  const names = Object.fromEntries(snapshot.experiment.metrics.map((m) => [m.metric, m]));
  const metrics = payload?.metrics ?? [];
  const bounds = metrics.flatMap((m) => (m.inference[VARIANT] ? [m.inference[VARIANT]!.ci_low, m.inference[VARIANT]!.ci_high] : []));
  const domain: [number, number] = [Math.min(-0.3, ...bounds) - 0.05, Math.max(0.5, ...bounds) + 0.05];
  const ledgerMatches =
    ledger &&
    metrics.every((m) => {
      const metric = names[m.metric_id]?.metric_name ?? '';
      return ['control', VARIANT].every((arm) => m.variants[arm]?.sum === ledger.arms[arm]?.[metric] && m.variants[arm]?.n === ledger.arms[arm]?.exposed);
    });
  const total = (exposed.control ?? 0) + (exposed[VARIANT] ?? 0);
  return (
    <section className="lab-env" aria-labelledby={`env-${name}`}>
      <div className="lab-env-head">
        <h2 id={`env-${name}`}>{name}</h2>
        <p>{about}</p>
        <p className="lab-meta">
          Experiment #{snapshot.experiment.id}, {snapshot.experiment.status}
          {snapshot.experiment.rollout_decision ? `, rolled out ${snapshot.experiment.rollout_decision}` : ''}. Results as of {time(snapshot.results.results?.as_of)}.
        </p>
      </div>
      <p className="lab-exposures">
        <strong>{total.toLocaleString('en-US')}</strong> visitors enrolled: {(exposed.control ?? 0).toLocaleString('en-US')} saw the empty form,{' '}
        {(exposed[VARIANT] ?? 0).toLocaleString('en-US')} saw the worked example
        {exposurePayload?.excluded_identities ? `; ${exposurePayload.excluded_identities} excluded for seeing both` : ''}.
        {payload?.srm_p_value != null && payload.srm_p_value < 0.001 ? ' Sample ratio mismatch: do not trust these numbers.' : ''}
      </p>
      {total === 0 ? (
        <p className="lab-empty">No visitors yet. The first result appears once each version has 50 visitors and 5 conversions.</p>
      ) : (
        <div className="lab-scroll">
        <table className="lab-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Empty form</th>
              <th scope="col">Worked example</th>
              <th scope="col">Lift and 95% interval</th>
              <th scope="col">Chance to beat control</th>
              <th scope="col">Reading</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const meta = names[m.metric_id];
              const c = m.variants.control ?? { n: 0, sum: 0 };
              const v = m.variants[VARIANT] ?? { n: 0, sum: 0 };
              const inf = m.inference[VARIANT] ?? null;
              const read = verdict(inf, meta?.expected_direction ?? 'increase', meta?.direction ?? 'up');
              return (
                <tr key={m.metric_id}>
                  <th scope="row">
                    <code>{meta?.metric_name}</code>
                    <span>{ROLE[meta?.metric_name ?? ''] ?? ''}</span>
                  </th>
                  <td data-label="Empty form">{pct(c.sum / (c.n || 1))}<span>{c.sum}/{c.n}</span></td>
                  <td data-label="Worked example">{pct(v.sum / (v.n || 1))}<span>{v.sum}/{v.n}</span></td>
                  <td className="lab-interval" data-label="Lift and 95% interval">
                    <Interval inf={inf} domain={domain} planted={ledger?.mode === 'ab' && meta?.metric_name === 'forecast_own' ? ledger.lift : undefined} />
                    <span>{inf ? `${signed(inf.lift)} [${signed(inf.ci_low)}, ${signed(inf.ci_high)}]` : '—'}</span>
                  </td>
                  <td data-label="Chance to beat control">{inf ? pct(inf.chance_to_win) : '—'}</td>
                  <td data-label="Reading"><span className={`tone ${read.tone}`}>{read.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {ledger && (
        <p className="lab-ledger">
          {ledgerMatches
            ? `Every exposure and conversion count above equals what the simulator sent (ledger ${ledger.runId}).`
            : `Some counts differ from the simulator ledger ${ledger.runId}.`}
          {ledger.mode === 'ab' ? ' The thin red line marks the planted +25% lift.' : ''}
        </p>
      )}
      {metrics.some((m) => names[m.metric_id]?.metric_name === 'forecast_run' && m.inference[VARIANT]) && (
        <p className="lab-ledger">
          forecast_run is reported but never used for the decision: pressing Forecast on the untouched example costs one click, so it flatters the
          worked example.
        </p>
      )}
    </section>
  );
}

export function Lab() {
  return (
    <div className="page lab">
      <header className="masthead">
        <a className="wordmark" href="/">Verdict</a>
        <h1>Lab notebook: does a worked example beat an empty form?</h1>
      </header>
      <p className="lab-intro">
        Verdict runs a Flagsmith experiment on its own first screen. Half of visitors get an empty form, half get a worked example, and the primary
        metric counts who forecasts their own numbers. The plan was registered before the experiment started:{' '}
        <a href="https://github.com/r69shabh/verdict/blob/main/EXPERIMENT.md">read the pre-registration</a> and the{' '}
        <a href="https://github.com/r69shabh/verdict/blob/main/RUNLOG.md">run log</a>. These are saved snapshots of Flagsmith's results, published with
        each deploy.
      </p>
      {ENVIRONMENTS.map((env) => (
        <Environment key={env.name} name={env.name} about={env.about} ledgerMode={env.ledger} />
      ))}
    </div>
  );
}
