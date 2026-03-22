'use client';

import { useContext, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AppDataContext } from '@/context/AppDataContext';
import { LocalNotifications } from '@capacitor/local-notifications';

export function NotificationsMenu() {
  const { notificationsEnabled, setNotificationsEnabled } = useContext(AppDataContext);

  // 1. Request permissions on mount (standard Android behavior)
  useEffect(() => {
    LocalNotifications.requestPermissions();
  }, []);

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      const permission = await LocalNotifications.checkPermissions();
      
      if (permission.display !== 'granted') {
        const request = await LocalNotifications.requestPermissions();
        if (request.display !== 'granted') {
          alert('Please enable notifications in Android Settings to receive reminders.');
          return;
        }
      }

      // 2. Schedule the Monthly Notification
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: "Monthly Reminder",
              body: "Dont forget to check your debts and make your payments :3.",
              id: 26, // Unique ID for this specific reminder type
              schedule: {
                on: {
                  day: 26,
                  hour: 18,
                  minute: 0
                },
                allowWhileIdle: true, // Crucial for Android battery saving modes
                every: 'month'
              },
              sound: 'default',
              actionTypeId: "",
              extra: null
            }
          ]
        });
        setNotificationsEnabled(true);
      } catch (error) {
        console.error("Failed to schedule notification", error);
      }
    } else {
      // 3. Cancel notifications if user toggles off
      await LocalNotifications.cancel({ notifications: [{ id: 26 }] });
      setNotificationsEnabled(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="monthly-reminders" className="text-base font-semibold">
              Monthly Reminders
            </Label>
            <p className="text-sm text-muted-foreground">
              Get a reminder on the 26th at 18:00.
            </p>
          </div>
          <Switch
            id="monthly-reminders"
            checked={notificationsEnabled}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}