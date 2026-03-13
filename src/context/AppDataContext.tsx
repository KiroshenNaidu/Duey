'use client';

import React, { createContext, ReactNode, useState } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { AppData, Debt, HistoryEntry } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface AppContextType extends AppData {
  addDebt: (debt: Omit<Debt, 'id' | 'payment_score'>) => void;
  incrementPayment: (debtId: string) => void;
  importData: (data: AppData) => void;
  clearData: () => void;
}

const defaultState: AppData = {
  debts: [],
  history: [],
};

export const AppDataContext = createContext<AppContextType>({
  ...defaultState,
  addDebt: () => {},
  incrementPayment: () => {},
  importData: () => {},
  clearData: () => {},
});

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [debts, setDebts] = useLocalStorage<Debt[]>('debts', defaultState.debts);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>('history', defaultState.history);
  const { toast } = useToast();

  const addDebt = (debtData: Omit<Debt, 'id' | 'payment_score'>) => {
    const newDebt: Debt = {
      ...debtData,
      id: new Date().toISOString(),
      payment_score: 0,
    };
    setDebts((prev) => [...prev, newDebt]);
    toast({
      title: 'Debt Added',
      description: `"${newDebt.title}" has been added to your list.`,
    });
  };

  const incrementPayment = (debtId: string) => {
    let updatedDebt: Debt | undefined;
    setDebts((prevDebts) =>
      prevDebts.map((debt) => {
        if (debt.id === debtId) {
          const totalInstallments = Math.ceil(debt.total_owed / debt.installment_amount);
          if (debt.payment_score < totalInstallments) {
            updatedDebt = { ...debt, payment_score: debt.payment_score + 1 };
            return updatedDebt;
          }
        }
        return debt;
      })
    );

    if (updatedDebt) {
      const newHistoryEntry: HistoryEntry = {
        id: new Date().toISOString(),
        debtId: updatedDebt.id,
        debtTitle: updatedDebt.title,
        date: new Date().toISOString(),
        amount: updatedDebt.installment_amount,
      };
      setHistory((prev) => [newHistoryEntry, ...prev]);

      const totalInstallments = Math.ceil(updatedDebt.total_owed / updatedDebt.installment_amount);
      if(updatedDebt.payment_score === totalInstallments) {
        toast({
          title: 'Congratulations!',
          description: `You've fully paid off "${updatedDebt.title}"!`,
          variant: 'default',
          className: 'bg-green-600 text-white border-green-600'
        });
      }
    }
  };
  
  const importData = (data: AppData) => {
    if (data.debts && data.history) {
      setDebts(data.debts);
      setHistory(data.history);
      toast({
        title: 'Success',
        description: 'Your data has been imported.',
      });
    } else {
      toast({
        title: 'Error',
        description: 'Invalid data format in the backup file.',
        variant: 'destructive',
      });
    }
  };

  const clearData = () => {
    setDebts([]);
    setHistory([]);
     toast({
        title: 'Data Cleared',
        description: 'All your data has been removed.',
      });
  }

  const value = {
    debts,
    history,
    addDebt,
    incrementPayment,
    importData,
    clearData,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
