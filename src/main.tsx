import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/modules.css';
import './styles/print.css';
import { ensureTemporal } from './core/temporal';
import { App } from './App';

async function bootstrap() {
  // Feature-detect native Temporal; dynamically load offline bundled polyfill if needed
  await ensureTemporal();
  const root = document.getElementById('root');
  if (!root) throw new Error('Planaday root element is missing');

  // Register Offline-First PWA Service Worker
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const register = () => { void navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Offline service worker unavailable', err)); };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap().catch((error) => {
  console.error('Planaday startup failed', error);
  const root = document.getElementById('root');
  if (root) {
    root.textContent = 'Planaday could not start. Your local data has not been intentionally changed. Reload to retry.';
    root.setAttribute('role', 'alert');
  }
});
