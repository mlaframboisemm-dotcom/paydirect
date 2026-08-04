import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

async function clearDevServiceWorkersAndCaches(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith('sovereign-cache-'))
      .map((key) => caches.delete(key))
  );
}

// Register SW only in production to prevent stale cache issues during local development.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').then(
        (reg) => console.log('[PWA] ServiceWorker registered with scope:', reg.scope),
        (err) => console.warn('[PWA] ServiceWorker registration failed:', err)
      );
      return;
    }

    clearDevServiceWorkersAndCaches().catch((err) => {
      console.warn('[PWA] Failed to clear dev service workers/caches:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
