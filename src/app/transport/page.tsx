'use client';

import { useState, useMemo, useContext, useEffect } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import { AppDataContext } from '@/context/AppDataContext';
import { format, getDaysInMonth, startOfMonth, getDay, add, sub, isSameMonth, isSameDay, isWeekend } from 'date-fns';
import { ChevronLeft, ChevronRight, Edit, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { formatCurrency, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

type TransportSettings = {
  driverName: string;
  dailyFee: number;
};

type TransportOverrides = {
  [key: string]: boolean; // ISODateString: isTravelDay
};

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TransportPage() {
  const [settings, setSettings] = useLocalStorage<TransportSettings>('transportSettings', { driverName: '', dailyFee: 0 });
  const [overrides, setOverrides] = useLocalStorage<TransportOverrides>('transportOverrides', {});
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEditingCalendar, setIsEditingCalendar] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { logTransportPayment } = useContext(AppDataContext);
  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSettingsChange = (field: keyof TransportSettings, value: string | number) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const { daysInMonth, travelDaysCount, totalDue } = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const daysInMonth = Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => add(monthStart, { days: i }));

    let travelDaysCount = 0;
    daysInMonth.forEach(day => {
      const isoDate = day.toISOString().split('T')[0];
      const isOverridden = overrides[isoDate] !== undefined;
      const isTravelDay = isOverridden ? overrides[isoDate] : !isWeekend(day);
      if (isTravelDay) {
        travelDaysCount++;
      }
    });

    const totalDue = travelDaysCount * (settings.dailyFee || 0);

    return { daysInMonth, travelDaysCount, totalDue };
  }, [currentDate, overrides, settings.dailyFee]);

  const handleDayToggle = (day: Date) => {
    if (!isEditingCalendar) return;
    const isoDate = day.toISOString().split('T')[0];
    const isCurrentlyTravelDay = overrides[isoDate] !== undefined ? overrides[isoDate] : !isWeekend(day);
    setOverrides(prev => ({ ...prev, [isoDate]: !isCurrentlyTravelDay }));
  };

  const handleMarkAsPaid = () => {
    if (totalDue <= 0) {
      toast({ title: "Nothing to pay", description: "Total amount for the month is zero.", variant: 'default' });
      return;
    }
    logTransportPayment(totalDue, format(currentDate, 'MMMM yyyy'));
    
    // Clear overrides for the current month
    const newOverrides = { ...overrides };
    daysInMonth.forEach(day => {
      const isoDate = day.toISOString().split('T')[0];
      delete newOverrides[isoDate];
    });
    setOverrides(newOverrides);
  };

  const firstDayOfMonth = getDay(startOfMonth(currentDate));

  if (!isClient) {
    return (
      <div className="container mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold text-foreground">Transport</h1>

      <Accordion type="single" collapsible>
        <AccordionItem value="settings">
          <AccordionTrigger>
            <div className='flex justify-between w-full pr-4 items-center'>
              <h2 className="text-xl font-semibold">Settings</h2>
              <span className='text-sm text-muted-foreground'>{settings.driverName} - {formatCurrency(settings.dailyFee)}/day</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="driverName">Driver Name</Label>
              <Input
                id="driverName"
                value={settings.driverName}
                onChange={e => handleSettingsChange('driverName', e.target.value)}
                placeholder="e.g., John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailyFee">Daily Fee (R)</Label>
              <Input
                id="dailyFee"
                type="number"
                value={settings.dailyFee}
                onChange={e => handleSettingsChange('dailyFee', parseFloat(e.target.value) || 0)}
                placeholder="e.g., 50"
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(sub(currentDate, { months: 1 }))}>
              <ChevronLeft />
            </Button>
            <CardTitle className="text-center">{format(currentDate, 'MMMM yyyy')}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(add(currentDate, { months: 1 }))}>
              <ChevronRight />
            </Button>
          </div>
          <div className="flex items-center space-x-2 mt-2 justify-end">
            <Label htmlFor="edit-calendar">{isEditingCalendar ? 'Editing' : 'Edit'}</Label>
            <Switch id="edit-calendar" checked={isEditingCalendar} onCheckedChange={setIsEditingCalendar} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center font-semibold text-muted-foreground">
            {WEEK_DAYS.map(day => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 mt-2">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
            {daysInMonth.map(day => {
              const isoDate = day.toISOString().split('T')[0];
              const isTravelDay = overrides[isoDate] !== undefined ? overrides[isoDate] : !isWeekend(day);
              const isToday = isSameDay(day, new Date()) && isSameMonth(day, new Date());
              return (
                <button
                  key={isoDate}
                  disabled={!isEditingCalendar}
                  onClick={() => handleDayToggle(day)}
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200",
                    isEditingCalendar ? 'cursor-pointer' : 'cursor-default',
                    isTravelDay ? 'bg-primary/90 text-primary-foreground' : 'bg-muted text-muted-foreground',
                    !isTravelDay && 'opacity-60',
                    isToday && "ring-2 ring-accent ring-offset-2 ring-offset-background",
                    isEditingCalendar && "hover:scale-105"
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      <Card>
         <CardHeader>
            <CardTitle className='text-lg'>Monthly Summary</CardTitle>
         </CardHeader>
         <CardContent className="flex justify-between items-center">
            <p><span className='font-bold'>{travelDaysCount}</span> travel days</p>
            <p className="text-2xl font-bold">{formatCurrency(totalDue)}</p>
        </CardContent>
        <CardFooter>
            <Button className="w-full" onClick={handleMarkAsPaid}>
                Mark as Paid for {format(currentDate, 'MMMM')}
            </Button>
        </CardFooter>
      </Card>

    </div>
  );
}
