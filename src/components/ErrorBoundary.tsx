'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Unhandled component crash:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>

          <div className="space-y-1.5 max-w-xs">
            <p className="text-base font-bold text-foreground">The app crashed</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-opacity hover:opacity-90"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm font-semibold transition-colors hover:bg-muted/50"
            >
              Reload app
            </button>
          </div>

          <details className="mt-2 text-left max-w-xs w-full">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              Technical details
            </summary>
            <pre className="mt-2 text-[10px] font-mono text-muted-foreground/70 whitespace-pre-wrap break-all max-h-48 overflow-y-auto rounded-xl bg-muted/40 p-3">
              {this.state.error.stack?.slice(0, 1000)}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
