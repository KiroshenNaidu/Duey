'use client';

import { useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import type { Debt } from '@/lib/types';
import { Pencil, Trash2, CalendarDays } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { PaymentCalendarDialog } from './PaymentCalendarDialog';
import { DebtCompletionDialog } from './DebtCompletionDialog';
import { getPaymentCount, getTotalInstallments, getAmountPaid } from '@/lib/calculations';

interface DebtCardProps {
  debt: Debt;
}

export function DebtCard({ debt }: DebtCardProps) {
  const router = useRouter();
  const { history, updateDebt, deleteDebt, completeDebt, logPaymentForToday, logCustomPayment } = useContext(AppDataContext);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const [editedTitle, setEditedTitle] = useState(debt.title);
  const [editedTotalOwed, setEditedTotalOwed] = useState(debt.total_owed.toString());
  const [editedInstallmentAmount, setEditedInstallmentAmount] = useState(debt.installment_amount.toString());
  const [customAmount, setCustomAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setEditedTitle(debt.title);
    setEditedTotalOwed(debt.total_owed.toString());
    setEditedInstallmentAmount(debt.installment_amount.toString());
  }, [debt]);

  const { paymentCount, totalInstallments, amountPaid, progress, isPaidOff } = useMemo(() => {
    const amountPaid = getAmountPaid(debt, history);
    const paymentCount = getPaymentCount(debt, history);
    const totalInstallments = getTotalInstallments(debt);
    const progress = debt.total_owed <= 0
      ? (amountPaid > 0 ? 100 : 0)
      : Math.min(100, (amountPaid / debt.total_owed) * 100);
    return { paymentCount, totalInstallments, amountPaid, progress, isPaidOff: progress >= 100 };
  }, [debt, history]);

  // Initialize ref with current isPaidOff so we don't fire on mount for already-paid debts
  const prevIsPaidOff = useRef(isPaidOff);
  useEffect(() => {
    if (isPaidOff && !prevIsPaidOff.current) {
      setShowCelebration(true);
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 } });
    }
    prevIsPaidOff.current = isPaidOff;
  }, [isPaidOff]);

  const handleUpdate = () => {
    const totalOwedNum = parseFloat(editedTotalOwed) || 0;
    const installmentAmountNum = parseFloat(editedInstallmentAmount) || 1;
    
    updateDebt(debt.id, {
      title: editedTitle,
      total_owed: totalOwedNum,
      installment_amount: installmentAmountNum,
    });
  };
  
  const handleDelete = () => {
    deleteDebt(debt.id);
    setIsDialogOpen(false);
  };

  const handleLogPaymentForToday = useCallback(() => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      logPaymentForToday(debt.id);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, debt.id, logPaymentForToday]);

  const handleLogCustomPayment = useCallback(() => {
    const amount = parseFloat(customAmount);
    if (!isNaN(amount) && amount > 0 && !isSubmitting) {
      setIsSubmitting(true);
      try {
        logCustomPayment(debt.id, amount);
        setCustomAmount('');
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [isSubmitting, customAmount, debt.id, logCustomPayment]);

  return (
    <>
    <DebtCompletionDialog
      open={showCelebration}
      onOpenChange={setShowCelebration}
      debtTitle={debt.title}
      totalOwed={debt.total_owed}
      paymentCount={paymentCount}
      onComplete={() => { setShowCelebration(false); completeDebt(debt.id); }}
      onKeepTracking={() => setShowCelebration(false)}
    />

    {/* Delete confirmation — rendered OUTSIDE the edit Dialog to avoid aria-hidden conflicts */}
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{debt.title}&quot;?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>This removes the debt from your active list. All payment records remain in your history.</p>
              <div className="bg-muted/50 rounded-xl p-3 border border-border/50 text-xs space-y-1">
                <p className="font-semibold text-foreground">About overpayments</p>
                <p>Any amount paid beyond the debt total is labelled <span className="font-semibold text-accent">Interest</span> by default. You can rename these entries in your payment history.</p>
              </div>
              <button
                onClick={() => { setShowDeleteConfirm(false); router.push('/history'); }}
                className="text-accent underline underline-offset-2 text-xs font-medium hover:text-accent/80 transition-colors"
              >
                View &amp; edit payment history →
              </button>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className={cn(buttonVariants({ variant: 'destructive' }))}>Delete Debt</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Card className="overflow-hidden border-border transition-all duration-300">
      <CardHeader>
        <div className="flex justify-between items-center gap-2">
          <CardTitle className="text-base font-bold truncate pr-2">{debt.title}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {paymentCount} of {totalInstallments} ({Math.round(progress)}%)
            </span>

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              if (!open) handleUpdate();
              setIsDialogOpen(open);
            }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden">
                <DialogHeader className="sr-only">
                  <DialogTitle>{debt.title}</DialogTitle>
                  <DialogDescription>
                    Edit debt details, log a payment, or delete this debt.
                  </DialogDescription>
                </DialogHeader>

                {/* Hero progress header */}
                <div className="px-5 pt-5 pb-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0 pr-3">
                      <h2 className="text-lg font-bold text-foreground leading-tight truncate">{debt.title}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {paymentCount} of {totalInstallments} installments
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={cn('text-3xl font-black tabular-nums leading-none', isPaidOff ? 'text-green-500' : 'text-primary')}>
                        {Math.round(progress)}%
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">complete</p>
                    </div>
                  </div>

                  <Progress
                    value={progress}
                    className={cn('h-3 rounded-full', isPaidOff ? '[&>*]:bg-green-500' : '[&>*]:bg-primary')}
                  />
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="font-semibold text-foreground">{formatCurrency(amountPaid)} paid</span>
                    <span className="text-muted-foreground">of {formatCurrency(debt.total_owed)}</span>
                  </div>
                </div>

                {/* Form & actions */}
                <div className="px-5 pb-5 space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor={`title-${debt.id}`} className="text-xs">Title</Label>
                    <Input id={`title-${debt.id}`} value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`total-${debt.id}`} className="text-xs">Total Owed</Label>
                      <Input id={`total-${debt.id}`} type="number" value={editedTotalOwed} onChange={(e) => setEditedTotalOwed(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`installment-${debt.id}`} className="text-xs">Installment</Label>
                      <Input id={`installment-${debt.id}`} type="number" value={editedInstallmentAmount} onChange={(e) => setEditedInstallmentAmount(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <Label htmlFor={`custom-payment-${debt.id}`} className="text-xs">Custom Payment Amount</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`custom-payment-${debt.id}`}
                        type="number"
                        placeholder={`e.g., ${debt.installment_amount * 2}`}
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                      />
                      <Button
                        onClick={handleLogCustomPayment}
                        disabled={!customAmount || parseFloat(customAmount) <= 0 || isSubmitting}
                        className="bg-accent text-accent-foreground hover:bg-accent/90 flex-shrink-0"
                      >
                        Log
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => { setIsDialogOpen(false); setTimeout(() => setShowDeleteConfirm(true), 150); }}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                      <PaymentCalendarDialog debt={debt}>
                        <Button variant="outline" size="icon" className="h-10 w-10">
                          <CalendarDays />
                        </Button>
                      </PaymentCalendarDialog>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleLogPaymentForToday} variant="secondary" disabled={isSubmitting}>
                        +1 Installment
                      </Button>
                      <DialogClose asChild>
                        <Button className="bg-primary">Done</Button>
                      </DialogClose>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2">
         <Progress value={progress} className={cn("h-1.5", isPaidOff ? '[&>*]:bg-green-500' : '')} />
         <div className="flex justify-between items-baseline">
            <span className="text-xs text-muted-foreground">{formatCurrency(amountPaid)} Paid</span>
            <span className="text-xs text-muted-foreground">/ {formatCurrency(debt.total_owed)}</span>
        </div>
      </CardContent>
    </Card>
    </>
  );
}