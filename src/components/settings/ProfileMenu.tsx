'use client';

import { useContext, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ProfileMenu() {
  const { userProfile, setUserProfile } = useContext(AppDataContext);

  const [name, setName] = useState(userProfile.name);
  const [paydayDay, setPaydayDay] = useState(userProfile.paydayDay.toString());

  const saveName = () => {
    if (name.trim() !== userProfile.name) {
      setUserProfile({ ...userProfile, name: name.trim() });
    }
  };

  const savePayday = () => {
    const day = parseInt(paydayDay, 10);
    if (!isNaN(day) && day >= 1 && day <= 31 && day !== userProfile.paydayDay) {
      setUserProfile({ ...userProfile, paydayDay: day });
    } else {
      setPaydayDay(userProfile.paydayDay.toString());
    }
  };

  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Personal Info</p>

          <div className="space-y-1.5">
            <Label className="text-xs">Your Name</Label>
            <Input
              placeholder="e.g., Kiroshen"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => e.key === 'Enter' && saveName()}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Payday (day of month)</Label>
            <Input
              type="number"
              min={1}
              max={31}
              placeholder="e.g., 26"
              value={paydayDay}
              onChange={e => setPaydayDay(e.target.value)}
              onBlur={savePayday}
              onKeyDown={e => e.key === 'Enter' && savePayday()}
            />
            {!isNaN(parseInt(paydayDay, 10)) && (
              <p className="text-[10px] text-muted-foreground">
                You get paid on the {ordinal(parseInt(paydayDay, 10))} of each month
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">About</p>
          <p className="text-sm text-foreground font-medium">Duey</p>
          <p className="text-xs text-muted-foreground">Personal finance tracker</p>
          <p className="text-xs text-muted-foreground mt-1">Built by Kiroshen · v1.0</p>
        </CardContent>
      </Card>
    </div>
  );
}
