'use client';

import { useContext, useState, useEffect } from 'react';
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { PaymentCalendarDialog } from './PaymentCalendarDialog';
import { getPaymentCount, getTotalInstallments, getAmountPaid, getProgress, getRemainingBalance } from '@/lib/calculations';

interface DebtCardProps {
  debt: Debt;
}

export function DebtCard({ debt }: DebtCardProps) {
  const { history, updateDebt, deleteDebt, logPaymentForToday, logCustomPayment } = useContext(AppDataContext);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [editedTitle, setEditedTitle] = useState(debt.title);
  const [editedTotalOwed, setEditedTotalOwed] = useState(debt.total_owed.toString());
  const [editedInstallmentAmount, setEditedInstallmentAmount] = useState(debt.installment_amount.toString());
  const [customAmount, setCustomAmount] = useState('');
  
  useEffect(() => {
    setEditedTitle(debt.title);
    setEditedTotalOwed(debt.total_owed.toString());
    setEditedInstallmentAmount(debt.installment_amount.toString());
  }, [debt]);

  const paymentCount = getPaymentCount(debt, history);
  const totalInstallments = getTotalInstallments(debt);
  const amountPaid = getAmountPaid(debt, history);
  const progress = getProgress(debt, history);
  const isPaidOff = progress >= 100;
  const remainingBalance = getRemainingBalance(debt, history);
  const installmentsLeft = Math.max(0, totalInstallments - paymentCount);

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

  const handleLogPaymentForToday = () => {
    logPaymentForToday(debt.id);
  };
  
  const handleLogCustomPayment = () => {
    const amount = parseFloat(customAmount);
    if (!isNaN(amount) && amount > 0) {
      logCustomPayment(debt.id, amount);
      setCustomAmount('');
    }
  };

  return (
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
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 leading-tight">
                    {Math.round(progress)}% COMPLETE • {formatCurrency(amountPaid)} PAID / {formatCurrency(remainingBalance)} LEFT • {installmentsLeft} OF {totalInstallments} LEFT
                  </p>
                  <DialogTitle>Debt Settings: {debt.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor={`title-${debt.id}`} className="text-xs">Title</Label>
                    <Input id={`title-${debt.id}`} value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`total-${debt.id}`} className="text-xs">Total Owed</Label>
                      <Input id={`total-${debt.id}`} type="number" value={editedTotalOwed} onChange={(e) => setEditedTotalOwed(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`installment-${debt.id}`} className="text-xs">Installment</Label>
                      <Input id={`installment-${debt.id}`} type="number" value={editedInstallmentAmount} onChange={(e) => setEditedInstallmentAmount(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-4 mt-2">
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
                        disabled={!customAmount || parseFloat(customAmount) <= 0}
                        className="bg-accent text-accent-foreground hover:bg-accent/90 flex-shrink-0"
                      >
                        Log
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-4 border-t">
                    <div className='flex gap-2'>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" className="h-10 w-10">
                            <Trash2 className="text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the "{debt.title}" debt. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className={cn(buttonVariants({variant: 'destructive'}))}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <PaymentCalendarDialog debt={debt}>
                        <Button variant="outline" size="icon" className="h-10 w-10">
                          <CalendarDays />
                        </Button>
                      </PaymentCalendarDialog>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleLogPaymentForToday} variant="secondary">
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
  );
}
