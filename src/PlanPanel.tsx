import { useState } from 'react';
import { cliCommands, preRegistration, type PlanNames } from './plan';
import type { Forecast, ForecastInput } from './forecast';
import { EVENTS, track } from './experiment';

type Props = {
  input: ForecastInput;
  result: Forecast;
  names: PlanNames;
  onNames: (names: PlanNames) => void;
  deadlineLabel: string;
};

function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {done ? <path d="M4 10.5 8 14.5 16 5.5" /> : <><rect x="6.5" y="6.5" width="10" height="10" rx="2" /><path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" /></>}
    </svg>
  );
}

function Block({ title, file, text }: { title: string; file: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    track(EVENTS.planCopied);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="block">
      <div className="block-head">
        <h3>{title}</h3>
        <span className="block-file">{file}</span>
        <button type="button" className="copy" onClick={copy}>
          <CopyIcon done={copied} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre tabIndex={0}><code>{text}</code></pre>
    </div>
  );
}

export function PlanPanel({ input, result, names, onNames, deadlineLabel }: Props) {
  const today = new Date().toLocaleDateString('en-CA');
  const set = (key: keyof PlanNames) => (e: React.ChangeEvent<HTMLInputElement>) => onNames({ ...names, [key]: e.target.value.replace(/\s+/g, '_') });
  return (
    <section className="plan" aria-labelledby="plan-title">
      <div className="plan-intro">
        <h2 id="plan-title">Your plan</h2>
        <p>Commit the pre-registration before you look at any results, then paste the commands to set the experiment up in Flagsmith.</p>
        <div className="names">
          <label>Flag <input value={names.flag} onChange={set('flag')} spellCheck={false} /></label>
          <label>Variant key <input value={names.variant} onChange={set('variant')} spellCheck={false} /></label>
          <label>Success event <input value={names.event} onChange={set('event')} spellCheck={false} /></label>
        </div>
      </div>
      <Block title="Pre-registration" file="EXPERIMENT.md" text={preRegistration(input, result, names, deadlineLabel, today)} />
      <Block title="Flagsmith CLI" file="setup.sh" text={cliCommands(input, names)} />
    </section>
  );
}
