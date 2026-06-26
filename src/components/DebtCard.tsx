'use client';

import { useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { DebtSemiGauge } from '@/components/DebtSemiGauge';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn, hslToHex } from '@/lib/utils';
import type { Debt } from '@/lib/types';
import { Pencil, Trash2, CalendarDays, CheckCircle2, XCircle, X, Archive } from 'lucide-react';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PaymentCalendarDialog } from './PaymentCalendarDialog';
import { DebtCompletionDialog } from './DebtCompletionDialog';
import { getPaymentCount, getTotalInstallments, getAmountPaid } from '@/lib/calculations';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';

interface DebtCardProps {
  debt: Debt;
}

interface PendingPayment {
  type: 'installment' | 'custom';
  amount: number;
}

interface ToastState {
  message: string;
  variant: 'success' | 'error';
}

// Radix dialogs run a ~200ms exit animation; removing the card in the same tick leaves
// the body pointer-events lock stuck. Both completeDebt call sites use this delay.
const DIALOG_CLOSE_DELAY_MS = 220;

// canvas-confetti only understands hex colours (strips every non-hex char, which
// silently mangled the old HSL strings), so everything is converted to hex via hslToHex.
function getConfettiColors(): string[] {
  const fallback = ['#7ee04f', '#a8e85f', '#4fd97a', '#b6f08a', '#8ce0a0', '#cdf2a8'];
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const [h, s, l] = raw.split(/\s+/).map((v) => parseFloat(v));
  if ([h, s, l].some((v) => Number.isNaN(v))) return fallback;

  const wrap = (v: number) => ((v % 360) + 360) % 360;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return [
    hslToHex(h, s, l),                                    // accent
    hslToHex(wrap(h - 30), s, l),                         // analogous, cooler
    hslToHex(wrap(h + 30), clamp(s - 12), clamp(l - 7)),  // analogous, deeper
    hslToHex(wrap(h - 15), clamp(s - 7), clamp(l + 9)),   // light tint
    hslToHex(wrap(h + 15), clamp(s - 17), clamp(l + 6)),  // soft tint
    hslToHex(h, clamp(s + 3), clamp(l + 21)),             // pale tint for sparkle
  ];
}

