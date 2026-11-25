import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = error?.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(displayMessage) as { error?: string; operationType?: string };
      if (parsed?.error) {
        displayMessage = `Cloud sync error (${parsed.operationType || 'operation'}): ${parsed.error}`;
      }
    } catch {
      // Keep plain error message
    }
    return { hasError: true, message: displayMessage };
  }

  componentDidCatch(error: Error): void {
    console.error('Physica Studio ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-lg text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <h1 className="font-display text-base font-semibold mb-1.5">
              Something went wrong
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Reload Studio</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
