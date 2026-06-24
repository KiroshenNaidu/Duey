export interface Debt {
  id: string;
  title: string;
  total_owed: number;
  installment_amount: number;
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
}

export interface HistoryEntry {
  id: string;
  debtId?: string;
  debtTitle: string;
  date: string; // ISO 8601 format
  amount: number;
  type: 'payment' | 'creation' | 'transport' | 'completion' | 'budget' | 'expense' | 'employment' | 'snapshot';
  note?: string;
  label?: string; // user-defined display label, e.g. "Interest", "Penalty Fee"
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
  uiStyle: 'solid' | 'glass' | 'minimal' | 'elevated';
  glassOpacity?: number; // 0.1–0.95, only used when uiStyle === 'glass'
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
  uberRides: UberRide[];
  budgetPlans: BudgetPlan[];
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
}

// For Import/Export, which might not have all fields.
export type AppData = Partial<AppState>;

export interface AppError {
  friendly: string;    // User-facing message: "Could not save background image"
  operation: string;   // Technical context: "idbSet('backgroundImage') in ThemeSettingsMenu"
  error: unknown;      // Original Error object
  ts: number;          // Date.now()
}
