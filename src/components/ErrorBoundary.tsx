'use client';

import React from 'react';

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
        <div className="flex flex-col items-center justify-center min-h-dvh p-8 text-center gap-4">
          <p className="text-xl font-bold text-foreground">The app crashed</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              Try again
            </button>
            <button
              onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
              className="px-5 py-2 rounded-xl border border-border text-foreground text-sm font-semibold"
            >
              Reload app
            </button>
          </div>
          <details className="mt-4 text-left max-w-xs w-full">
            <summary className="text-xs text-muted-foreground cursor-pointer">Technical details</summary>
            <pre className="mt-2 text-[10px] font-mono text-muted-foreground/70 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {this.state.error.stack?.slice(0, 1000)}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
