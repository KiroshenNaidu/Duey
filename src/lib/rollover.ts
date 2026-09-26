import { add, format } from 'date-fns';
import type { AppState, Expense, HistoryEntry, IncomeChange, SavingEntry } from './types';
import { calculateSealedCycleSummary, cycleKey, cycleStartFromKey, getPayCycle, nextCycleStart, normalizePayDay } from './calculations';
import { leftoversBankId, materialiseRecurring } from './piggybanks';
import { genId } from './utils';

/** True once the pay cycle the app last saw has ended — the cue to run `rollOverCycles`.
 *  A fresh install (no cycle recorded yet) has nothing to close. */
export function cycleHasEnded(state: AppState, now: Date = new Date()): boolean {
  const key = getPayCycle(normalizePayDay(state.userProfile.paydayDay), now).key;
  return !!state.lastSnapshotMonth && state.lastSnapshotMonth !== key;
}

/**
 * Close every pay cycle that has ended since the app last looked, then clear what the new
 * cycle starts without. Pure: takes a state, returns the next one. Runs at launch AND
 * while the app is open, whenever `cycleHasEnded` says so (see the rollover effect in
 * AppDataProvider) — on Android the app often stays alive in the background across pay day,
 * and a seal that only ran on a cold start meant the leftover never reached Savings until
 * the OS happened to kill the process.
 */
export function rollOverCycles(state: AppState, now: Date = new Date()): AppState {
  let loaded = state;

  // Pay-cycle seal — finalize every cycle that has fully ended since we last sealed,
  // writing one permanent summary per cycle. A cycle runs pay date → day before the
  // next pay date (Settings → Pay Date; payDay 1 is the calendar month this used to
  // be, unchanged). The loop catches up multi-cycle gaps (app not opened for a while).
  // lastSnapshotMonth === '' means fresh install; skip to avoid a noisy first entry.
  const payDay = normalizePayDay(loaded.userProfile.paydayDay);
  const currentCycle = getPayCycle(payDay, now);
  if (loaded.lastSnapshotMonth && loaded.lastSnapshotMonth !== currentCycle.key) {
    const snapshots: HistoryEntry[] = [];
    // Whatever a cycle ends with becomes savings — the money survived the cycle, so
    // it is money you kept. Written here, alongside the summary, so the two can never
    // disagree about what was left. Only a SURPLUS sweeps: a deficit is a debt to the
    // next cycle, not a negative deposit. One entry per cycle, guarded below.
    const sweeps: SavingEntry[] = [];
    // Standing orders become real rows as each cycle seals — see materialiseRecurring.
    // Accumulated here and fed into every later summary, so a cycle's figures include
    // the contributions it was actually charged.
    const contributions: SavingEntry[] = [];
    const sweepBankId = leftoversBankId(loaded.piggybanks);
    // Start AT the last recorded cycle, not after it: lastSnapshotMonth stores the
    // cycle that was LIVE when we last looked, so that cycle is the first one that
    // can have ended since. (Starting one past it — as this used to — meant a cycle
    // was only ever sealed if the app went unopened for longer than one whole cycle.)
    // Re-sealing is impossible regardless: an already-written summary is skipped by
    // title below, which also protects against a stale/hand-edited key.
    let cursor = cycleStartFromKey(loaded.lastSnapshotMonth, payDay);
    // Safety bound against a corrupt lastSnapshotMonth producing a runaway loop.
    for (let guard = 0; cursor < currentCycle.start && guard < 120; guard++) {
      const start = cursor;
      const end = nextCycleStart(start, payDay);
      cursor = end;
      const lastDay = add(end, { days: -1 });
      const title = `${payDay === 1
        ? format(start, 'MMMM yyyy')
        : `${format(start, 'd MMM')} – ${format(lastDay, 'd MMM yyyy')}`} Summary`;
      if (loaded.history.some(h => h.type === 'snapshot' && h.debtTitle === title)) continue;
      const cycleK = format(start, 'yyyy-MM');
      // Charge the cycle its standing orders BEFORE summarising it, so the summary and
      // the jar agree about what went in.
      contributions.push(...materialiseRecurring(
        loaded.recurringSavings,
        [...contributions, ...(loaded.savings ?? [])],
        cycleK,
        genId,
        lastDay.toISOString(),
      ));
      const savingsSoFar = [...contributions, ...(loaded.savings ?? [])];
      const s = calculateSealedCycleSummary({ ...loaded, savings: savingsSoFar, payDay }, cycleK);
      // Sweep the leftover. Guarded against an entry that already exists for this
      // cycle (a hand-edited key, a restored backup), so a relaunch can never bank
      // the same surplus twice.
      if (s.remaining > 0 && !savingsSoFar.some(v => v.source === 'auto' && v.cycleKey === cycleK)) {
        sweeps.push({
          id: genId(),
          amount: s.remaining,
          cycleKey: cycleK,
          label: 'Leftover',
          note: `Left at the end of ${payDay === 1 ? format(start, 'MMMM yyyy') : `${format(start, 'd MMM')} – ${format(lastDay, 'd MMM yyyy')}`}`,
          source: 'auto',
          direction: 'in',
          bankId: sweepBankId,
          createdAt: lastDay.toISOString(),
        });
      }
      snapshots.push({
        id: genId(),
        debtTitle: title,
        // Dated to the cycle's LAST day, so History files it under the month the
        // cycle ended in and the breakdown sheet can recover the cycle from it.
        date: lastDay.toISOString(),
        amount: Math.abs(s.remaining),
        type: 'snapshot',
        note: `Income: ${Math.round(s.income)} | Outgoings: ${Math.round(s.totalOutgoings)} | ${s.remaining >= 0 ? 'Surplus' : 'Deficit'}: ${Math.round(Math.abs(s.remaining))}`,
        // Persist the exact sealed breakdown so the History detail sheet never drifts
        // once one-time extras/expenses are purged (recompute is only a fallback).
        snapshot: s,
      });
    }
    loaded = {
      ...loaded,
      history: [...snapshots, ...loaded.history],
      savings: [...sweeps, ...contributions, ...(loaded.savings ?? [])],
      lastSnapshotMonth: currentCycle.key,
    };
  } else if (!loaded.lastSnapshotMonth) {
    // Fresh install — record the cycle so the next pay date seals a real summary.
    loaded = { ...loaded, lastSnapshotMonth: currentCycle.key };
  }

  // Auto-purge non-recurring expenses AND one-time extra incomes from previous cycles
  // — this is the "reset", and it now happens on the pay date rather than the 1st.
  // Runs AFTER the seal so sealed summaries still see them. One-time expenses keep
  // their original `expense` history entry as the permanent record; one-time extras
  // were captured in the sealed cycle's income.
  const purged = loaded.expenses.filter(e => !e.recurring && new Date(e.createdAt) < currentCycle.start);
  loaded = {
    ...loaded,
    expenses: loaded.expenses.filter(e => e.recurring || new Date(e.createdAt) >= currentCycle.start),
    extraIncomes: (loaded.extraIncomes ?? []).filter(e => e.recurring || new Date(e.createdAt) >= currentCycle.start),
    history: purged.length ? keepExpenseRecords(loaded.history, purged) : loaded.history,
  };
  return loaded;
}

