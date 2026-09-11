'use client';

import { createContext, ReactNode, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { AppState, Debt, HistoryEntry, AppData, ThemeSettings, TransportSettings, TransportOverrides, TransportMonthlyOverrides, DayState, UberRide, UserTheme, BudgetPlan, BudgetItem, UserProfile, NotificationSettings, AppError, Expense, ExtraIncome, DayNightSettings, SavingEntry, Loan, LoanEvent, Piggybank, RecurringSaving } from '@/lib/types';
import { isSameDay, startOfDay, format, add } from 'date-fns';
import { idbGet, idbSet, idbDel, setCurrencyCode, genId } from '@/lib/utils';
import { calculateSealedCycleSummary, cycleKey, cycleStartFromKey, getPayCycle, nextCycleStart, normalizePayDay, dayKey, legacyUtcDayKey } from '@/lib/calculations';
import { syncDebtReminders } from '@/lib/debtReminders';
import { systemPresets } from '@/lib/systemThemes';
import { DEFAULT_RADIAL_FX_ID, RADIAL_FX_PRESETS } from '@/lib/radialFx';
import { DEFAULT_HAPTIC_STRENGTH, setHapticStrength, type HapticStrength } from '@/lib/haptics';
import { DEFAULT_QUICK_SHORTCUTS, sanitizeShortcuts } from '@/lib/quickShortcuts';
import { personKey, debtPersonName, entryPersonName, PERSON_ENTRY_TYPES } from '@/lib/persons';
import { LoadingScreen } from '@/components/LoadingScreen';
import {
  DEFAULT_BANK_ID, LEFTOVERS_BANK_ID, bankBalance, defaultPiggybanks, leftoversBankId,
  materialiseRecurring,
} from '@/lib/piggybanks';

const CURRENT_SCHEMA_VERSION = 10;

/**
 * v10: savings gained piggybanks. Every pre-v10 entry was a deposit into one undifferentiated
 * pile, so the migration creates the two default jars and files the old entries by source:
 * swept leftovers into "Leftovers", everything put away by hand into "Savings".
 *
 * v9: day keys moved from UTC-derived (`toISOString`) to LOCAL 'yyyy-MM-dd'
 * (see `dayKey` in lib/calculations.ts for why).
 *
 * For every stored key we recover the calendar day it was WRITTEN for and re-key it.
 * Under the old scheme a local day D was stored as the UTC date of D's local midnight,
 * so the original day is whichever of {K, K+1} reproduces K when run back through the
 * old derivation. Resolving it per key (rather than applying one blanket offset) means
 * a timezone that straddles UTC — the UK, where the offset is 0 in winter and −60 in
 * summer — migrates each date with the offset that was actually in force on it.
 *
 * Timezones at or west of UTC never shifted, so their keys resolve to themselves and
 * this is a no-op. Anything that resolves to neither candidate (a hand-edited backup,
 * a key that was already local) is left exactly as-is.
 */
function migrateDayKey(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const [, y, mo, d] = m;
  const asLocal = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(asLocal.getTime())) return key;
  if (legacyUtcDayKey(asLocal) === key) return key;              // west of / at UTC — unchanged
  const nextDay = add(asLocal, { days: 1 });
  if (legacyUtcDayKey(nextDay) === key) return dayKey(nextDay);  // east of UTC — shift forward
  return key;
}

/** Re-key whichever day-keyed collections are PRESENT. Absent ones stay absent so a
 *  partial payload (the config-only import) is never given empty ones to spread over
 *  the real data already in state. NOT idempotent — always gate on the schema version. */
function migrateDayKeys<T extends { transportOverrides?: TransportOverrides; uberRides?: UberRide[] }>(payload: T): T {
  const next = { ...payload };
  if (payload.transportOverrides) {
    const overrides: TransportOverrides = {};
    for (const [k, v] of Object.entries(payload.transportOverrides)) overrides[migrateDayKey(k)] = v;
    next.transportOverrides = overrides;
  }
  if (payload.uberRides) {
    next.uberRides = payload.uberRides.map(r => ({ ...r, date: migrateDayKey(r.date) }));
  }
  return next;
}

// How long to coalesce rapid state changes into a single localStorage write. Long enough to
// absorb a burst (tapping calendar days, toggling budget items, notepad autosave) into one
// serialize; short enough that a lone change is durable almost immediately. A background/
// unload flush (see the persistence effects) guarantees nothing buffered here is ever lost.
const PERSIST_DEBOUNCE_MS = 500;

