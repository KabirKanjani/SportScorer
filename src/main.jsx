import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { bootSentry } from './sentry.js';
import './styles.css';

// Client error tracking via the Sentry loader in index.html. Fire-and-forget:
// queued until the SDK reports ready, never blocks first paint.
bootSentry();
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// PWA installability: a network pass-through worker so the app can be "Added to
// Home Screen" without ever serving stale assets from a cache.
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}