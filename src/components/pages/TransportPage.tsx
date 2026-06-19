'use client';

import { useState, useMemo, useContext } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { format, getDay, add, sub, isSameMonth, startOfMonth, startOfToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Lock, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatCurrency, cn } from '@/lib/utils';
import { calculateTransportMonth, getEffectiveDayState } from '@/lib/calculations';
import type { DayState } from '@/lib/types';
import { UberDayDialog } from '@/components/UberDayDialog';
import { TransportHistoryLog } from '@/components/TransportHistoryLog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { DatePickerInput } from '@/components/ui/date-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function TransportPage() {
  const {
    transportSettings, setTransportSettings,
    transportOverrides, setTransportOverrides,
    logTransportPayment, deleteHistoryEntry, history,
    uberRides,
  } = useContext(AppDataContext);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEditingCalendar, setIsEditingCalendar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'driver' | 'uber'>('driver');
  const [uberDialogDate, setUberDialogDate] = useState<string | null>(null);

  const today = startOfToday();
  const isCurrentMonth = isSameMonth(currentDate, today);
  const isLocked = !isCurrentMonth;
  const isFutureMonth = startOfMonth(currentDate) > startOfMonth(today) && !isSameMonth(currentDate, today);

  const { isPaidForMonth, monthStr, paymentEntryId } = useMemo(() => {
    const monthStr = format(currentDate, 'MMMM yyyy');
    const entry = history.find(e => e.type === 'transport' && e.debtTitle === `Transport: ${monthStr}`);
    return { isPaidForMonth: !!entry, monthStr, paymentEntryId: entry?.id ?? null };
  }, [currentDate, history]);

  const { daysInMonth, fullDaysCount, halfDaysCount, totalDue } = useMemo(
    () => calculateTransportMonth(currentDate, transportOverrides, transportSettings, today),
    [currentDate, transportOverrides, transportSettings, today]
  );

  const handleDayToggle = (day: Date) => {
    if (!isEditingCalendar || isLocked || isPaidForMonth) return;
    const isoDate = day.toISOString().split('T')[0];
    const cur: DayState = getEffectiveDayState(day, transportOverrides, transportSettings.employed, isFutureMonth);
    const next: DayState = cur === 1 ? 0 : cur === 0 ? 1.5 : 1;
    setTransportOverrides({ ...transportOverrides, [isoDate]: next });
  };

  const handleMarkAsPaid = () => {
    if (isPaidForMonth) {
      setUndoOpen(true);
      return;
    }
    if (totalDue <= 0 || isLocked) return;
    logTransportPayment(totalDue, monthStr);
  };

  const handleUndoPayment = () => {
    if (paymentEntryId) deleteHistoryEntry(paymentEntryId);
    setUndoOpen(false);
  };

  const firstDayOfMonth = getDay(startOfMonth(currentDate));
  const uberMonthPrefix = format(currentDate, 'yyyy-MM');
  const uberMonthRides = uberRides.filter(r => r.date.startsWith(uberMonthPrefix));
  const uberMonthTotal = uberMonthRides.reduce((sum, r) => sum + r.price, 0);
  const pricingMode = transportSettings.pricingMode ?? 'daily';

  const rateStr = pricingMode === 'monthly'
    ? `${formatCurrency(transportSettings.monthlyFee)}/mo`
    : `${formatCurrency(transportSettings.dailyFee)}/day`;
  const jobChip = transportSettings.employed && (transportSettings.jobTitle || transportSettings.company)
    ? [transportSettings.jobTitle, transportSettings.company].filter(Boolean).join(' @ ')
    : null;
  const chipText = transportSettings.driverName
    ? `${transportSettings.driverName} · ${rateStr}`
    : rateStr;

  return (
    <div className="container mx-auto max-w-md space-y-3 pt-11 pb-8">
      <h1 className="text-xl font-bold text-foreground text-center">Transport</h1>

      {/* ── Compact settings row ── */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="w-full flex items-center justify-between bg-card rounded-xl px-3 py-2.5 transition-all duration-200 active:scale-[0.98]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-foreground font-medium truncate">{chipText}</span>
          {jobChip && <span className="text-[10px] text-muted-foreground truncate hidden sm:block">{jobChip}</span>}
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0",
            transportSettings.employed
              ? "bg-positive/20 text-positive"
              : "bg-muted text-muted-foreground"
          )}>
            {transportSettings.employed ? 'Employed' : 'Off'}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground ml-2 shrink-0">Edit ›</span>
      </button>

      {/* ── Settings Dialog ── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Employment & Driver</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Employment Status</p>
              <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {transportSettings.employed ? 'Employed' : 'Unemployed'}
                  </p>
                  {!transportSettings.employed && (
                    <p className="text-[10px] text-muted-foreground">Future months default to no travel</p>
                  )}
                </div>
                <Switch
                  checked={transportSettings.employed}
                  onCheckedChange={v => {
                    const now = new Date().toISOString().slice(0, 10);
                    if (v) {
                      setTransportSettings({ ...transportSettings, employed: true, employmentStartDate: now, employmentEndDate: undefined });
                    } else {
                      setTransportSettings({ ...transportSettings, employed: false, employmentEndDate: now });
                    }
                  }}
                  className="h-4 w-8"
                />
              </div>

              {transportSettings.employed && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Job Title</Label>
                    <Input
                      value={transportSettings.jobTitle ?? ''}
                      onChange={e => setTransportSettings({ ...transportSettings, jobTitle: e.target.value || undefined })}
                      placeholder="e.g., Software Developer"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Company</Label>
                    <Input
                      value={transportSettings.company ?? ''}
                      onChange={e => setTransportSettings({ ...transportSettings, company: e.target.value || undefined })}
                      placeholder="e.g., Acme Corp"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Start Date</Label>
                    <DatePickerInput
                      value={transportSettings.employmentStartDate}
                      onChange={v => setTransportSettings({ ...transportSettings, employmentStartDate: v || undefined })}
                      placeholder="Select start date"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border" />

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Driver Details</p>

              <div className="space-y-1">
                <Label htmlFor="driverName" className="text-[10px] text-muted-foreground">Driver Name</Label>
                <Input
                  id="driverName"
                  value={transportSettings.driverName}
                  onChange={e => setTransportSettings({ ...transportSettings, driverName: e.target.value })}
                  placeholder="e.g., John Doe"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Pricing Mode</Label>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={pricingMode === 'daily' ? 'default' : 'outline'}
                    className="flex-1 h-8 text-xs"
                    onClick={() => setTransportSettings({ ...transportSettings, pricingMode: 'daily' })}
                  >
                    Daily Rate
                  </Button>
                  <Button
                    size="sm"
                    variant={pricingMode === 'monthly' ? 'default' : 'outline'}
                    className="flex-1 h-8 text-xs"
                    onClick={() => setTransportSettings({ ...transportSettings, pricingMode: 'monthly' })}
                  >
                    Flat Monthly
                  </Button>
                </div>
              </div>

              {pricingMode === 'daily' ? (
                <div className="space-y-1">
                  <Label htmlFor="dailyFee" className="text-[10px] text-muted-foreground">Daily Fee (R)</Label>
                  <Input
                    id="dailyFee"
                    type="number"
                    min={0}
                    value={transportSettings.dailyFee || ''}
                    onChange={e => setTransportSettings({ ...transportSettings, dailyFee: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 100"
                    className="h-8 text-xs"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="monthlyFee" className="text-[10px] text-muted-foreground">Monthly Fee (R)</Label>
                  <Input
                    id="monthlyFee"
                    type="number"
                    min={0}
                    value={transportSettings.monthlyFee || ''}
                    onChange={e => setTransportSettings({ ...transportSettings, monthlyFee: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 2000"
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>

            <DialogClose asChild>
              <Button className="w-full h-8 bg-primary text-xs font-bold text-white hover:bg-primary/90">
                Save & Close
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Undo payment AlertDialog ── */}
      <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo Payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the payment record for <strong>{monthStr}</strong>. Only undo if you marked this as paid by mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as Paid</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUndoPayment}
              className={cn(buttonVariants({ variant: 'destructive' }))}
            >
              Undo Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Calendar card ── */}
      <Card>
        <CardHeader className="p-3">
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(sub(currentDate, { months: 1 }))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-center text-base flex flex-col items-center">
              <span className={cn(isCurrentMonth ? "text-accent" : "text-foreground")}>
                {format(currentDate, 'MMMM yyyy')}
              </span>
              <span className="text-[10px] font-semibold flex items-center gap-1 uppercase tracking-tighter text-foreground">
                {isCurrentMonth ? '(Current Month)' : <><Lock className="h-2 w-2" /> (Read-Only)</>}
              </span>
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(add(currentDate, { months: 1 }))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {calendarMode === 'driver' && (
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
          )}
        </CardHeader>

        <CardContent className="p-3 pt-0 pb-0">
          <div className="calendar-container py-6">
            {calendarMode === 'driver' && isPaidForMonth && <div className="paid-stamp">PAID</div>}

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
              {WEEK_DAYS.map((d, i) => <div key={i}>{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-1 mt-1">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`e-${i}`} />)}

              {calendarMode === 'driver' && daysInMonth.map(day => {
                const isoDate = day.toISOString().split('T')[0];
                const state = getEffectiveDayState(day, transportOverrides, transportSettings.employed, isFutureMonth);
                const isToday = isSameMonth(day, new Date()) && day.getDate() === new Date().getDate();
                return (
                  <button
                    key={isoDate}
                    disabled={!isEditingCalendar || isLocked || isPaidForMonth}
                    onClick={() => handleDayToggle(day)}
                    style={isToday ? { boxShadow: '0 0 10px 3px hsl(var(--accent) / 0.4)' } : undefined}
                    className={cn(
                      "h-7 w-7 rounded-full flex flex-col items-center justify-center transition-all duration-200 text-[10px]",
                      (isEditingCalendar && !isLocked && !isPaidForMonth) ? 'cursor-pointer hover:scale-105' : 'cursor-default',
                      state === 1 && 'bg-primary/90 text-primary-foreground',
                      state === 1.5 && 'bg-primary/40 text-primary-foreground',
                      state === 0 && 'bg-muted text-muted-foreground opacity-60',
                      isToday && "ring-1 ring-accent ring-offset-1 ring-offset-background",
                    )}
                  >
                    <span className="leading-none">{format(day, 'd')}</span>
                    {state === 1.5 && <span className="leading-none text-[7px] opacity-80">½</span>}
                  </button>
                );
              })}

              {calendarMode === 'uber' && daysInMonth.map(day => {
                const isoDate = day.toISOString().split('T')[0];
                const dayRides = uberRides.filter(r => r.date === isoDate);
                const dayTotal = dayRides.reduce((sum, r) => sum + r.price, 0);
                const hasRides = dayRides.length > 0;
                const isToday = isSameMonth(day, new Date()) && day.getDate() === new Date().getDate();
                return (
                  <button
                    key={isoDate}
                    onClick={() => setUberDialogDate(isoDate)}
                    style={isToday ? { boxShadow: '0 0 10px 3px hsl(var(--accent) / 0.4)' } : undefined}
                    className={cn(
                      "h-7 w-7 rounded-full flex flex-col items-center justify-center transition-all duration-200 text-[10px] cursor-pointer hover:scale-105",
                      hasRides ? 'bg-accent/30 text-foreground' : 'bg-muted/20 text-muted-foreground opacity-50',
                      isToday && "ring-1 ring-accent ring-offset-1 ring-offset-background"
                    )}
                  >
                    <span className="leading-none">{format(day, 'd')}</span>
                    {hasRides && (
                      <span className="leading-none text-[7px] text-accent font-semibold">
                        {dayTotal >= 1000 ? `${Math.round(dayTotal / 1000)}k` : Math.round(dayTotal)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
        <CardFooter className="px-3 pb-3 pt-2 border-t border-border/30">
          <div className="flex gap-1 justify-center w-full">
            <Button
              size="sm"
              variant={calendarMode === 'driver' ? 'default' : 'ghost'}
              className="h-6 px-3 text-[10px]"
              onClick={() => setCalendarMode('driver')}
            >
              Driver
            </Button>
            <Button
              size="sm"
              variant={calendarMode === 'uber' ? 'default' : 'ghost'}
              className="h-6 px-3 text-[10px]"
              onClick={() => setCalendarMode('uber')}
            >
              Uber
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* ── Monthly summary ── */}
      {calendarMode === 'driver' ? (
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-foreground uppercase text-[10px] tracking-widest">Monthly Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-between items-baseline p-3 pt-0">
            <p className="text-xs text-foreground">
              {!transportSettings.employed && isFutureMonth ? (
                <span className="text-muted-foreground">Unemployed — no travel</span>
              ) : pricingMode === 'monthly' ? (
                <span>Flat monthly rate</span>
              ) : (
                <>
                  <span className="font-bold">{fullDaysCount}</span> full
                  {halfDaysCount > 0 && <> · <span className="font-bold">{halfDaysCount}</span> half</>}
                  {' '}days
                </>
              )}
            </p>
            <p className="text-base font-bold whitespace-nowrap text-foreground">{formatCurrency(totalDue)}</p>
          </CardContent>
          <CardFooter className="p-3 pt-0">
            <Button
              className={cn(
                "w-full h-8 text-xs font-bold",
                isPaidForMonth && "bg-positive/20 text-positive border border-positive/30 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/30"
              )}
              variant={isPaidForMonth ? 'outline' : 'default'}
              onClick={handleMarkAsPaid}
              disabled={!isPaidForMonth && (isLocked || totalDue <= 0)}
            >
              {isPaidForMonth ? '✓ Payment Confirmed — tap to undo' : `Mark as Paid for ${format(currentDate, 'MMMM')}`}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-foreground uppercase text-[10px] tracking-widest">Uber — {format(currentDate, 'MMMM yyyy')}</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-between items-baseline p-3 pt-0">
            <p className="text-xs text-foreground">
              <span className="font-bold">{uberMonthRides.length}</span> ride{uberMonthRides.length !== 1 ? 's' : ''}
            </p>
            <p className="text-base font-bold whitespace-nowrap text-foreground">{formatCurrency(uberMonthTotal)}</p>
          </CardContent>
        </Card>
      )}

      <TransportHistoryLog
        history={history}
        uberRides={uberRides}
        transportOverrides={transportOverrides}
        transportSettings={transportSettings}
      />

      {uberDialogDate && (
        <UberDayDialog
          date={uberDialogDate}
          rides={uberRides.filter(r => r.date === uberDialogDate)}
          open={!!uberDialogDate}
          onOpenChange={open => { if (!open) setUberDialogDate(null); }}
        />
      )}
    </div>
  );
}
