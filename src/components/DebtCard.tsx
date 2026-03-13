'use client';

import { useContext, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import type { Debt } from '@/lib/types';
import { Pencil, Trash2, Plus, Minus, Check } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface DebtCardProps {
  debt: Debt;
}

export function DebtCard({ debt }: DebtCardProps) {
  const { updateDebt, deleteDebt, incrementPayment } = useContext(AppDataContext);
  const [isEditing, setIsEditing] = useState(false);

  // State for form fields in edit mode
  const [editedTitle, setEditedTitle] = useState(debt.title);
  const [editedTotalOwed, setEditedTotalOwed] = useState(debt.total_owed.toString());
  const [editedInstallmentAmount, setEditedInstallmentAmount] = useState(debt.installment_amount.toString());
  const [editedPaymentScore, setEditedPaymentScore] = useState(debt.payment_score);

  useEffect(() => {
    setEditedTitle(debt.title);
    setEditedTotalOwed(debt.total_owed.toString());
    setEditedInstallmentAmount(debt.installment_amount.toString());
    setEditedPaymentScore(debt.payment_score);
  }, [debt]);

  const totalInstallments = debt.installment_amount > 0 ? Math.ceil(debt.total_owed / debt.installment_amount) : 0;
  const amountPaid = debt.payment_score * debt.installment_amount;
  const progress = totalInstallments > 0 ? (debt.payment_score / totalInstallments) * 100 : debt.total_owed > 0 ? 0 : 100;
  const isPaidOff = progress >= 100 && debt.total_owed > 0;

  const handleUpdate = () => {
    const totalOwedNum = parseFloat(editedTotalOwed) || 0;
    const installmentAmountNum = parseFloat(editedInstallmentAmount) || 1;
    
    updateDebt(debt.id, {
      title: editedTitle,
      total_owed: totalOwedNum,
      installment_amount: installmentAmountNum,
      payment_score: editedPaymentScore,
    });
    setIsEditing(false);
  };
  
  const handleDelete = () => {
    deleteDebt(debt.id);
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      handleUpdate();
    } else {
      setIsEditing(true);
    }
  }

  const editedTotalNum = parseFloat(editedTotalOwed) || 0;
  const editedInstallmentNum = parseFloat(editedInstallmentAmount) || 1;
  const editedTotalInstallments = editedInstallmentNum > 0 ? Math.ceil(editedTotalNum / editedInstallmentNum) : 0;

  return (
    <Card className={cn(
        "overflow-hidden transition-all duration-300",
        isEditing ? "border-accent ring-2 ring-accent" : "border-border"
      )}>
      <CardHeader className="p-4">
        <div className="flex justify-between items-center gap-2">
          <CardTitle className="text-lg font-semibold truncate pr-2">{debt.title}</CardTitle>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {debt.payment_score} of {totalInstallments}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={handleToggleEdit}>
              {isEditing ? <Check className="h-5 w-5" /> : <Pencil className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-0 space-y-2">
         <Progress value={progress} className={cn("h-1.5", isPaidOff ? '[&>*]:bg-green-500' : '')} />
         <div className="flex justify-between items-baseline">
            <span className="text-xs text-muted-foreground">{formatCurrency(amountPaid)} Paid</span>
            <span className="text-xs text-muted-foreground">/ {formatCurrency(debt.total_owed)}</span>
        </div>
      </CardContent>

      <div className={cn(
        "transition-[max-height,padding] duration-500 ease-in-out overflow-hidden",
        isEditing ? "max-h-[500px] p-4 pt-0" : "max-h-0 p-0"
      )}>
        <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
                <Label htmlFor={`title-${debt.id}`}>Title</Label>
                <Input id={`title-${debt.id}`} value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor={`total-${debt.id}`}>Total Owed</Label>
                    <Input id={`total-${debt.id}`} type="number" value={editedTotalOwed} onChange={(e) => setEditedTotalOwed(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor={`installment-${debt.id}`}>Installment</Label>
                    <Input id={`installment-${debt.id}`} type="number" value={editedInstallmentAmount} onChange={(e) => setEditedInstallmentAmount(e.target.value)} />
                </div>
            </div>
            
            <div className="space-y-2">
                <Label>Payment Adjustments</Label>
                <div className="flex items-center justify-center gap-4 p-2 bg-secondary rounded-md">
                    <Button variant="ghost" size="icon" onClick={() => setEditedPaymentScore(s => Math.max(0, s - 1))} disabled={editedPaymentScore <= 0}>
                        <Minus />
                    </Button>
                    <span className="text-xl font-bold tabular-nums w-24 text-center">{editedPaymentScore} / {editedTotalInstallments || 0}</span>
                    <Button variant="ghost" size="icon" onClick={() => setEditedPaymentScore(s => Math.min(editedTotalInstallments, s + 1))} disabled={editedPaymentScore >= editedTotalInstallments}>
                        <Plus />
                    </Button>
                </div>
            </div>
            <div className="flex justify-between items-center pt-4 border-t">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline" size="icon">
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
                 <Button onClick={() => incrementPayment(debt.id)} disabled={isPaidOff}>
                    +1 Payment
                 </Button>
            </div>
        </div>
      </div>
    </Card>
  );
}
