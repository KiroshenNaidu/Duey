'use client';

import { useState, useMemo, useContext, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { format, getDay, add, sub, isSameMonth, startOfMonth, isWeekend, startOfToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Save, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { formatCurrency, cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateTransportMonth } from '@/lib/calculations';
import type { TransportSettings } from '@/lib/types';

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function TransportPage() {
  const { transportSettings, setTransportSettings, transportOverrides, setTransportOverrides, logTransportPayment, history } = useContext(AppDataContext);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEditingCalendar, setIsEditingCalendar] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true) }, []);

  const today = startOfToday();
  const isCurrentMonth = isSameMonth(currentDate, today);
  
  // Future/Past Locking: Editing only allowed for current month
  const isLocked = !isCurrentMonth;

  const { isPaidForMonth, monthStr } = useMemo(() => {
    const monthStr = format(currentDate, 'MMMM yyyy');
    const paymentForThisMonth = history.find(entry => 
      entry.type === 'transport' && entry.debtTitle === `Transport: ${monthStr}`
    );
    return { isPaidForMonth: !!paymentForThisMonth, monthStr };
  }, [currentDate, history]);

  const handleSettingsChange = (field: keyof TransportSettings, value: string | number) => {
    setTransportSettings({ ...transportSettings, [field]: value });
  };

  const { daysInMonth, travelDaysCount, totalDue } = useMemo(
    () => calculateTransportMonth(currentDate, transportOverrides, transportSettings.dailyFee),
    [currentDate, transportOverrides, transportSettings.dailyFee]
  );

  const handleDayToggle = (day: Date) => {
    if (!isEditingCalendar || isLocked || isPaidForMonth) return;
    const isoDate = day.toISOString().split('T')[0];
    const isCurrentlyTravelDay = calculateTransportMonth(currentDate, transportOverrides, transportSettings.dailyFee)
                                  .daysInMonth.find(d => isSameMonth(d, day)) 
                                  ? (transportOverrides[isoDate] !== undefined ? transportOverrides[isoDate] : !isWeekend(day))
                                  : false;
    setTransportOverrides({ ...transportOverrides, [isoDate]: !isCurrentlyTravelDay });
  };
  
  const handleMarkAsPaid = () => {
    if (totalDue <= 0 || isLocked) {
      return;
    }
    logTransportPayment(totalDue, monthStr);
  };

  const firstDayOfMonth = getDay(startOfMonth(currentDate));

  if (!isClient) {
    return (
      <div className="container mx-auto max-w-md space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-md space-y-3">
      <h1 className="text-xl font-bold text-accent">Transport</h1>

      <Accordion type="single" collapsible className="border-none">
        <AccordionItem value="settings" className="border-none">
          <AccordionTrigger className={cn(
            "hover:no-underline py-3 px-4 border-none transition-all duration-200 bg-card",
            "rounded-xl data-[state=open]:rounded-b-none data-[state=open]:rounded-t-xl"
          )}>
            <div className="flex flex-1 justify-between items-center mr-4">
              <h2 className="text-base font-semibold">Settings</h2>
              <div className='flex flex-col items-end text-[10px] text-muted-foreground'>
                <span>{transportSettings.driverName || 'Set Driver'}</span>
                <span>{formatCurrency(transportSettings.dailyFee)}/day</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4 pb-6 px-3 bg-card rounded-b-xl">
            <div className="space-y-2">
              <Label 
                htmlFor="driverName" 
                className="text-xs font-semibold bg-background/40 px-2 py-1 rounded-sm inline-block backdrop-blur-sm shadow-sm text-foreground"
              >
                Driver Name
              </Label>
              <Input
                id="driverName"
                value={transportSettings.driverName}
                onChange={e => handleSettingsChange('driverName', e.target.value)}
                placeholder="e.g., John Doe"
                className="border-border focus-visible:ring-accent focus:border-accent transition-all duration-200"
              />
            </div>
            <div className="space-y-2">
              <Label 
                htmlFor="dailyFee" 
                className="text-xs font-semibold bg-background/40 px-2 py-1 rounded-sm inline-block backdrop-blur-sm shadow-sm text-foreground"
              >
                Daily Fee (R)
              </Label>
              <Input
                id="dailyFee"
                type="number"
                value={transportSettings.dailyFee}
                onChange={e => handleSettingsChange('dailyFee', parseFloat(e.target.value) || 0)}
                placeholder="e.g., 50"
                className="border-border focus-visible:ring-accent focus:border-accent transition-all duration-200"
              />
            </div>
            <Button className="w-full bg-primary font-bold text-white hover:bg-primary/90 mt-2 shadow-md transition-transform active:scale-[0.98]">
              <Save className="mr-2 h-4 w-4" /> Save Settings
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(sub(currentDate, { months: 1 }))}>
              <ChevronLeft />
            </Button>
            <CardTitle className={cn("text-center text-base flex flex-col items-center", isCurrentMonth ? "text-accent" : "text-foreground")}>
              <span>{format(currentDate, 'MMMM yyyy')}</span>
              <span className="text-[10px] font-semibold flex items-center gap-1 uppercase tracking-tighter">
                {isCurrentMonth ? '(Active)' : <><Lock className="h-2 w-2" /> (Read-Only)</>}
              </span>
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(add(currentDate, { months: 1 }))}>
              <ChevronRight />
            </Button>
          </div>
          <div className="flex items-center space-x-2 mt-2 justify-end">
            <Label htmlFor="edit-calendar" className={cn("text-xs", (isLocked || isPaidForMonth) && "opacity-50")}>
              {isEditingCalendar ? 'Editing' : 'Edit'}
            </Label>
            <Switch 
              id="edit-calendar" 
              checked={isEditingCalendar} 
              onCheckedChange={setIsEditingCalendar} 
              disabled={isLocked || isPaidForMonth} 
              className={cn((isLocked || isPaidForMonth) && "opacity-50 cursor-not-allowed")}
            />
          </div>
        </CardHeader>
        <CardContent className="calendar-container">
          {isPaidForMonth && <div className="paid-stamp">PAID</div>}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
            {WEEK_DAYS.map((day, i) => <div key={i}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 mt-2">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
            {daysInMonth.map(day => {
              const isoDate = day.toISOString().split('T')[0];
              const isTravelDay = transportOverrides[isoDate] !== undefined ? transportOverrides[isoDate] : !isWeekend(day);
              const isToday = isSameMonth(day, new Date()) && day.getDate() === new Date().getDate();
              return (
                <button
                  key={isoDate}
                  disabled={!isEditingCalendar || isLocked || isPaidForMonth}
                  onClick={() => handleDayToggle(day)}
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center transition-all duration-200 text-xs",
                    (isEditingCalendar && !isLocked && !isPaidForMonth) ? 'cursor-pointer' : 'cursor-default',
                    isTravelDay ? 'bg-primary/90 text-primary-foreground' : 'bg-muted text-muted-foreground',
                    !isTravelDay && 'opacity-60',
                    isToday && "ring-2 ring-accent ring-offset-2 ring-offset-background",
                    (isEditingCalendar && !isLocked && !isPaidForMonth) && "hover:scale-105"
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
            <CardTitle className="text-base text-accent uppercase text-xs tracking-widest">Monthly Summary</CardTitle>
         </CardHeader>
         <CardContent className="flex justify-between items-baseline">
            <p className='text-sm text-foreground'><span className='font-bold'>{travelDaysCount}</span> travel days</p>
            <p className="text-lg font-bold whitespace-nowrap text-foreground">{formatCurrency(totalDue)}</p>
        </CardContent>
        <CardFooter>
            <Button 
              className="w-full font-bold" 
              onClick={handleMarkAsPaid} 
              disabled={isLocked || isPaidForMonth || totalDue <= 0}
            >
                {isPaidForMonth ? '✓ Payment Confirmed' : `Mark as Paid for ${format(currentDate, 'MMMM')}`}
            </Button>
        </CardFooter>
      </Card>

    </div>
  );
}
