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

  // Register Offline-First PWA Service Worker
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-fatal in restricted/file contexts
      });
    });
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
