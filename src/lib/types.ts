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

export interface ThemeSettings {
  background: string;
  surface: string;
  primary: string;
  accent: string;
  font: 'Inter' | 'Serif' | 'Mono';
  backgroundImage: string;
  backgroundOpacity: number;
  foreground: string;
  accentForeground: string;
  uiScale: number;
  uiStyle: 'solid' | 'glass';
}

export interface UserTheme {
    id: string;
    name: string;
    settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>;
}

export interface UserProfile {
  name: string;
  paydayDay: number; // 1–31
}

export interface NotificationSettings {
  enabled: boolean;
  paydayDay: number;
  hour: number;
  minute: number;
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
