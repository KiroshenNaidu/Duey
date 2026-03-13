'use client';

import { useContext } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import type { Debt } from '@/lib/types';

interface DebtCardProps {
  debt: Debt;
}

export function DebtCard({ debt }: DebtCardProps) {
  const { incrementPayment } = useContext(AppDataContext);
  
  const totalInstallments = Math.ceil(debt.total_owed / debt.installment_amount);
  const amountPaid = debt.payment_score * debt.installment_amount;
  const remainingBalance = Math.max(0, debt.total_owed - amountPaid);
  const progress = totalInstallments > 0 ? (debt.payment_score / totalInstallments) * 100 : 0;
  const isPaidOff = progress >= 100;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{debt.title}</CardTitle>
        <CardDescription>
          {debt.payment_score} of {totalInstallments} payments made
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-2xl font-bold text-foreground">{formatCurrency(remainingBalance)}</span>
            <span className="text-sm text-muted-foreground">/ {formatCurrency(debt.total_owed)}</span>
          </div>
          <Progress value={progress} className={isPaidOff ? '[&>*]:bg-green-500' : ''} />
        </div>
      </CardContent>
      <CardFooter className="bg-secondary/50 p-4">
        <Button
          className="w-full h-12 text-lg"
          onClick={() => incrementPayment(debt.id)}
          disabled={isPaidOff}
        >
          {isPaidOff ? 'Paid Off!' : '+1 Payment'}
        </Button>
      </CardFooter>
    </Card>
  );
}
