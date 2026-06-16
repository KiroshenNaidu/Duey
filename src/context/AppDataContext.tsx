'use client';

import { createContext, ReactNode, useEffect, useState, useMemo, useCallback } from 'react';
import type { AppState, Debt, HistoryEntry, AppData, ThemeSettings, TransportSettings, TransportOverrides, DayState, UberRide, UserTheme, BudgetPlan, BudgetItem, UserProfile, NotificationSettings } from '@/lib/types';
import { isSameDay, startOfDay } from 'date-fns';

const CURRENT_SCHEMA_VERSION = 6;

function migrateState(raw: AppState): AppState {
  const overrides: TransportOverrides = {};
  for (const [k, v] of Object.entries(raw.transportOverrides ?? {})) {
    const val: unknown = v;
    overrides[k] = val === true ? 1 : val === false ? 0 : (val as DayState);
  }
  const transportSettings: TransportSettings = {
    driverName: raw.transportSettings?.driverName ?? '',
    employed: raw.transportSettings?.employed ?? true,
    pricingMode: raw.transportSettings?.pricingMode ?? 'daily',
    dailyFee: raw.transportSettings?.dailyFee ?? 0,
    monthlyFee: raw.transportSettings?.monthlyFee ?? 0,
  };
  return {
    ...raw,
    transportSettings,
    transportOverrides: overrides,
    uberRides: raw.uberRides ?? [],
    budgetPlans: raw.budgetPlans ?? [],
    monthlyIncome: raw.monthlyIncome ?? 0,
    userProfile: raw.userProfile ?? { name: '', paydayDay: 26 },
    notificationSettings: raw.notificationSettings ?? { enabled: false, paydayDay: 26, hour: 18, minute: 0 },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

const defaultState: AppState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  debts: [],
  history: [],
  transportSettings: { driverName: '', employed: true, pricingMode: 'daily', dailyFee: 0, monthlyFee: 0 },
  transportOverrides: {},
  uberRides: [],
  budgetPlans: [],
  monthlyIncome: 0,
  userProfile: { name: '', paydayDay: 26 },
  notificationSettings: { enabled: false, paydayDay: 26, hour: 18, minute: 0 },
  themeSettings: {
    background: '223 13% 10%',
    surface: '222 15% 12%',
    primary: '227 50% 50%',
    accent: '191 79% 57%',
    font: 'Inter',
    foreground: '0 0% 98%',
    accentForeground: '0 0% 98%',
    backgroundOpacity: 0.5,
    uiScale: 1.0,
    uiStyle: 'solid',
  },
  userThemes: [],
  notepadContent: '',
};

interface AppContextType extends AppState {
  addDebt: (debt: Omit<Debt, 'id'>) => void;
  updateDebt: (debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => void;
  deleteDebt: (debtId: string) => void;
  completeDebt: (debtId: string) => void;
  togglePaymentDate: (debtId: string, date: Date) => void;
  logPaymentForToday: (debtId: string) => void;
  logCustomPayment: (debtId: string, amount: number) => void;
  setTransportSettings: (settings: TransportSettings) => void;
  setTransportOverrides: (overrides: TransportOverrides) => void;
  logTransportPayment: (amount: number, month: string) => void;
  addUberRide: (ride: Omit<UberRide, 'id' | 'createdAt'>) => void;
  deleteUberRide: (rideId: string) => void;
  updateUberRide: (rideId: string, data: Partial<Omit<UberRide, 'id' | 'createdAt'>>) => void;
  addBudgetPlan: (name: string, budget: number) => void;
  deleteBudgetPlan: (planId: string) => void;
  updateBudgetPlan: (planId: string, data: { name?: string; budget?: number }) => void;
  addBudgetItem: (planId: string, item: Omit<BudgetItem, 'id' | 'createdAt'>) => void;
  deleteBudgetItem: (planId: string, itemId: string) => void;
  setMonthlyIncome: (income: number) => void;
  setUserProfile: (profile: UserProfile) => void;
  setNotificationSettings: (settings: NotificationSettings) => void;
  setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage'>) => void;
  setNotepadContent: (content: string) => void;
  addUserTheme: (name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>) => void;
  deleteUserTheme: (themeId: string) => void;
  importData: (data: AppData) => void;
  deleteHistoryEntry: (entryId: string) => void;
  clearData: () => void;
  getAppState: () => AppState;
}

export const AppDataContext = createContext<AppContextType>({
  ...defaultState,
  addDebt: () => {},
  updateDebt: () => {},
  deleteDebt: () => {},
  completeDebt: () => {},
  togglePaymentDate: () => {},
  logPaymentForToday: () => {},
  logCustomPayment: () => {},
  setTransportSettings: () => {},
  setTransportOverrides: () => {},
  logTransportPayment: () => {},
  addUberRide: () => {},
  deleteUberRide: () => {},
  updateUberRide: () => {},
  addBudgetPlan: () => {},
  deleteBudgetPlan: () => {},
  updateBudgetPlan: () => {},
  addBudgetItem: () => {},
  deleteBudgetItem: () => {},
  setMonthlyIncome: () => {},
  setUserProfile: () => {},
  setNotificationSettings: () => {},
  setThemeSettings: () => {},
  setNotepadContent: () => {},
  addUserTheme: () => {},
  deleteUserTheme: () => {},
  importData: () => {},
  deleteHistoryEntry: () => {},
  clearData: () => {},
  getAppState: () => defaultState,
});

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const storedStateRaw = localStorage.getItem('appState');
    if (storedStateRaw) {
      try {
        setAppState(migrateState(JSON.parse(storedStateRaw)));
      } catch (e) {
        console.error("Failed to parse local optimistic state", e);
      }
    }
    setIsLoaded(true);
  }, []);

  const updateStateAndSync = (updater: (prev: AppState) => AppState) => {
    setAppState(prev => {
      const next = updater(prev);
      localStorage.setItem('appState', JSON.stringify(next));
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
  }, []);

  const deleteDebt = (debtId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      debts: prev.debts.filter(debt => debt.id !== debtId),
      history: prev.history.filter(h => h.debtId !== debtId),
    }));
  };

  const completeDebt = (debtId: string) => {
    updateStateAndSync(prev => {
      const debt = prev.debts.find(d => d.id === debtId);
      if (!debt) return prev;
      const completionEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        debtId: debt.id,
        debtTitle: debt.title,
        date: new Date().toISOString(),
        amount: debt.total_owed,
        type: 'completion',
      };
      return {
        ...prev,
        debts: prev.debts.filter(d => d.id !== debtId),
        history: [completionEntry, ...prev.history],
      };
    });
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
  }, []);

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

  const deleteHistoryEntry = (entryId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      history: prev.history.filter(h => h.id !== entryId),
    }));
  };

  const addUberRide = (ride: Omit<UberRide, 'id' | 'createdAt'>) => {
    updateStateAndSync(prev => ({
      ...prev,
      uberRides: [...prev.uberRides, { ...ride, id: crypto.randomUUID(), createdAt: new Date().toISOString() }],
    }));
  };

  const deleteUberRide = (rideId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      uberRides: prev.uberRides.filter(r => r.id !== rideId),
    }));
  };

  const updateUberRide = (rideId: string, data: Partial<Omit<UberRide, 'id' | 'createdAt'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      uberRides: prev.uberRides.map(r => r.id === rideId ? { ...r, ...data } : r),
    }));
  };

  const addBudgetPlan = (name: string, budget: number) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: [...prev.budgetPlans, { id: crypto.randomUUID(), name, budget, items: [], createdAt: new Date().toISOString() }],
    }));
  };

  const deleteBudgetPlan = (planId: string) => {
    updateStateAndSync(prev => {
      const plan = prev.budgetPlans.find(p => p.id === planId);
      const historyEntry: HistoryEntry | null = plan ? {
        id: crypto.randomUUID(),
        debtTitle: `Budget: ${plan.name}`,
        date: new Date().toISOString(),
        amount: plan.items.reduce((s, i) => s + i.price, 0),
        type: 'budget',
      } : null;
      return {
        ...prev,
        budgetPlans: prev.budgetPlans.filter(p => p.id !== planId),
        history: historyEntry ? [historyEntry, ...prev.history] : prev.history,
      };
    });
  };

  const updateBudgetPlan = (planId: string, data: { name?: string; budget?: number }) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: prev.budgetPlans.map(p => p.id === planId ? { ...p, ...data } : p),
    }));
  };

  const addBudgetItem = (planId: string, item: Omit<BudgetItem, 'id' | 'createdAt'>) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: prev.budgetPlans.map(p =>
        p.id === planId
          ? { ...p, items: [...p.items, { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() }] }
          : p
      ),
    }));
  };

  const deleteBudgetItem = (planId: string, itemId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: prev.budgetPlans.map(p =>
        p.id === planId ? { ...p, items: p.items.filter(i => i.id !== itemId) } : p
      ),
    }));
  };

  const addUserTheme = useCallback((name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: [...prev.userThemes, { id: crypto.randomUUID(), name, settings }]
    }));
  }, []);

  const deleteUserTheme = useCallback((themeId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: prev.userThemes.filter(t => t.id !== themeId)
    }));
  }, []);

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
    completeDebt,
    togglePaymentDate,
    logPaymentForToday,
    logCustomPayment,
    setTransportSettings: (settings: TransportSettings) => updateStateAndSync(p => ({ ...p, transportSettings: settings })),
    setTransportOverrides: (overrides: TransportOverrides) => updateStateAndSync(p => ({ ...p, transportOverrides: overrides })),
    logTransportPayment,
    addUberRide,
    deleteUberRide,
    updateUberRide,
    addBudgetPlan,
    deleteBudgetPlan,
    updateBudgetPlan,
    addBudgetItem,
    deleteBudgetItem,
    setMonthlyIncome: (income: number) => updateStateAndSync(p => ({ ...p, monthlyIncome: income })),
    setUserProfile: (profile: UserProfile) => updateStateAndSync(p => ({ ...p, userProfile: profile })),
    setNotificationSettings: (settings: NotificationSettings) => updateStateAndSync(p => ({ ...p, notificationSettings: settings })),
    setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage'>) => updateStateAndSync(p => ({ ...p, themeSettings: settings })),
    setNotepadContent: (content: string) => updateStateAndSync(p => ({ ...p, notepadContent: content })),
    addUserTheme,
    deleteUserTheme,
    deleteHistoryEntry,
    importData,
    clearData,
    getAppState: () => appState,
  }), [appState]);

  if (!isLoaded) return null;

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}
