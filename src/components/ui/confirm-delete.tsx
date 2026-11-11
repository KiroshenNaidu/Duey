'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Global "are you sure?" before a delete. Call
//   confirmDelete({ title: 'Delete "WiFi"?' }, () => deleteExpense(id))
// and the action only runs on Delete. Event-based like showUndoToast, so callers need no
// state or context; <ConfirmDeleteHost /> is mounted once in the root layout. Styled as the
// debt delete confirmation in DebtCard.

const EVENT_NAME = 'duey:confirm-delete';

interface ConfirmDeleteOptions {
  title: string;
  description?: string;
  /** Button label. Default "Delete". */
  confirmLabel?: string;
}

interface ConfirmDeleteDetail extends ConfirmDeleteOptions {
  onConfirm: () => void;
}

export function confirmDelete(options: ConfirmDeleteOptions, onConfirm: () => void) {
  window.dispatchEvent(new CustomEvent<ConfirmDeleteDetail>(EVENT_NAME, { detail: { ...options, onConfirm } }));
}

export function ConfirmDeleteHost() {
  const [open, setOpen] = useState(false);
  // Kept after closing so the text doesn't blank out during the exit animation.
  const [req, setReq] = useState<ConfirmDeleteDetail | null>(null);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onShow = (e: Event) => {
      const detail = (e as CustomEvent<ConfirmDeleteDetail>).detail;
      pending.current = detail.onConfirm;
      setReq(detail);
      setOpen(true);
    };
    window.addEventListener(EVENT_NAME, onShow);
    return () => window.removeEventListener(EVENT_NAME, onShow);
  }, []);

  const confirm = () => {
    const run = pending.current;
    pending.current = null;
    setOpen(false);
    run?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={v => { setOpen(v); if (!v) pending.current = null; }}>
      <AlertDialogContent className="rounded-[2rem]">
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title ?? 'Delete?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {req?.description ?? 'Are you sure? You can undo this for a few seconds afterwards.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-end">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} className={cn(buttonVariants({ variant: 'destructive' }))}>
            {req?.confirmLabel ?? 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
