import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/schibsted-grotesk';
import './styles.css';
import { App } from './App';
import { Lab } from './Lab';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname.replace(/\/$/, '') === '/lab' ? <Lab /> : <App />}
  </StrictMode>,
);
