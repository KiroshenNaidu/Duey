'use client';

import { useState, useMemo, useContext, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { format, getDay, add, sub, isSameMonth, startOfMonth, isWeekend, startOfToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
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
      <h1 className="text-xl font-bold text-foreground">Transport</h1>

      <Accordion type="single" collapsible className="border-none">
        <AccordionItem value="settings" className="border-none">
          <AccordionTrigger className={cn(
            "hover:no-underline py-2 px-3 border-none transition-all duration-200 bg-card",
            "rounded-xl data-[state=open]:rounded-b-none data-[state=open]:rounded-t-xl"
          )}>
            <div className="flex flex-1 justify-between items-center mr-4">
              <h2 className="text-sm font-semibold text-foreground">Settings</h2>
              <div className='flex flex-col items-end text-[10px] text-muted-foreground'>
                <span>{transportSettings.driverName || 'Set Driver'}</span>
                <span>{formatCurrency(transportSettings.dailyFee)}/day</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pt-3 pb-4 px-3 bg-card rounded-b-xl">
            <div className="space-y-1">
              <Label 
                htmlFor="driverName" 
                className="text-[10px] font-semibold bg-background/40 px-2 py-0.5 rounded-sm inline-block backdrop-blur-sm shadow-sm text-foreground"
              >
                Driver Name
              </Label>
              <Input
                id="driverName"
                value={transportSettings.driverName}
                onChange={e => handleSettingsChange('driverName', e.target.value)}
                placeholder="e.g., John Doe"
                className="h-8 text-xs border-border focus-visible:ring-accent focus:border-accent transition-all duration-200"
              />
            </div>
            <div className="space-y-1">
              <Label 
                htmlFor="dailyFee" 
                className="text-[10px] font-semibold bg-background/40 px-2 py-0.5 rounded-sm inline-block backdrop-blur-sm shadow-sm text-foreground"
              >
                Daily Fee (R)
              </Label>
              <Input
                id="dailyFee"
                type="number"
                value={transportSettings.dailyFee}
                onChange={e => handleSettingsChange('dailyFee', parseFloat(e.target.value) || 0)}
                placeholder="e.g., 50"
                className="h-8 text-xs border-border focus-visible:ring-accent focus:border-accent transition-all duration-200"
              />
            </div>
            <Button className="w-full h-8 bg-primary text-xs font-bold text-white hover:bg-primary/90 mt-1 shadow-md transition-transform active:scale-[0.98]">
               Save Settings
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardHeader className="p-3">
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(sub(currentDate, { months: 1 }))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-center text-base flex flex-col items-center text-foreground">
              <span className={cn(isCurrentMonth ? "text-accent" : "text-foreground")}>
                {format(currentDate, 'MMMM yyyy')}
              </span>
              <span className="text-[10px] font-semibold flex items-center gap-1 uppercase tracking-tighter text-foreground">
                {isCurrentMonth ? `(Current Month)` : <><Lock className="h-2 w-2" /> (Read-Only)</>}
              </span>
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(add(currentDate, { months: 1 }))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center space-x-2 mt-1 justify-end">
            <Label htmlFor="edit-calendar" className={cn("text-[10px]", (isLocked || isPaidForMonth) && "opacity-50")}>
              {isEditingCalendar ? 'Editing' : 'Edit'}
            </Label>
            <Switch 
              id="edit-calendar" 
              checked={isEditingCalendar} 
              onCheckedChange={setIsEditingCalendar} 
              disabled={isLocked || isPaidForMonth} 
              className={cn("h-4 w-8", (isLocked || isPaidForMonth) && "opacity-50 cursor-not-allowed")}
            />
          </div>
        </CardHeader>
        <CardContent className="calendar-container p-3 pt-0">
          {isPaidForMonth && <div className="paid-stamp">PAID</div>}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
            {WEEK_DAYS.map((day, i) => <div key={i}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 mt-1">
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
                    "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-200 text-[10px]",
                    (isEditingCalendar && !isLocked && !isPaidForMonth) ? 'cursor-pointer' : 'cursor-default',
                    isTravelDay ? 'bg-primary/90 text-primary-foreground' : 'bg-muted text-muted-foreground',
                    !isTravelDay && 'opacity-60',
                    isToday && "ring-1 ring-accent ring-offset-1 ring-offset-background",
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
         <CardHeader className="p-3">
            <CardTitle className="text-foreground uppercase text-[10px] tracking-widest">Monthly Summary</CardTitle>
         </CardHeader>
         <CardContent className="flex justify-between items-baseline p-3 pt-0">
            <p className='text-xs text-foreground'><span className='font-bold'>{travelDaysCount}</span> travel days</p>
            <p className="text-base font-bold whitespace-nowrap text-foreground">{formatCurrency(totalDue)}</p>
        </CardContent>
        <CardFooter className="p-3 pt-0">
            <Button 
              className="w-full h-8 text-xs font-bold" 
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
