import type { Debt, HistoryEntry } from './types';
import { getRemainingBalance } from './calculations';
import { formatCurrency } from './utils';

// Per-debt due-date reminders (Android only). Debts with no dueDay set get NO reminder —
// the feature is purely opt-in per debt. Notification ids are derived from the debt id so
// rescheduling replaces rather than duplicates; the whole id block is cleared first so
// removed/completed debts lose their reminders.
//
// The Settings → Notifications master switch governs this feature: when it is off, every
// pending debt reminder is cancelled and nothing new is scheduled. Permission is never
// requested here — it is requested exactly once, from the Notifications settings screen
// when the user turns the master switch on. This sync only ever runs with an
// already-granted permission.

// Keep clear of id 1 (the monthly payment reminder in NotificationsMenu).
const DEBT_NOTIFICATION_ID_BASE = 100000;
const DEBT_NOTIFICATION_ID_RANGE = 100000;

/** Stable numeric notification id for a debt (Capacitor requires Java-int ids). */
export function debtNotificationId(debtId: string): number {
  let hash = 0;
  for (let i = 0; i < debtId.length; i++) {
    hash = (hash * 31 + debtId.charCodeAt(i)) | 0;
  }
  return DEBT_NOTIFICATION_ID_BASE + (Math.abs(hash) % DEBT_NOTIFICATION_ID_RANGE);
}

/**
 * Cancel-and-reschedule all per-debt reminders to match the current debt list.
 * Fire-and-forget safe: resolves silently on web or when permission is missing.
 *
 * masterEnabled — Settings → Notifications master switch. false clears everything
 * pending and schedules nothing. history is needed to skip fully-paid debts.
 */
export async function syncDebtReminders(
  debts: Debt[],
  history: HistoryEntry[],
  masterEnabled: boolean,
  hour = 9,
  minute = 0,
): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { LocalNotifications } = await import('@capacitor/local-notifications');

    // Clear every previously scheduled debt reminder (including ones for deleted debts).
    // Runs even when the master switch is off so flipping it off wipes pending reminders.
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter(
      n => n.id >= DEBT_NOTIFICATION_ID_BASE && n.id < DEBT_NOTIFICATION_ID_BASE + DEBT_NOTIFICATION_ID_RANGE
    );
    if (stale.length > 0) {
      await LocalNotifications.cancel({ notifications: stale.map(n => ({ id: n.id })) });
    }

    if (!masterEnabled) return;

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    // Only debts that still owe money — a fully paid debt must stop reminding even if
    // the user hasn't archived it yet.
    const withDueDay = debts.filter(d =>
      d.dueDay != null && d.dueDay >= 1 && d.dueDay <= 31 &&
      getRemainingBalance(d, history) > 0
    );
    if (withDueDay.length === 0) return;

    await LocalNotifications.createChannel({
      id: 'debt-reminders',
      name: 'Debt Due Dates',
      description: 'Reminders for debts with a due day set',
      importance: 4,
      visibility: 1,
    });

    await LocalNotifications.schedule({
      notifications: withDueDay.map(d => ({
        title: `Duey — ${d.title} due`,
        body: `Installment of ${formatCurrency(d.installment_amount)} is due today.`,
        id: debtNotificationId(d.id),
        schedule: {
          on: { day: d.dueDay as number, hour, minute },
          repeats: true,
          allowWhileIdle: true,
        },
        channelId: 'debt-reminders',
      })),
    });
  } catch {
    // Never let reminder plumbing break the app — reminders are best-effort.
  }
}
