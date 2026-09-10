import type { Loan } from './types';

// Everything a loan "is" is derived from its events — nothing about a loan's balance is
// ever stored, so a mis-typed repayment is fixed by deleting that one row rather than by
// reconciling a running total against the log that disagrees with it. Same reasoning as the
// debt side, where paid comes from history rather than a field on the debt.

export const loanLent = (l: Loan): number =>
  l.events.reduce((s, e) => (e.type === 'lent' ? s + e.amount : s), 0);

export const loanRepaid = (l: Loan): number =>
  l.events.reduce((s, e) => (e.type === 'repaid' ? s + e.amount : s), 0);

/** Signed balance: positive is still owed to you, negative means they overpaid. */
export const loanBalance = (l: Loan): number => loanLent(l) - loanRepaid(l);

/** What they still owe, floored at zero — an overpayment is not a debt you now carry. */
export const loanOutstanding = (l: Loan): number => Math.max(0, loanBalance(l));

/** 0–1 repaid. A loan with nothing lent yet is 0 rather than complete. */
export const loanProgress = (l: Loan): number => {
  const lent = loanLent(l);
  return lent > 0 ? Math.min(1, loanRepaid(l) / lent) : 0;
};

/** Closed either way: paid back in full, or closed by hand (written off, settled off-app). */
export const isLoanSettled = (l: Loan): boolean =>
  !!l.settledAt || (loanLent(l) > 0 && loanBalance(l) <= 0);

/** Newest movement first — the order the timeline reads in. */
export const loanEventsNewestFirst = (l: Loan) =>
  [...l.events].sort((a, b) => (a.date === b.date
    ? (a.createdAt < b.createdAt ? 1 : -1)
    : (a.date < b.date ? 1 : -1)));

/** ms of the most recent movement, or of creation for a loan with no events at all. */
export const loanLastActivity = (l: Loan): number => {
  const latest = l.events.reduce((max, e) => Math.max(max, new Date(e.date).getTime()), 0);
  return latest || new Date(l.createdAt).getTime();
};

/** Past its promised date with money still outstanding. No date = never overdue. */
export const isLoanOverdue = (l: Loan, today = new Date()): boolean => {
  if (!l.dueDate || isLoanSettled(l)) return false;
  return new Date(`${l.dueDate}T23:59:59`).getTime() < today.getTime();
};

export interface LoansSummary {
  /** Total ever handed out, across every loan including settled ones. */
  lent: number;
  /** Total ever come back. */
  repaid: number;
  /** Still owed to you right now. */
  outstanding: number;
  /** People with something still outstanding. */
  debtors: number;
}

export function summariseLoans(loans: Loan[]): LoansSummary {
  const people = new Set<string>();
  let lent = 0, repaid = 0, outstanding = 0;
  for (const l of loans) {
    lent += loanLent(l);
    repaid += loanRepaid(l);
    const left = loanOutstanding(l);
    if (left > 0 && !l.settledAt) {
      outstanding += left;
      people.add(l.person.trim().toLowerCase());
    }
  }
  return { lent, repaid, outstanding, debtors: people.size };
}
