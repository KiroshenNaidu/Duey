'use client';

import { createContext, ReactNode, useEffect, useState, useMemo, useCallback } from 'react';
import type { AppState, Debt, HistoryEntry, AppData, ThemeSettings, TransportSettings, TransportOverrides, DayState, UberRide, UserTheme, BudgetPlan, BudgetItem, UserProfile, NotificationSettings, AppError, Expense, ExtraIncome } from '@/lib/types';
import { isSameDay, startOfDay, startOfMonth, format } from 'date-fns';
import { idbGet, idbSet, idbDel, setCurrencyCode } from '@/lib/utils';
import { calculateTransportMonth } from '@/lib/calculations';
import { LoadingScreen } from '@/components/LoadingScreen';

const CURRENT_SCHEMA_VERSION = 8;

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
    jobTitle: raw.transportSettings?.jobTitle,
    company: raw.transportSettings?.company,
    employmentStartDate: raw.transportSettings?.employmentStartDate,
    employmentEndDate: raw.transportSettings?.employmentEndDate,
  };
  return {
    ...raw,
    // Existing users who already have data default to ZAR so they don't see the picker.
    currency: raw.currency ?? ((raw.debts?.length ?? 0) > 0 || (raw.history?.length ?? 0) > 0 ? 'ZAR' : ''),
    transportSettings,
    transportOverrides: overrides,
    uberRides: raw.uberRides ?? [],
    expenses: raw.expenses ?? [],
    extraIncomes: raw.extraIncomes ?? [],
    budgetPlans: raw.budgetPlans ?? [],
    monthlyIncome: raw.monthlyIncome ?? 0,
    userProfile: raw.userProfile
      ? { name: raw.userProfile.name ?? '', paydayDay: raw.userProfile.paydayDay ?? 26, bio: raw.userProfile.bio ?? '' }
      : { name: '', paydayDay: 26, bio: '' },
    notificationSettings: raw.notificationSettings
      ? { enabled: raw.notificationSettings.enabled ?? false, paydayDay: raw.notificationSettings.paydayDay ?? 26, hour: raw.notificationSettings.hour ?? 18, minute: raw.notificationSettings.minute ?? 0, message: raw.notificationSettings.message ?? 'Time to log your monthly payments.' }
      : { enabled: false, paydayDay: 26, hour: 18, minute: 0, message: 'Time to log your monthly payments.' },
    themeSettings: raw.themeSettings
      ? { ...raw.themeSettings, useSafeAreaInsets: true, bgX: raw.themeSettings.bgX ?? 50, bgY: raw.themeSettings.bgY ?? 50, bgScale: raw.themeSettings.bgScale ?? 1, backgroundBlur: raw.themeSettings.backgroundBlur ?? 0 }
      : defaultState.themeSettings,
    exportFolderUri: raw.exportFolderUri ?? '',
    exportFolderName: raw.exportFolderName ?? '',
    lastSnapshotMonth: raw.lastSnapshotMonth ?? '',
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

const defaultState: AppState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  currency: '',
  debts: [],
  history: [],
  transportSettings: { driverName: '', employed: true, pricingMode: 'daily', dailyFee: 0, monthlyFee: 0 },
  transportOverrides: {},
  uberRides: [],
  expenses: [],
  extraIncomes: [],
  budgetPlans: [],
  monthlyIncome: 0,
  userProfile: { name: '', paydayDay: 26, bio: '' },
  notificationSettings: { enabled: false, paydayDay: 26, hour: 18, minute: 0, message: 'Time to log your monthly payments.' },
  themeSettings: {
    background: '240 6% 7%',
    surface: '240 4% 11%',
    primary: '96 65% 64%',
    accent: '103 77% 59%',
    font: 'Inter',
    foreground: '60 8% 95%',
    accentForeground: '240 3% 62%',
    backgroundOpacity: 0.5,
    uiScale: 1.0,
    uiStyle: 'solid',
    useSafeAreaInsets: true,
    bgX: 50,
    bgY: 50,
    bgScale: 1,
    backgroundBlur: 0,
    glassOpacity: 0.55,
    positive: '161 50% 57%',
    negative: '0 70% 62%',
    catTransport: '217 91% 68%',
    catBudget: '0 70% 62%',
    catExpense: '25 95% 53%',
    catCompletion: '43 96% 70%',
    catEmployment: '173 80% 74%',
    catSnapshot: '199 89% 62%',
  },
  userThemes: [],
  notepadContent: '',
  exportFolderUri: '',
  exportFolderName: '',
  lastSnapshotMonth: '',
};

