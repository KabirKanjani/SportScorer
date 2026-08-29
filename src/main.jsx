import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { API_BASE } from './api.js';
import './styles.css';

// Client error tracking via the Sentry loader mounted in index.html. The loader
// exposes a buffering window.Sentry immediately, so a fire-and-forget init here
// is safe: init options apply once the real SDK finishes loading. No DSN is
// needed — the loader carries the client key.
async function initSentry() {
  try {
    const res = await fetch(API_BASE + '/api/sentry/config', { credentials: 'include' });
    const cfg = await res.json();
    window.Sentry?.init({
      environment: cfg?.environment || 'development',
      release: cfg?.release || undefined,
      tracesSampleRate: 0.05,
    });
  } catch {
    /* offline or not configured — skip */
  }
}

initSentry();
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);