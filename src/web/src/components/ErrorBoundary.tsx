import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { I18nContext } from '../i18n/context';
import { pillButtonClass } from './primitives';

/**
 * Last line of defence for a render that throws.
 *
 * Without one, any exception raised while rendering unmounts the whole tree and leaves a
 * blank black page with no way back — the user cannot even reload into a different state,
 * because the failure reproduces on every render. The panel is a single-screen app with no
 * router, so there is nowhere to fall back to except a retry.
 *
 * It is a class because that is still the only way to catch a render error in React.
 * `contextType` is how a class reads the translator: the copy is the same pair of keys the
 * session-check failure already uses, so this adds no new strings to either catalogue.
 */
interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  static contextType = I18nContext;

  declare context: React.ContextType<typeof I18nContext>;

  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The panel ships no error reporting, so the console is the only record there is.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    const { t } = this.context;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink px-6 font-sans text-cream">
        <h1 className="sr-only">{t('app.sessionCheckFailed')}</h1>
        <p role="alert" className="m-0 text-center font-mono text-[13px] text-cream/70">
          {t('app.sessionCheckFailed')}
        </p>
        {/* A full reload, not `setState({ failed: false })`: the state that produced the
            bad render is still there, so re-rendering the same tree would just throw
            again. */}
        <button
          type="button"
          className={pillButtonClass}
          onClick={() => window.location.reload()}
        >
          {t('app.retry')}
        </button>
      </main>
    );
  }
}
