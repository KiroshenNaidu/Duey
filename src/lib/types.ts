export interface Debt {
  id: string;
  title: string;
  total_owed: number;
  installment_amount: number;
  payment_score: number;
}

export interface HistoryEntry {
  id: string;
  debtId: string;
  debtTitle: string;
  date: string; // ISO 8601 format
  amount: number;
}

export interface AppData {
  debts: Debt[];
  history: HistoryEntry[];
}
