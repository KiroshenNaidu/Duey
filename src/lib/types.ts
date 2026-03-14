export interface Debt {
  id: string;
  title: string;
  total_owed: number;
  installment_amount: number;
  paymentDates?: string[];
}

export interface HistoryEntry {
  id:string;
  debtId?: string;
  debtTitle: string;
  date: string; // ISO 8601 format
  amount: number;
  type: 'payment' | 'creation' | 'transport';
}

export interface TransportSettings {
  driverName: string;
  dailyFee: number;
}

export type TransportOverrides = {
  [key: string]: boolean; // ISODateString: isTravelDay
};

export interface ThemeSettings {
  background: string;
  surface: string;
  primary: string;
  accent: string;
  font: 'Inter' | 'Serif' | 'Mono';
  backgroundImage: string;
  backgroundOpacity: number;
  foreground: string;
}

export interface UserTheme {
    id: string;
    name: string;
    settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>;
}

// Unified App State
export interface AppState {
  schemaVersion: number;
  debts: Debt[];
  history: HistoryEntry[];
  transportSettings: TransportSettings;
  transportOverrides: TransportOverrides;
  themeSettings: Omit<ThemeSettings, 'backgroundImage'>;
  userThemes: UserTheme[];
  notepadContent: string;
}

// For Import/Export, which might not have all fields.
export type AppData = Partial<AppState>;
