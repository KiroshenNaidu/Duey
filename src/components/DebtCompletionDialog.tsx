'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface DebtCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debtTitle: string;
  totalOwed: number;
  paymentCount: number;
  onComplete: () => void;
  onKeepTracking: () => void;
}

export function DebtCompletionDialog({
  open,
  onOpenChange,
  debtTitle,
  totalOwed,
  paymentCount,
  onComplete,
  onKeepTracking,
}: DebtCompletionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] text-center">
        <DialogHeader>
          <div className="text-5xl mb-2">🎉</div>
          <DialogTitle className="text-xl">Paid Off!</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-1 text-sm text-muted-foreground">
          <p>
            You&apos;ve fully paid off <span className="font-semibold text-foreground">{debtTitle}</span>
          </p>
          <p>
            {formatCurrency(totalOwed)} across {paymentCount} payment{paymentCount !== 1 ? 's' : ''}. Well done!
          </p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={onComplete}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Complete &amp; Archive
          </Button>
          <Button
            variant="outline"
            onClick={onKeepTracking}
            className="w-full"
          >
            Keep Tracking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
