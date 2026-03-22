'use client';

import { useContext } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AppDataContext } from '@/context/AppDataContext';

export function NotificationsMenu() {
  const { notificationsEnabled, setNotificationsEnabled } = useContext(AppDataContext);

  const handleToggle = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    if (enabled) {
      console.log('User enabled monthly reminders. Note: True OS-level push notifications require a native wrapper or service worker setup.');
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="monthly-reminders" className="text-base font-semibold">Monthly Reminders</Label>
            <p className="text-sm text-muted-foreground">Get a reminder on the 26th at 18:00.</p>
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
