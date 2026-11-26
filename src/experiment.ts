import flagsmith from '@flagsmith/flagsmith';

export const FLAG = 'first_screen';
export const EVENTS = {
  forecastRun: 'forecast_run',
  forecastOwn: 'forecast_own',
  planCopied: 'plan_copied',
} as const;

export type Arm = 'control' | 'worked_example';
export type Assignment = {
  arm: Arm;
  mode: 'live' | 'preview' | 'offline';
  inExperiment: boolean;
};

const ENVIRONMENT_KEY = import.meta.env.VITE_FLAGSMITH_ENVIRONMENT_KEY as string | undefined;
const EVENTS_URL = 'https://events.api.flagsmith.com/';
const VISITOR_KEY = 'verdict.visitor';

let live = false;
const sent = new Set<string>();

function visitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = `v_${crypto.randomUUID()}`;
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return `v_${crypto.randomUUID()}`;
  }
}

const keepaliveFetch: typeof fetch = (input, init) =>
  fetch(input, String(input instanceof Request ? input.url : input).startsWith(EVENTS_URL) ? { ...init, keepalive: true } : init);

function timeout(ms: number) {
  return new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Flagsmith did not answer within ${ms} ms`)), ms));
}

function isAutomated() {
  return navigator.webdriver || /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed/i.test(navigator.userAgent);
}

function previewArm(): Arm | null {
  const value = new URLSearchParams(location.search).get('preview');
  return value === 'control' || value === 'worked_example' ? value : null;
}

let assignment: Promise<Assignment> | null = null;

export function assign(): Promise<Assignment> {
  assignment ??= resolveAssignment();
  return assignment;
}

async function resolveAssignment(): Promise<Assignment> {
  const preview = previewArm();
  if (preview) return { arm: preview, mode: 'preview', inExperiment: false };
  if (isAutomated()) return { arm: 'control', mode: 'offline', inExperiment: false };
  if (!ENVIRONMENT_KEY) return { arm: 'control', mode: 'offline', inExperiment: false };
  try {
    await Promise.race([
      flagsmith.init({
        environmentID: ENVIRONMENT_KEY,
        identity: visitorId(),
        enableEvents: true,
        cacheFlags: false,
        fetch: keepaliveFetch,
        eventProcessorConfig: { flushInterval: 3000 },
      }),
      timeout(4000),
    ]);
    const flag = flagsmith.getExperimentFlag(FLAG);
    live = Boolean(flag?.experiment?.inExperiment);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flagsmith.flushEvents();
    });
    void flagsmith.flushEvents();
    return {
      arm: flag?.value === 'worked_example' ? 'worked_example' : 'control',
      mode: 'live',
      inExperiment: Boolean(flag?.experiment?.inExperiment),
    };
  } catch {
    return { arm: 'control', mode: 'offline', inExperiment: false };
  }
}

export function track(event: (typeof EVENTS)[keyof typeof EVENTS]) {
  if (!live || sent.has(event)) return;
  sent.add(event);
  flagsmith.trackEvent(event);
  void flagsmith.flushEvents();
}