// Settings that no longer exist: the UI Style picker (only Solid was ever implemented —
// Minimal and Elevated had no styles at all, and Glass fought every other setting) with its
// glass-transparency slider, and the page-transition preset. Stripped on load so they leave
// saved state and JSON backups instead of riding along forever as dead keys.
const dropRemovedThemeFields = <T,>(settings: T): T => {
  const { uiStyle, glassOpacity, ...rest } = settings as T & { uiStyle?: unknown; glassOpacity?: unknown };
  return rest as T;
};

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
  // v9 day-key re-keying, applied ONCE (gated on the stored schema version) — running it
  // twice would shift every date a second day forward.
  const needsDayKeyMigration = (raw.schemaVersion ?? 0) < 9;
  const dayKeyed = needsDayKeyMigration
    ? migrateDayKeys({ transportOverrides: overrides, uberRides: raw.uberRides ?? [] })
    : { transportOverrides: overrides, uberRides: raw.uberRides ?? [] };

  // Existing users who already have data default to ZAR so they don't see the picker.
  const currency = raw.currency ?? ((raw.debts?.length ?? 0) > 0 || (raw.history?.length ?? 0) > 0 ? 'ZAR' : '');

  // pageTransitionId is pulled out of the spread rather than deleted after it: the field
  // is gone from AppState, so it can only leave here.
  const { pageTransitionId: _removedPageTransition, ...rest } = raw as AppState & { pageTransitionId?: string };

  return {
    ...rest,
    currency,
    // The tour fires once, right after the currency picker. Anyone who ALREADY answered
    // that picker is mid-flight in the app and must not be interrupted by it on upgrade —
    // they get it from Profile -> "How to use Duey" if they want it.
    tutorialSeen: raw.tutorialSeen ?? currency !== '',
    transportSettings,
    transportOverrides: dayKeyed.transportOverrides,
    transportMonthlyOverrides: raw.transportMonthlyOverrides ?? {},
    uberRides: dayKeyed.uberRides,
    expenses: raw.expenses ?? [],
    extraIncomes: raw.extraIncomes ?? [],
    budgetPlans: raw.budgetPlans ?? [],
    // Jars, and the entries filed into them. A backup from before piggybanks existed has
    // neither, so it gets the defaults and its entries are sorted by how they arrived.
    ...reconcilePiggybanks(raw),
    // Backups written before the lending ledger existed simply have none.
    loans: (raw.loans ?? []).map(l => ({ ...l, events: l.events ?? [] })),
    monthlyIncome: raw.monthlyIncome ?? 0,
    userProfile: raw.userProfile
      ? { name: raw.userProfile.name ?? '', paydayDay: raw.userProfile.paydayDay ?? 26, bio: raw.userProfile.bio ?? '' }
      : { name: '', paydayDay: 26, bio: '' },
    notificationSettings: raw.notificationSettings
      // masterEnabled migration: pre-master installs could only have granted notification
      // permission by enabling the monthly reminder, so inherit `enabled` as the default.
      ? { masterEnabled: raw.notificationSettings.masterEnabled ?? raw.notificationSettings.enabled ?? false, enabled: raw.notificationSettings.enabled ?? false, paydayDay: raw.notificationSettings.paydayDay ?? 26, hour: raw.notificationSettings.hour ?? 18, minute: raw.notificationSettings.minute ?? 0, message: raw.notificationSettings.message ?? 'Time to log your monthly payments.' }
      : { masterEnabled: false, enabled: false, paydayDay: 26, hour: 18, minute: 0, message: 'Time to log your monthly payments.' },
    userThemes: (raw.userThemes ?? []).map(t => ({ ...t, settings: dropRemovedThemeFields(t.settings) })),
    themeSettings: raw.themeSettings
      ? { ...dropRemovedThemeFields(raw.themeSettings), useSafeAreaInsets: true, bgX: raw.themeSettings.bgX ?? 50, bgY: raw.themeSettings.bgY ?? 50, bgScale: raw.themeSettings.bgScale ?? 1, backgroundBlur: raw.themeSettings.backgroundBlur ?? 0 }
      : defaultState.themeSettings,
    exportFolderUri: raw.exportFolderUri ?? '',
    exportFolderName: raw.exportFolderName ?? '',
    lastSnapshotMonth: raw.lastSnapshotMonth ?? '',
    dayNight: raw.dayNight ?? { dayThemeId: '', nightThemeId: '', mode: 'night' },
    favouriteThemes: raw.favouriteThemes ?? [],
    hiddenSystemPresets: raw.hiddenSystemPresets ?? [],
    // A stored id can name an effect that no longer exists (Magnetic and Elastic were
    // removed): fall back rather than leaving the picker with nothing selected.
    quickAddFxId: RADIAL_FX_PRESETS.some(p => p.id === raw.quickAddFxId) ? raw.quickAddFxId : DEFAULT_RADIAL_FX_ID,
    quickAddShortcuts: sanitizeShortcuts(raw.quickAddShortcuts),
    swipeActionsEnabled: raw.swipeActionsEnabled ?? true,
    hapticsStrength: raw.hapticsStrength ?? DEFAULT_HAPTIC_STRENGTH,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * Guarantees the savings state is coherent however it arrived — a fresh install, a v9
 * backup with no jars at all, or a hand-edited file with jars but no sweep target.
 *
 * Two invariants, both of which cost money if broken:
 *   • The two default jars always exist. The sweep has to have somewhere to put a surplus,
 *     and by-hand saving has to have a default target.
 *   • Every entry names a jar that exists. An entry pointing at a deleted or absent jar is
 *     money that counts toward the total but appears on no card — invisible, and impossible
 *     to spend or correct. Those are re-homed to the default jar rather than dropped.
 */
function reconcilePiggybanks(raw: Partial<AppState>): Pick<AppState, 'piggybanks' | 'recurringSavings' | 'savings'> {
  const stamp = new Date().toISOString();
  const banks = [...(raw.piggybanks ?? [])];
  for (const fallback of defaultPiggybanks(stamp)) {
    const exists = fallback.isLeftovers
      ? banks.some(b => b.isLeftovers || b.id === fallback.id)
      : banks.some(b => b.id === fallback.id);
    if (!exists) banks.push(fallback);
  }
  const known = new Set(banks.map(b => b.id));
  const sweepId = leftoversBankId(banks);

  const savings = (raw.savings ?? []).map(v => {
    const claimed = v.bankId ?? (v.source === 'auto' ? sweepId : DEFAULT_BANK_ID);
    return {
      ...v,
      direction: v.direction ?? ('in' as const),
      bankId: known.has(claimed) ? claimed : DEFAULT_BANK_ID,
    };
  });
  // Same for standing orders: one pointing nowhere would charge every cycle forever with
  // no card to switch it off from.
  const recurringSavings = (raw.recurringSavings ?? [])
    .map(r => ({ ...r, bankId: known.has(r.bankId) ? r.bankId : DEFAULT_BANK_ID }));

  return { piggybanks: banks, recurringSavings, savings };
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
  savings: [],
  piggybanks: defaultPiggybanks(new Date(0).toISOString()),
  recurringSavings: [],
  loans: [],
  userProfile: { name: '', paydayDay: 26, bio: '' },
  notificationSettings: { masterEnabled: false, enabled: false, paydayDay: 26, hour: 18, minute: 0, message: 'Time to log your monthly payments.' },
  // Default theme = the "System Rec" preset (deep slate-indigo base, violet primary, mint
  // accent). Keep these color values in sync with the 'System Rec' entry in systemThemes.ts
  // and the :root fallback in globals.css.
  themeSettings: {
    background: '230 18% 6%',
    surface: '230 14% 10%',
    primary: '252 84% 72%',
    accent: '168 62% 56%',
    font: 'Inter',
    foreground: '228 14% 96%',
    accentForeground: '230 8% 63%',
    backgroundOpacity: 0.5,
    uiScale: 1.0,
    useSafeAreaInsets: true,
    bgX: 50,
    bgY: 50,
    bgScale: 1,
    backgroundBlur: 0,
    positive: '158 55% 56%',
    negative: '354 72% 62%',
    catTransport: '213 90% 68%',
    catBudget: '340 68% 64%',
    catExpense: '25 92% 60%',
    catCompletion: '43 96% 70%',
    catEmployment: '168 62% 56%',
    catSnapshot: '199 89% 66%',
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
  swipeActionsEnabled: true,
  hapticsStrength: DEFAULT_HAPTIC_STRENGTH,
  tutorialSeen: false,
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
  // Rename a person everywhere at once: every active debt owed to them AND every debt-history
  // entry (creation/payment/completion) tied to them. `fromKey` is a canonical personKey().
  renamePerson: (fromKey: string, newName: string) => void;
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
  /** One savings movement. `cycleKey` files it against a pay cycle; `direction` says whether
   *  money went in or came back out. Writes the History record too. */
  addSaving: (amount: number, cycleKey: string, label: string, note?: string, bankId?: string, direction?: 'in' | 'out') => void;
  /** Opens a jar and returns its id, so a caller can file the first deposit straight into it. */
  addPiggybank: (name: string, target?: number, note?: string) => string;
  updatePiggybank: (id: string, data: Partial<Omit<Piggybank, 'id' | 'createdAt'>>) => void;
  /** Closes a jar, taking its entries and standing orders with it. Returns everything
   *  removed so an undo can put it all back. The leftovers jar refuses to close. */
  deletePiggybank: (id: string) => { bank?: Piggybank; entries: SavingEntry[]; orders: RecurringSaving[] };
  restorePiggybank: (restore: { bank?: Piggybank; entries: SavingEntry[]; orders: RecurringSaving[] }) => void;
  addRecurringSaving: (bankId: string, amount: number, label: string) => void;
  setRecurringSavingActive: (id: string, active: boolean) => void;
  deleteRecurringSaving: (id: string) => void;
  /** Open a loan: one person, one first 'lent' event. Everything after is addLoanEvent. */
  addLoan: (person: string, amount: number, opts?: { reason?: string; date?: string; dueDate?: string; note?: string }) => void;
  updateLoan: (loanId: string, data: Partial<Pick<Loan, 'person' | 'reason' | 'dueDate' | 'note'>>) => void;
  deleteLoan: (loanId: string) => void;
  restoreLoan: (loan: Loan) => void;
  addLoanEvent: (loanId: string, event: { type: LoanEvent['type']; amount: number; date: string; note?: string }) => void;
  deleteLoanEvent: (loanId: string, eventId: string) => void;
  restoreLoanEvent: (loanId: string, event: LoanEvent) => void;
  /** Close a loan by hand (written off / settled off-app), or reopen it. */
  setLoanSettled: (loanId: string, settled: boolean) => void;
  updateSaving: (id: string, data: Partial<Pick<SavingEntry, 'amount' | 'label' | 'note' | 'cycleKey'>>) => void;
  deleteSaving: (id: string) => void;
  restoreSaving: (item: SavingEntry) => void;
  restoreExpense: (item: Expense) => void;
  restoreHistoryEntry: (entry: HistoryEntry) => void;
  // Undo counterparts for the destructive actions above/below — see the implementations
  // for exactly what each puts back.
  restoreDebt: (debt: Debt, entries: HistoryEntry[]) => void;
  unarchiveDebt: (debt: Debt) => void;
  restoreUberRide: (ride: UberRide) => void;
  restoreBudgetPlan: (plan: BudgetPlan) => void;
  unarchiveBudgetPlan: (planId: string, planName: string) => void;
  restoreBudgetItem: (planId: string, item: BudgetItem) => void;
  restoreUserTheme: (theme: UserTheme, favourite: boolean) => void;
  setDayNight: (dayNight: DayNightSettings) => void;
  addBudgetPlan: (name: string, budget: number) => void;
  deleteBudgetPlan: (planId: string) => void;
  archiveBudgetPlan: (planId: string) => void;
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
  setSwipeActionsEnabled: (on: boolean) => void;
  setHapticsStrength: (s: HapticStrength) => void;
  setTutorialSeen: (seen: boolean) => void;
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
  renamePerson: () => {},
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
  addSaving: () => {},
  addPiggybank: () => '',
  updatePiggybank: () => {},
  deletePiggybank: () => ({ entries: [], orders: [] }),
  restorePiggybank: () => {},
  addRecurringSaving: () => {},
  setRecurringSavingActive: () => {},
  deleteRecurringSaving: () => {},
  addLoan: () => {},
  updateLoan: () => {},
  deleteLoan: () => {},
  restoreLoan: () => {},
  addLoanEvent: () => {},
  deleteLoanEvent: () => {},
  restoreLoanEvent: () => {},
  setLoanSettled: () => {},
  updateSaving: () => {},
  deleteSaving: () => {},
  restoreSaving: () => {},
  restoreExpense: () => {},
  restoreHistoryEntry: () => {},
  restoreDebt: () => {},
  unarchiveDebt: () => {},
  restoreUberRide: () => {},
  restoreBudgetPlan: () => {},
  unarchiveBudgetPlan: () => {},
  restoreBudgetItem: () => {},
  restoreUserTheme: () => {},
  setDayNight: () => {},
  addBudgetPlan: () => {},
  deleteBudgetPlan: () => {},
  archiveBudgetPlan: () => {},
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
  setSwipeActionsEnabled: () => {},
  setHapticsStrength: () => {},
  setTutorialSeen: () => {},
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

  // Keep the module-level haptic strength in sync so hapticTick/hapticTap read the saved
  // setting without needing context access from lib code.
  useEffect(() => { setHapticStrength(appState.hapticsStrength); }, [appState.hapticsStrength]);

  // Keep per-debt due-date reminders in sync with the debt list (native only, best-effort).
  // Debts without a dueDay are simply never scheduled; fully-paid debts stop reminding
  // (history dep re-syncs after every payment). The Notifications master switch gates the
  // whole feature — turning it off cancels every pending debt reminder.
  useEffect(() => {
    if (!isLoaded) return;
    void syncDebtReminders(appState.debts, appState.history, appState.notificationSettings.masterEnabled);
  }, [isLoaded, appState.debts, appState.history, appState.notificationSettings.masterEnabled]);

  useEffect(() => {
    const storedStateRaw = localStorage.getItem('appState');
    if (storedStateRaw) {
      try {
        let loaded = migrateState(JSON.parse(storedStateRaw));

        // Pay-cycle seal — finalize every cycle that has fully ended since we last sealed,
        // writing one permanent summary per cycle. A cycle runs pay date → day before the
        // next pay date (Settings → Pay Date; payDay 1 is the calendar month this used to
        // be, unchanged). The loop catches up multi-cycle gaps (app not opened for a while).
        // lastSnapshotMonth === '' means fresh install; skip to avoid a noisy first entry.
        const payDay = normalizePayDay(loaded.userProfile.paydayDay);
        const currentCycle = getPayCycle(payDay);
        if (loaded.lastSnapshotMonth && loaded.lastSnapshotMonth !== currentCycle.key) {
          const snapshots: HistoryEntry[] = [];
          // Whatever a cycle ends with becomes savings — the money survived the cycle, so
          // it is money you kept. Written here, alongside the summary, so the two can never
          // disagree about what was left. Only a SURPLUS sweeps: a deficit is a debt to the
          // next cycle, not a negative deposit. One entry per cycle, guarded below.
          const sweeps: SavingEntry[] = [];
          // Standing orders become real rows as each cycle seals — see materialiseRecurring.
          // Accumulated here and fed into every later summary, so a cycle's figures include
          // the contributions it was actually charged.
          const contributions: SavingEntry[] = [];
          const sweepBankId = leftoversBankId(loaded.piggybanks);
          // Start AT the last recorded cycle, not after it: lastSnapshotMonth stores the
          // cycle that was LIVE when we last looked, so that cycle is the first one that
          // can have ended since. (Starting one past it — as this used to — meant a cycle
          // was only ever sealed if the app went unopened for longer than one whole cycle.)
          // Re-sealing is impossible regardless: an already-written summary is skipped by
          // title below, which also protects against a stale/hand-edited key.
          let cursor = cycleStartFromKey(loaded.lastSnapshotMonth, payDay);
          // Safety bound against a corrupt lastSnapshotMonth producing a runaway loop.
          for (let guard = 0; cursor < currentCycle.start && guard < 120; guard++) {
            const start = cursor;
            const end = nextCycleStart(start, payDay);
            cursor = end;
            const lastDay = add(end, { days: -1 });
            const title = `${payDay === 1
              ? format(start, 'MMMM yyyy')
              : `${format(start, 'd MMM')} – ${format(lastDay, 'd MMM yyyy')}`} Summary`;
            if (loaded.history.some(h => h.type === 'snapshot' && h.debtTitle === title)) continue;
            const cycleK = format(start, 'yyyy-MM');
            // Charge the cycle its standing orders BEFORE summarising it, so the summary and
            // the jar agree about what went in.
            contributions.push(...materialiseRecurring(
              loaded.recurringSavings,
              [...contributions, ...(loaded.savings ?? [])],
              cycleK,
              genId,
              lastDay.toISOString(),
            ));
            const savingsSoFar = [...contributions, ...(loaded.savings ?? [])];
            const s = calculateSealedCycleSummary({ ...loaded, savings: savingsSoFar, payDay }, cycleK);
            // Sweep the leftover. Guarded against an entry that already exists for this
            // cycle (a hand-edited key, a restored backup), so a relaunch can never bank
            // the same surplus twice.
            if (s.remaining > 0 && !savingsSoFar.some(v => v.source === 'auto' && v.cycleKey === cycleK)) {
              sweeps.push({
                id: genId(),
                amount: s.remaining,
                cycleKey: cycleK,
                label: 'Leftover',
                note: `Left at the end of ${payDay === 1 ? format(start, 'MMMM yyyy') : `${format(start, 'd MMM')} – ${format(lastDay, 'd MMM yyyy')}`}`,
                source: 'auto',
                direction: 'in',
                bankId: sweepBankId,
                createdAt: lastDay.toISOString(),
              });
            }
            snapshots.push({
              id: genId(),
              debtTitle: title,
              // Dated to the cycle's LAST day, so History files it under the month the
              // cycle ended in and the breakdown sheet can recover the cycle from it.
              date: lastDay.toISOString(),
              amount: Math.abs(s.remaining),
              type: 'snapshot',
              note: `Income: ${Math.round(s.income)} | Outgoings: ${Math.round(s.totalOutgoings)} | ${s.remaining >= 0 ? 'Surplus' : 'Deficit'}: ${Math.round(Math.abs(s.remaining))}`,
              // Persist the exact sealed breakdown so the History detail sheet never drifts
              // once one-time extras/expenses are purged (recompute is only a fallback).
              snapshot: s,
            });
          }
          loaded = {
            ...loaded,
            history: [...snapshots, ...loaded.history],
            savings: [...sweeps, ...contributions, ...(loaded.savings ?? [])],
            lastSnapshotMonth: currentCycle.key,
          };
        } else if (!loaded.lastSnapshotMonth) {
          // Fresh install — record the cycle so the next pay date seals a real summary.
          loaded = { ...loaded, lastSnapshotMonth: currentCycle.key };
        }

        // Auto-purge non-recurring expenses AND one-time extra incomes from previous cycles
        // — this is the "reset", and it now happens on the pay date rather than the 1st.
        // Runs AFTER the seal so sealed summaries still see them. One-time expenses keep
        // their original `expense` history entry as the permanent record; one-time extras
        // were captured in the sealed cycle's income.
        loaded = {
          ...loaded,
          expenses: loaded.expenses.filter(e => e.recurring || new Date(e.createdAt) >= currentCycle.start),
          extraIncomes: (loaded.extraIncomes ?? []).filter(e => e.recurring || new Date(e.createdAt) >= currentCycle.start),
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

  // ── Persistence ──
  // Serializing the whole app state and writing it to localStorage is a synchronous,
  // main-thread cost. Doing it INSIDE every setState updater (the old design) re-serialized
  // the ENTIRE state once per mutation, so a burst of rapid changes stuttered in proportion
  // to how much data the user had. Now mutations only touch memory (the UI stays instant)
  // and the write is COALESCED: one debounced write, forced out the moment the app is
  // backgrounded or unloaded — the only instants the bytes actually have to be on disk.
  const stateRef = useRef(appState);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearedRef = useRef(false); // set by clearData so a teardown flush can't resurrect wiped data
  const loadedRef = useRef(false);  // false until real data is loaded — blocks a background flush
                                    // that would otherwise write empty defaults over stored data

  const persistNow = useCallback(() => {
    clearTimeout(writeTimerRef.current);
    writeTimerRef.current = undefined;
    if (clearedRef.current || !loadedRef.current) return;
    try {
      localStorage.setItem('appState', JSON.stringify(stateRef.current));
    } catch (err) {
      setAppError({
        friendly: 'Could not save — your device storage may be full. Some changes may be lost after refresh.',
        operation: "localStorage.setItem('appState') in persistNow",
        error: err,
        ts: Date.now(),
      });
    }
  }, [setAppError]);

  const updateStateAndSync = useCallback((updater: (prev: AppState) => AppState) => {
    setAppState(updater);
  }, []);

  // Mirror the latest state into a ref and (re)arm the debounced write on every change.
  // Gated on isLoaded so the initial default state can't overwrite real data before it
  // loads — but the migrated/sealed state produced AT load IS persisted, which closes an
  // old latent bug: a month-end seal computed on open used to be lost if the app closed
  // before the next mutation, so it re-sealed (and duplicated the summary) next launch.
  useEffect(() => {
    stateRef.current = appState;
    if (!isLoaded) return;
    loadedRef.current = true;
    clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
  }, [appState, isLoaded, persistNow]);

  // Force any buffered write out the instant the app is hidden or torn down. On Android the
  // 'hidden' visibility change is the dependable "user left" signal (home button, app
  // switcher, screen off), so changes survive even if the OS later kills the backgrounded
  // process; 'pagehide' covers reloads (config import, JSON editor) and web tab close.
  useEffect(() => {
    const flushIfHidden = () => { if (document.visibilityState === 'hidden') persistNow(); };
    window.addEventListener('pagehide', persistNow);
    document.addEventListener('visibilitychange', flushIfHidden);
    return () => {
      window.removeEventListener('pagehide', persistNow);
      document.removeEventListener('visibilitychange', flushIfHidden);
    };
  }, [persistNow]);

  const addDebt = useCallback((debtData: Omit<Debt, 'id'>) => {
    updateStateAndSync(prev => {
      // Normalize person on creation: trimmed, and never stored as an empty string.
      const person = debtData.person?.trim() || undefined;
      const newDebt: Debt = { ...debtData, person, id: genId() };
      const newHistoryEntry: HistoryEntry = {
        id: `${newDebt.id}-created`,
        debtId: newDebt.id,
        debtTitle: newDebt.title,
        person,
        date: new Date().toISOString(),
        amount: newDebt.total_owed,
        type: 'creation',
      };
      return { ...prev, debts: [...prev.debts, newDebt], history: [newHistoryEntry, ...prev.history] };
    });
  }, [updateStateAndSync]);

  const updateDebt = useCallback((debtId: string, updatedData: Partial<Omit<Debt, 'id'>>) => {
    updateStateAndSync(prev => {
      // Person is one fact about the debt — when it changes, restamp the debt's existing
      // history entries too so past payments never show a stale "who".
      const personChanged = 'person' in updatedData;
      const person = personChanged ? (updatedData.person?.trim() || undefined) : undefined;
      return {
        ...prev,
        debts: prev.debts.map(d => (d.id === debtId ? { ...d, ...updatedData, ...(personChanged && { person }) } : d)),
        history: personChanged
          ? prev.history.map(h => (h.debtId === debtId ? { ...h, person } : h))
          : prev.history,
      };
    });
  }, [updateStateAndSync]);

  const deleteDebt = useCallback((debtId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      debts: prev.debts.filter(debt => debt.id !== debtId),
      history: prev.history.filter(h => h.debtId !== debtId),
    }));
  }, [updateStateAndSync]);

  // Rename a person across the whole dataset. Identity is the canonical personKey, so this
  // catches case/whitespace variants too. We first resolve which debtIds belong to the person
  // (from both active debts and their creation entries) so that debt-history entries written
  // under an OLD title before a prior rename still get swept along via their debtId — keeping
  // the debts list, the History log, and the Add-Debt suggestions perfectly in sync.
  const renamePerson = useCallback((fromKey: string, rawNewName: string) => {
    const newName = rawNewName.trim();
    if (!newName || !fromKey) return;
    updateStateAndSync(prev => {
      const targetDebtIds = new Set<string>();
      for (const d of prev.debts) if (personKey(debtPersonName(d)) === fromKey) targetDebtIds.add(d.id);
      for (const h of prev.history) {
        if (h.type === 'creation' && h.debtId && personKey(entryPersonName(h)) === fromKey) targetDebtIds.add(h.debtId);
      }

      // Rename whichever field carries the identity: the explicit person when set, else the
      // title (legacy debts where the title IS the person).
      const debts = prev.debts.map(d => {
        if (personKey(debtPersonName(d)) !== fromKey) return d;
        return d.person?.trim() ? { ...d, person: newName } : { ...d, title: newName };
      });
      const history = prev.history.map(h => {
        if (!PERSON_ENTRY_TYPES.includes(h.type)) return h; // never touch transport/expense/etc.
        const belongs = (h.debtId != null && targetDebtIds.has(h.debtId)) || personKey(entryPersonName(h)) === fromKey;
        if (!belongs) return h;
        return h.person?.trim() ? { ...h, person: newName } : { ...h, debtTitle: newName };
      });

      return { ...prev, debts, history };
    });
  }, [updateStateAndSync]);

  const completeDebt = useCallback((debtId: string) => {
    updateStateAndSync(prev => {
      const debt = prev.debts.find(d => d.id === debtId);
      if (!debt) return prev;
      const completionEntry: HistoryEntry = {
        id: genId(),
        debtId: debt.id,
        debtTitle: debt.title,
        person: debt.person,
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
              person: debt.person,
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
          person: debt.person,
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
        person: debt.person,
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

  // ── Savings ──────────────────────────────────────────────────────────────────
  // Leftovers arrive on their own from the seal (see the load effect); these are the
  // by-hand entries and the edits/removals for either kind.
  /** One movement, in or out, plus the History record of it. Both directions go through
   *  here so the ledger row and the history entry can never describe different things. */
  const addSaving = useCallback((
    amount: number,
    cycleKey: string,
    label: string,
    note?: string,
    bankId: string = DEFAULT_BANK_ID,
    direction: 'in' | 'out' = 'in',
  ) => {
    updateStateAndSync(prev => {
      const bank = (prev.piggybanks ?? []).find(b => b.id === bankId);
      const entry: SavingEntry = {
        id: genId(), amount, cycleKey, label, note, source: 'manual', direction, bankId,
        createdAt: new Date().toISOString(),
      };
      const record: HistoryEntry = {
        id: genId(),
        debtTitle: `${bank?.name ?? 'Savings'}: ${label}`,
        date: entry.createdAt,
        amount,
        type: 'savings',
        label: direction === 'out' ? 'Taken out' : 'Put away',
        note,
      };
      return { ...prev, savings: [entry, ...(prev.savings ?? [])], history: [record, ...prev.history] };
    });
  }, [updateStateAndSync]);

  // ── Piggybanks ───────────────────────────────────────────────────────────────
  // Jars are just names and goals; every figure they show is derived from the entries
  // filed into them (lib/piggybanks), so nothing here ever writes a balance.
  const addPiggybank = useCallback((name: string, target?: number, note?: string) => {
    const bank: Piggybank = { id: genId(), name, target, note, createdAt: new Date().toISOString() };
    updateStateAndSync(prev => ({
      ...prev,
      piggybanks: [...(prev.piggybanks ?? []), bank],
      history: [{
        id: genId(), debtTitle: `Piggybank: ${name}`, date: bank.createdAt,
        amount: target ?? 0, type: 'savings', label: 'Opened',
        note: target ? `Goal ${target}` : undefined,
      }, ...prev.history],
    }));
    return bank.id;
  }, [updateStateAndSync]);

  const updatePiggybank = useCallback((id: string, data: Partial<Omit<Piggybank, 'id' | 'createdAt'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      piggybanks: (prev.piggybanks ?? []).map(b => (b.id === id ? { ...b, ...data } : b)),
    }));
  }, [updateStateAndSync]);

  /** Closing a jar takes its entries and standing orders with it — the money was a record,
   *  not an account. Everything removed is handed back for the undo toast to restore. */
  const deletePiggybank = useCallback((id: string) => {
    let removed: { bank?: Piggybank; entries: SavingEntry[]; orders: RecurringSaving[] } = { entries: [], orders: [] };
    updateStateAndSync(prev => {
      const bank = (prev.piggybanks ?? []).find(b => b.id === id);
      // The leftovers jar is where the seal puts every surplus: without it a cycle would
      // have nowhere to sweep to.
      if (!bank || bank.isLeftovers) return prev;
      const entries = (prev.savings ?? []).filter(v => (v.bankId ?? DEFAULT_BANK_ID) === id);
      const orders = (prev.recurringSavings ?? []).filter(r => r.bankId === id);
      removed = { bank, entries, orders };
      return {
        ...prev,
        piggybanks: (prev.piggybanks ?? []).filter(b => b.id !== id),
        savings: (prev.savings ?? []).filter(v => (v.bankId ?? DEFAULT_BANK_ID) !== id),
        recurringSavings: (prev.recurringSavings ?? []).filter(r => r.bankId !== id),
        history: [{
          id: genId(), debtTitle: `Piggybank: ${bank.name}`, date: new Date().toISOString(),
          amount: entries.reduce((s, e) => s + (e.direction === 'out' ? -e.amount : e.amount), 0),
          type: 'savings', label: 'Closed',
          note: `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} removed with it`,
        }, ...prev.history],
      };
    });
    return removed;
  }, [updateStateAndSync]);

  const restorePiggybank = useCallback((restore: { bank?: Piggybank; entries: SavingEntry[]; orders: RecurringSaving[] }) => {
    if (!restore.bank) return;
    updateStateAndSync(prev => ({
      ...prev,
      piggybanks: [...(prev.piggybanks ?? []), restore.bank!],
      savings: [...restore.entries, ...(prev.savings ?? [])],
      recurringSavings: [...restore.orders, ...(prev.recurringSavings ?? [])],
    }));
  }, [updateStateAndSync]);

  // ── Standing orders ──────────────────────────────────────────────────────────
  // A standing order is a rule, not a movement: it charges every cycle from the one it was
  // created in, and the seal turns each charge into a real entry (see materialiseRecurring).
  const addRecurringSaving = useCallback((bankId: string, amount: number, label: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      recurringSavings: [
        {
          id: genId(), bankId, amount, label, active: true,
          // The cycle you are IN, not the month you are in — see RecurringSaving.startCycleKey.
          startCycleKey: cycleKey(new Date(), normalizePayDay(prev.userProfile.paydayDay)),
          createdAt: new Date().toISOString(),
        },
        ...(prev.recurringSavings ?? []),
      ],
    }));
  }, [updateStateAndSync]);

  const setRecurringSavingActive = useCallback((id: string, active: boolean) => {
    updateStateAndSync(prev => ({
      ...prev,
      recurringSavings: (prev.recurringSavings ?? []).map(r => (r.id === id ? { ...r, active } : r)),
    }));
  }, [updateStateAndSync]);

  const deleteRecurringSaving = useCallback((id: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      recurringSavings: (prev.recurringSavings ?? []).filter(r => r.id !== id),
    }));
  }, [updateStateAndSync]);

  const updateSaving = useCallback((id: string, data: Partial<Pick<SavingEntry, 'amount' | 'label' | 'note' | 'cycleKey'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      savings: (prev.savings ?? []).map(s => (s.id === id ? { ...s, ...data } : s)),
    }));
  }, [updateStateAndSync]);

  const deleteSaving = useCallback((id: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      savings: (prev.savings ?? []).filter(s => s.id !== id),
    }));
  }, [updateStateAndSync]);

  const restoreSaving = useCallback((item: SavingEntry) => {
    updateStateAndSync(prev => ({ ...prev, savings: [item, ...(prev.savings ?? [])] }));
  }, [updateStateAndSync]);

  // ── Loans (money lent OUT) ────────────────────────────────────────────────
  // Deliberately isolated from debts and from the Balance calculator: see the Loan doc
  // comment in lib/types.ts. Every figure is derived from `events` (lib/loans.ts), so these
  // actions only ever append to or filter that log.

  const addLoan = useCallback((person: string, amount: number, opts?: { reason?: string; date?: string; dueDate?: string; note?: string }) => {
    const now = new Date();
    const day = opts?.date || format(now, 'yyyy-MM-dd');
    const loan: Loan = {
      id: genId(),
      person: person.trim(),
      reason: opts?.reason?.trim() || undefined,
      dueDate: opts?.dueDate || undefined,
      note: opts?.note?.trim() || undefined,
      createdAt: now.toISOString(),
      events: [{ id: genId(), type: 'lent', amount, date: day, note: opts?.note?.trim() || undefined, createdAt: now.toISOString() }],
    };
    updateStateAndSync(prev => ({ ...prev, loans: [loan, ...(prev.loans ?? [])] }));
  }, [updateStateAndSync]);

  const updateLoan = useCallback((loanId: string, data: Partial<Pick<Loan, 'person' | 'reason' | 'dueDate' | 'note'>>) => {
    updateStateAndSync(prev => ({
      ...prev,
      loans: (prev.loans ?? []).map(l => (l.id === loanId ? { ...l, ...data } : l)),
    }));
  }, [updateStateAndSync]);

  const deleteLoan = useCallback((loanId: string) => {
    updateStateAndSync(prev => ({ ...prev, loans: (prev.loans ?? []).filter(l => l.id !== loanId) }));
  }, [updateStateAndSync]);

  // Undo a delete. The id guard makes a double-tapped UNDO a no-op rather than a duplicate.
  const restoreLoan = useCallback((loan: Loan) => {
    updateStateAndSync(prev => (
      (prev.loans ?? []).some(l => l.id === loan.id)
        ? prev
        : { ...prev, loans: [loan, ...(prev.loans ?? [])] }
    ));
  }, [updateStateAndSync]);

  const addLoanEvent = useCallback((loanId: string, event: { type: LoanEvent['type']; amount: number; date: string; note?: string }) => {
    const row: LoanEvent = {
      id: genId(),
      type: event.type,
      amount: event.amount,
      date: event.date,
      note: event.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    updateStateAndSync(prev => ({
      ...prev,
      loans: (prev.loans ?? []).map(l => (l.id === loanId ? { ...l, events: [...l.events, row] } : l)),
    }));
  }, [updateStateAndSync]);

  const deleteLoanEvent = useCallback((loanId: string, eventId: string) => {
    updateStateAndSync(prev => ({
      ...prev,
      loans: (prev.loans ?? []).map(l => (l.id === loanId ? { ...l, events: l.events.filter(e => e.id !== eventId) } : l)),
    }));
  }, [updateStateAndSync]);

  const restoreLoanEvent = useCallback((loanId: string, event: LoanEvent) => {
    updateStateAndSync(prev => ({
      ...prev,
      loans: (prev.loans ?? []).map(l => (
        l.id === loanId && !l.events.some(e => e.id === event.id)
          ? { ...l, events: [...l.events, event] }
          : l
      )),
    }));
  }, [updateStateAndSync]);

  const setLoanSettled = useCallback((loanId: string, settled: boolean) => {
    updateStateAndSync(prev => ({
      ...prev,
      loans: (prev.loans ?? []).map(l => (
        l.id === loanId ? { ...l, settledAt: settled ? new Date().toISOString() : undefined } : l
      )),
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

  // Undo a debt delete: the debt plus every history record deleteDebt removed with it
  // (callers capture both BEFORE deleting). Id guards make a double-tapped UNDO a no-op.
  const restoreDebt = useCallback((debt: Debt, entries: HistoryEntry[]) => {
    updateStateAndSync(prev => ({
      ...prev,
      debts: prev.debts.some(d => d.id === debt.id) ? prev.debts : [...prev.debts, debt],
      history: [...entries.filter(e => !prev.history.some(h => h.id === e.id)), ...prev.history],
    }));
  }, [updateStateAndSync]);

  // Undo an archive: put the debt back and drop the completion entry the archive wrote
  // (first match = newest, since history is prepend-ordered).
  const unarchiveDebt = useCallback((debt: Debt) => {
    updateStateAndSync(prev => {
      if (prev.debts.some(d => d.id === debt.id)) return prev;
      const idx = prev.history.findIndex(h => h.type === 'completion' && h.debtId === debt.id);
      return {
        ...prev,
        debts: [...prev.debts, debt],
        history: idx < 0 ? prev.history : [...prev.history.slice(0, idx), ...prev.history.slice(idx + 1)],
      };
    });
  }, [updateStateAndSync]);

  const restoreUberRide = useCallback((ride: UberRide) => {
    updateStateAndSync(prev => ({
      ...prev,
      uberRides: prev.uberRides.some(r => r.id === ride.id) ? prev.uberRides : [...prev.uberRides, ride],
    }));
  }, [updateStateAndSync]);

  // Undo a plan delete: re-add the plan and drop the "Plan deleted" record the delete
  // wrote — leaving it would show a deletion in History for a plan that exists again.
  const restoreBudgetPlan = useCallback((plan: BudgetPlan) => {
    updateStateAndSync(prev => {
      if (prev.budgetPlans.some(p => p.id === plan.id)) return prev;
      const idx = prev.history.findIndex(h => h.type === 'budget' && h.note === 'Plan deleted' && h.debtTitle === `Budget: ${plan.name}`);
      return {
        ...prev,
        budgetPlans: [...prev.budgetPlans, plan],
        history: idx < 0 ? prev.history : [...prev.history.slice(0, idx), ...prev.history.slice(idx + 1)],
      };
    });
  }, [updateStateAndSync]);

  // Undo a plan archive: clear the flag and drop its "Plan archived" record.
  const unarchiveBudgetPlan = useCallback((planId: string, planName: string) => {
    updateStateAndSync(prev => {
      const idx = prev.history.findIndex(h => h.type === 'budget' && h.note === 'Plan archived' && h.debtTitle === `Budget: ${planName}`);
      return {
        ...prev,
        budgetPlans: prev.budgetPlans.map(p => p.id === planId ? { ...p, archived: false } : p),
        history: idx < 0 ? prev.history : [...prev.history.slice(0, idx), ...prev.history.slice(idx + 1)],
      };
    });
  }, [updateStateAndSync]);

  const restoreBudgetItem = useCallback((planId: string, item: BudgetItem) => {
    updateStateAndSync(prev => ({
      ...prev,
      budgetPlans: prev.budgetPlans.map(p =>
        p.id === planId && !p.items.some(i => i.id === item.id) ? { ...p, items: [...p.items, item] } : p
      ),
    }));
  }, [updateStateAndSync]);

  // Undo a saved-theme delete; `favourite` re-links it into the Day/Night quick-switch
  // list deleteUserTheme scrubbed it from.
  const restoreUserTheme = useCallback((theme: UserTheme, favourite: boolean) => {
    updateStateAndSync(prev => ({
      ...prev,
      userThemes: prev.userThemes.some(t => t.id === theme.id) ? prev.userThemes : [...prev.userThemes, theme],
      favouriteThemes: favourite ? [...new Set([...(prev.favouriteThemes ?? []), theme.id])] : (prev.favouriteThemes ?? []),
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

  // Archive keeps the plan in state (hidden from the picker) so its confirmed spend
  // still counts for the month it was confirmed — removing it would silently un-deduct
  // that money from the live balance and the month-end seal. See BudgetPlan.archived.
  const archiveBudgetPlan = useCallback((planId: string) => {
    updateStateAndSync(prev => {
      const plan = prev.budgetPlans.find(p => p.id === planId);
      if (!plan) return prev;
      const historyEntry: HistoryEntry = {
        id: genId(),
        debtTitle: `Budget: ${plan.name}`,
        date: new Date().toISOString(),
        amount: plan.items.reduce((s, i) => s + i.price, 0),
        type: 'budget',
        note: 'Plan archived',
      };
      return {
        ...prev,
        budgetPlans: prev.budgetPlans.map(p => p.id === planId ? { ...p, archived: true } : p),
        history: [historyEntry, ...prev.history],
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
    // A backup written by a pre-v9 build still carries UTC-derived day keys, so re-key it
    // on the way in — otherwise an imported transport calendar / Uber log would sit one day
    // off from everything created since. Gated on the FILE's version, not the app's, and
    // applied to the INCOMING payload only: the config-only import carries no day-keyed
    // collections, and re-keying the merged result would have shifted the data already in
    // state (which is v9 already) a second day forward.
    const incoming = (data.schemaVersion ?? 0) < 9 ? migrateDayKeys(data) : data;
    // tutorialSeen is a property of this INSTALL, not of the data: restoring a backup
    // written before the tour existed (or on a fresh device) must not replay it at someone
    // already using the app.
    updateStateAndSync(prev => ({ ...prev, ...incoming, tutorialSeen: prev.tutorialSeen, schemaVersion: CURRENT_SCHEMA_VERSION }));
  };

  const clearData = () => {
    // Disable persistence first: a pending debounced write — or the pagehide flush the
    // reload below triggers — must not rewrite the state we're about to wipe.
    clearedRef.current = true;
    clearTimeout(writeTimerRef.current);
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
    renamePerson,
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
    addSaving,
    addPiggybank,
    updatePiggybank,
    deletePiggybank,
    restorePiggybank,
    addRecurringSaving,
    setRecurringSavingActive,
    deleteRecurringSaving,
    addLoan,
    updateLoan,
    deleteLoan,
    restoreLoan,
    addLoanEvent,
    deleteLoanEvent,
    restoreLoanEvent,
    setLoanSettled,
    updateSaving,
    deleteSaving,
    restoreSaving,
    restoreExpense,
    restoreHistoryEntry,
    restoreDebt,
    unarchiveDebt,
    restoreUberRide,
    restoreBudgetPlan,
    unarchiveBudgetPlan,
    restoreBudgetItem,
    restoreUserTheme,
    setDayNight: (dayNight: DayNightSettings) => updateStateAndSync(p => ({ ...p, dayNight })),
    addBudgetPlan,
    deleteBudgetPlan,
    archiveBudgetPlan,
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
    setSwipeActionsEnabled: (on: boolean) => updateStateAndSync(p => ({ ...p, swipeActionsEnabled: on })),
    setHapticsStrength: (s: HapticStrength) => updateStateAndSync(p => ({ ...p, hapticsStrength: s })),
    setTutorialSeen: (seen: boolean) => updateStateAndSync(p => ({ ...p, tutorialSeen: seen })),
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
