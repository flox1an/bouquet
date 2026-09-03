import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { downloadDiagnosticReport, recordDiagnosticError } from '../utils/diagnostics';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Top-level render guard. Catches errors thrown during rendering so a single
 * component crash does not blank the whole app. The fallback is self-contained
 * (no provider dependencies) because it must render when the app tree is broken.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error during render:', error, info);
    recordDiagnosticError('react.error-boundary', error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-full bg-destructive/10 p-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </span>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            An unexpected error occurred while rendering this page. Reloading usually fixes it.
          </p>
          {this.state.error && (
            <pre className="mb-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
          <button
            type="button"
            onClick={() => downloadDiagnosticReport()}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
          >
            Download diagnostic report
          </button>
        </div>
      </div>
    );
  }
}