type NavGuard = { onAttempt: (href: string) => void } | null;

interface AppContextType extends AppState {
  navGuard: NavGuard;
  setNavGuard: (guard: NavGuard) => void;
  // When true, AppShell suppresses page-level swipe navigation (e.g. while a Settings
  // sub-menu is open and owns horizontal swipes for its own sub-tabs).
  pageSwipeLocked: boolean;
  setPageSwipeLocked: (locked: boolean) => void;
  appError: AppError | null;
  setAppError: (error: AppError | null) => void;
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
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void;
  deleteExpense: (expenseId: string) => void;
  updateExpense: (expenseId: string, data: Partial<Omit<Expense, 'id' | 'createdAt'>>) => void;
  addExtraIncome: (label: string, amount: number) => void;
  deleteExtraIncome: (id: string) => void;
  addBudgetPlan: (name: string, budget: number) => void;
  deleteBudgetPlan: (planId: string) => void;
  updateBudgetPlan: (planId: string, data: { name?: string; budget?: number }) => void;
  addBudgetItem: (planId: string, item: Omit<BudgetItem, 'id' | 'createdAt'>) => void;
  deleteBudgetItem: (planId: string, itemId: string) => void;
  toggleBudgetItemPurchased: (planId: string, itemId: string) => void;
  setMonthlyIncome: (income: number) => void;
  setUserProfile: (profile: UserProfile) => void;
  setNotificationSettings: (settings: NotificationSettings) => void;
  setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo'>) => void;
  setNotepadContent: (content: string) => void;
  addUserTheme: (name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo' | 'backgroundOpacity'>) => void;
  deleteUserTheme: (themeId: string) => void;
  importData: (data: AppData) => void;
  deleteHistoryEntry: (entryId: string) => void;
  updateHistoryEntry: (entryId: string, data: Partial<Pick<HistoryEntry, 'label' | 'note'>>) => void;
  setCurrency: (code: string) => void;
  setExportFolder: (uri: string, name: string) => void;
  clearData: () => void; // fire-and-forget async
  getAppState: () => AppState;
  avatarDataUrl: string;
  setProfileAvatar: (url: string) => Promise<void>;
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
  addExpense: () => {},
  deleteExpense: () => {},
  updateExpense: () => {},
  addExtraIncome: () => {},
  deleteExtraIncome: () => {},
  addBudgetPlan: () => {},
  deleteBudgetPlan: () => {},
  updateBudgetPlan: () => {},
  addBudgetItem: () => {},
  deleteBudgetItem: () => {},
  toggleBudgetItemPurchased: () => {},
  setMonthlyIncome: () => {},
  setUserProfile: () => {},
  setNotificationSettings: () => {},
  setThemeSettings: () => {},
  setNotepadContent: () => {},
  addUserTheme: () => {},
  deleteUserTheme: () => {},
  importData: () => {},
  deleteHistoryEntry: () => {},
  updateHistoryEntry: () => {},
  setCurrency: () => {},
  setExportFolder: () => {},
  clearData: () => {},
  getAppState: () => defaultState,
  avatarDataUrl: '',
  setProfileAvatar: async () => {},
  navGuard: null,
  setNavGuard: () => {},
  pageSwipeLocked: false,
  setPageSwipeLocked: () => {},
  appError: null,
  setAppError: () => {},
});

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [navGuard, setNavGuard] = useState<NavGuard>(null);
  const [pageSwipeLocked, setPageSwipeLocked] = useState(false);
  const [appError, setAppError] = useState<AppError | null>(null);

  // Keep module-level currency in sync with state so formatCurrency() picks it up everywhere.
  useEffect(() => { setCurrencyCode(appState.currency); }, [appState.currency]);

  useEffect(() => {
    const storedStateRaw = localStorage.getItem('appState');
    if (storedStateRaw) {
      try {
        let loaded = migrateState(JSON.parse(storedStateRaw));

        // Auto-purge non-recurring expenses from previous months
        const firstOfThisMonth = startOfMonth(new Date());
        const expired = loaded.expenses.filter(
          e => !e.recurring && new Date(e.createdAt) < firstOfThisMonth
        );
        if (expired.length > 0) {
          const purgeEntries: HistoryEntry[] = expired.map(e => ({
            id: crypto.randomUUID(),
            debtTitle: e.title,
            date: new Date().toISOString(),
            amount: e.amount,
            type: 'expense' as const,
            note: 'Auto-removed (one-time expense)',
          }));
          loaded = {
            ...loaded,
            expenses: loaded.expenses.filter(e => e.recurring || new Date(e.createdAt) >= firstOfThisMonth),
            history: [...purgeEntries, ...loaded.history],
          };
        }

        // Monthly balance snapshot — logs once per month on first load of a new month.
        // lastSnapshotMonth === '' means fresh install; skip to avoid a noisy first entry.
        const currentMonthKey = format(new Date(), 'yyyy-MM');
        if (loaded.lastSnapshotMonth && loaded.lastSnapshotMonth !== currentMonthKey) {
          const prevMonthLabel = format(firstOfThisMonth, 'MMMM yyyy');
          const transportCost = calculateTransportMonth(new Date(), loaded.transportOverrides, loaded.transportSettings).totalDue;
          const budgetSpent = loaded.budgetPlans.flatMap(p => p.items).reduce((s, i) => s + i.price, 0);
          // Debt outgoings = payments actually logged against the month that just ended,
          // not the planned installment_amount.
          const snapshotMonthKey = format(firstOfThisMonth, 'yyyy-MM');
          const debtTotal = loaded.history.reduce((s, h) =>
            h.type === 'payment' && h.debtId && format(new Date(h.date), 'yyyy-MM') === snapshotMonthKey
              ? s + h.amount : s, 0);
          const expenseTotal = loaded.expenses.reduce((s, e) => s + e.amount, 0);
          const totalExtra = (loaded.extraIncomes ?? []).reduce((s, e) => s + e.amount, 0);
          const totalOutgoings = transportCost + budgetSpent + debtTotal + expenseTotal;
          const income = loaded.monthlyIncome + totalExtra;
          const remaining = income - totalOutgoings;
          const snapshotEntry: HistoryEntry = {
            id: crypto.randomUUID(),
            debtTitle: `${prevMonthLabel} Summary`,
            date: new Date().toISOString(),
            amount: Math.abs(remaining),
            type: 'snapshot' as const,
            note: `Income: ${income} · Outgoings: ${totalOutgoings} · ${remaining >= 0 ? 'Surplus' : 'Deficit'}: ${Math.abs(remaining)}`,
          };
          loaded = {
            ...loaded,
            history: [snapshotEntry, ...loaded.history],
            lastSnapshotMonth: currentMonthKey,
          };
        } else if (!loaded.lastSnapshotMonth) {
          // Fresh install — just record the month so the next month-turn creates a real snapshot.
          loaded = { ...loaded, lastSnapshotMonth: currentMonthKey };
        }

        setAppState(loaded);
      } catch (e) {
        console.error("Failed to parse persisted app state", e);
      }
    }
    setIsLoaded(true);
    idbGet<string>('profileAvatar')
      .then(v => { if (v) setAvatarDataUrl(v); })
      .catch((err) => { console.error('Failed to load profile avatar', err); });
  }, []);

  const setProfileAvatar = useCallback(async (url: string) => {
    try {
      if (url) {
        await idbSet('profileAvatar', url);
      } else {
        await idbDel('profileAvatar');
      }
      setAvatarDataUrl(url);
    } catch (err) {
      setAppError({
        friendly: 'Could not save profile photo — storage may be full.',
        operation: `${url ? "idbSet('profileAvatar')" : "idbDel('profileAvatar')"} in setProfileAvatar`,
        error: err,
        ts: Date.now(),
      });
    }
  }, [setAppError]);

  const updateStateAndSync = useCallback((updater: (prev: AppState) => AppState) => {
    setAppState(prev => {
      const next = updater(prev);
      try {
        localStorage.setItem('appState', JSON.stringify(next));
      } catch (err) {
        queueMicrotask(() => setAppError({
          friendly: 'Could not save — your device storage may be full. Some changes may be lost after refresh.',
          operation: "localStorage.setItem('appState') in updateStateAndSync",
          error: err,
          ts: Date.now(),
        }));
      }
      return next;
    });
  }, [setAppError]);

  const addDebt = useCallback((debtData: Omit<Debt, 'id'>) => {
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
  }, [updateStateAndSync]);

  const updateDebt = useCallback((debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      debts: prev.debts.map(d => (d.id === debtId ? { ...d, ...updatedData } : d)),
    }));
  }, [updateStateAndSync]);

  const deleteDebt = useCallback((debtId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      debts: prev.debts.filter(debt => debt.id !== debtId),
      history: prev.history.filter(h => h.debtId !== debtId),
    }));
  }, [updateStateAndSync]);

  const completeDebt = useCallback((debtId: string) => {
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
  }, [updateStateAndSync]);
  
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
  }, [updateStateAndSync]);

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

  const updateHistoryEntry = (entryId: string, data: Partial<Pick<HistoryEntry, 'label' | 'note'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      history: prev.history.map(h => h.id === entryId ? { ...h, ...data } : h),
    }));
  };

  const addUberRide = useCallback((ride: Omit<UberRide, 'id' | 'createdAt'>) => {
    updateStateAndSync(prev => ({
      ...prev,
      uberRides: [...prev.uberRides, { ...ride, id: crypto.randomUUID(), createdAt: new Date().toISOString() }],
    }));
  }, [updateStateAndSync]);

  const deleteUberRide = useCallback((rideId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      uberRides: prev.uberRides.filter(r => r.id !== rideId),
    }));
  }, [updateStateAndSync]);

  const updateUberRide = (rideId: string, data: Partial<Omit<UberRide, 'id' | 'createdAt'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      uberRides: prev.uberRides.map(r => r.id === rideId ? { ...r, ...data } : r),
    }));
  };

  const addExpense = useCallback((expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
    updateStateAndSync(prev => {
      const newExpense: Expense = { ...expenseData, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      const historyEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        debtTitle: newExpense.title,
        date: newExpense.date,
        amount: newExpense.amount,
        type: 'expense',
        note: newExpense.note,
      };
      return { ...prev, expenses: [...prev.expenses, newExpense], history: [historyEntry, ...prev.history] };
    });
  }, [updateStateAndSync]);

  const deleteExpense = useCallback((expenseId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      expenses: prev.expenses.filter(e => e.id !== expenseId),
    }));
  }, [updateStateAndSync]);

  const updateExpense = useCallback((expenseId: string, data: Partial<Omit<Expense, 'id' | 'createdAt'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      expenses: prev.expenses.map(e => e.id === expenseId ? { ...e, ...data } : e),
    }));
  }, [updateStateAndSync]);

  const addExtraIncome = useCallback((label: string, amount: number) => {
    updateStateAndSync(prev => ({
      ...prev,
      extraIncomes: [...(prev.extraIncomes ?? []), { id: crypto.randomUUID(), label, amount, createdAt: new Date().toISOString() }],
    }));
  }, [updateStateAndSync]);

  const deleteExtraIncome = useCallback((id: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      extraIncomes: (prev.extraIncomes ?? []).filter(e => e.id !== id),
    }));
  }, [updateStateAndSync]);

  const addBudgetPlan = useCallback((name: string, budget: number) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: [...prev.budgetPlans, { id: crypto.randomUUID(), name, budget, items: [], createdAt: new Date().toISOString() }],
    }));
  }, [updateStateAndSync]);

  const deleteBudgetPlan = useCallback((planId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: prev.budgetPlans.filter(p => p.id !== planId),
    }));
  }, [updateStateAndSync]);

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

  const toggleBudgetItemPurchased = (planId: string, itemId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: prev.budgetPlans.map(p =>
        p.id === planId
          ? { ...p, items: p.items.map(i => i.id === itemId ? { ...i, purchased: !i.purchased } : i) }
          : p
      ),
    }));
  };

  const addUserTheme = useCallback((name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo' | 'backgroundOpacity'>) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: [...prev.userThemes, { id: crypto.randomUUID(), name, settings }]
    }));
  }, [updateStateAndSync]);

  const deleteUserTheme = useCallback((themeId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: prev.userThemes.filter(t => t.id !== themeId)
    }));
  }, [updateStateAndSync]);

  const importData = (data: AppData) => {
    updateStateAndSync(prev => ({ ...prev, ...data, schemaVersion: CURRENT_SCHEMA_VERSION }));
  };

  const clearData = () => {
    const keysToRemove = ['appState', 'duey_device_id'];
    keysToRemove.forEach(key => localStorage.removeItem(key));
    idbDel('backgroundImage').catch(() => {});
    idbDel('backgroundVideo').catch(() => {});
    idbDel('profileAvatar').catch(() => {});
    setAppState(defaultState);
    setAvatarDataUrl('');
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
    setTransportSettings: (settings: TransportSettings) => updateStateAndSync(p => {
      const prev = p.transportSettings;
      const historyEntries: HistoryEntry[] = [];
      if (prev.employed !== settings.employed) {
        const label = settings.employed ? 'Started employment' : 'Ended employment';
        const note = settings.employed
          ? [settings.jobTitle, settings.company].filter(Boolean).join(' at ') || undefined
          : [prev.jobTitle, prev.company].filter(Boolean).join(' at ') || undefined;
        historyEntries.push({
          id: crypto.randomUUID(),
          debtTitle: label,
          date: new Date().toISOString(),
          amount: 0,
          type: 'employment',
          note,
        });
      }
      return {
        ...p,
        transportSettings: settings,
        history: historyEntries.length > 0 ? [...historyEntries, ...p.history] : p.history,
      };
    }),
    setTransportOverrides: (overrides: TransportOverrides) => updateStateAndSync(p => ({ ...p, transportOverrides: overrides })),
    logTransportPayment,
    addUberRide,
    deleteUberRide,
    updateUberRide,
    addExpense,
    deleteExpense,
    updateExpense,
    addExtraIncome,
    deleteExtraIncome,
    addBudgetPlan,
    deleteBudgetPlan,
    updateBudgetPlan,
    addBudgetItem,
    deleteBudgetItem,
    toggleBudgetItemPurchased,
    setMonthlyIncome: (income: number) => updateStateAndSync(p => ({ ...p, monthlyIncome: income })),
    setUserProfile: (profile: UserProfile) => updateStateAndSync(p => ({ ...p, userProfile: profile })),
    setNotificationSettings: (settings: NotificationSettings) => updateStateAndSync(p => ({ ...p, notificationSettings: settings })),
    setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo'>) => updateStateAndSync(p => ({ ...p, themeSettings: settings })),
    setNotepadContent: (content: string) => updateStateAndSync(p => ({ ...p, notepadContent: content })),
    setCurrency: (code: string) => updateStateAndSync(p => ({ ...p, currency: code })),
    setExportFolder: (uri: string, name: string) => updateStateAndSync(p => ({ ...p, exportFolderUri: uri, exportFolderName: name })),
    addUserTheme,
    deleteUserTheme,
    deleteHistoryEntry,
    updateHistoryEntry,
    importData,
    clearData,
    getAppState: () => appState,
    avatarDataUrl,
    setProfileAvatar,
    navGuard,
    setNavGuard,
    pageSwipeLocked,
    setPageSwipeLocked,
    appError,
    setAppError,
  }), [appState, avatarDataUrl, setProfileAvatar, navGuard, setNavGuard, pageSwipeLocked, appError, setAppError, addExpense, deleteExpense, updateExpense]);

  if (!isLoaded) return <LoadingScreen />;

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}
