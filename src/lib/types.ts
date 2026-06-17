export interface Debt {
  id: string;
  title: string;
  total_owed: number;
  installment_amount: number;
}

export interface HistoryEntry {
  id: string;
  debtId?: string;
  debtTitle: string;
  date: string; // ISO 8601 format
  amount: number;
  type: 'payment' | 'creation' | 'transport' | 'completion' | 'budget';
  note?: string;
  label?: string; // user-defined display label, e.g. "Interest", "Penalty Fee"
}

export interface TransportSettings {
  driverName: string;
  employed: boolean;
  pricingMode: 'daily' | 'monthly';
  dailyFee: number;
  monthlyFee: number;
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
  createdAt: string;
}

export interface BudgetPlan {
  id: string;
  name: string;
  budget: number;
  items: BudgetItem[];
  createdAt: string;
}

export type FontFamily = 'Inter' | 'Serif' | 'Mono' | 'Nunito' | 'Lexend' | 'DM Sans' | 'Space Grotesk' | 'Playfair';

export interface ThemeSettings {
  background: string;
  surface: string;
  primary: string;
  accent: string;
  font: FontFamily;
  backgroundImage: string;
  backgroundOpacity: number;
  foreground: string;
  accentForeground: string;
  uiScale: number;
  uiStyle: 'solid' | 'glass' | 'minimal' | 'elevated';
  glassOpacity?: number; // 0.1–0.95, only used when uiStyle === 'glass'
  useSafeAreaInsets?: boolean;
  bgX?: number; // 0–100, default 50 (background-position-x %)
  bgY?: number; // 0–100, default 50 (background-position-y %)
}

export interface UserTheme {
    id: string;
    name: string;
    settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>;
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
  debts: Debt[];
  history: HistoryEntry[];
  transportSettings: TransportSettings;
  transportOverrides: TransportOverrides;
  uberRides: UberRide[];
  budgetPlans: BudgetPlan[];
  monthlyIncome: number;
  userProfile: UserProfile;
  notificationSettings: NotificationSettings;
  themeSettings: Omit<ThemeSettings, 'backgroundImage'>;
  userThemes: UserTheme[];
  notepadContent: string;
}

// For Import/Export, which might not have all fields.
export type AppData = Partial<AppState>;

export interface AppError {
  friendly: string;    // User-facing message: "Could not save background image"
  operation: string;   // Technical context: "idbSet('backgroundImage') in ThemeSettingsMenu"
  error: unknown;      // Original Error object
  ts: number;          // Date.now()
}
