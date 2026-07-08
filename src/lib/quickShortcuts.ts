import type { ElementType } from 'react';
import {
  CreditCard, Receipt, BadgeDollarSign, Car, PlusCircle, Bus, PiggyBank, ListPlus,
  Calculator, StickyNote, Palette, History,
} from 'lucide-react';

// Catalogue of every shortcut the quick-add radial can hold. The user picks which ones
// (and their arc order) in Theme → Style → Quick Menu; the selection is stored as
// AppState.quickAddShortcuts (ordered ids).
//
// kind 'form' → opens a mini-form dialog that logs data for today (default).
// kind 'nav'  → opens a tool / navigates instead (handled in QuickAdd.pick()).
//
// Adding a new shortcut:
//   1. Add an entry here (id, labels, icon, kind).
//   2. form → add its mini-form to the dialog switch in QuickAdd.tsx.
//      nav  → add its case to runNavShortcut() in QuickAdd.tsx.
// Everything else (radial, config UI, catalogue popup) picks it up automatically.

export interface QuickShortcut {
  id: string;
  label: string;        // short label under the radial icon
  title: string;        // dialog heading (form shortcuts)
  description: string;  // shown in the "add shortcut" catalogue
  icon: ElementType;
  kind?: 'form' | 'nav'; // default 'form'
}

export const QUICK_SHORTCUTS: QuickShortcut[] = [
  { id: 'payment', label: 'Payment', title: 'Debt payment', description: 'Log money paid to one of your debts today', icon: CreditCard },
  { id: 'expense', label: 'Expense', title: 'Add expense', description: 'Log a one-time or recurring expense', icon: Receipt },
  { id: 'income', label: 'Income', title: 'Extra income', description: 'Log extra income — freelance, gift, bonus…', icon: BadgeDollarSign },
  { id: 'uber', label: 'Uber', title: 'Uber ride', description: 'Log an Uber ride on today’s date', icon: Car },
  { id: 'debt', label: 'New debt', title: 'Add new debt', description: 'Start tracking a new debt (title, total, installment)', icon: PlusCircle },
  { id: 'transport-paid', label: 'Transport', title: 'Pay transport', description: 'Mark this month’s transport as paid in one tap', icon: Bus },
  { id: 'budget-plan', label: 'Budget', title: 'New budget plan', description: 'Create a new budget plan with a spending ceiling', icon: PiggyBank },
  { id: 'budget-item', label: 'Item', title: 'Add budget item', description: 'Add an item to one of your budget plans', icon: ListPlus },
  // Nav / tool shortcuts — open something instead of logging data.
  { id: 'calculator', label: 'Calc', title: 'Calculator', description: 'Open the floating calculator', icon: Calculator, kind: 'nav' },
  { id: 'notes', label: 'Notes', title: 'Notes', description: 'Open your quick notepad', icon: StickyNote, kind: 'nav' },
  { id: 'theme', label: 'Theme', title: 'Theme', description: 'Jump to theme settings', icon: Palette, kind: 'nav' },
  { id: 'history', label: 'History', title: 'History', description: 'Open the full history page', icon: History, kind: 'nav' },
];

export const DEFAULT_QUICK_SHORTCUTS = ['payment', 'expense', 'income', 'uber'];
export const MIN_QUICK_SHORTCUTS = 1;
export const MAX_QUICK_SHORTCUTS = 7;

export function getShortcut(id: string): QuickShortcut | undefined {
  return QUICK_SHORTCUTS.find(s => s.id === id);
}

/** Filter a stored list down to known ids, deduped, clamped to the max. Falls back to
 *  the defaults if nothing valid remains — the radial must never be empty. */
export function sanitizeShortcuts(ids: string[] | undefined): string[] {
  const known = new Set(QUICK_SHORTCUTS.map(s => s.id));
  const clean = [...new Set((ids ?? []).filter(id => known.has(id)))].slice(0, MAX_QUICK_SHORTCUTS);
  return clean.length >= MIN_QUICK_SHORTCUTS ? clean : [...DEFAULT_QUICK_SHORTCUTS];
}
