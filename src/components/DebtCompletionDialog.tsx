'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface DebtCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debtTitle: string;
  totalOwed: number;
  amountPaid: number;
  paymentCount: number;
  onComplete: () => void;
  onKeepTracking: () => void;
}

export function DebtCompletionDialog({
  open,
  onOpenChange,
  debtTitle,
  totalOwed,
  amountPaid,
  paymentCount,
  onComplete,
  onKeepTracking,
}: DebtCompletionDialogProps) {
  const overpaid = Math.max(0, amountPaid - totalOwed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px] p-0 gap-0 overflow-hidden">
        <div className="flex flex-col items-center text-center px-6 pt-8 pb-6 space-y-4">
          {/* Centered emoji */}
          <div className="text-6xl leading-none select-none">🎉</div>

          <div className="space-y-1">
            <DialogTitle className="text-2xl font-black">Paid Off!</DialogTitle>
            <DialogDescription className="sr-only">
              Debt fully paid — choose to archive it or continue tracking.
            </DialogDescription>
            <p className="text-sm text-muted-foreground">
              You&apos;ve fully paid off{' '}
              <span className="font-semibold text-foreground">{debtTitle}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(amountPaid)} across {paymentCount} payment{paymentCount !== 1 ? 's' : ''}. Well done!
            </p>
            {overpaid > 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                {formatCurrency(overpaid)} over the {formatCurrency(totalOwed)} owed
              </p>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-2">
          <Button
            onClick={onComplete}
            className="w-full bg-accent text-btn-on-accent hover:bg-accent/90 h-12 text-base font-semibold"
          >
            Complete &amp; Archive
          </Button>
          <Button
            variant="outline"
            onClick={onKeepTracking}
            className="w-full h-11"
          >
            Keep Tracking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
