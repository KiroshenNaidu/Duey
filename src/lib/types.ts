import type { HapticStrength } from './haptics';

export interface Debt {
  id: string;
  title: string;
  // WHO the debt is owed to, separate from title (WHAT it's for). Optional — when unset,
  // the title doubles as the person identity, which is how all pre-person debts behave.
  person?: string;
  total_owed: number;
  installment_amount: number;
  // Day of month (1–31) a payment is due. PURELY optional — null/undefined means no due
  // date and no reminder is ever scheduled for this debt.
  dueDay?: number | null;
}

/**
 * One movement on a loan: money going out to the borrower, or coming back.
 *
 * `date` is when it actually happened and is picked by the user — people log a loan days
 * after handing over the cash — while `createdAt` is when the row was written. The two are
 * kept apart so the timeline can be ordered by the real event while an undo still knows
 * which row is which.
 */
export interface LoanEvent {
  id: string;
  type: 'lent' | 'repaid';
  amount: number;
  /** 'yyyy-MM-dd' — the day it happened. */
  date: string;
  note?: string;
  createdAt: string; // ISO 8601
}

/**
 * Money the user LENT OUT — the mirror of `Debt`, which is money the user owes.
 *
 * Deliberately its own type rather than a flag on Debt: a debt is a monthly commitment the
 * Balance calculator budgets for, and money owed TO you is neither owed nor spendable. A
 * loan therefore has no installment and never reaches `calculateLiveMonthly` — repayments
 * that arrive are recorded here, and it is up to the user to log any of it as income if
 * they want it in the cycle's figures.
 *
 * The amount lent is not a field: it is the sum of the 'lent' events, so lending the same
 * person more later is one loan with two events rather than a number edited behind your
 * back (see lib/loans.ts for every derived figure).
 */
export interface Loan {
  id: string;
  /** Who borrowed. Identity is personKey(person), same canonical rule debts use. */
  person: string;
  /** What it was for. Optional — many loans are just "money". */
  reason?: string;
  /** 'yyyy-MM-dd' they said they would pay it back. Purely informational: nothing is
   *  scheduled off it, it only drives the "overdue" mark on the card. */
  dueDate?: string;
  note?: string;
  createdAt: string; // ISO 8601
  /** Set when closed by hand — a loan written off, or one settled outside the ledger. A
   *  loan whose repayments cover it counts as settled without this. */
  settledAt?: string;
  events: LoanEvent[];
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category?: string; // kept for backward compat
  date: string; // ISO 8601
  note?: string;
  createdAt: string; // ISO 8601
  recurring?: boolean; // true = stays every month; false/undefined = auto-deleted on 1st of next month
}

export interface ExtraIncome {
  id: string;
  label: string;
  amount: number;
  createdAt: string; // ISO 8601
  recurring?: boolean; // true = counts every month; false/undefined = auto-removed on 1st of next month (mirrors Expense)
}

/**
 * Money set aside, filed against the pay cycle it belongs to.
 *
 * Two ways in, and the difference matters enough to record it:
 *   • 'auto' — what was LEFT OVER when a cycle ended. The seal writes exactly one of these
 *     per cycle, for the surplus it sealed, so savings grow on their own as cycles turn.
 *   • 'manual' — money the user says they put away, for whatever cycle they choose.
 *
 * An auto entry is a claim about the past, not a live figure: it keeps the amount the
 * cycle ended with even if that cycle's data is edited afterwards. Delete it if the
 * leftover was actually spent — nothing else in the app depends on it.
 */
export interface SavingEntry {
  id: string;
  amount: number;
  /** 'yyyy-MM' pay-cycle key (the month the cycle STARTS in) this saving belongs to. */
  cycleKey: string;
  label: string;
  note?: string;
  source: 'auto' | 'manual';
  createdAt: string; // ISO 8601
}

