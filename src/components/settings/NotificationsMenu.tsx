'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function NotificationsMenu() {
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  const handleToggle = (enabled: boolean) => {
    setRemindersEnabled(enabled);
    console.log(`This is a UI demonstration. True OS-level push notifications are not available in this web environment. Reminder state is now: ${enabled ? 'On' : 'Off'}.`);
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
            checked={remindersEnabled}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
