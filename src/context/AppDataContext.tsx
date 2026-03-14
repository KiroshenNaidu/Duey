'use client';

import React, { createContext, ReactNode, useEffect, useState, useMemo } from 'react';
import type { AppState, Debt, HistoryEntry, AppData, ThemeSettings, TransportSettings, TransportOverrides, UserTheme } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { isSameDay, startOfDay } from 'date-fns';
import { Toaster } from '@/components/ui/toaster';
import { getPaymentCount, getTotalInstallments } from '@/lib/calculations';
import { idbClear } from '@/lib/utils';

const CURRENT_SCHEMA_VERSION = 2;

const defaultState: AppState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  debts: [],
  history: [],
  transportSettings: { driverName: '', dailyFee: 0 },
  transportOverrides: {},
  themeSettings: {
    background: '220 14% 10%',
    surface: '220 14% 12%',
    primary: '225 50% 50%',
    accent: '188 78% 57%',
    font: 'Inter',
  },
  userThemes: [],
  notepadContent: '',
};

interface AppContextType extends AppState {
  addDebt: (debt: Omit<Debt, 'id' | 'paymentDates'>) => void;
  updateDebt: (debtId: string, updatedData: Partial<Omit<Debt, 'id' | 'paymentDates'>>) => void;
  deleteDebt: (debtId: string) => void;
  togglePaymentDate: (debtId: string, date: Date) => void;
  logPaymentForToday: (debtId: string) => void;
  setTransportSettings: (settings: TransportSettings) => void;
  setTransportOverrides: (overrides: TransportOverrides) => void;
  logTransportPayment: (amount: number, month: string) => void;
  setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage'>) => void;
  setNotepadContent: (content: string) => void;
  addUserTheme: (name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>) => void;
  deleteUserTheme: (themeId: string) => void;
  importData: (data: AppData) => void;
  clearData: () => void;
  getAppState: () => AppState;
}