export interface HistoryEntry {
  id: string;
  debtId?: string;
  debtTitle: string;
  // WHO the entry was paid to, stamped from the debt's person at write time so the record
  // stays self-describing (who + what for) even after the debt itself is gone. Absent on
  // entries for debts without an explicit person and on all pre-person entries.
  person?: string;
  date: string; // ISO 8601 format
  amount: number;
  type: 'payment' | 'creation' | 'transport' | 'completion' | 'budget' | 'expense' | 'employment' | 'snapshot';
  note?: string;
  label?: string; // user-defined display label, e.g. "Interest", "Penalty Fee"
  edited?: boolean; // true once the user has manually edited this entry (amount/date/label/note)
  // Full sealed month breakdown, captured at seal time (type 'snapshot' only) so the
  // History → snapshot breakdown shows the exact figures that were sealed. Recomputing
  // later drifts once one-time extra incomes are purged, so we persist them here. Older
  // snapshots created before this field existed have no value → the sheet recomputes.
  snapshot?: {
    income: number;
    transport: number;
    uber: number;
    debt: number;
    expenses: number;
    budget: number;
    /** Manual savings filed against the cycle. Optional: snapshots sealed before savings
     *  existed have none, and the breakdown sheet simply omits the row for them. */
    savings?: number;
    totalOutgoings: number;
    remaining: number;
  };
}

export interface TransportSettings {
  driverName: string;
  employed: boolean;
  pricingMode: 'daily' | 'monthly';
  dailyFee: number;
  monthlyFee: number;
  jobTitle?: string;
  company?: string;
  employmentStartDate?: string; // ISO 8601 date string
  employmentEndDate?: string;   // ISO 8601 date string — set when marked as no longer employed
}

export type DayState = 0 | 1 | 1.5; // 0=home, 1=full travel, 1.5=half day

export type TransportOverrides = {
  [key: string]: DayState;
};

// Per-month flat-fee overrides for 'monthly' pricing mode, keyed by 'yyyy-MM'.
// A present value takes priority over TransportSettings.monthlyFee for that month.
export type TransportMonthlyOverrides = {
  [monthKey: string]: number;
};

export interface UberRide {
  id: string;
  date: string;      // ISO YYYY-MM-DD
  price: number;
  distance?: number; // km
  from?: string;
  to?: string;
  createdAt: string;
}

export interface BudgetItem {
  id: string;
  name: string;
  price: number;
  link?: string;
  purchased?: boolean;
  createdAt: string;
}

export interface BudgetPlan {
  id: string;
  name: string;
  budget: number;
  items: BudgetItem[];
  createdAt: string;
  // Budgets are NOT counted in the monthly balance until confirmed. Confirming means
  // "I bought these items and stuck to the budget" — the plan's spent total (sum of item
  // prices, not the budget ceiling) is then deducted, but only for the month it was confirmed.
  confirmed?: boolean;
  confirmedAt?: string; // ISO 8601 — when the plan was confirmed
  // Archived plans disappear from the Budget tab's picker but STAY in state: their
  // confirmed spend must keep counting for the month it was confirmed (live balance +
  // month-end seal both read budgetPlans). History keeps the archive record.
  archived?: boolean;
}

export interface ThemeSettings {
  background: string;
  surface: string;
  primary: string;
  accent: string;
  font: string;
  backgroundImage: string;
  backgroundVideo: string; // looping background video: '/loading.mp4' preset path, or a data URL for uploads
  backgroundOpacity: number;
  backgroundBlur?: number; // 0–20 px blur applied to the background image/video
  foreground: string;
  accentForeground: string;
  uiScale: number;
  useSafeAreaInsets?: boolean;
  bgX?: number; // 0–100, default 50 (background-position-x %)
  bgY?: number; // 0–100, default 50 (background-position-y %)
  bgScale?: number; // 1–3, default 1 (zoom for background image/video)
  // Status / category colors (HSL "h s% l%"). Optional — fall back to CSS defaults when unset.
  positive?: string;
  negative?: string;
  catTransport?: string;
  catBudget?: string;
  catExpense?: string;
  catCompletion?: string;
  catEmployment?: string;
  catSnapshot?: string;
}

export interface UserTheme {
    id: string;
    name: string;
    settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo' | 'backgroundOpacity'>;
}

