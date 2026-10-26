import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles/app.css';
import { App } from './app/App';
import { registerServiceWorker, watchInstallPrompt } from './app/pwa';
import { hideSplash } from './platform';
import { startEngine } from './state/engine';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

document.addEventListener('visibilitychange', () => {
  document.documentElement.dataset.hidden =
    document.visibilityState === 'hidden' ? 'true' : 'false';
});

watchInstallPrompt();

void startEngine()
  .catch((error: unknown) => {
    console.error('Pandaro failed to load saved data', error);
  })
  .finally(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    void hideSplash();
    void registerServiceWorker();
  });
