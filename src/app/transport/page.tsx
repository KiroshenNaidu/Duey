'use client';

import { useState, useMemo, useContext, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { format, getDay, add, sub, isSameMonth, isSameDay, startOfMonth, isWeekend } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { formatCurrency, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateTransportMonth } from '@/lib/calculations';
import type { TransportSettings } from '@/lib/types';

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TransportPage() {
  const { transportSettings, setTransportSettings, transportOverrides, setTransportOverrides, logTransportPayment } = useContext(AppDataContext);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEditingCalendar, setIsEditingCalendar] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();

  useEffect(() => { setIsClient(true) }, []);

  const handleSettingsChange = (field: keyof TransportSettings, value: string | number) => {
    setTransportSettings({ ...transportSettings, [field]: value });
  };

  const { daysInMonth, travelDaysCount, totalDue } = useMemo(
    () => calculateTransportMonth(currentDate, transportOverrides, transportSettings.dailyFee),
    [currentDate, transportOverrides, transportSettings.dailyFee]
  );

  const handleDayToggle = (day: Date) => {
    if (!isEditingCalendar) return;
    const isoDate = day.toISOString().split('T')[0];
    const isCurrentlyTravelDay = calculateTransportMonth(currentDate, transportOverrides, transportSettings.dailyFee)
                                  .daysInMonth.find(d => isSameDay(d, day)) 
                                  ? (transportOverrides[isoDate] !== undefined ? transportOverrides[isoDate] : !isWeekend(day))
                                  : false;
    setTransportOverrides({ ...transportOverrides, [isoDate]: !isCurrentlyTravelDay });
  };
  
  const handleMarkAsPaid = () => {
    if (totalDue <= 0) {
      toast({ title: "Nothing to pay", description: "Total amount for the month is zero.", variant: 'default' });
      return;
    }
    logTransportPayment(totalDue, format(currentDate, 'MMMM yyyy'));
    
    // Clear overrides for the current month
    const newOverrides = { ...transportOverrides };
    daysInMonth.forEach(day => {
      const isoDate = day.toISOString().split('T')[0];
      delete newOverrides[isoDate];
    });
    setTransportOverrides(newOverrides);
  };

  const firstDayOfMonth = getDay(startOfMonth(currentDate));

  if (!isClient) {
    return (
      <div className="container mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-bold text-foreground">Transport</h1>

      <Accordion type="single" collapsible>
        <AccordionItem value="settings">
          <AccordionTrigger>
            <div className='flex justify-between w-full pr-4 items-center'>
              <h2 className="text-lg font-semibold">Settings</h2>
              <span className='text-sm text-muted-foreground'>{transportSettings.driverName} - {formatCurrency(transportSettings.dailyFee)}/day</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="driverName">Driver Name</Label>
              <Input
                id="driverName"
                value={transportSettings.driverName}
                onChange={e => handleSettingsChange('driverName', e.target.value)}
                placeholder="e.g., John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailyFee">Daily Fee (R)</Label>
              <Input
                id="dailyFee"
                type="number"
                value={transportSettings.dailyFee}
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
              const isTravelDay = transportOverrides[isoDate] !== undefined ? transportOverrides[isoDate] : !isWeekend(day);
              const isToday = isSameDay(day, new Date()) && isSameMonth(day, new Date());
              return (
                <button
                  key={isoDate}
                  disabled={!isEditingCalendar}
                  onClick={() => handleDayToggle(day)}
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200 text-sm",
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
            <p className="text-xl font-bold">{formatCurrency(totalDue)}</p>
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