export interface AvatarSettings {
  offsetX: number; // -0.5 to 0.5 (fraction of container width)
  offsetY: number; // -0.5 to 0.5 (fraction of container height)
  scale: number;   // 1.0 to 3.0
}

export interface UserProfile {
  name: string;
  paydayDay: number; // 1–31
  bio: string;
  avatarSettings?: AvatarSettings;
}

export interface NotificationSettings {
  // MASTER switch — when false, NO notification of any kind is scheduled (monthly
  // payment reminder AND per-debt due-day reminders) and everything pending is
  // cancelled. Individual features below only apply while this is true.
  masterEnabled: boolean;
  // Monthly payment reminder on/off (subordinate to masterEnabled).
  enabled: boolean;
  paydayDay: number;
  hour: number;
  minute: number;
  message: string;
}

// Unified App State
export interface AppState {
  schemaVersion: number;
  currency: string; // ISO 4217 code, e.g. 'ZAR', 'USD'
  debts: Debt[];
  history: HistoryEntry[];
  expenses: Expense[];
  extraIncomes: ExtraIncome[];
  transportSettings: TransportSettings;
  transportOverrides: TransportOverrides;
  transportMonthlyOverrides: TransportMonthlyOverrides;
  uberRides: UberRide[];
  budgetPlans: BudgetPlan[];
  /** Money set aside, per pay cycle. Fed automatically by each cycle's leftover (see the
   *  seal in AppDataContext) and by hand from Stats → Savings. */
  savings: SavingEntry[];
  /** Money lent OUT to other people (Money → Debts → Owed to me). Tracked on its own and
   *  never mixed into the debt/Balance math — see the Loan doc comment. */
  loans: Loan[];
  monthlyIncome: number;
  userProfile: UserProfile;
  notificationSettings: NotificationSettings;
  themeSettings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo'>;
  userThemes: UserTheme[];
  notepadContent: string;
  /** SAF tree URI of the user-chosen export folder (Android). Empty = not yet chosen. */
  exportFolderUri: string;
  /** Human-readable name of the chosen folder, for display in settings. */
  exportFolderName: string;
  /** 'yyyy-MM' of the last month we already pushed a balance snapshot to history. */
  lastSnapshotMonth: string;
  /** Day/Night quick-switch: which saved theme preset each mode applies, and the active mode. */
  dayNight: DayNightSettings;
  /** Starred theme ids ('preset:<name>' for system presets, UserTheme id for user themes).
   *  Only these are offered in the Day/Night quick-switch. */
  favouriteThemes: string[];
  /** System preset names the user has removed from their preset list. At least one system
   *  preset must always remain visible (enforced in AppDataContext). Restorable anytime. */
  hiddenSystemPresets: string[];
  /** Selected quick-add radial gesture effect preset (see lib/radialFx.ts). */
  quickAddFxId: string;
  /** Ordered shortcut ids shown in the quick-add radial (see lib/quickShortcuts.ts).
   *  Order = position along the arc. Min 1, max 7 (enforced in AppDataContext). */
  quickAddShortcuts: string[];
  /** Swipe-to-reveal action trays on list cards (see components/SwipeableRow.tsx). */
  swipeActionsEnabled: boolean;
  /** Vibration feedback strength for buttons/gestures (see lib/haptics.ts). */
  hapticsStrength: HapticStrength;
  /** True once the first-run feature tour has been completed OR skipped. The tour is
   *  replayable at any time from Profile -> "How to use Duey" (see TutorialTour.tsx). */
  tutorialSeen: boolean;
}

export interface DayNightSettings {
  dayThemeId: string;   // UserTheme id or 'preset:<name>' for a system preset; '' = not configured
  nightThemeId: string;
  mode: 'day' | 'night';
}

// For Import/Export, which might not have all fields.
export type AppData = Partial<AppState>;

export interface AppError {
  friendly: string;    // User-facing message: "Could not save background image"
  operation: string;   // Technical context: "idbSet('backgroundImage') in ThemeSettingsMenu"
  error: unknown;      // Original Error object
  ts: number;          // Date.now()
}
