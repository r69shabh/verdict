import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/schibsted-grotesk';
import './styles.css';
import { App } from './App';
import { Check } from './Check';
import { Lab } from './Lab';

const route = location.pathname.replace(/\/$/, '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {route === '/lab' ? <Lab /> : route === '/check' ? <Check /> : <App />}
  </StrictMode>,
);
