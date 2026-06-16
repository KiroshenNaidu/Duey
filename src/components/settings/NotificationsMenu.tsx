'use client';

import { useContext, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Smartphone } from 'lucide-react';

async function scheduleNotification(paydayDay: number, hour: number, minute: number, message: string) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.createChannel({
    id: 'payment-reminders',
    name: 'Payment Reminders',
    description: 'Monthly payment logging reminders',
    importance: 4,
    visibility: 1,
  });
  await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        title: 'Duey — Payment Reminder',
        body: message || 'Time to log your monthly payments.',
        id: 1,
        schedule: {
          on: { day: paydayDay, hour, minute },
          repeats: true,
          allowWhileIdle: true,
        },
        channelId: 'payment-reminders',
      },
    ],
  });
}

async function cancelNotification() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
}

export function NotificationsMenu() {
  const { notificationSettings, setNotificationSettings, userProfile } = useContext(AppDataContext);
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [messageInput, setMessageInput] = useState(notificationSettings.message ?? 'Time to log your monthly payments.');

  const checkNative = async () => {
    if (isNative !== null) return isNative;
    const { Capacitor } = await import('@capacitor/core');
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    return native;
  };

  const timeString = `${String(notificationSettings.hour).padStart(2, '0')}:${String(notificationSettings.minute).padStart(2, '0')}`;

  const handleToggle = async (enabled: boolean) => {
    const native = await checkNative();

    if (enabled && native) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display !== 'granted') {
          setStatusMsg('Permission denied. Enable notifications in Android settings.');
          return;
        }
        await scheduleNotification(
          notificationSettings.paydayDay || userProfile.paydayDay,
          notificationSettings.hour,
          notificationSettings.minute,
          notificationSettings.message,
        );
        setStatusMsg('Notification scheduled!');
      } catch {
        setStatusMsg('Failed to schedule notification.');
        return;
      }
    } else if (!enabled && native) {
      await cancelNotification();
      setStatusMsg('');
    }

    setNotificationSettings({ ...notificationSettings, enabled });
  };

  const handleDayChange = async (val: string) => {
    const day = parseInt(val, 10);
    if (isNaN(day) || day < 1 || day > 31) return;
    const updated = { ...notificationSettings, paydayDay: day };
    setNotificationSettings(updated);
    if (updated.enabled && (await checkNative())) {
      await scheduleNotification(day, updated.hour, updated.minute, updated.message);
    }
  };

  const handleTimeChange = async (val: string) => {
    const [h, m] = val.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return;
    const updated = { ...notificationSettings, hour: h, minute: m };
    setNotificationSettings(updated);
    if (updated.enabled && (await checkNative())) {
      await scheduleNotification(updated.paydayDay, h, m, updated.message);
    }
  };

  const saveMessage = async () => {
    const trimmed = messageInput.trim() || 'Time to log your monthly payments.';
    const updated = { ...notificationSettings, message: trimmed };
    setNotificationSettings(updated);
    if (updated.enabled && (await checkNative())) {
      await scheduleNotification(updated.paydayDay, updated.hour, updated.minute, trimmed);
    }
  };

  return (
    <div className="space-y-3">
      {isNative === false && (
        <Card>
          <CardContent className="p-3 flex items-start gap-2.5">
            <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Notifications only work on the Android app. Settings are saved and will apply after{' '}
              <span className="font-medium text-foreground">npm run build → npx cap sync → Android Studio build</span>.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payment Reminders</p>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notif-toggle" className="text-sm font-semibold">Monthly Reminder</Label>
              <p className="text-xs text-muted-foreground">Remind me to log payments each month</p>
            </div>
            <Switch
              id="notif-toggle"
              checked={notificationSettings.enabled}
              onCheckedChange={handleToggle}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reminder Day (1–31)</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={notificationSettings.paydayDay}
              onChange={e => handleDayChange(e.target.value)}
              disabled={!notificationSettings.enabled}
            />
            <p className="text-[10px] text-muted-foreground">
              Defaults to your payday ({userProfile.paydayDay}th). Change in Profile if needed.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reminder Time</Label>
            <Input
              type="time"
              value={timeString}
              onChange={e => handleTimeChange(e.target.value)}
              disabled={!notificationSettings.enabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notification Message</Label>
            <Textarea
              placeholder="Time to log your monthly payments."
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onBlur={saveMessage}
              rows={2}
              className="resize-none text-sm"
              disabled={!notificationSettings.enabled}
            />
            <p className="text-[10px] text-muted-foreground">
              This appears as the notification body on your Android device.
            </p>
          </div>

          {statusMsg && (
            <p className="text-xs text-accent font-medium">{statusMsg}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
