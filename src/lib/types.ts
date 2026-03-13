export interface Debt {
  id: string;
  title: string;
  total_owed: number;
  installment_amount: number;
  payment_score: number;
  paymentDates?: string[];
}

export interface HistoryEntry {
  id: string;
  debtId?: string;
  debtTitle: string;
  date: string; // ISO 8601 format
  amount: number;
  type: 'payment' | 'creation' | 'transport';
}

export interface AppData {
  debts: Debt[];
  history: HistoryEntry[];
}

export interface ThemeSettings {
  background: string;
  surface: string;
  primary: string;
  accent: string;
  font: 'Inter' | 'Serif' | 'Mono';
  backgroundImage: string;
  backgroundOpacity: number;
}