export function DebtCard({ debt }: DebtCardProps) {
  const router = useRouter();
  const { history, updateDebt, deleteDebt, completeDebt, logCustomPayment } = useContext(AppDataContext);

  // Edit dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState(debt.title);
  const [editedTotalOwed, setEditedTotalOwed] = useState(debt.total_owed.toString());
  const [editedInstallmentAmount, setEditedInstallmentAmount] = useState(debt.installment_amount.toString());

  // Payment dialog (nested inside edit dialog)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'installment' | 'custom'>('installment');
  const [customAmount, setCustomAmount] = useState('');
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);

  // Save confirmation (nested inside edit dialog)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // Outside-edit-dialog state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Sync edit fields when debt prop changes while dialog is closed
  useEffect(() => {
    if (!isDialogOpen) {
      setEditedTitle(debt.title);
      setEditedTotalOwed(debt.total_owed.toString());
      setEditedInstallmentAmount(debt.installment_amount.toString());
    }
  }, [debt, isDialogOpen]);

  const { paymentCount, totalInstallments, amountPaid, progress, isPaidOff } = useMemo(() => {
    const amountPaid = getAmountPaid(debt, history);
    const paymentCount = getPaymentCount(debt, history);
    const totalInstallments = getTotalInstallments(debt);
    const progress = debt.total_owed <= 0
      ? (amountPaid > 0 ? 100 : 0)
      : Math.min(100, (amountPaid / debt.total_owed) * 100);
    return { paymentCount, totalInstallments, amountPaid, progress, isPaidOff: progress >= 100 };
  }, [debt, history]);

  // Bar fills from 0 → progress. Replays every time the Money page (route '/') becomes
  // active — swipe or tab — not just on first mount, since the carousel keeps all pages
  // permanently mounted. Mirrors the BudgetGauge load fill.
  const barReady = useReplayOnActive('/');

  const prevIsPaidOff = useRef(isPaidOff);
  useEffect(() => {
    if (isPaidOff && !prevIsPaidOff.current) {
      setShowCelebration(true);
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 140, spread: 85, origin: { y: 0.55 }, colors: getConfettiColors() });
      });
    }
    prevIsPaidOff.current = isPaidOff;
  }, [isPaidOff]);

  const showToast = useCallback((message: string, variant: 'success' | 'error' = 'success') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const resetEditState = useCallback(() => {
    setEditedTitle(debt.title);
    setEditedTotalOwed(debt.total_owed.toString());
    setEditedInstallmentAmount(debt.installment_amount.toString());
    setPendingPayment(null);
    setCustomAmount('');
    setPaymentMode('installment');
  }, [debt]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) resetEditState();
    setIsDialogOpen(open);
  }, [resetEditState]);

  const handleDelete = useCallback(() => {
    deleteDebt(debt.id);
    setIsDialogOpen(false);
  }, [debt.id, deleteDebt]);

  // Pending changes — computed from current edit state vs saved debt
  const pendingChanges = useMemo(() => {
    const changes: { field: string; from: string; to: string }[] = [];
    const totalOwedNum = parseFloat(editedTotalOwed) || 0;
    const installmentAmountNum = parseFloat(editedInstallmentAmount) || 1;

    if (editedTitle.trim() !== debt.title)
      changes.push({ field: 'Title', from: debt.title, to: editedTitle.trim() });
    if (totalOwedNum !== debt.total_owed)
      changes.push({ field: 'Total Owed', from: formatCurrency(debt.total_owed), to: formatCurrency(totalOwedNum) });
    if (installmentAmountNum !== debt.installment_amount)
      changes.push({ field: 'Installment', from: formatCurrency(debt.installment_amount), to: formatCurrency(installmentAmountNum) });

    return changes;
  }, [editedTitle, editedTotalOwed, editedInstallmentAmount, debt]);

  const hasChanges = pendingChanges.length > 0 || pendingPayment !== null;

  const handleConfirmSave = useCallback(() => {
    try {
      const totalOwedNum = parseFloat(editedTotalOwed) || 0;
      const installmentAmountNum = parseFloat(editedInstallmentAmount) || 1;

      if (pendingChanges.length > 0) {
        updateDebt(debt.id, {
          title: editedTitle.trim(),
          total_owed: totalOwedNum,
          installment_amount: installmentAmountNum,
        });
      }

      if (pendingPayment) {
        logCustomPayment(debt.id, effectivePendingAmount);
      }

      setShowSaveConfirm(false);
      // Delay parent Dialog close until the nested AlertDialog finishes its exit animation.
      // Closing both in the same tick leaves Radix's backdrop overlay stuck on screen,
      // making the entire page unclickable until a hard refresh.
      setTimeout(() => {
        setIsDialogOpen(false);
        showToast('Changes saved successfully');
      }, 100);
    } catch {
      setShowSaveConfirm(false);
      showToast('Failed to save — please try again', 'error');
    }
  }, [editedTitle, editedTotalOwed, editedInstallmentAmount, pendingChanges, pendingPayment, debt.id, updateDebt, logCustomPayment, showToast]);

  const openPaymentDialog = useCallback(() => {
    // Pre-fill from existing staged payment so user sees they're replacing, not adding
    if (pendingPayment) {
      setPaymentMode(pendingPayment.type);
      setCustomAmount(pendingPayment.type === 'custom' ? pendingPayment.amount.toString() : '');
    }
    setShowPaymentDialog(true);
  }, [pendingPayment]);

  const handleConfirmPayment = useCallback(() => {
    const amount = paymentMode === 'installment'
      ? (parseFloat(editedInstallmentAmount) || debt.installment_amount)
      : parseFloat(customAmount);
    if (!amount || amount <= 0) return;

    setPendingPayment({ type: paymentMode, amount });
    setShowPaymentDialog(false);
    setCustomAmount('');
    setPaymentMode('installment');
  }, [paymentMode, editedInstallmentAmount, debt.installment_amount, customAmount]);

  const paymentDialogAmountValid = paymentMode === 'installment'
    ? true
    : (parseFloat(customAmount) > 0);

  const liveInstallmentAmount = parseFloat(editedInstallmentAmount) || debt.installment_amount;

  // If payment type is 'installment', always mirror the live installment field value
  // so changing the Installment input instantly updates the staged badge and gauge ghost.
  const effectivePendingAmount = pendingPayment
    ? pendingPayment.type === 'installment' ? liveInstallmentAmount : pendingPayment.amount
    : 0;

  // How many extra percentage points the staged payment would add (capped at 100%)
  const pendingProgressPct = debt.total_owed > 0 && effectivePendingAmount > 0
    ? Math.min(100 - progress, (effectivePendingAmount / debt.total_owed) * 100)
    : 0;

  return (
    <>
      {/* Toast notification */}
      {toast && (
        <div className={cn(
          "fixed top-20 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-semibold animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none border",
          toast.variant === 'success'
            ? "bg-card border-accent/30 text-foreground"
            : "bg-card border-destructive/40 text-destructive"
        )}>
          {toast.variant === 'success'
            ? <CheckCircle2 className="h-4 w-4 text-positive flex-shrink-0" />
            : <XCircle className="h-4 w-4 flex-shrink-0" />
          }
          {toast.message}
        </div>
      )}

      <DebtCompletionDialog
        open={showCelebration}
        onOpenChange={setShowCelebration}
        debtTitle={debt.title}
        totalOwed={debt.total_owed}
        amountPaid={amountPaid}
        paymentCount={paymentCount}
        onComplete={() => {
          setShowCelebration(false);
          // Defer removal until the dialog finishes its ~200ms exit. completeDebt removes
          // this debt, which unmounts the card (and this dialog with it). Doing that in the
          // same tick as the close leaves Radix's body pointer-events lock stuck — the page
          // freezes and the archive appears to "do nothing". Same race as handleConfirmSave.
          setTimeout(() => completeDebt(debt.id), DIALOG_CLOSE_DELAY_MS);
        }}
        onKeepTracking={() => setShowCelebration(false)}
      />

      {/* Delete confirmation — opened after edit dialog closes */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-[2rem]">
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
          <AlertDialogFooter className="flex-row justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className={cn(buttonVariants({ variant: 'destructive' }))}>
              Delete Debt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirmation */}
      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive &quot;{debt.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This moves the debt to your history as completed. Your payment records will remain visible in the History tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              // Defer for the same reason as the celebration dialog: let this AlertDialog
              // finish closing before completeDebt unmounts the card, or the page freezes.
              onClick={() => { setTimeout(() => completeDebt(debt.id), DIALOG_CLOSE_DELAY_MS); }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Card */}
      <Card className="overflow-hidden transition-all duration-300">
        <CardHeader>
          <div className="flex justify-between items-center gap-2">
            <CardTitle
              className="text-base font-bold truncate pr-2"
              style={isPaidOff ? { color: 'hsl(var(--primary-complete))' } : undefined}
            >{debt.title}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {paymentCount} of {totalInstallments} ({Math.round(progress)}%)
              </span>

              {/* Edit dialog */}
              <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
                <button
                  onClick={() => setIsDialogOpen(true)}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), "h-8 w-8 flex-shrink-0")}
                >
                  <Pencil className="h-4 w-4" />
                </button>

                <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden">
                  <DialogHeader className="sr-only">
                    <DialogTitle>{debt.title}</DialogTitle>
                  </DialogHeader>

                  {/*
                    Nested dialogs live inside this DialogContent so Radix UI treats them
                    as children of this dialog — preventing it from closing when they open.
                  */}

                  {/* Make Payment — nested dialog, standard layout for keyboard handling */}
                  <Dialog
                    open={showPaymentDialog}
                    onOpenChange={(open) => {
                      if (!open) { setCustomAmount(''); setPaymentMode('installment'); }
                      setShowPaymentDialog(open);
                    }}
                  >
                    <DialogContent className="sm:max-w-[360px]">
                      <DialogHeader>
                        <DialogTitle>Make Payment</DialogTitle>
                        <DialogDescription>
                          {pendingPayment
                            ? 'Replace your staged payment — only one will be logged on save.'
                            : 'Choose how much to log. One payment will be recorded on save.'}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={() => setPaymentMode('installment')}
                          className={cn(
                            "w-full rounded-xl border p-4 text-left transition-colors duration-150",
                            paymentMode === 'installment'
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-border/80 hover:bg-muted/40"
                          )}
                        >
                          <p className="text-sm font-semibold text-foreground">Standard Installment</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatCurrency(liveInstallmentAmount)} per payment
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMode('custom')}
                          className={cn(
                            "w-full rounded-xl border p-4 text-left transition-colors duration-150",
                            paymentMode === 'custom'
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-border/80 hover:bg-muted/40"
                          )}
                        >
                          <p className="text-sm font-semibold text-foreground">Custom Amount</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Enter a specific payment amount</p>
                        </button>

                        {paymentMode === 'custom' && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Payment Amount</Label>
                            <Input
                              type="number"
                              placeholder={`e.g., ${liveInstallmentAmount * 2}`}
                              value={customAmount}
                              onChange={(e) => setCustomAmount(e.target.value)}
                              autoFocus
                            />
                          </div>
                        )}
                      </div>

                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
                        <Button
                          onClick={handleConfirmPayment}
                          disabled={!paymentDialogAmountValid}
                          className="bg-accent text-btn-on-accent hover:bg-accent/90"
                        >
                          Done
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Save confirmation — nested alert dialog */}
                  <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
                    <AlertDialogContent className="rounded-[2rem]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Changes</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3 text-sm text-muted-foreground">
                            {pendingPayment ? (() => {
                              const newTotalOwed = parseFloat(editedTotalOwed) || debt.total_owed;
                              const newAmountPaid = amountPaid + effectivePendingAmount;
                              const newProgress = newTotalOwed <= 0 ? 100 : Math.min(100, (newAmountPaid / newTotalOwed) * 100);
                              return (
                                <div className="space-y-3">
                                  {/* Payment amount */}
                                  <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-muted/50 px-3 py-2.5">
                                    <span className="text-xs text-muted-foreground">
                                      {pendingPayment.type === 'installment' ? 'Standard installment' : 'Custom payment'}
                                    </span>
                                    <span className="text-sm font-bold text-accent">
                                      +{formatCurrency(effectivePendingAmount)}
                                    </span>
                                  </div>

                                  {/* Before / After */}
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2.5 space-y-1">
                                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Before</p>
                                      <p className="font-semibold text-foreground">{formatCurrency(amountPaid)}</p>
                                      <p className="text-muted-foreground">{Math.round(progress)}% paid</p>
                                      {newTotalOwed > amountPaid && (
                                        <p className="text-muted-foreground/60">{formatCurrency(newTotalOwed - amountPaid)} left</p>
                                      )}
                                    </div>
                                    <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 space-y-1">
                                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">After</p>
                                      <p className="font-semibold text-accent">{formatCurrency(newAmountPaid)}</p>
                                      <p className="text-muted-foreground">{Math.round(newProgress)}% paid</p>
                                      {newTotalOwed > newAmountPaid && (
                                        <p className="text-muted-foreground/60">{formatCurrency(newTotalOwed - newAmountPaid)} left</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Overpayment callout */}
                                  {newAmountPaid > newTotalOwed && (
                                    <div className="flex items-center justify-between rounded-lg border border-completion/25 bg-completion/[0.08] px-3 py-2 text-xs">
                                      <span className="text-muted-foreground">Over by</span>
                                      <span className="font-semibold text-completion">{formatCurrency(newAmountPaid - newTotalOwed)}</span>
                                    </div>
                                  )}

                                  {/* Note other structural changes briefly */}
                                  {pendingChanges.length > 0 && (
                                    <p className="text-xs text-muted-foreground border-t border-border/40 pt-2">
                                      {pendingChanges.map(c => c.field).join(', ')} {pendingChanges.length === 1 ? 'setting' : 'settings'} also updated
                                    </p>
                                  )}
                                </div>
                              );
                            })() : (
                              // No payment — only structural changes
                              <div className="space-y-2">
                                {pendingChanges.map(c => (
                                  <div
                                    key={c.field}
                                    className="bg-muted/50 rounded-lg px-3 py-2 border border-border/50 flex items-center justify-between gap-3 text-xs"
                                  >
                                    <span className="text-muted-foreground">{c.field}</span>
                                    <span className="flex items-center gap-1.5">
                                      <span className="line-through opacity-60">{c.from}</span>
                                      <span className="text-accent font-semibold">→ {c.to}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-row justify-end">
                        <AlertDialogCancel>Back</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleConfirmSave}
                        >
                          Save Changes
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {/* Hero progress header */}
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-center gap-4">
                      <DebtSemiGauge progress={progress} pendingProgress={pendingProgressPct} paidOff={isPaidOff} />
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold text-foreground leading-tight break-words">{debt.title}</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {paymentCount} of {totalInstallments} installments
                        </p>
                        <div className="mt-3 space-y-0.5">
                          <p
                            className="text-sm font-semibold text-primary"
                            style={isPaidOff ? { color: 'hsl(var(--primary-complete))' } : undefined}
                          >{formatCurrency(amountPaid)} paid</p>
                          <p className="text-xs text-muted-foreground">of {formatCurrency(debt.total_owed)}</p>
                          {!isPaidOff && debt.total_owed > amountPaid && (
                            <p className="text-xs text-muted-foreground/70">
                              {formatCurrency(debt.total_owed - amountPaid)} remaining
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Staged payment badge */}
                    {pendingPayment && (
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-accent/30 bg-accent/10 px-3 py-2">
                        <div>
                          <p className="text-xs font-semibold text-accent">
                            Payment staged: +{formatCurrency(effectivePendingAmount)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pendingPayment.type === 'installment' ? 'Standard installment' : 'Custom payment'} · will log on save
                          </p>
                        </div>
                        <button
                          onClick={() => setPendingPayment(null)}
                          className="text-muted-foreground hover:text-foreground transition-colors ml-2"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Form & actions */}
                  <div className="px-5 pb-5 space-y-4 border-t pt-4">
                    <div className="space-y-2">
                      <Label htmlFor={`title-${debt.id}`} className="text-xs">Title</Label>
                      <Input
                        id={`title-${debt.id}`}
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`total-${debt.id}`} className="text-xs">Total Owed</Label>
                        <Input
                          id={`total-${debt.id}`}
                          type="number"
                          value={editedTotalOwed}
                          onChange={(e) => setEditedTotalOwed(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`installment-${debt.id}`} className="text-xs">Installment</Label>
                        <Input
                          id={`installment-${debt.id}`}
                          type="number"
                          value={editedInstallmentAmount}
                          onChange={(e) => setEditedInstallmentAmount(e.target.value)}
                        />
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
                        {isPaidOff ? (
                          <Button
                            variant="secondary"
                            onClick={() => { setIsDialogOpen(false); setTimeout(() => setShowArchiveConfirm(true), 150); }}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button variant="secondary" onClick={openPaymentDialog}>
                            Make Payment
                          </Button>
                        )}
                        <Button
                          className="bg-primary"
                          onClick={() => {
                            if (hasChanges) {
                              setShowSaveConfirm(true);
                            } else {
                              setIsDialogOpen(false);
                            }
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {/* Custom progress bar — includes ghost segment for staged payment preview */}
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            {/* Ghost: extends to where the staged payment would reach */}
            {pendingProgressPct > 0 && (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
                style={{
                  width: `${Math.min(100, progress + pendingProgressPct)}%`,
                  opacity: 0.38,
                  ...(isPaidOff && { backgroundColor: 'hsl(var(--primary-complete))' }),
                }}
              />
            )}
            {/* Solid: real current progress — flowing gradient between --primary and
                --primary-complete so it stays in-theme and updates on theme change. */}
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full bar-animated', barReady && 'transition-[width] duration-700', isPaidOff && 'bar-glow')}
              style={{
                width: `${barReady ? progress : 0}%`,
                background: isPaidOff
                  ? 'repeating-linear-gradient(to right, hsl(var(--primary-b)) 0%, hsl(var(--primary-complete)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary-complete)) 75%, hsl(var(--primary-b)) 100%)'
                  : 'repeating-linear-gradient(to right, hsl(var(--primary-a)) 0%, hsl(var(--primary)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary)) 75%, hsl(var(--primary-a)) 100%)',
              }}
            />
          </div>
          <div className="flex justify-between items-baseline">
            <span
              className="text-xs font-medium text-muted-foreground"
              style={isPaidOff ? { color: 'hsl(var(--primary-complete))' } : undefined}
            >{formatCurrency(amountPaid)} Paid</span>
            <span className="text-xs text-muted-foreground">/ {formatCurrency(debt.total_owed)}</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
