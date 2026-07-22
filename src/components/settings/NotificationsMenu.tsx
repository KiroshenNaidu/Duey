'use client';

import { useContext, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { TimePicker } from '@/components/TimePicker';
import { Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface NotificationsMenuProps {
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (msg: string) => void;
  onCancel?: () => void;
}

export function NotificationsMenu({ onDirtyChange, onSaved, onCancel }: NotificationsMenuProps) {
  const { notificationSettings, setNotificationSettings, userProfile } = useContext(AppDataContext);
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const [draft, setDraft] = useState({ ...notificationSettings });
  const [draftDayStr, setDraftDayStr] = useState(String(notificationSettings.paydayDay));

  const isDirty = JSON.stringify(draft) !== JSON.stringify(notificationSettings);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const checkNative = async () => {
    if (isNative !== null) return isNative;
    const { Capacitor } = await import('@capacitor/core');
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    return native;
  };

  const draftTimeString = `${String(draft.hour).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`;

  const handleSave = async () => {
    const effectiveDay = draft.paydayDay || userProfile.paydayDay;
    // Master off forces every subordinate feature off in what we persist, so nothing
    // downstream (debt reminder sync included) can act on a stale enabled flag.
    const draftToSave = draft.masterEnabled
      ? { ...draft, paydayDay: effectiveDay }
      : { ...draft, paydayDay: effectiveDay, enabled: false };
    const native = await checkNative();
    if (native) {
      if (draftToSave.masterEnabled) {
        // Master ON is the single place the app asks Android for notification
        // permission — every scheduler elsewhere only checks, never prompts.
        try {
          const { LocalNotifications } = await import('@capacitor/local-notifications');
          const perm = await LocalNotifications.requestPermissions();
          if (perm.display !== 'granted') {
            setStatusMsg('Permission denied. Enable notifications in Android settings.');
            return;
          }
        } catch {
          setStatusMsg('Failed to request notification permission.');
          return;
        }
      }
      if (draftToSave.masterEnabled && draftToSave.enabled) {
        try {
          await scheduleNotification(
            effectiveDay,
            draftToSave.hour,
            draftToSave.minute,
            draftToSave.message,
          );
          setNotificationSettings(draftToSave);
          setStatusMsg('Notification scheduled!');
        } catch {
          setStatusMsg('Failed to schedule notification.');
          return;
        }
      } else {
        // Monthly reminder off (or master off) — cancel it. Per-debt due-day reminders
        // are cancelled by the AppDataContext sync effect reacting to masterEnabled.
        try {
          await cancelNotification();
          setNotificationSettings(draftToSave);
          setStatusMsg(draftToSave.masterEnabled ? '' : 'All notifications turned off.');
        } catch {
          setStatusMsg('Failed to cancel notification.');
          return;
        }
      }
    } else {
      setNotificationSettings(draftToSave);
    }

    onDirtyChange?.(false);
    onSaved?.('Notification settings saved');
  };

  const handleCancel = () => {
    setDraft({ ...notificationSettings });
    onDirtyChange?.(false);
    onCancel?.();
  };

  const handleDayChange = (val: string) => {
    setDraftDayStr(val);
    if (val === '') {
      setDraft(prev => ({ ...prev, paydayDay: 0 }));
      return;
    }
    const day = parseInt(val, 10);
    if (!isNaN(day) && day >= 0 && day <= 31) {
      setDraft(prev => ({ ...prev, paydayDay: day }));
    }
  };

  const handleTimeChange = (val: string) => {
    const [h, m] = val.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      setDraft(prev => ({ ...prev, hour: h, minute: m }));
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

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={handleCancel}>Cancel</Button>
        <Button
          className={cn('flex-1', isDirty && 'ring-2 ring-accent/50 ring-offset-1 ring-offset-background')}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>

      {/* MASTER switch — the one gate for ALL notifications (monthly + debt due-day
          reminders). Turning it on triggers the Android permission request on Save;
          turning it off cancels everything scheduled. */}
      <Card>
        <CardContent className="p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notif-master" className="text-sm font-semibold">Allow Notifications</Label>
              <p className="text-xs text-muted-foreground">Master switch — off means Duey sends nothing</p>
            </div>
            <Switch
              id="notif-master"
              checked={draft.masterEnabled}
              onCheckedChange={(v) => setDraft(prev => ({ ...prev, masterEnabled: v }))}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Covers the monthly reminder below and every per-debt due-day reminder.
            Android will ask for permission when you save with this on.
          </p>
        </CardContent>
      </Card>

      <Card className={cn(!draft.masterEnabled && 'opacity-50')}>
        <CardContent className="p-3 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payment Reminders</p>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notif-toggle" className="text-sm font-semibold">Monthly Reminder</Label>
              <p className="text-xs text-muted-foreground">Remind me to log payments each month</p>
            </div>
            <Switch
              id="notif-toggle"
              checked={draft.enabled}
              disabled={!draft.masterEnabled}
              onCheckedChange={(v) => setDraft(prev => ({ ...prev, enabled: v }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reminder Day (1–31)</Label>
            <Input
              type="number"
              min={0}
              max={31}
              value={draftDayStr}
              onChange={e => handleDayChange(e.target.value)}
              disabled={!draft.masterEnabled || !draft.enabled}
            />
            <p className="text-[10px] text-muted-foreground">
              Defaults to your payday ({userProfile.paydayDay}th). Change in Profile if needed.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reminder Time</Label>
            <TimePicker
              value={draftTimeString}
              onChange={handleTimeChange}
              disabled={!draft.masterEnabled || !draft.enabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notification Message</Label>
            <Textarea
              placeholder="Time to log your monthly payments."
              value={draft.message}
              onChange={e => setDraft(prev => ({ ...prev, message: e.target.value }))}
              rows={2}
              className="resize-none text-sm"
              disabled={!draft.masterEnabled || !draft.enabled}
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
