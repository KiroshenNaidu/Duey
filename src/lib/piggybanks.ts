import type { Piggybank, RecurringSaving, SavingEntry } from '@/lib/types';

/**
 * Every figure a piggybank has is derived from its entries — a balance is never stored.
 * Same reasoning as loans (see the Loan doc comment): a stored total is a second source of
 * truth that drifts the moment an entry is edited, deleted or undone.
 *
 * The sign convention lives in exactly one place, `signedAmount`. Entries carry a positive
 * `amount` and a `direction`, because "R200" and "which way did it go" are two different
 * facts and storing a negative number conflates them — a deposit of −200 is not a thing.
 */

/** The jar the cycle-end sweep fills. Created on first load and never deletable. */
export const LEFTOVERS_BANK_ID = 'bank-leftovers';
/** Where entries from before jars existed live, and the default target for by-hand saving. */
export const DEFAULT_BANK_ID = 'bank-general';

export const bankIdOf = (e: SavingEntry): string => e.bankId ?? DEFAULT_BANK_ID;

/** Money in is positive, money out is negative — the only place that decision is made. */
export const signedAmount = (e: SavingEntry): number =>
  (e.direction === 'out' ? -e.amount : e.amount);

export const entriesOfBank = (entries: SavingEntry[], bankId: string): SavingEntry[] =>
  entries.filter(e => bankIdOf(e) === bankId);

/** What a jar currently holds: everything put in, less everything taken back out. */
export const bankBalance = (entries: SavingEntry[], bankId: string): number =>
  entriesOfBank(entries, bankId).reduce((s, e) => s + signedAmount(e), 0);

/** The whole pile across every jar, net of withdrawals. */
export const savingsTotal = (entries: SavingEntry[]): number =>
  entries.reduce((s, e) => s + signedAmount(e), 0);

/** 0–1 toward the jar's goal. A jar with no target has no progress to report. */
export const bankProgress = (bank: Piggybank, balance: number): number | null =>
  bank.target && bank.target > 0 ? Math.max(0, Math.min(1, balance / bank.target)) : null;

export const isBankFull = (bank: Piggybank, balance: number): boolean =>
  !!bank.target && bank.target > 0 && balance >= bank.target;

/** Standing orders that are running (a paused one stays in the list and counts nowhere). */
export const activeRecurring = (orders: RecurringSaving[] | undefined, bankId?: string): RecurringSaving[] =>
  (orders ?? []).filter(r => r.active !== false && (bankId == null || r.bankId === bankId));

export const recurringTotal = (orders: RecurringSaving[] | undefined, bankId?: string): number =>
  activeRecurring(orders, bankId).reduce((s, r) => s + r.amount, 0);

/**
 * What a standing order charges a given cycle.
 *
 * Zero before the order existed — a new order must not retroactively empty cycles that were
 * sealed years ago — and zero once the seal has already materialised it into a real entry
 * for that cycle, or the cycle would be charged twice.
 */
const recurringChargeForCycle = (
  order: RecurringSaving,
  cycleKey: string,
  entries: SavingEntry[],
): number => {
  // Both are 'yyyy-MM' cycle keys, so a string compare is a date compare. Orders written
  // before the field existed fall back to their calendar month, which is right whenever
  // payday is the 1st and at most one cycle out otherwise.
  const startedIn = order.startCycleKey ?? order.createdAt.slice(0, 7);
  if (cycleKey < startedIn) return 0;
  if (entries.some(e => e.recurringId === order.id && e.cycleKey === cycleKey)) return 0;
  return order.amount;
};

/**
 * The savings line for one pay cycle, as Balance sees it.
 *
 * Deposits filed against the cycle are an outgoing. Withdrawals are the same figure with
 * the sign flipped: money you took back out is money you can spend again, so it lifts
 * Remaining rather than sinking it — and a cycle where you put R500 in and took R500 back
 * out nets to zero, which is exactly what happened.
 *
 * AUTO leftovers are excluded from the deposit side. A leftover IS what the cycle had left
 * after every deduction, so deducting it as well would subtract the same money twice.
 * Withdrawing one, though, DOES count: that money was banked out of a cycle that has since
 * closed, so bringing it back into this one genuinely adds to what this cycle can spend.
 *
 * Can be negative. Callers must not clamp it — a negative savings line is the whole point
 * of letting money come back out.
 */
export function savingsMovementForCycle(
  entries: SavingEntry[] | undefined,
  recurring: RecurringSaving[] | undefined,
  cycleKey: string,
): number {
  const list = entries ?? [];
  const filed = list.reduce((s, e) => {
    if (e.cycleKey !== cycleKey) return s;
    if (e.direction === 'out') return s - e.amount;
    return e.source === 'auto' ? s : s + e.amount;
  }, 0);
  const standing = activeRecurring(recurring)
    .reduce((s, r) => s + recurringChargeForCycle(r, cycleKey, list), 0);
  return filed + standing;
}

/**
 * The entries a seal should write for one cycle's standing orders — the same guard as
 * above, so re-sealing or restoring a backup can never charge a cycle twice.
 */
export function materialiseRecurring(
  orders: RecurringSaving[] | undefined,
  entries: SavingEntry[],
  cycleKey: string,
  makeId: () => string,
  createdAt: string,
): SavingEntry[] {
  return activeRecurring(orders)
    .filter(r => recurringChargeForCycle(r, cycleKey, entries) > 0)
    .map(r => ({
      id: makeId(),
      amount: r.amount,
      cycleKey,
      label: r.label,
      note: 'Standing order',
      source: 'recurring' as const,
      direction: 'in' as const,
      bankId: r.bankId,
      recurringId: r.id,
      createdAt,
    }));
}

/** The two jars every install has. Created on load when they are missing. */
export const defaultPiggybanks = (createdAt: string): Piggybank[] => [
  {
    id: LEFTOVERS_BANK_ID,
    name: 'Leftovers',
    note: 'Whatever each pay cycle ends with lands here on its own.',
    createdAt,
    isLeftovers: true,
  },
  {
    id: DEFAULT_BANK_ID,
    name: 'Savings',
    note: 'Money put away by hand.',
    createdAt,
  },
];

/** Where the seal puts a swept leftover: the flagged jar, or the first one that exists. */
export const leftoversBankId = (banks: Piggybank[] | undefined): string =>
  (banks ?? []).find(b => b.isLeftovers)?.id ?? (banks ?? [])[0]?.id ?? LEFTOVERS_BANK_ID;
