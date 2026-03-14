import type { Debt, HistoryEntry, TransportOverrides } from './types';
import { isWeekend, getDaysInMonth, startOfMonth, add } from 'date-fns';

// Debt Calculations
export const getAmountPaid = (debt: Debt, history: HistoryEntry[]): number => {
    return history
        .filter(h => h.debtId === debt.id && h.type === 'payment')
        .reduce((acc, p) => acc + p.amount, 0);
};

export const getPaymentCount = (debt: Debt, history: HistoryEntry[]): number => {
    return history.filter(h => h.debtId === debt.id && h.type === 'payment').length;
};

export const getTotalInstallments = (debt: Debt): number => {
    if (debt.installment_amount <= 0) return 0;
    return Math.ceil(debt.total_owed / debt.installment_amount);
};

export const getRemainingBalance = (debt: Debt, history: HistoryEntry[]): number => {
    return Math.max(0, debt.total_owed - getAmountPaid(debt, history));
};

export const getProgress = (debt: Debt, history: HistoryEntry[]): number => {
    if (debt.total_owed <= 0) {
        return getAmountPaid(debt, history) > 0 ? 100 : 0;
    };
    const amountPaid = getAmountPaid(debt, history);
    const progress = (amountPaid / debt.total_owed) * 100;
    return Math.min(100, progress);
};


// Stats Page Calculations
export const calculateGlobalStats = (debts: Debt[], history: HistoryEntry[]) => {
    const globalTotalDebt = debts.reduce((acc, debt) => acc + debt.total_owed, 0);
    const globalAmountPaid = debts.reduce((acc, debt) => acc + getAmountPaid(debt, history), 0);
    const globalRemainingBalance = globalTotalDebt - globalAmountPaid;
    const totalTransportPaid = history
      .filter((item) => item.type === 'transport')
      .reduce((acc, item) => acc + item.amount, 0);
    
    return { globalTotalDebt, globalAmountPaid, globalRemainingBalance, totalTransportPaid };
};

// Transport Page Calculations
export const calculateTransportMonth = (
    currentDate: Date, 
    overrides: TransportOverrides, 
    dailyFee: number
) => {
    const monthStart = startOfMonth(currentDate);
    const daysInMonth = Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => add(monthStart, { days: i }));

    let travelDaysCount = 0;
    daysInMonth.forEach(day => {
      const isoDate = day.toISOString().split('T')[0];
      const isOverridden = overrides[isoDate] !== undefined;
      const isTravelDay = isOverridden ? overrides[isoDate] : !isWeekend(day);
      if (isTravelDay) {
        travelDaysCount++;
      }
    });

    const totalDue = travelDaysCount * (dailyFee || 0);

    return { daysInMonth, travelDaysCount, totalDue };
}
