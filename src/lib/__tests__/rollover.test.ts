import { describe, expect, it } from 'vitest';
import { cycleHasEnded, rollOverCycles } from '../rollover';
import { LEFTOVERS_BANK_ID } from '../piggybanks';
import { calculateSealedCycleSummary } from '../calculations';
import { day, iso, screenshotState } from './fixtures';

const BEFORE_PAYDAY = day(2026, 9, 29, 23);
const PAYDAY = day(2026, 9, 30, 0);

describe('knowing when a cycle has ended', () => {
  it('waits until pay day', () => {
    expect(cycleHasEnded(screenshotState(), BEFORE_PAYDAY)).toBe(false);
    expect(cycleHasEnded(screenshotState(), PAYDAY)).toBe(true);
  });

  it('does nothing on a fresh install', () => {
    expect(cycleHasEnded(screenshotState({ lastSnapshotMonth: '' }), PAYDAY)).toBe(false);
  });
});

describe('the end-of-cycle sweep into Savings', () => {
  it('banks exactly what Balance had left into Leftovers', () => {
    const next = rollOverCycles(screenshotState(), PAYDAY);
    const swept = next.savings.filter(s => s.source === 'auto');
    expect(swept).toHaveLength(1);
    expect(swept[0].amount).toBe(669);
    expect(swept[0].cycleKey).toBe('2026-08');
    expect(swept[0].bankId).toBe(LEFTOVERS_BANK_ID);
    expect(next.lastSnapshotMonth).toBe('2026-09');
  });

  it('writes a summary of the closed cycle to History', () => {
    const next = rollOverCycles(screenshotState(), PAYDAY);
    const summary = next.history.find(h => h.type === 'snapshot');
    expect(summary?.snapshot?.remaining).toBe(669);
    expect(summary?.snapshot?.income).toBe(6500);
  });

  it('never banks the same cycle twice', () => {
    const once = rollOverCycles(screenshotState(), PAYDAY);
    const twice = rollOverCycles({ ...once, lastSnapshotMonth: '2026-08' }, PAYDAY);
    expect(twice.savings.filter(s => s.source === 'auto')).toHaveLength(1);
    expect(twice.history.filter(h => h.type === 'snapshot')).toHaveLength(1);
  });

  it('banks nothing when the cycle ended short', () => {
    const state = screenshotState({ monthlyIncome: 5000 });
    const next = rollOverCycles(state, PAYDAY);
    expect(next.savings.filter(s => s.source === 'auto')).toHaveLength(0);
    expect(next.history.find(h => h.type === 'snapshot')?.snapshot?.remaining).toBe(-831);
  });

  it('clears one-time expenses on pay day but keeps recurring ones', () => {
    const state = screenshotState({
      expenses: [
        ...screenshotState().expenses,
        { id: 'shoes', title: 'Shoes', amount: 400, date: iso(2026, 9, 12), createdAt: iso(2026, 9, 12) },
      ],
    });
    const next = rollOverCycles(state, PAYDAY);
    expect(next.expenses.map(e => e.id)).toEqual(['rent']);
    // The shoes still counted in the cycle they were bought in.
    expect(next.history.find(h => h.type === 'snapshot')?.snapshot?.expenses).toBe(4139);
  });

  it('turns a standing order into a real deposit and leaves the rest as leftover', () => {
    const state = screenshotState({
      recurringSavings: [{ id: 'so', bankId: 'bank-general', amount: 200, label: 'Payday transfer', createdAt: iso(2026, 9, 1), startCycleKey: '2026-08' }],
    });
    const next = rollOverCycles(state, PAYDAY);
    const order = next.savings.find(s => s.source === 'recurring');
    expect(order?.amount).toBe(200);
    expect(next.savings.find(s => s.source === 'auto')?.amount).toBe(469);
  });

  it('catches up every cycle missed while the app was closed', () => {
    const next = rollOverCycles(screenshotState({ lastSnapshotMonth: '2026-06' }), PAYDAY);
    expect(next.history.filter(h => h.type === 'snapshot')).toHaveLength(3);
    expect(next.lastSnapshotMonth).toBe('2026-09');
  });
});

describe('cycle-end expenses match Balance, whatever happened to History', () => {
  const shoes = { id: 'shoes', title: 'Shoes', amount: 400, date: iso(2026, 9, 12), createdAt: iso(2026, 9, 12) };

  it('uses the edited amount, not the amount it was first logged at', () => {
    const state = screenshotState({
      expenses: [...screenshotState().expenses, { ...shoes, amount: 350 }],
      history: [...screenshotState().history, { id: 'shoes-log', debtTitle: 'Shoes', type: 'expense', amount: 400, date: shoes.date, expenseId: 'shoes' }],
    });
    const next = rollOverCycles(state, PAYDAY);
    expect(next.history.find(h => h.type === 'snapshot')?.snapshot?.expenses).toBe(3739 + 350);
    expect(next.savings.find(s => s.source === 'auto')?.amount).toBe(669 - 350);
  });

  it('ignores an expense you deleted, even though its History record is still there', () => {
    const state = screenshotState({
      history: [...screenshotState().history, { id: 'shoes-log', debtTitle: 'Shoes', type: 'expense', amount: 400, date: shoes.date, expenseId: 'shoes' }],
    });
    const next = rollOverCycles(state, PAYDAY);
    expect(next.savings.find(s => s.source === 'auto')?.amount).toBe(669);
  });

  it('keeps counting a cleared one-time expense when an old cycle is worked out again', () => {
    const state = screenshotState({ expenses: [...screenshotState().expenses, shoes] });
    const next = rollOverCycles(state, PAYDAY);
    // The shoes are gone from the list now, and a record was written to keep them.
    expect(next.expenses.find(e => e.id === 'shoes')).toBeUndefined();
    const record = next.history.find(h => h.expenseId === 'shoes');
    expect(record?.expensePurged).toBe(true);
    expect(record?.amount).toBe(400);
    const again = calculateSealedCycleSummary({ ...next, payDay: 30 }, '2026-08');
    expect(again.expenses).toBe(3739 + 400);
  });

  it('still counts old records from before expenses were linked', () => {
    const state = screenshotState({
      history: [...screenshotState().history, { id: 'old', debtTitle: 'Groceries', type: 'expense', amount: 250, date: iso(2026, 7, 5) }],
    });
    // 30 Jun to 29 Jul: before the rent was added, so only the groceries count.
    expect(calculateSealedCycleSummary({ ...state, payDay: 30 }, '2026-06').expenses).toBe(250);
  });
});
