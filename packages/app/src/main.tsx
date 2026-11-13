import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hydrate, startAutosave } from './store/session';
import './global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Restore the shared or saved project before the first render, so it doesn't flash.
void hydrate()
  .catch((e: unknown) => console.warn('Could not restore the session', e))
  .finally(() => {
    startAutosave();
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
