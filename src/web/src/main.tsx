import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { I18nProvider } from './i18n/I18nProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Inside the provider, not outside: the boundary renders translated copy, so it needs
        the translator to be available when it catches. */}
    <I18nProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
