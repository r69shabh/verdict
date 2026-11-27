import { useEffect, useMemo, useRef, useState } from 'react';
import { assign, EVENTS, track, type Assignment } from './experiment';
import { forecast, validate, type ForecastInput } from './forecast';
import { formatDeadline, initialFields, isOwnForecast, toInput, type Fields } from './fields';
import { ForecastPanel } from './ForecastPanel';
import { PlanPanel } from './PlanPanel';
import { slug, type PlanNames } from './plan';

const REPO = 'https://github.com/r69shabh/verdict';

const ERROR_TEXT: Record<keyof ForecastInput, keyof Fields | null> = {
  threshold: null,
  visitorsPerDay: 'visitors',
  baselineRate: 'baseline',
  relativeLift: 'lift',
  days: 'deadline',
  rolloutShare: 'rollout',
  variantShare: 'split',
};

function Blank(props: {
  name: keyof Fields;
  fields: Fields;
  onChange: (name: keyof Fields, value: string) => void;
  label: string;
  hint: string;
  kind?: 'number' | 'text' | 'date';
  invalid?: boolean;
}) {
  const { name, fields, onChange, label, hint, kind = 'number', invalid } = props;
  return (
    <input
      className={`blank ${kind}${fields[name] === '' ? ' empty' : ''}`}
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={hint}
      value={fields[name]}
      type={kind === 'date' ? 'datetime-local' : 'text'}
      inputMode={kind === 'number' ? 'decimal' : undefined}
      autoComplete="off"
      spellCheck={kind === 'text'}
      onChange={(e) => onChange(name, e.target.value)}
    />
  );
}

function Disclosure({ assignment }: { assignment: Assignment | null }) {
  const arm = assignment?.arm === 'worked_example' ? 'the worked example' : 'the empty form';
  const status = !assignment
    ? 'Checking which version you get…'
    : assignment.mode === 'preview'
      ? `This is a preview of ${arm}. Nothing you do here is counted.`
      : assignment.mode === 'offline'
        ? 'Flagsmith did not load, so you see the empty form and nothing is counted.'
        : assignment.inExperiment
          ? `You are seeing ${arm}.`
          : 'You are outside the experiment, so nothing is counted.';
  return (
    <footer className="disclosure">
      <p>
        This page is an A/B test run with Flagsmith Experimentation. Half of visitors get an empty form, half get a worked example, and it
        counts who goes on to forecast their own numbers. {status}
      </p>
      <p>
        <a href="/lab">See the results so far</a>
        <a href="/check">Check a test that is already running</a>
        <a href={`${REPO}/blob/main/EXPERIMENT.md`}>Read the pre-registration</a>
        <a href={REPO}>Source on GitHub</a>
        <span>Visits carry a random ID and nothing else.</span>
      </p>
    </footer>
  );
}

export function App() {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sweep, setSweep] = useState(0);
  const [names, setNames] = useState<PlanNames | null>(null);
  const example = useRef<Fields | null>(null);
  const now = useMemo(() => Date.now(), [fields]);

  useEffect(() => {
    let alive = true;
    void assign().then((result) => {
      if (!alive) return;
      const start = initialFields(result.arm);
      example.current = start;
      setAssignment(result);
      setFields(start);
    });
    return () => {
      alive = false;
    };
  }, []);

  const input = fields ? toInput(fields, now) : null;
  const errors = input ? validate(input) : [];
  const result = submitted && input && errors.length === 0 ? forecast(input) : null;
  const deadlineLabel = fields ? formatDeadline(fields.deadline) : '';
  const invalid = new Set(errors.map((e) => ERROR_TEXT[e.field]));

  useEffect(() => {
    if (result && assignment && fields && example.current && isOwnForecast(assignment.arm, fields, example.current)) track(EVENTS.forecastOwn);
  });

  const onChange = (name: keyof Fields, value: string) => setFields((current) => (current ? { ...current, [name]: value } : current));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fields) return;
    setSubmitted(true);
    if (input && errors.length === 0) {
      track(EVENTS.forecastRun);
      setSweep((n) => n + 1);
      setNames((current) => current ?? { change: fields.change || 'My change', success: fields.success || 'convert', flag: slug(fields.change, 'my_experiment'), variant: 'variant', event: slug(fields.success, 'conversion') });
    }
  };

  const missing = submitted && !input;

  return (
    <div className="page">
      <header className="masthead">
        <span className="wordmark">Verdict</span>
        <h1>Will your A/B test reach a verdict before your deadline?</h1>
      </header>

      <main className="desk">
        <form className="sheet" onSubmit={onSubmit} aria-busy={!fields} noValidate>
          {fields ? (
            <>
              <p className="sentence">
                My page gets <Blank name="visitors" fields={fields} onChange={onChange} label="Visitors per day" hint="how many" invalid={invalid.has('visitors')} /> visitors a day.
                Today <Blank name="baseline" fields={fields} onChange={onChange} label="Baseline conversion rate, percent" hint="rate" invalid={invalid.has('baseline')} />% of them{' '}
                <Blank name="success" fields={fields} onChange={onChange} label="What counts as success" hint="do the thing" kind="text" />. I think{' '}
                <Blank name="change" fields={fields} onChange={onChange} label="The change you are testing" hint="my change" kind="text" /> will lift that by{' '}
                <Blank name="lift" fields={fields} onChange={onChange} label="Expected relative lift, percent" hint="lift" invalid={invalid.has('lift')} />%. I need an answer by{' '}
                <Blank name="deadline" fields={fields} onChange={onChange} label="Deadline" hint="deadline" kind="date" invalid={invalid.has('deadline')} />.
              </p>
              <p className="sentence small">
                <Blank name="rollout" fields={fields} onChange={onChange} label="Share of visitors in the test, percent" hint="100" invalid={invalid.has('rollout')} />% of visitors enter the test, and{' '}
                <Blank name="split" fields={fields} onChange={onChange} label="Share of the test that sees the change, percent" hint="50" invalid={invalid.has('split')} />% of them see the change.
              </p>
              {assignment?.arm === 'worked_example' && <p className="hint">These numbers are an example. Change any of them to plan your own test.</p>}
              {(missing || errors.length > 0) && (
                <ul className="errors" role="alert">
                  {missing && <li>Fill in every number and the deadline to get a forecast.</li>}
                  {errors.map((e) => <li key={e.field + e.message}>{e.message}</li>)}
                </ul>
              )}
              <button type="submit" className="go">Forecast my test</button>
            </>
          ) : (
            <p className="sentence loading">Loading…</p>
          )}
        </form>

        <ForecastPanel input={input} result={result} deadlineLabel={deadlineLabel} sweep={sweep} />
      </main>

      {result && input && names && <PlanPanel input={input} result={result} names={names} onNames={setNames} deadlineLabel={deadlineLabel} />}

      <Disclosure assignment={assignment} />
    </div>
  );
}
