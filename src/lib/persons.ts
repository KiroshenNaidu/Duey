import type { HistoryEntry } from './types';

// Canonical identity for a person: trimmed, lowercased, internal whitespace collapsed. Every
// decision about "is this the same person" (dedupe, matching, stat aggregation, rename) runs on
// this key, so "John", " john ", and "John  Smith" behave as one person everywhere.
export const personKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

// The debt-history entry types that belong to a person. Transport/expense/budget/etc. never do,
// so renaming a person must never touch them even if a title happens to collide.
export const PERSON_ENTRY_TYPES: HistoryEntry['type'][] = ['payment', 'creation', 'completion'];

export interface PersonProfile {
  key: string;          // canonical identity (see personKey)
  name: string;         // display spelling — from the most recent debt added for them
  timesInDebt: number;  // debts you've opened with this person
  totalPaid: number;    // total ever paid to them, across every debt
  completions: number;  // debts of theirs you've fully paid off
  lastActivity: number; // ms of their most recent event, for recency ranking
}

// Build one profile per person from the history log. There is no separate person store — this
// is the sole derivation, shared by the Add-Debt suggestions and the People manager so they can
// never disagree. Payments/completions are routed through their debtId back to the person's
// creation key, so stats stay correct even after a debt is renamed.
export function derivePersonProfiles(history: HistoryEntry[]): PersonProfile[] {
  const debtIdToKey = new Map<string, string>();
  for (const h of history) {
    if (h.type === 'creation' && h.debtId) debtIdToKey.set(h.debtId, personKey(h.debtTitle));
  }

  type Acc = PersonProfile & { nameTime: number };
  const profiles = new Map<string, Acc>();
  const ensure = (key: string): Acc => {
    let p = profiles.get(key);
    if (!p) { p = { key, name: '', nameTime: -1, timesInDebt: 0, totalPaid: 0, completions: 0, lastActivity: 0 }; profiles.set(key, p); }
    return p;
  };

  for (const h of history) {
    const t = new Date(h.date).getTime();
    if (h.type === 'creation') {
      const key = personKey(h.debtTitle);
      if (!key) continue; // blank titles aren't a person
      const p = ensure(key);
      p.timesInDebt++;
      if (t >= p.nameTime) { p.name = h.debtTitle.trim(); p.nameTime = t; }
      p.lastActivity = Math.max(p.lastActivity, t);
    } else if (h.type === 'payment' || h.type === 'completion') {
      // Route via debtId so a renamed debt's payments still land on the right person.
      const key = h.debtId ? debtIdToKey.get(h.debtId) : undefined;
      if (!key) continue;
      const p = ensure(key);
      if (h.type === 'payment') p.totalPaid += h.amount;
      else p.completions++;
      p.lastActivity = Math.max(p.lastActivity, t);
    }
  }

  // Most recently active first — a sensible default for both the dropdown and the manager.
  return [...profiles.values()]
    .map(({ nameTime: _nameTime, ...p }) => p)
    .sort((a, b) => b.lastActivity - a.lastActivity);
}
