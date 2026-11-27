import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/schibsted-grotesk';
import './styles.css';
import { App } from './App';

const Lab = lazy(() => import('./Lab').then((m) => ({ default: m.Lab })));
const Check = lazy(() => import('./Check').then((m) => ({ default: m.Check })));
const route = location.pathname.replace(/\/$/, '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{route === '/lab' ? <Lab /> : route === '/check' ? <Check /> : <App />}</Suspense>
  </StrictMode>,
);
