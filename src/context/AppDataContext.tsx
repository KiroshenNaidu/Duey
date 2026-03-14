
'use client';

import React, { createContext, ReactNode, useEffect, useState, useMemo, useCallback } from 'react';
import type { AppState, Debt, HistoryEntry, AppData, ThemeSettings, TransportSettings, TransportOverrides, UserTheme } from '@/lib/types';
import { isSameDay, startOfDay } from 'date-fns';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { getFirestore } from '@/firebase';

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
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize User ID and load optimistic local state
  useEffect(() => {
    let devId = localStorage.getItem('duey_device_id');
    if (!devId) {
      devId = crypto.randomUUID();
      localStorage.setItem('duey_device_id', devId);
    }
    setUserId(devId);

    const storedStateRaw = localStorage.getItem('appState');
    if (storedStateRaw) {
      try {
        setAppState(JSON.parse(storedStateRaw));
      } catch (e) {
        console.error("Failed to parse local optimistic state", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Sync with Firestore
  useEffect(() => {
    if (!userId || !isLoaded) return;

    const db = getFirestore();
    if (!db) return; // Wait for initialization

    const userDocRef = doc(db, 'users', userId);

    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const remoteData = snapshot.data() as AppState;
        setAppState(prev => ({
          ...prev,
          ...remoteData,
          schemaVersion: CURRENT_SCHEMA_VERSION
        }));
        // Update optimistic local storage
        localStorage.setItem('appState', JSON.stringify(remoteData));
      }
    });

    return () => unsubscribe();
  }, [userId, isLoaded]);

  // Push updates to Firestore
  const syncToFirestore = useCallback((newState: AppState) => {
    if (!userId) return;
    const db = getFirestore();
    if (!db) return;
    
    setDoc(doc(db, 'users', userId), newState, { merge: true });
    localStorage.setItem('appState', JSON.stringify(newState));
  }, [userId]);

  const updateStateAndSync = (updater: (prev: AppState) => AppState) => {
    setAppState(prev => {
      const next = updater(prev);
      syncToFirestore(next);
      return next;
    });
  };

  const addDebt = (debtData: Omit<Debt, 'id'>) => {
    updateStateAndSync(prev => {
      const newDebt: Debt = { ...debtData, id: crypto.randomUUID() };
      const newHistoryEntry: HistoryEntry = {
        id: `${newDebt.id}-created`,
        debtId: newDebt.id,
        debtTitle: newDebt.title,
        date: new Date().toISOString(),
        amount: newDebt.total_owed,
        type: 'creation',
      };
      return { ...prev, debts: [...prev.debts, newDebt], history: [newHistoryEntry, ...prev.history] };
    });
  };

  const updateDebt = useCallback((debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      debts: prev.debts.map(d => (d.id === debtId ? { ...d, ...updatedData } : d)),
    }));
  }, [userId]);

  const deleteDebt = (debtId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      debts: prev.debts.filter(debt => debt.id !== debtId),
      history: prev.history.filter(h => h.debtId !== debtId),
    }));
  };
  
  const togglePaymentDate = useCallback((debtId: string, date: Date) => {
    updateStateAndSync(prev => {
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
          updatedHistory = prev.history.filter(h => h.id !== existingPayment.id);
      } else {
          updatedHistory = [{
              id: crypto.randomUUID(),
              debtId: debt.id,
              debtTitle: debt.title,
              date: dateToToggle.toISOString(),
              amount: debt.installment_amount,
              type: 'payment'
          }, ...prev.history];
      }
      return { ...prev, history: updatedHistory };
    });
  }, [userId]);
  
  const logPaymentForToday = (debtId: string) => {
    updateStateAndSync(prev => {
      const debt = prev.debts.find(d => d.id === debtId);
      if (!debt) return prev;
      
      const newHistoryEntry: HistoryEntry = {
          id: crypto.randomUUID(),
          debtId: debt.id,
          debtTitle: debt.title,
          date: new Date().toISOString(),
          amount: debt.installment_amount,
          type: 'payment'
      };
      return { ...prev, history: [newHistoryEntry, ...prev.history] };
    });
  };

  const logCustomPayment = (debtId: string, amount: number) => {
    updateStateAndSync(prev => {
      const debt = prev.debts.find(d => d.id === debtId);
      if (!debt || amount <= 0) return prev;

      const newHistoryEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        debtId: debt.id,
        debtTitle: debt.title,
        date: new Date().toISOString(),
        amount,
        type: 'payment'
      };
      return { ...prev, history: [newHistoryEntry, ...prev.history] };
    });
  };

  const logTransportPayment = (amount: number, month: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      history: [{ id: crypto.randomUUID(), debtTitle: `Transport: ${month}`, date: new Date().toISOString(), amount, type: 'transport' }, ...prev.history]
    }));
  };

  const addUserTheme = useCallback((name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: [...prev.userThemes, { id: crypto.randomUUID(), name, settings }]
    }));
  }, [userId]);

  const deleteUserTheme = useCallback((themeId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: prev.userThemes.filter(t => t.id !== themeId)
    }));
  }, [userId]);

  const importData = (data: AppData) => {
    updateStateAndSync(prev => ({ ...prev, ...data, schemaVersion: CURRENT_SCHEMA_VERSION }));
  };

  const clearData = () => {
    const keysToRemove = ['appState', 'duey_device_id'];
    keysToRemove.forEach(key => localStorage.removeItem(key));
    setAppState(defaultState);
    window.location.reload();
  };

  const value = useMemo(() => ({
    ...appState,
    addDebt,
    updateDebt,
    deleteDebt,
    togglePaymentDate,
    logPaymentForToday,
    logCustomPayment,
    setTransportSettings: (settings: TransportSettings) => updateStateAndSync(p => ({ ...p, transportSettings: settings })),
    setTransportOverrides: (overrides: TransportOverrides) => updateStateAndSync(p => ({ ...p, transportOverrides: overrides })),
    logTransportPayment,
    setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage'>) => updateStateAndSync(p => ({ ...p, themeSettings: settings })),
    setNotepadContent: (content: string) => updateStateAndSync(p => ({ ...p, notepadContent: content })),
    addUserTheme,
    deleteUserTheme,
    importData,
    clearData,
    getAppState: () => appState,
  }), [appState, userId]);

  if (!isLoaded) return null;

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}
