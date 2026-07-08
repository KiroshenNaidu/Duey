'use client';

import { createContext, ReactNode, useEffect, useState, useMemo, useCallback } from 'react';
import type { AppState, Debt, HistoryEntry, AppData, ThemeSettings, TransportSettings, TransportOverrides, TransportMonthlyOverrides, DayState, UberRide, UserTheme, BudgetPlan, BudgetItem, UserProfile, NotificationSettings, AppError, Expense, ExtraIncome, DayNightSettings } from '@/lib/types';
import { isSameDay, startOfDay, startOfMonth, format, add, endOfMonth } from 'date-fns';
import { idbGet, idbSet, idbDel, setCurrencyCode, genId } from '@/lib/utils';
import { calculateSealedMonthSummary } from '@/lib/calculations';
import { syncDebtReminders } from '@/lib/debtReminders';
import { systemPresets } from '@/lib/systemThemes';
import { DEFAULT_RADIAL_FX_ID } from '@/lib/radialFx';
import { DEFAULT_QUICK_SHORTCUTS, sanitizeShortcuts } from '@/lib/quickShortcuts';
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
    transportMonthlyOverrides: raw.transportMonthlyOverrides ?? {},
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
    dayNight: raw.dayNight ?? { dayThemeId: '', nightThemeId: '', mode: 'night' },
    favouriteThemes: raw.favouriteThemes ?? [],
    hiddenSystemPresets: raw.hiddenSystemPresets ?? [],
    quickAddFxId: raw.quickAddFxId ?? DEFAULT_RADIAL_FX_ID,
    quickAddShortcuts: sanitizeShortcuts(raw.quickAddShortcuts),
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
  transportMonthlyOverrides: {},
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
  dayNight: { dayThemeId: '', nightThemeId: '', mode: 'night' },
  favouriteThemes: [],
  hiddenSystemPresets: [],
  quickAddFxId: DEFAULT_RADIAL_FX_ID,
  quickAddShortcuts: [...DEFAULT_QUICK_SHORTCUTS],
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
  setTransportMonthlyOverride: (monthKey: string, amount: number | null) => void;
  logTransportPayment: (amount: number, month: string) => void;
  addUberRide: (ride: Omit<UberRide, 'id' | 'createdAt'>) => void;
  deleteUberRide: (rideId: string) => void;
  updateUberRide: (rideId: string, data: Partial<Omit<UberRide, 'id' | 'createdAt'>>) => void;
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void;
  deleteExpense: (expenseId: string) => void;
  updateExpense: (expenseId: string, data: Partial<Omit<Expense, 'id' | 'createdAt'>>) => void;
  addExtraIncome: (label: string, amount: number, recurring?: boolean) => void;
  deleteExtraIncome: (id: string) => void;
  restoreExtraIncome: (item: ExtraIncome) => void;
  restoreExpense: (item: Expense) => void;
  restoreHistoryEntry: (entry: HistoryEntry) => void;
  setDayNight: (dayNight: DayNightSettings) => void;
  addBudgetPlan: (name: string, budget: number) => void;
  deleteBudgetPlan: (planId: string) => void;
  updateBudgetPlan: (planId: string, data: { name?: string; budget?: number }) => void;
  addBudgetItem: (planId: string, item: Omit<BudgetItem, 'id' | 'createdAt'>) => void;
  deleteBudgetItem: (planId: string, itemId: string) => void;
  toggleBudgetItemPurchased: (planId: string, itemId: string) => void;
  toggleBudgetPlanConfirmed: (planId: string) => void;
  setMonthlyIncome: (income: number) => void;
  setUserProfile: (profile: UserProfile) => void;
  setNotificationSettings: (settings: NotificationSettings) => void;
  setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo'>) => void;
  setNotepadContent: (content: string) => void;
  addUserTheme: (name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo' | 'backgroundOpacity'>) => void;
  deleteUserTheme: (themeId: string) => void;
  setFavouriteThemes: (ids: string[]) => void;
  setHiddenSystemPresets: (names: string[]) => void;
  setQuickAddFxId: (id: string) => void;
  setQuickAddShortcuts: (ids: string[]) => void;
  importData: (data: AppData) => void;
  deleteHistoryEntry: (entryId: string) => void;
  updateHistoryEntry: (entryId: string, data: Partial<Pick<HistoryEntry, 'label' | 'note' | 'amount' | 'date'>>) => void;
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
  setTransportMonthlyOverride: () => {},
  logTransportPayment: () => {},
  addUberRide: () => {},
  deleteUberRide: () => {},
  updateUberRide: () => {},
  addExpense: () => {},
  deleteExpense: () => {},
  updateExpense: () => {},
  addExtraIncome: () => {},
  deleteExtraIncome: () => {},
  restoreExtraIncome: () => {},
  restoreExpense: () => {},
  restoreHistoryEntry: () => {},
  setDayNight: () => {},
  addBudgetPlan: () => {},
  deleteBudgetPlan: () => {},
  updateBudgetPlan: () => {},
  addBudgetItem: () => {},
  deleteBudgetItem: () => {},
  toggleBudgetItemPurchased: () => {},
  toggleBudgetPlanConfirmed: () => {},
  setMonthlyIncome: () => {},
  setUserProfile: () => {},
  setNotificationSettings: () => {},
  setThemeSettings: () => {},
  setNotepadContent: () => {},
  addUserTheme: () => {},
  deleteUserTheme: () => {},
  setFavouriteThemes: () => {},
  setHiddenSystemPresets: () => {},
  setQuickAddFxId: () => {},
  setQuickAddShortcuts: () => {},
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

  // Keep per-debt due-date reminders in sync with the debt list (native only, best-effort).
  // Debts without a dueDay are simply never scheduled.
  useEffect(() => {
    if (!isLoaded) return;
    void syncDebtReminders(appState.debts);
  }, [isLoaded, appState.debts]);

  useEffect(() => {
    const storedStateRaw = localStorage.getItem('appState');
    if (storedStateRaw) {
      try {
        let loaded = migrateState(JSON.parse(storedStateRaw));

        // Month-end seal — finalize every month that has fully ended since we last sealed,
        // writing one permanent summary per month. The loop catches up multi-month gaps
        // (app not opened for a while), which the old single-month version got wrong.
        // lastSnapshotMonth === '' means fresh install; skip to avoid a noisy first entry.
        const currentMonthKey = format(new Date(), 'yyyy-MM');
        if (loaded.lastSnapshotMonth && loaded.lastSnapshotMonth !== currentMonthKey) {
          const currentMonthStart = startOfMonth(new Date());
          const snapshots: HistoryEntry[] = [];
          // Start at the month AFTER the last sealed one; seal up to (not incl.) the current month.
          let cursor = startOfMonth(add(new Date(`${loaded.lastSnapshotMonth}-01T00:00:00`), { months: 1 }));
          // Safety bound against a corrupt lastSnapshotMonth producing a runaway loop.
          for (let guard = 0; cursor < currentMonthStart && guard < 120; guard++) {
            const mk = format(cursor, 'yyyy-MM');
            const s = calculateSealedMonthSummary(loaded, mk);
            snapshots.push({
              id: genId(),
              debtTitle: `${format(cursor, 'MMMM yyyy')} Summary`,
              date: endOfMonth(cursor).toISOString(),
              amount: Math.abs(s.remaining),
              type: 'snapshot',
              note: `Income: ${Math.round(s.income)} | Outgoings: ${Math.round(s.totalOutgoings)} | ${s.remaining >= 0 ? 'Surplus' : 'Deficit'}: ${Math.round(Math.abs(s.remaining))}`,
              // Persist the exact sealed breakdown so the History detail sheet never drifts
              // once one-time extras/expenses are purged (recompute is only a fallback).
              snapshot: s,
            });
            cursor = add(cursor, { months: 1 });
          }
          loaded = {
            ...loaded,
            history: [...snapshots, ...loaded.history],
            lastSnapshotMonth: currentMonthKey,
          };
        } else if (!loaded.lastSnapshotMonth) {
          // Fresh install — record the month so the next month-turn seals a real summary.
          loaded = { ...loaded, lastSnapshotMonth: currentMonthKey };
        }

        // Auto-purge non-recurring expenses AND one-time extra incomes from previous months.
        // Runs AFTER the seal so sealed summaries still see them. One-time expenses keep
        // their original `expense` history entry as the permanent record; one-time extras
        // were captured in the sealed month's income.
        const firstOfThisMonth = startOfMonth(new Date());
        loaded = {
          ...loaded,
          expenses: loaded.expenses.filter(e => e.recurring || new Date(e.createdAt) >= firstOfThisMonth),
          extraIncomes: (loaded.extraIncomes ?? []).filter(e => e.recurring || new Date(e.createdAt) >= firstOfThisMonth),
        };

        setAppState(loaded);
      } catch (e) {
        console.error("Failed to parse persisted app state", e);
        // Back up the unreadable data so it isn't lost, then start clean — otherwise
        // the same corrupt blob would fail to parse on every launch. The user keeps
        // defaults but can recover the raw backup from storage if needed.
        try {
          localStorage.setItem('appState_corrupt_backup', storedStateRaw);
          localStorage.setItem('appState_corrupt_backup_at', new Date().toISOString());
          localStorage.removeItem('appState');
        } catch {
          // storage write failed too — nothing more we can safely do here
        }
        queueMicrotask(() => setAppError({
          friendly: 'Your saved data could not be read and may be corrupted. The app has reset to a clean state; a backup of the unreadable data was kept on your device.',
          operation: "JSON.parse / migrateState('appState') in AppDataProvider load effect",
          error: e,
          ts: Date.now(),
        }));
      }
    }
    setIsLoaded(true);
    idbGet<string>('profileAvatar')
      .then(v => { if (v) setAvatarDataUrl(v); })
      .catch((err) => { console.error('Failed to load profile avatar', err); });
  }, []);

  // Global safety net for errors that escape React's render tree — async callbacks,
  // event handlers, and unhandled promise rejections. The ErrorBoundary can't catch
  // these, so without this they'd vanish into the console. We surface them through the
  // same ErrorModal, but guard against noise: ignore benign ResizeObserver warnings and
  // don't clobber an error that's already showing.
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = event.message || '';
      // ResizeObserver loop warnings are benign browser noise, not real bugs.
      if (msg.includes('ResizeObserver loop')) return;
      setAppError(prev => prev ?? {
        friendly: 'Something went wrong unexpectedly. The app is still running, but the last action may not have completed.',
        operation: `window 'error' event${event.filename ? ` at ${event.filename}:${event.lineno}` : ''}`,
        error: event.error ?? new Error(msg || 'Unknown error'),
        ts: Date.now(),
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      setAppError(prev => prev ?? {
        friendly: 'A background task failed unexpectedly. Your data is safe, but the last action may not have completed.',
        operation: "window 'unhandledrejection' event",
        error: reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection'),
        ts: Date.now(),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
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
      const newDebt: Debt = { ...debtData, id: genId() };
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
        id: genId(),
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
              id: genId(),
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
          id: genId(),
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
        id: genId(),
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
      history: [{ id: genId(), debtTitle: `Transport: ${month}`, date: new Date().toISOString(), amount, type: 'transport' }, ...prev.history]
    }));
  };

  const deleteHistoryEntry = (entryId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      history: prev.history.filter(h => h.id !== entryId),
    }));
  };

  const updateHistoryEntry = (entryId: string, data: Partial<Pick<HistoryEntry, 'label' | 'note' | 'amount' | 'date'>>) => {
    // Any manual edit flags the entry as edited so the UI can surface a small badge.
    updateStateAndSync(prev => ({
      ...prev,
      history: prev.history.map(h => h.id === entryId ? { ...h, ...data, edited: true } : h),
    }));
  };

  const addUberRide = useCallback((ride: Omit<UberRide, 'id' | 'createdAt'>) => {
    updateStateAndSync(prev => ({
      ...prev,
      uberRides: [...prev.uberRides, { ...ride, id: genId(), createdAt: new Date().toISOString() }],
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
      const newExpense: Expense = { ...expenseData, id: genId(), createdAt: new Date().toISOString() };
      const historyEntry: HistoryEntry = {
        id: genId(),
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

  const addExtraIncome = useCallback((label: string, amount: number, recurring = false) => {
    updateStateAndSync(prev => ({
      ...prev,
      extraIncomes: [...(prev.extraIncomes ?? []), { id: genId(), label, amount, createdAt: new Date().toISOString(), recurring }],
    }));
  }, [updateStateAndSync]);

  const deleteExtraIncome = useCallback((id: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      extraIncomes: (prev.extraIncomes ?? []).filter(e => e.id !== id),
    }));
  }, [updateStateAndSync]);

  // Undo support — reinsert an item exactly as it was before a delete.
  const restoreExtraIncome = useCallback((item: ExtraIncome) => {
    updateStateAndSync(prev => ({
      ...prev,
      extraIncomes: [...(prev.extraIncomes ?? []), item],
    }));
  }, [updateStateAndSync]);

  const restoreExpense = useCallback((item: Expense) => {
    updateStateAndSync(prev => ({
      ...prev,
      expenses: [...prev.expenses, item],
    }));
  }, [updateStateAndSync]);

  const restoreHistoryEntry = useCallback((entry: HistoryEntry) => {
    updateStateAndSync(prev => ({
      ...prev,
      history: [entry, ...prev.history],
    }));
  }, [updateStateAndSync]);

  const addBudgetPlan = useCallback((name: string, budget: number) => {
    updateStateAndSync(prev => {
      const newPlan = { id: genId(), name, budget, items: [], createdAt: new Date().toISOString() };
      const historyEntry: HistoryEntry = {
        id: genId(),
        debtTitle: `Budget: ${name}`,
        date: new Date().toISOString(),
        amount: budget,
        type: 'budget',
        note: 'Plan created',
      };
      return {
        ...prev,
        budgetPlans: [...prev.budgetPlans, newPlan],
        history: [historyEntry, ...prev.history],
      };
    });
  }, [updateStateAndSync]);

  const deleteBudgetPlan = useCallback((planId: string) => {
    updateStateAndSync(prev => {
      const plan = prev.budgetPlans.find(p => p.id === planId);
      const historyEntry: HistoryEntry | null = plan ? {
        id: genId(),
        debtTitle: `Budget: ${plan.name}`,
        date: new Date().toISOString(),
        amount: plan.items.reduce((s, i) => s + i.price, 0),
        type: 'budget',
        note: 'Plan deleted',
      } : null;
      return {
        ...prev,
        budgetPlans: prev.budgetPlans.filter(p => p.id !== planId),
        history: historyEntry ? [historyEntry, ...prev.history] : prev.history,
      };
    });
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
          ? { ...p, items: [...p.items, { ...item, id: genId(), createdAt: new Date().toISOString() }] }
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

  // Confirm/unconfirm a plan's purchase. Confirming stamps `confirmedAt` to now so the plan's
  // spent total counts toward that month's balance; unconfirming clears it and removes it again.
  const toggleBudgetPlanConfirmed = (planId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: prev.budgetPlans.map(p => {
        if (p.id !== planId) return p;
        const confirmed = !p.confirmed;
        return { ...p, confirmed, confirmedAt: confirmed ? new Date().toISOString() : undefined };
      }),
    }));
  };

  const addUserTheme = useCallback((name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo' | 'backgroundOpacity'>) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: [...prev.userThemes, { id: genId(), name, settings }]
    }));
  }, [updateStateAndSync]);

  const deleteUserTheme = useCallback((themeId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: prev.userThemes.filter(t => t.id !== themeId),
      // A deleted theme can't stay a favourite (it feeds the Day/Night quick-switch).
      favouriteThemes: (prev.favouriteThemes ?? []).filter(id => id !== themeId),
    }));
  }, [updateStateAndSync]);

  // Bulk setters — the Theme editor drafts favourites + hidden presets locally and commits
  // the whole arrays on Save (never auto-apply), matching the theme's save/cancel contract.
  const setFavouriteThemes = useCallback((ids: string[]) => {
    updateStateAndSync(prev => ({ ...prev, favouriteThemes: [...new Set(ids)] }));
  }, [updateStateAndSync]);

  const setHiddenSystemPresets = useCallback((names: string[]) => {
    updateStateAndSync(prev => {
      // Guard: at least one system preset must always remain visible.
      const clamped = [...new Set(names)].slice(0, Math.max(0, systemPresets.length - 1));
      return {
        ...prev,
        hiddenSystemPresets: clamped,
        // A hidden preset can't stay a favourite (it feeds the Day/Night quick-switch).
        favouriteThemes: (prev.favouriteThemes ?? []).filter(id => !clamped.includes(id.replace(/^preset:/, ''))),
      };
    });
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
          id: genId(),
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
    // Persist (or clear, when amount === null) the per-month flat-fee override so it
    // survives navigating between months. Takes priority over transportSettings.monthlyFee.
    setTransportMonthlyOverride: (monthKey: string, amount: number | null) => updateStateAndSync(p => {
      const next: TransportMonthlyOverrides = { ...p.transportMonthlyOverrides };
      if (amount === null) delete next[monthKey];
      else next[monthKey] = amount;
      return { ...p, transportMonthlyOverrides: next };
    }),
    logTransportPayment,
    addUberRide,
    deleteUberRide,
    updateUberRide,
    addExpense,
    deleteExpense,
    updateExpense,
    addExtraIncome,
    deleteExtraIncome,
    restoreExtraIncome,
    restoreExpense,
    restoreHistoryEntry,
    setDayNight: (dayNight: DayNightSettings) => updateStateAndSync(p => ({ ...p, dayNight })),
    addBudgetPlan,
    deleteBudgetPlan,
    updateBudgetPlan,
    addBudgetItem,
    deleteBudgetItem,
    toggleBudgetItemPurchased,
    toggleBudgetPlanConfirmed,
    setMonthlyIncome: (income: number) => updateStateAndSync(p => ({ ...p, monthlyIncome: income })),
    setUserProfile: (profile: UserProfile) => updateStateAndSync(p => ({ ...p, userProfile: profile })),
    setNotificationSettings: (settings: NotificationSettings) => updateStateAndSync(p => ({ ...p, notificationSettings: settings })),
    setThemeSettings: (settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo'>) => updateStateAndSync(p => ({ ...p, themeSettings: settings })),
    setNotepadContent: (content: string) => updateStateAndSync(p => ({ ...p, notepadContent: content })),
    setCurrency: (code: string) => updateStateAndSync(p => ({ ...p, currency: code })),
    setExportFolder: (uri: string, name: string) => updateStateAndSync(p => ({ ...p, exportFolderUri: uri, exportFolderName: name })),
    addUserTheme,
    deleteUserTheme,
    setFavouriteThemes,
    setHiddenSystemPresets,
    setQuickAddFxId: (id: string) => updateStateAndSync(p => ({ ...p, quickAddFxId: id })),
    // sanitize enforces known ids, dedupe, and the 1–7 count bounds.
    setQuickAddShortcuts: (ids: string[]) => updateStateAndSync(p => ({ ...p, quickAddShortcuts: sanitizeShortcuts(ids) })),
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
