'use client';

import { useContext, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

export function ErrorModal() {
  const { appError, setAppError } = useContext(AppDataContext);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!appError) return null;

  const err = appError.error instanceof Error ? appError.error : null;
  const errorType = err?.name ?? 'UnknownError';
  const errorMessage = err?.message ?? String(appError.error);
  const errorStack = err?.stack ?? '';
  const timeStr = new Date(appError.ts).toLocaleTimeString();

  const report = JSON.stringify({
    friendly: appError.friendly,
    operation: appError.operation,
    errorType,
    message: errorMessage,
    stack: errorStack.slice(0, 800),
    timestamp: appError.ts,
    time: new Date(appError.ts).toISOString(),
  }, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — user can expand details manually
    }
  };

  const handleDismiss = () => {
    setAppError(null);
    setShowDetails(false);
    setCopied(false);
  };

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Something went wrong</AlertDialogTitle>
          <AlertDialogDescription>{appError.friendly}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <button
            onClick={() => setShowDetails(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Details for support / AI
          </button>

          {showDetails && (
            <div className="bg-muted/50 rounded-xl p-3 space-y-1.5 text-[11px] font-mono border border-border/50">
              <p><span className="text-muted-foreground">Operation: </span>{appError.operation}</p>
              <p><span className="text-muted-foreground">Error: </span>{errorType}</p>
              <p><span className="text-muted-foreground">Message: </span>{errorMessage}</p>
              <p><span className="text-muted-foreground">Time: </span>{timeStr}</p>
              {errorStack && (
                <details className="mt-1">
                  <summary className="text-muted-foreground cursor-pointer">Stack trace</summary>
                  <pre className="mt-1 text-[10px] whitespace-pre-wrap break-all opacity-70 max-h-32 overflow-y-auto">
                    {errorStack.slice(0, 800)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex-row gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 flex-1">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy for AI'}
          </Button>
          <Button size="sm" onClick={handleDismiss} className="flex-1">Dismiss</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
