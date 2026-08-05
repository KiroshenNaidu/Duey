'use client';

import { useState, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

// Only the dialog CHROME is eager here — the trigger, the frame and the header, so the +
// FAB is live on the very first painted frame. The form body carries react-hook-form + zod
// + @hookform/resolvers (~80 KB) and is code-split into its own chunk, warmed in the
// background moments after boot (prefetch.ts tier 1). By the time anyone opens this dialog
// the chunk is parsed and cached, so the skeleton below is a cold-start-only fallback.
const AddDebtForm = dynamic(() => import('@/components/AddDebtForm').then(m => ({ default: m.AddDebtForm })), {
  ssr: false,
  loading: () => (
    <div className="space-y-4 pt-1">
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  ),
});

export function AddDebtDialog({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Debt</DialogTitle>
          <DialogDescription className="sr-only">Enter the debt title, who it is owed to, total amount owed, and monthly installment to start tracking.</DialogDescription>
        </DialogHeader>
        {/* Radix unmounts DialogContent when closed, so the form's draft state is discarded
            on close exactly as the old form.reset() did — and a fresh AddDebtForm mounts
            (with empty defaults) on the next open. */}
        <AddDebtForm onDone={() => setIsOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
