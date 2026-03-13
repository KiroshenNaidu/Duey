'use client';

import React, { createContext, ReactNode, useEffect } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { AppData, Debt, HistoryEntry } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { isSameDay } from 'date-fns';
import { Toaster } from '@/components/ui/toaster';

interface AppContextType extends AppData {
  addDebt: (debt: Omit<Debt, 'id' | 'payment_score' | 'paymentDates'>) => void;
  updateDebt: (debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => void;
  deleteDebt: (debtId: string) => void;
  importData: (data: AppData) => void;
  clearData: () => void;
  incrementPayment: (debtId: string) => void;
  logTransportPayment: (amount: number, month: string) => void;
  togglePaymentDate: (debtId: string, date: Date) => void;
}

const defaultState: AppData = {
  debts: [],
  history: [],
};

export const AppDataContext = createContext<AppContextType>({
  ...defaultState,
  addDebt: () => {},
  updateDebt: () => {},
  deleteDebt: () => {},
  importData: () => {},
  clearData: () => {},
  incrementPayment: () => {},
  logTransportPayment: () => {},
  togglePaymentDate: () => {},
});

type ToastAction = () => void;
const toastQueue: { action: ToastAction; id: string }[] = [];
let isProcessingToast = false;

function processToastQueue() {
  if (isProcessingToast || toastQueue.length === 0) return;
  isProcessingToast = true;
  const toastItem = toastQueue.shift();
  if (toastItem) {
    toastItem.action();
  }
  // Allow the next toast to be processed after a short delay
  setTimeout(() => {
    isProcessingToast = false;
    processToastQueue();
  }, 300);
}

function queueToast(action: ToastAction) {
  toastQueue.push({ action, id: Math.random().toString() });
  processToastQueue();
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [debts, setDebts] = useLocalStorage<Debt[]>('debts', defaultState.debts);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>('history', defaultState.history);
  const { toast } = useToast();

  const addDebt = (debtData: Omit<Debt, 'id' | 'payment_score' | 'paymentDates'>) => {
    const newDebt: Debt = {
      ...debtData,
      id: new Date().toISOString(),
      payment_score: 0,
      paymentDates: [],
    };
    setDebts((prev) => [...prev, newDebt]);

    const newHistoryEntry: HistoryEntry = {
      id: `${newDebt.id}-created`,
      debtId: newDebt.id,
      debtTitle: newDebt.title,
      date: new Date().toISOString(),
      amount: newDebt.total_owed,
      type: 'creation',
    };
    setHistory((prev) => [newHistoryEntry, ...prev]);

    queueToast(() => toast({
      title: 'Debt Added',
      description: `"${newDebt.title}" has been added to your list.`,
    }));
  };

  const incrementPayment = (debtId: string) => {
    const today = new Date();
    const debtToUpdate = debts.find((d) => d.id === debtId);

    if (!debtToUpdate) return;

    const paymentDates = debtToUpdate.paymentDates || [];
    const dateAlreadyLogged = paymentDates.some((d) => isSameDay(new Date(d), today));

    if (dateAlreadyLogged) {
       queueToast(() => toast({
        variant: 'destructive',
        title: 'Already Logged',
        description: 'A payment for today has already been recorded for this debt.',
      }));
      return;
    }

    const totalInstallments =
      debtToUpdate.installment_amount > 0
        ? Math.ceil(debtToUpdate.total_owed / debtToUpdate.installment_amount)
        : 0;
    if (debtToUpdate.payment_score >= totalInstallments && debtToUpdate.total_owed > 0) {
      return;
    }

    const newPaymentDates = [...paymentDates, today.toISOString()];
    const updatedDebt: Debt = {
      ...debtToUpdate,
      paymentDates: newPaymentDates,
      payment_score: newPaymentDates.length,
    };

    setDebts((prevDebts) =>
      prevDebts.map((debt) => (debt.id === debtId ? updatedDebt : debt))
    );

    const newHistoryEntry: HistoryEntry = {
      id: new Date().toISOString(),
      debtId: updatedDebt.id,
      debtTitle: updatedDebt.title,
      date: new Date().toISOString(),
      amount: updatedDebt.installment_amount,
      type: 'payment',
    };
    setHistory((prev) => [newHistoryEntry, ...prev]);

    const newTotalInstallments =
      updatedDebt.installment_amount > 0
        ? Math.ceil(updatedDebt.total_owed / updatedDebt.installment_amount)
        : 0;
    if (updatedDebt.payment_score === newTotalInstallments && updatedDebt.total_owed > 0) {
      queueToast(() => toast({
        title: 'Congratulations!',
        description: `You've fully paid off "${updatedDebt.title}"!`,
        variant: 'default',
        className: 'bg-green-600 text-white border-green-600',
      }));
    }
  };

  const togglePaymentDate = (debtId: string, date: Date) => {
    setDebts(prevDebts => prevDebts.map(debt => {
      if (debt.id === debtId) {
        const paymentDates = debt.paymentDates || [];
        const dateString = date.toISOString();
        
        let newPaymentDates: string[];
        const existingIndex = paymentDates.findIndex(d => isSameDay(new Date(d), date));

        if (existingIndex > -1) {
          newPaymentDates = paymentDates.filter((_, index) => index !== existingIndex);
        } else {
          newPaymentDates = [...paymentDates, dateString];
        }

        newPaymentDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        return {
          ...debt,
          paymentDates: newPaymentDates,
          payment_score: newPaymentDates.length,
        };
      }
      return debt;
    }));
  };

  const updateDebt = (debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => {
    const oldDebt = debts.find((d) => d.id === debtId);
    if (!oldDebt) return;

    const payment_score = (oldDebt.paymentDates || []).length;
    const newDebt: Debt = { ...oldDebt, ...updatedData, payment_score };

    setDebts((prevDebts) =>
      prevDebts.map((debt) => (debt.id === debtId ? newDebt : debt))
    );

    queueToast(() => toast({
      title: 'Debt Updated',
      description: 'Your debt details have been saved.',
    }));

    const oldTotalInstallments = oldDebt.installment_amount > 0 ? Math.ceil(oldDebt.total_owed / oldDebt.installment_amount) : 0;
    const newTotalInstallments = newDebt.installment_amount > 0 ? Math.ceil(newDebt.total_owed / newDebt.installment_amount) : 0;
    const wasPaidOff = oldDebt.payment_score >= oldTotalInstallments && oldDebt.total_owed > 0;
    const isNowPaidOff = newDebt.payment_score >= newTotalInstallments && newDebt.total_owed > 0;

    if (!wasPaidOff && isNowPaidOff) {
      queueToast(() => toast({
        title: 'Congratulations!',
        description: `You've fully paid off "${newDebt.title}"!`,
        variant: 'default',
        className: 'bg-green-600 text-white border-green-600'
      }));
    }
  };

  const deleteDebt = (debtId: string) => {
    const debtToDelete = debts.find(d => d.id === debtId);
    if (debtToDelete) {
      setDebts(prevDebts => prevDebts.filter(debt => debt.id !== debtId));
      queueToast(() => toast({
        title: 'Debt Deleted',
        description: `"${debtToDelete.title}" has been removed.`,
      }));
    }
  };
  
  const importData = (data: AppData) => {
    if (data.debts && data.history) {
      setDebts(data.debts);
      setHistory(data.history);
      queueToast(() => toast({
        title: 'Success',
        description: 'Your data has been imported.',
      }));
    } else {
      queueToast(() => toast({
        title: 'Error',
        description: 'Invalid data format in the backup file.',
        variant: 'destructive',
      }));
    }
  };

  const clearData = () => {
    window.localStorage.removeItem('debts');
    window.localStorage.removeItem('history');
    window.localStorage.removeItem('transportSettings');
    window.localStorage.removeItem('transportOverrides');
    window.localStorage.removeItem('themeSettings');

    queueToast(() => toast({
      title: 'Data Cleared',
      description: 'All app data has been removed. The app will now reload.',
    }));
    
    setTimeout(() => {
        window.location.reload();
    }, 1500);
  };

  const logTransportPayment = (amount: number, month: string) => {
    const newHistoryEntry: HistoryEntry = {
      id: new Date().toISOString(),
      debtTitle: `Transport: ${month}`,
      date: new Date().toISOString(),
      amount: amount,
      type: 'transport',
    };
    setHistory((prev) => [newHistoryEntry, ...prev]);
    queueToast(() => toast({
      title: 'Payment Logged',
      description: `Transport payment for ${month} has been recorded.`,
    }));
  };

  const value = {
    debts,
    history,
    addDebt,
    updateDebt,
    deleteDebt,
    importData,
    clearData,
    incrementPayment,
    logTransportPayment,
    togglePaymentDate,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
      <Toaster />
    </AppDataContext.Provider>
  );
}
