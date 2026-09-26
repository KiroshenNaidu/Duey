import { describe, expect, it } from 'vitest';
import { calculateLiveMonthly, calculateSealedCycleSummary, getPayCycle } from '../calculations';
import { day, iso, sam, screenshotInput } from './fixtures';

const TODAY = day(2026, 9, 26);

describe('pay cycles', () => {
  it('runs from pay day to the day before the next pay day', () => {
    const cycle = getPayCycle(30, TODAY);
    expect(cycle.key).toBe('2026-08');
    expect(cycle.start).toEqual(new Date(2026, 7, 30));
    expect(cycle.end).toEqual(new Date(2026, 8, 30));
  });

  it('turns over on pay day itself', () => {
    expect(getPayCycle(30, day(2026, 9, 29, 23)).key).toBe('2026-08');
    expect(getPayCycle(30, day(2026, 9, 30, 0)).key).toBe('2026-09');
  });
});

describe('Balance for the running cycle', () => {
  it('matches the Balance screen: R6500 in, R5831 out, R669 left', () => {
    const m = calculateLiveMonthly(screenshotInput(), TODAY);
    expect(m.income).toBe(6500);
    expect(m.transport).toBe(1800);
    expect(m.uber).toBe(182);
    expect(m.debt).toBe(60);
    expect(m.expenses).toBe(3739);
    expect(m.loans).toBe(50);
    expect(m.totalOutgoings).toBe(5831);
    expect(m.remaining).toBe(669);
  });

  it('shrinks the loan deduction when some is paid back', () => {
    const loans = [sam([
      { id: 'e1', type: 'lent', amount: 50, date: '2026-09-10', createdAt: iso(2026, 9, 10) },
      { id: 'e2', type: 'repaid', amount: 20, date: '2026-09-20', createdAt: iso(2026, 9, 20) },
    ])];
    const m = calculateLiveMonthly(screenshotInput({ loans }), TODAY);
    expect(m.loans).toBe(30);
    expect(m.remaining).toBe(689);
  });

  it('takes money put into savings off, and adds money taken out back on', () => {
    const putIn = calculateLiveMonthly(screenshotInput({
      savings: [{ id: 's1', amount: 100, cycleKey: '2026-08', label: 'Put away', source: 'manual', direction: 'in', createdAt: iso(2026, 9, 20) }],
    }), TODAY);
    expect(putIn.savings).toBe(100);
    expect(putIn.remaining).toBe(569);

    const takenOut = calculateLiveMonthly(screenshotInput({
      savings: [{ id: 's2', amount: 100, cycleKey: '2026-08', label: 'Taken out', source: 'manual', direction: 'out', createdAt: iso(2026, 9, 20) }],
    }), TODAY);
    expect(takenOut.savings).toBe(-100);
    expect(takenOut.remaining).toBe(769);
  });

  it('never deducts the automatic leftover, because it IS what was left', () => {
    const m = calculateLiveMonthly(screenshotInput({
      savings: [{ id: 'auto', amount: 669, cycleKey: '2026-08', label: 'Leftover', source: 'auto', direction: 'in', createdAt: iso(2026, 9, 29) }],
    }), TODAY);
    expect(m.remaining).toBe(669);
  });

  it('adds extra income on top of salary', () => {
    const m = calculateLiveMonthly(screenshotInput({
      extraIncomes: [{ id: 'x', label: 'Bonus', amount: 500, createdAt: iso(2026, 9, 15) }],
    }), TODAY);
    expect(m.income).toBe(7000);
    expect(m.remaining).toBe(1169);
  });
});

describe('a closed cycle, worked out again later', () => {
  it('gives the same numbers Balance showed before it closed', () => {
    const live = calculateLiveMonthly(screenshotInput(), TODAY);
    const sealed = calculateSealedCycleSummary(screenshotInput(), '2026-08');
    expect(sealed.remaining).toBe(live.remaining);
    expect(sealed.totalOutgoings).toBe(live.totalOutgoings);
  });

  it('counts only what was still owed on loans when the cycle closed', () => {
    const loans = [sam([
      { id: 'e1', type: 'lent', amount: 50, date: '2026-09-10', createdAt: iso(2026, 9, 10) },
      // Paid back AFTER the cycle closed, so the closed cycle still counts all 50.
      { id: 'e2', type: 'repaid', amount: 50, date: '2026-10-02', createdAt: iso(2026, 10, 2) },
    ])];
    expect(calculateSealedCycleSummary(screenshotInput({ loans }), '2026-08').loans).toBe(50);
  });

  it('counts a one-time extra income only in the cycle it came in', () => {
    const extraIncomes = [{ id: 'x', label: 'Bonus', amount: 500, createdAt: iso(2026, 9, 15) }];
    expect(calculateSealedCycleSummary(screenshotInput({ extraIncomes }), '2026-08').income).toBe(7000);
    expect(calculateSealedCycleSummary(screenshotInput({ extraIncomes }), '2026-09').income).toBe(6500);
  });

  it('counts a recurring extra income in every cycle from when it started', () => {
    const extraIncomes = [{ id: 'x', label: 'Side job', amount: 300, createdAt: iso(2026, 9, 15), recurring: true }];
    expect(calculateSealedCycleSummary(screenshotInput({ extraIncomes }), '2026-07').income).toBe(6500);
    expect(calculateSealedCycleSummary(screenshotInput({ extraIncomes }), '2026-08').income).toBe(6800);
    expect(calculateSealedCycleSummary(screenshotInput({ extraIncomes }), '2026-09').income).toBe(6800);
  });
});
