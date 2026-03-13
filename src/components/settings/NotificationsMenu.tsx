'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export function NotificationsMenu() {
  // As a web application, we cannot reliably schedule OS-level notifications
  // that persist after the app is closed or the device is restarted.
  // This UI is a placeholder to fulfill the design request.
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const { toast } = useToast();

  const handleToggle = (enabled: boolean) => {
    setRemindersEnabled(enabled);
    toast({
      title: 'Notifications Mockup',
      description: `This is a UI demonstration. True OS-level push notifications are not available in this web environment. Reminder state is now: ${enabled ? 'On' : 'Off'}.`,
    });
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
