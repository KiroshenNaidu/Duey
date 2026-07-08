import type { Debt } from './types';

// Per-debt due-date reminders (Android only). Debts with no dueDay set get NO reminder —
// the feature is purely opt-in per debt. Notification ids are derived from the debt id so
// rescheduling replaces rather than duplicates; the whole id block is cleared first so
// removed/completed debts lose their reminders.

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
 */
export async function syncDebtReminders(debts: Debt[], hour = 9, minute = 0): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    // Clear every previously scheduled debt reminder (including ones for deleted debts).
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter(
      n => n.id >= DEBT_NOTIFICATION_ID_BASE && n.id < DEBT_NOTIFICATION_ID_BASE + DEBT_NOTIFICATION_ID_RANGE
    );
    if (stale.length > 0) {
      await LocalNotifications.cancel({ notifications: stale.map(n => ({ id: n.id })) });
    }

    const withDueDay = debts.filter(d => d.dueDay != null && d.dueDay >= 1 && d.dueDay <= 31);
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
        body: `Installment of R${d.installment_amount} is due today.`,
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
