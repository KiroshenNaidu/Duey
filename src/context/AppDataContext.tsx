'use client';

import React, { createContext, ReactNode, useEffect, useState, useMemo, useCallback } from 'react';
import type { AppState, Debt, HistoryEntry, AppData, ThemeSettings, TransportSettings, TransportOverrides, UserTheme } from '@/lib/types';
import { isSameDay, startOfDay } from 'date-fns';
import { idbClear } from '@/lib/utils';

const CURRENT_SCHEMA_VERSION = 3;

const defaultState: AppState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  debts: [],
  history: [],
  transportSettings: { driverName: '', dailyFee: 0 },
  transportOverrides: {},
  themeSettings: {
    background: '223 13% 10%',
    surface: '222 15% 12%',
    primary: '227 50% 50%',
    accent: '191 79% 57%',
    font: 'Inter',
    foreground: '0 0% 98%',
    accentForeground: '0 0% 98%',
    uiScale: 1.0,
  },
  userThemes: [],
  notepadContent: '',
};

interface AppContextType extends AppState {
  addDebt: (debt: Omit<Debt, 'id'>) => void;
  updateDebt: (debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => void;
  deleteDebt: (debtId: string) => void;
  togglePaymentDate: (debtId: string, date: Date) => void;
  logPaymentForToday: (debtId: string) => void;
  logCustomPayment: (debtId: string, amount: number) => void;
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
  logCustomPayment: () => {},
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

  useEffect(() => {
    try {
      const storedStateRaw = localStorage.getItem('appState');
      let stateToLoad: AppState = defaultState;

      if (storedStateRaw) {
        const parsedData = JSON.parse(storedStateRaw);
        
        if (!parsedData.schemaVersion || parsedData.schemaVersion < CURRENT_SCHEMA_VERSION) {
           console.log(`Migrating data from v${parsedData.schemaVersion || 1} to v${CURRENT_SCHEMA_VERSION}...`);
           if (parsedData.schemaVersion < 3) {
             const oldDebts = JSON.parse(localStorage.getItem('debts') || '[]').map((d: any) => {
                const { paymentDates, ...rest } = d;
                return rest;
             });
             const oldHistory = JSON.parse(localStorage.getItem('history') || '[]');
             const oldTransportSettings = JSON.parse(localStorage.getItem('transportSettings') || '{}');
             const oldTransportOverrides = JSON.parse(localStorage.getItem('transportOverrides') || '{}');
             const oldThemeSettings = JSON.parse(localStorage.getItem('themeSettings') || '{}');
             const oldNotepadContent = localStorage.getItem('quick-note') || '';

             stateToLoad = {
                 ...defaultState,
                 debts: oldDebts,
                 history: oldHistory,
                 transportSettings: oldTransportSettings.driverName !== undefined ? oldTransportSettings : defaultState.transportSettings,
                 transportOverrides: Object.keys(oldTransportOverrides).length > 0 ? oldTransportOverrides : defaultState.transportOverrides,
                 themeSettings: oldThemeSettings.primary !== undefined ? {...defaultState.themeSettings, ...oldThemeSettings} : defaultState.themeSettings,
                 userThemes: [],
                 notepadContent: oldNotepadContent || defaultState.notepadContent,
             };
           } else {
             stateToLoad = { ...defaultState, ...parsedData };
           }

           if (!stateToLoad.themeSettings.uiScale) {
              stateToLoad.themeSettings.uiScale = 1.0;
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

  const addDebt = (debtData: Omit<Debt, 'id'>) => {
    const newDebt: Debt = { ...debtData, id: new Date().toISOString() };
    const newHistoryEntry: HistoryEntry = {
      id: `${newDebt.id}-created`,
      debtId: newDebt.id,
      debtTitle: newDebt.title,
      date: new Date().toISOString(),
      amount: newDebt.total_owed,
      type: 'creation',
    };
    setAppState(prev => ({ ...prev, debts: [...prev.debts, newDebt], history: [newHistoryEntry, ...prev.history] }));
  };

  const updateDebt = useCallback((debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => {
    setAppState(prev => {
        const oldDebt = prev.debts.find(d => d.id === debtId);
        if (!oldDebt) return prev;
        
        const newDebt = { ...oldDebt, ...updatedData };
        return {
            ...prev,
            debts: prev.debts.map(d => (d.id === debtId ? newDebt : d)),
        };
    });
  }, []);

  const deleteDebt = (debtId: string) => {
    setAppState(prev => {
      const debtToDelete = prev.debts.find(d => d.id === debtId);
      if (debtToDelete) {
        return {
          ...prev,
          debts: prev.debts.filter(debt => debt.id !== debtId),
          history: prev.history.filter(h => h.debtId !== debtId),
        };
      }
      return prev;
    });
  };
  
  const togglePaymentDate = useCallback((debtId: string, date: Date) => {
    setAppState(prev => {
      const debt = prev.debts.find(d => d.id === debtId);
      if (!debt) return prev;
  
      const dateToToggle = startOfDay(date);
      const existingPayment = prev.history.find(h =>
          h.debtId === debtId &&
          h.type === 'payment' &&
          isSameDay(new Date(h.date), dateToToggle)
      );
      
      let updatedHistory: HistoryEntry[];

      if (existingPayment) {
          // If a payment exists on this day, remove it
          updatedHistory = prev.history.filter(h => h.id !== existingPayment.id);
      } else {
          // If no payment exists, add a new one for the installment amount
          const newHistoryEntry: HistoryEntry = {
              id: new Date().toISOString(),
              debtId: debt.id,
              debtTitle: debt.title,
              date: dateToToggle.toISOString(),
              amount: debt.installment_amount,
              type: 'payment'
          };
          updatedHistory = [newHistoryEntry, ...prev.history];
      }

      return { ...prev, history: updatedHistory };
    });
  }, []);
  
  const logPaymentForToday = (debtId: string) => {
    const debt = appState.debts.find(d => d.id === debtId);
    if (!debt) return;
    
    const isAlreadyLogged = appState.history.some(h => 
        h.debtId === debtId && 
        h.type === 'payment' && 
        isSameDay(new Date(h.date), new Date())
    );

    if (isAlreadyLogged) {
        console.warn('Already Logged: A payment for today has already been recorded for this debt.');
        return;
    }
    
    const newHistoryEntry: HistoryEntry = {
        id: new Date().toISOString(),
        debtId: debt.id,
        debtTitle: debt.title,
        date: new Date().toISOString(),
        amount: debt.installment_amount,
        type: 'payment'
    };
    setAppState(prev => ({ ...prev, history: [newHistoryEntry, ...prev.history] }));
  };

  const logCustomPayment = (debtId: string, amount: number) => {
    const debt = appState.debts.find(d => d.id === debtId);
    if (!debt || amount <= 0) return;

    const newHistoryEntry: HistoryEntry = {
      id: new Date().toISOString(),
      debtId: debt.id,
      debtTitle: debt.title,
      date: new Date().toISOString(),
      amount,
      type: 'payment'
    };
    setAppState(prev => ({ ...prev, history: [newHistoryEntry, ...prev.history] }));
  };

  const logTransportPayment = (amount: number, month: string) => {
    const newHistoryEntry: HistoryEntry = { id: new Date().toISOString(), debtTitle: `Transport: ${month}`, date: new Date().toISOString(), amount, type: 'transport' };
    setAppState(prev => ({ ...prev, history: [newHistoryEntry, ...prev.history] }));
  };

  const addUserTheme = useCallback((name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>) => {
    const newTheme: UserTheme = {
      id: new Date().toISOString(),
      name,
      settings
    };
    setAppState(prev => ({ ...prev, userThemes: [...prev.userThemes, newTheme] }));
  }, []);

  const deleteUserTheme = useCallback((themeId: string) => {
    setAppState(prev => {
        const themeToDelete = prev.userThemes.find(t => t.id === themeId);
        if (!themeToDelete) return prev;

        return {
            ...prev,
            userThemes: prev.userThemes.filter(t => t.id !== themeId)
        };
    });
  }, []);

  const importData = (data: AppData) => {
    try {
      if (data.debts && data.history && data.themeSettings) {
        setAppState(prev => ({ ...defaultState, ...prev, ...data, schemaVersion: CURRENT_SCHEMA_VERSION }));
      } else { throw new Error('Missing critical data fields.') }
    } catch (e: any) {
      console.error(`Invalid data format: ${e.message}`);
    }
  };

  const clearData = () => {
    const keysToRemove = [
      'appState',
      // also include old keys for a full cleanup from migration
      'debts', 
      'history', 
      'transportSettings', 
      'transportOverrides', 
      'themeSettings',
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
        setTimeout(() => window.location.reload(), 500);
    });
  };

  const value = useMemo(() => ({
    ...appState,
    addDebt,
    updateDebt,
    deleteDebt,
    togglePaymentDate,
    logPaymentForToday,
    logCustomPayment,
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
  }), [appState, deleteDebt, togglePaymentDate, addUserTheme, deleteUserTheme, updateDebt]);

  if (!isLoaded) return null;

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}
