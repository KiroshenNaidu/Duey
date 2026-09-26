import { describe, expect, it } from 'vitest';
import { calculateSealedCycleSummary, salaryForCycle } from '../calculations';
import { recordSalaryChange } from '../rollover';
import { day, screenshotInput, screenshotState } from './fixtures';

describe('salary per cycle', () => {
  it('uses today\'s salary when it has never changed', () => {
    expect(salaryForCycle(6500, [], '2026-03')).toBe(6500);
  });

  it('keeps the old salary for cycles before a raise', () => {
    const history = [{ fromCycle: '0000-00', amount: 5000 }, { fromCycle: '2026-08', amount: 6500 }];
    expect(salaryForCycle(6500, history, '2026-07')).toBe(5000);
    expect(salaryForCycle(6500, history, '2026-08')).toBe(6500);
    expect(salaryForCycle(6500, history, '2026-10')).toBe(6500);
  });

  it('a closed cycle is worked out with the salary it really had', () => {
    const incomeHistory = [{ fromCycle: '0000-00', amount: 5000 }, { fromCycle: '2026-08', amount: 6500 }];
    expect(calculateSealedCycleSummary(screenshotInput({ incomeHistory }), '2026-07').income).toBe(5000);
    expect(calculateSealedCycleSummary(screenshotInput({ incomeHistory }), '2026-08').income).toBe(6500);
  });
});

describe('changing the salary', () => {
  const now = day(2026, 9, 26); // in the cycle that started 30 Aug ('2026-08')

  it('keeps the old amount for the cycles before, the first time it changes', () => {
    const history = recordSalaryChange(screenshotState({ monthlyIncome: 5000 }), 6500, now);
    expect(history).toEqual([{ fromCycle: '0000-00', amount: 5000 }, { fromCycle: '2026-08', amount: 6500 }]);
  });

  it('replaces a change made earlier in the same cycle', () => {
    const state = screenshotState({
      monthlyIncome: 6500,
      incomeHistory: [{ fromCycle: '0000-00', amount: 5000 }, { fromCycle: '2026-08', amount: 6500 }],
    });
    expect(recordSalaryChange(state, 7000, now)).toEqual([
      { fromCycle: '0000-00', amount: 5000 }, { fromCycle: '2026-08', amount: 7000 },
    ]);
  });

  it('records nothing when the amount did not change', () => {
    expect(recordSalaryChange(screenshotState({ monthlyIncome: 6500 }), 6500, now)).toEqual([]);
  });

  it('does not invent an old salary for someone setting it for the first time', () => {
    expect(recordSalaryChange(screenshotState({ monthlyIncome: 0 }), 6500, now)).toEqual([
      { fromCycle: '2026-08', amount: 6500 },
    ]);
  });
});
