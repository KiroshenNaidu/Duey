'use client';

import React, { createContext, ReactNode } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { AppData, Debt, HistoryEntry } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface AppContextType extends AppData {
  addDebt: (debt: Omit<Debt, 'id' | 'payment_score'>) => void;
  updateDebt: (debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => void;
  deleteDebt: (debtId: string) => void;
  importData: (data: AppData) => void;
  clearData: () => void;
  incrementPayment: (debtId: string) => void;
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

  const updateDebt = (debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => {
    let oldDebt: Debt | undefined;
    let newDebt: Debt | undefined;
    setDebts(prevDebts => 
      prevDebts.map(debt => {
        if (debt.id === debtId) {
          oldDebt = debt;
          newDebt = { ...debt, ...updatedData };
          return newDebt;
        }
        return debt;
      })
    );

    toast({
      title: 'Debt Updated',
      description: 'Your debt details have been saved.',
    });

    if (oldDebt && newDebt) {
      const oldTotalInstallments = oldDebt.installment_amount > 0 ? Math.ceil(oldDebt.total_owed / oldDebt.installment_amount) : 0;
      const newTotalInstallments = newDebt.installment_amount > 0 ? Math.ceil(newDebt.total_owed / newDebt.installment_amount) : 0;
      const wasPaidOff = oldDebt.payment_score >= oldTotalInstallments && oldDebt.total_owed > 0;
      const isNowPaidOff = newDebt.payment_score >= newTotalInstallments && newDebt.total_owed > 0;

      if (!wasPaidOff && isNowPaidOff) {
           toast({
              title: 'Congratulations!',
              description: `You've fully paid off "${newDebt.title}"!`,
              variant: 'default',
              className: 'bg-green-600 text-white border-green-600'
          });
      }
    }
  };

  const deleteDebt = (debtId: string) => {
    const debtToDelete = debts.find(d => d.id === debtId);
    if (debtToDelete) {
      setDebts(prevDebts => prevDebts.filter(debt => debt.id !== debtId));
      toast({
        title: 'Debt Deleted',
        description: `"${debtToDelete.title}" has been removed.`,
      });
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
    updateDebt,
    deleteDebt,
    importData,
    clearData,
    incrementPayment,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