export const AppDataContext = createContext<AppContextType>({
  ...defaultState,
  addDebt: () => {},
  updateDebt: () => {},
  deleteDebt: () => {},
  togglePaymentDate: () => {},
  logPaymentForToday: () => {},
  setTransportSettings: () => {},
  setTransportOverrides: () => {},
  logTransportPayment: () => {},
  setThemeSettings: () => {},
  setNotepadContent: () => {},
  addUserTheme: () => {},
  deleteUserTheme: () => {},
  importData: () => {},
  clearData: () => {},
  getAppState: () => defaultState,
});

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedStateRaw = localStorage.getItem('appState');
      let stateToLoad: AppState = defaultState;

      if (storedStateRaw) {
        const parsedData = JSON.parse(storedStateRaw);
        
        if (!parsedData.schemaVersion || parsedData.schemaVersion < CURRENT_SCHEMA_VERSION) {
           console.log(`Migrating data from v${parsedData.schemaVersion || 1} to v${CURRENT_SCHEMA_VERSION}...`);
           if (parsedData.schemaVersion === undefined) { // Migrating from legacy separate keys
             const oldDebts = JSON.parse(localStorage.getItem('debts') || '[]');
             const oldHistory = JSON.parse(localStorage.getItem('history') || '[]');
             const oldTransportSettings = JSON.parse(localStorage.getItem('transportSettings') || '{}');
             const oldTransportOverrides = JSON.parse(localStorage.getItem('transportOverrides') || '{}');
             const oldThemeSettings = JSON.parse(localStorage.getItem('themeSettings') || '{}');
             const oldNotepadContent = localStorage.getItem('quick-note') || '';

             const migratedDebts = oldDebts.map((d: any) => {
                const { payment_score, ...rest } = d;
                if (!d.paymentDates && payment_score > 0) {
                  // Cannot reconstruct dates from score, so paymentDates will be empty.
                }
                return rest;
             });

             stateToLoad = {
                 ...defaultState,
                 debts: migratedDebts,
                 history: oldHistory,
                 transportSettings: oldTransportSettings.driverName !== undefined ? oldTransportSettings : defaultState.transportSettings,
                 transportOverrides: Object.keys(oldTransportOverrides).length > 0 ? oldTransportOverrides : defaultState.transportOverrides,
                 themeSettings: oldThemeSettings.primary !== undefined ? oldThemeSettings : defaultState.themeSettings,
                 userThemes: [],
                 notepadContent: oldNotepadContent || defaultState.notepadContent,
             };
           }
           stateToLoad.schemaVersion = CURRENT_SCHEMA_VERSION;
        } else {
            stateToLoad = { ...defaultState, ...parsedData };
        }
      }
      setAppState(stateToLoad);
    } catch (error) {
      console.error('Failed to load or parse app state:', error);
      setAppState(defaultState);
    } finally {
        setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('appState', JSON.stringify(appState));
    }
  }, [appState, isLoaded]);

  const addDebt = (debtData: Omit<Debt, 'id' | 'paymentDates'>) => {
    const newDebt: Debt = { ...debtData, id: new Date().toISOString(), paymentDates: [] };
    const newHistoryEntry: HistoryEntry = {
      id: `${newDebt.id}-created`,
      debtId: newDebt.id,
      debtTitle: newDebt.title,
      date: new Date().toISOString(),
      amount: newDebt.total_owed,
      type: 'creation',
    };
    setAppState(prev => ({ ...prev, debts: [...prev.debts, newDebt], history: [newHistoryEntry, ...prev.history] }));
    toast({ title: 'Debt Added', description: `"${newDebt.title}" has been added.` });
  };

  const updateDebt = (debtId: string, updatedData: Partial<Omit<Debt, 'id' | 'paymentDates'>>) => {
    const oldDebt = appState.debts.find(d => d.id === debtId);
    if (!oldDebt) return;

    const newDebt = { ...oldDebt, ...updatedData };
    
    setAppState(prev => ({
        ...prev,
        debts: prev.debts.map(d => d.id === debtId ? newDebt : d)
    }));

    const wasPaidOff = getPaymentCount(oldDebt) >= getTotalInstallments(oldDebt) && oldDebt.total_owed > 0;
    const isNowPaidOff = getPaymentCount(newDebt) >= getTotalInstallments(newDebt) && newDebt.total_owed > 0;

    if (!wasPaidOff && isNowPaidOff) {
        toast({
            title: 'Congratulations!',
            description: `You've fully paid off "${newDebt.title}"!`,
            className: 'bg-green-600 text-white border-green-600',
        });
    }
  };

  const deleteDebt = (debtId: string) => {
    const debtToDelete = appState.debts.find(d => d.id === debtId);
    if (debtToDelete) {
      setAppState(prev => ({ ...prev, debts: prev.debts.filter(debt => debt.id !== debtId), history: prev.history.filter(h => h.debtId !== debtId) }));
      toast({ title: 'Debt Deleted', description: `"${debtToDelete.title}" has been removed.` });
    }
  };

  const togglePaymentDate = (debtId: string, date: Date) => {
    const debt = appState.debts.find(d => d.id === debtId);
    if (!debt) return;

    const paymentDates = debt.paymentDates || [];
    const dateToToggle = startOfDay(date).toISOString();
    const existingIndex = paymentDates.findIndex(d => isSameDay(new Date(d), date));

    let newPaymentDates: string[];
    let wasAdded = false;

    if (existingIndex > -1) {
        newPaymentDates = paymentDates.filter((_, index) => index !== existingIndex);
    } else {
        newPaymentDates = [...paymentDates, dateToToggle];
        wasAdded = true;
    }
    newPaymentDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    const newDebt = { ...debt, paymentDates: newPaymentDates };
    
    setAppState(prev => {
        const newHistoryEntry = wasAdded ? {
            id: new Date().toISOString(),
            debtId: debt.id,
            debtTitle: debt.title,
            date: date.toISOString(),
            amount: debt.installment_amount,
            type: 'payment'
        } as HistoryEntry : null;

        return {
            ...prev,
            debts: prev.debts.map(d => d.id === debtId ? newDebt : d),
            history: newHistoryEntry ? [newHistoryEntry, ...prev.history] : prev.history,
        };
    });
  };
  
  const logPaymentForToday = (debtId: string) => {
    const debt = appState.debts.find(d => d.id === debtId);
    if (!debt) return;
    const isAlreadyLogged = (debt.paymentDates || []).some(d => isSameDay(new Date(d), new Date()));
    if (isAlreadyLogged) {
        toast({ variant: 'destructive', title: 'Already Logged', description: 'A payment for today has already been recorded for this debt.' });
        return;
    }
    togglePaymentDate(debtId, new Date());
  };

  const logTransportPayment = (amount: number, month: string) => {
    const newHistoryEntry: HistoryEntry = { id: new Date().toISOString(), debtTitle: `Transport: ${month}`, date: new Date().toISOString(), amount, type: 'transport' };
    setAppState(prev => ({ ...prev, history: [newHistoryEntry, ...prev.history] }));
    toast({ title: 'Payment Logged', description: `Transport payment for ${month} has been recorded.` });
  };

  const addUserTheme = (name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>) => {
    const newTheme: UserTheme = {
      id: new Date().toISOString(),
      name,
      settings
    };
    setAppState(prev => ({ ...prev, userThemes: [...prev.userThemes, newTheme] }));
    toast({ title: 'Preset Saved', description: `"${name}" has been added to My Themes.` });
  };

  const deleteUserTheme = (themeId: string) => {
    const themeToDelete = appState.userThemes.find(t => t.id === themeId);
    if (!themeToDelete) return;

    setAppState(prev => ({
        ...prev,
        userThemes: prev.userThemes.filter(t => t.id !== themeId)
    }));
    toast({ title: 'Preset Deleted', description: `"${themeToDelete.name}" has been removed.` });
  };

  const importData = (data: AppData) => {
    try {
      if (data.debts && data.history && data.themeSettings) {
        setAppState(prev => ({ ...defaultState, ...prev, ...data, schemaVersion: CURRENT_SCHEMA_VERSION }));
        toast({ title: 'Success', description: 'Your data has been imported.' });
      } else { throw new Error('Missing critical data fields.') }
    } catch (e: any) {
      toast({ title: 'Error', description: `Invalid data format: ${e.message}`, variant: 'destructive' });
    }
  };

  const clearData = () => {
    const keysToRemove = [
        'appState', 
        'debts', 
        'history', 
        'transportSettings', 
        'transportOverrides', 
        'themeSettings', 
        'userThemes',
        'quick-note'
    ];
    keysToRemove.forEach(key => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error(`Could not remove ${key} from localStorage`, e);
        }
    });

    idbClear().finally(() => {
        setAppState(defaultState);
        toast({ title: 'Data Cleared', description: 'All app data has been removed. The app will now reload.' });
        setTimeout(() => window.location.reload(), 1500);
    });
  };

  const value = useMemo(() => ({
    ...appState,
    addDebt,
    updateDebt,
    deleteDebt,
    togglePaymentDate,
    logPaymentForToday,
    setTransportSettings: (settings: TransportSettings) => setAppState(p => ({ ...p, transportSettings: settings })),
    setTransportOverrides: (overrides: TransportOverrides) => setAppState(p => ({ ...p, transportOverrides: overrides })),
    logTransportPayment,
    setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage'>) => setAppState(p => ({ ...p, themeSettings: settings })),
    setNotepadContent: (content: string) => setAppState(p => ({ ...p, notepadContent: content })),
    addUserTheme,
    deleteUserTheme,
    importData,
    clearData,
    getAppState: () => appState,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [appState]);

  if (!isLoaded) return null;

  return (
    <AppDataContext.Provider value={value}>
      {children}
      <Toaster />
    </AppDataContext.Provider>
  );
}