/**
 * One-time expenses are about to be cleared out, so their History record becomes the only
 * copy the old cycle has. Make sure each one has exactly one, carrying the expense's FINAL
 * amount (edits change the expense, not its record) and marked as cleared, so
 * calculateSealedCycleSummary counts it from here on. A missing record is written fresh:
 * this is what used to make an old cycle quietly lose an expense.
 */
function keepExpenseRecords(history: HistoryEntry[], purged: Expense[]): HistoryEntry[] {
  const next = history.slice();
  for (const e of purged) {
    // Linked by id, or (older records) the same title and amount with no link yet.
    const i = next.findIndex(h => h.type === 'expense' && (
      h.expenseId === e.id || (!h.expenseId && !h.expensePurged && h.debtTitle === e.title && h.amount === e.amount)
    ));
    if (i >= 0) {
      next[i] = { ...next[i], expenseId: e.id, amount: e.amount, expensePurged: true };
    } else {
      next.push({
        id: genId(), debtTitle: e.title, date: e.date, amount: e.amount, type: 'expense',
        note: e.note, expenseId: e.id, expensePurged: true,
      });
    }
  }
  return next;
}

/**
 * The salary history after changing the salary to `income` today. The new amount applies
 * from the cycle you are in. The first time it changes, the old salary is kept as the
 * amount for every cycle before, so those cycles do not pick up the new one.
 */
export function recordSalaryChange(state: AppState, income: number, now: Date): IncomeChange[] {
  const history = state.incomeHistory ?? [];
  if (income === state.monthlyIncome) return history;
  const key = cycleKey(now, normalizePayDay(state.userProfile.paydayDay));
  const base = history.length === 0 && state.monthlyIncome > 0
    ? [{ fromCycle: '0000-00', amount: state.monthlyIncome }]
    : history;
  return [...base.filter(h => h.fromCycle !== key), { fromCycle: key, amount: income }]
    .sort((a, b) => (a.fromCycle < b.fromCycle ? -1 : 1));
}
