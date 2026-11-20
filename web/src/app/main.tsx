import './zodConfig';
import '@patternfly/react-core/dist/styles/base.css';
import '@patternfly/patternfly/patternfly-addons.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// `npm run dev:mock` (Vite mode `mock`, T-0042): start the MSW mock backend before the first request. Vite replaces
// `import.meta.env.MODE` with a literal, so production builds drop this branch and the dynamic import with it.
if (import.meta.env.MODE === 'mock') {
  const { startMockBackend } = await import('@/mocks/browser');
  await startMockBackend();
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
