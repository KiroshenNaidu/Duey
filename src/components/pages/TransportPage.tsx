'use client';

import { useState, useMemo, useContext, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { format, getDay, add, sub, isSameDay, isSameMonth, startOfMonth, startOfToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Lock, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatCurrency, cn } from '@/lib/utils';
import { calculateTransportMonth, getEffectiveDayState, dayKey } from '@/lib/calculations';
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

// The two calendars the card can show. Listed rather than hand-written twice so the footer
// switch splits the row evenly between however many there are.
const CALENDAR_MODES = [
  { id: 'driver', label: 'Driver' },
  { id: 'uber', label: 'Uber' },
] as const;

type CalendarMode = (typeof CALENDAR_MODES)[number]['id'];



export function TransportPage() {
  const {
    transportSettings, setTransportSettings,
    transportOverrides, setTransportOverrides,
    transportMonthlyOverrides, setTransportMonthlyOverride,
    logTransportPayment, deleteHistoryEntry, history,
    uberRides,
  } = useContext(AppDataContext);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEditingCalendar, setIsEditingCalendar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('driver');
  const [uberDialogDate, setUberDialogDate] = useState<string | null>(null);
  // Flat monthly mode only: per-month amount override, committed when Edit toggle is turned off.
  const [monthlyAmountOverride, setMonthlyAmountOverride] = useState('');

  const today = startOfToday();
  const isCurrentMonth = isSameMonth(currentDate, today);
  const isLocked = !isCurrentMonth;
  const isFutureMonth = startOfMonth(currentDate) > startOfMonth(today) && !isSameMonth(currentDate, today);
  const monthKey = format(currentDate, 'yyyy-MM');

  const { isPaidForMonth, monthStr, paymentEntryId } = useMemo(() => {
    const monthStr = format(currentDate, 'MMMM yyyy');
    const entry = history.find(e => e.type === 'transport' && e.debtTitle === `Transport: ${monthStr}`);
    return { isPaidForMonth: !!entry, monthStr, paymentEntryId: entry?.id ?? null };
  }, [currentDate, history]);

  // The per-month flat-fee override MUST be passed in: without it `totalDue` silently
  // ignored the adjusted amount for 'monthly' pricing, and every consumer had to remember
  // to swap in `effectiveMonthlyAmount` instead. Passing it here makes totalDue the single
  // correct figure for both pricing modes, matching the Balance tab and the month-end seal
  // (which both already pass it).
  const { daysInMonth, fullDaysCount, halfDaysCount, totalDue } = useMemo(
    () => calculateTransportMonth(
      currentDate, transportOverrides, transportSettings, today, transportMonthlyOverrides[monthKey],
    ),
    [currentDate, transportOverrides, transportSettings, today, transportMonthlyOverrides, monthKey]
  );

  // Load the persisted per-month override into the editable draft when the user
  // navigates to a different month. An absent override leaves the field empty so
  // it falls back to the default monthly fee.
  useEffect(() => {
    setIsEditingCalendar(false);
    const saved = transportMonthlyOverrides[monthKey];
    setMonthlyAmountOverride(saved !== undefined ? String(saved) : '');
    // monthKey/transportMonthlyOverrides derive from currentDate; only reload on month change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  // Write-through the draft to the persisted per-month override so it survives
  // navigating away and back. Empty clears the override (revert to default fee).
  const handleMonthlyOverrideChange = (raw: string) => {
    setMonthlyAmountOverride(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      setTransportMonthlyOverride(monthKey, null);
      return;
    }
    const parsed = parseFloat(trimmed);
    if (!Number.isNaN(parsed)) setTransportMonthlyOverride(monthKey, parsed);
  };

  const handleDayToggle = (day: Date) => {
    if (!isEditingCalendar || isLocked || isPaidForMonth) return;
    const isoDate = dayKey(day);
    const cur: DayState = getEffectiveDayState(day, transportOverrides, transportSettings.employed, isFutureMonth);
    const next: DayState = cur === 1 ? 0 : cur === 0 ? 1.5 : 1;
    setTransportOverrides({ ...transportOverrides, [isoDate]: next });
  };

  const setCalendarEditing = (v: boolean) => {
    if (isLocked || isPaidForMonth) return;
    setIsEditingCalendar(v);
    if (!v) {
      // Turning edit off unmounts the override input and shrinks the card. The keyboard
      // may stay open here (unlike Mark as Paid), so KeyboardInset's close-reset won't
      // fire and <main> would be left scrolled into the now-shorter content with the top
      // cut off. Blur to dismiss the keyboard and snap the scroller to top.
      (document.activeElement as HTMLElement | null)?.blur();
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  const handleMarkAsPaid = () => {
    if (isPaidForMonth) {
      setUndoOpen(true);
      return;
    }
    // totalDue now honours the per-month flat-fee override in 'monthly' mode, so it is
    // the amount for BOTH pricing modes — no parallel figure to keep in sync.
    if (totalDue <= 0 || isLocked) return;
    logTransportPayment(totalDue, monthStr);
    setIsEditingCalendar(false);
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

  // Flat-monthly override: a persisted per-month value takes priority over the configured
  // monthlyFee. The AMOUNT itself now comes from totalDue (calculateTransportMonth already
  // applies the override); this flag only drives the "adjusted for <Month>" caption.
  const savedMonthlyOverride = transportMonthlyOverrides[monthKey];
  const hasMonthlyOverride = pricingMode === 'monthly' && savedMonthlyOverride !== undefined;

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
                    setTransportSettings({ ...transportSettings, employed: v });
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
                      placeholder="Select start date (optional)"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">End Date</Label>
                    <DatePickerInput
                      value={transportSettings.employmentEndDate}
                      onChange={v => setTransportSettings({ ...transportSettings, employmentEndDate: v || undefined })}
                      placeholder="Select end date (optional)"
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
              <Button className="w-full h-8 text-xs font-bold">
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
              <span className={cn("text-[10px] font-semibold flex items-center gap-1 uppercase tracking-tighter", isCurrentMonth ? "text-primary" : "text-muted-foreground")}>
                {isCurrentMonth ? '(Current Month)' : <><Lock className="h-2 w-2" /> (Read-Only)</>}
              </span>
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(add(currentDate, { months: 1 }))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Whole row is one tap target for the Edit switch (small screens) — pointer
              taps land on the row (switch is pointer-events-none so a direct tap can't
              double-fire); keyboard users still toggle the Switch itself. */}
          {calendarMode === 'driver' && (
            <div
              className={cn(
                "flex items-center space-x-2 mt-1 justify-end",
                (isLocked || isPaidForMonth) ? "cursor-not-allowed" : "cursor-pointer"
              )}
              onClick={() => setCalendarEditing(!isEditingCalendar)}
            >
              <Label className={cn("text-xs pointer-events-none", (isLocked || isPaidForMonth) && "opacity-50")}>
                {isEditingCalendar ? 'Editing' : 'Edit'}
              </Label>
              <Switch
                id="edit-calendar"
                aria-label="Edit calendar days"
                checked={isEditingCalendar}
                onCheckedChange={setCalendarEditing}
                disabled={isLocked || isPaidForMonth}
                // accent-flow-switch: checked track shifts through the accent family,
                // matching the today cell's colour flow (see globals.css).
                className={cn("h-5 w-10 pointer-events-none accent-flow-switch", (isLocked || isPaidForMonth) && "opacity-50 cursor-not-allowed")}
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

            <div className="grid grid-cols-7 gap-1 mt-4 justify-items-center">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`e-${i}`} />)}

              {calendarMode === 'driver' && daysInMonth.map(day => {
                const isoDate = dayKey(day);
                const state = getEffectiveDayState(day, transportOverrides, transportSettings.employed, isFutureMonth);
                const isToday = isSameDay(day, today);
                return (
                  <button
                    key={isoDate}
                    disabled={!isEditingCalendar || isLocked || isPaidForMonth}
                    onClick={() => handleDayToggle(day)}
                    className={cn(
                      "relative overflow-hidden h-7 w-7 rounded-full flex flex-col items-center justify-center transition-all duration-200 text-[10px]",
                      (isEditingCalendar && !isLocked && !isPaidForMonth) ? 'cursor-pointer hover:scale-105' : 'cursor-default',
                      state === 1 && 'bg-primary/15 text-primary-foreground',
                      state === 1.5 && 'bg-primary/15 text-foreground',
                      state === 0 && 'bg-muted text-muted-foreground opacity-60',
                      // Today ALWAYS colours from the accent family (never the primary's):
                      // arc-animated-accent flows the cell's `color` from the accent into its
                      // analogous hue (water and ring paint with currentColor, so they ride
                      // along), bar-glow composites in the accent halo pulse, and the static
                      // text colour is the reduced-motion fallback. bg-accent/15 replaces the
                      // per-state tint (it shows through the translucent water and above the
                      // waterline on half days); opacity-100 beats the off-day dim so the
                      // halo/ring never fade — the empty water still reads as "off".
                      isToday && "arc-animated-accent bar-glow text-[hsl(var(--accent))] bg-accent/15 opacity-100 ring-1 ring-current ring-offset-1 ring-offset-background",
                    )}
                  >
                    {/* Water level renders the day state (full/half/empty) and eases
                        between marks on tap — see .liquid-fill in globals.css. Mounted in
                        every state so drain-to-empty animates too. Back wave first so the
                        front surface paints over it. */}
                    <span
                      aria-hidden
                      className={cn(
                        "liquid-fill",
                        state === 1 && "lf-full",      // solid, still, completely filled
                        state === 1.5 && "lf-animate", // only half-days slosh
                      )}
                      style={{ '--fill': state === 1 ? 1.08 : state === 1.5 ? 0.5 : -0.08 } as React.CSSProperties}
                    >
                      <span className="lf-wave lf-wave2" />
                      <span className="lf-wave" />
                    </span>
                    {/* Today's button `color` is the animated water colour, so the number
                        re-asserts its per-state colour to stay readable on the water. Full
                        days sit ON the accent water, so contrast comes from --btn-on-accent
                        (auto black/white for the accent), not the primary's. */}
                    <span className={cn(
                      "relative z-10 leading-none",
                      isToday && (state === 1 ? 'text-[hsl(var(--btn-on-accent))]' : state === 1.5 ? 'text-foreground' : 'text-muted-foreground'),
                    )}>{format(day, 'd')}</span>
                  </button>
                );
              })}

              {calendarMode === 'uber' && daysInMonth.map(day => {
                const isoDate = dayKey(day);
                const dayRides = uberRides.filter(r => r.date === isoDate);
                const dayTotal = dayRides.reduce((sum, r) => sum + r.price, 0);
                const hasRides = dayRides.length > 0;
                const isToday = isSameDay(day, today);
                return (
                  <button
                    key={isoDate}
                    onClick={() => setUberDialogDate(isoDate)}
                    className={cn(
                      // relative + overflow-hidden so the water layer below clips to the circle
                      // (same host requirements as the driver cell).
                      "relative overflow-hidden h-7 w-7 rounded-full flex flex-col items-center justify-center transition-all duration-200 text-[10px] cursor-pointer hover:scale-105",
                      // Per-day tint only when it ISN'T today — today owns its whole fill
                      // below, and two competing bg-* utilities would be decided by
                      // stylesheet order rather than by this list.
                      !isToday && (hasRides ? 'bg-accent/30 text-foreground' : 'bg-muted/20 text-muted-foreground opacity-50'),
                      // Today is styled EXACTLY like the driver calendar's today cell: the same
                      // bg-accent/15 tint under a full water level, so it picks up the same
                      // accent → accent-complete diagonal blend (.arc-animated-accent .lf-wave)
                      // instead of the flat single-hue disc bg-current used to paint.
                      isToday && "arc-animated-accent bar-glow text-[hsl(var(--accent))] bg-accent/15 opacity-100 ring-1 ring-current ring-offset-1 ring-offset-background",
                    )}
                  >
                    {/* Today's multicolour water. Always at a FULL level — an Uber day is
                        either logged or not, so there is no half state for a level to show;
                        the two-colour blend, ring and halo are what mark it as today. Back
                        wave first so the front surface paints over it (lf-full hides it). */}
                    {isToday && (
                      <span aria-hidden className="liquid-fill lf-full" style={{ '--fill': 1.08 } as React.CSSProperties}>
                        <span className="lf-wave lf-wave2" />
                        <span className="lf-wave" />
                      </span>
                    )}
                    {/* On today's disc the type sits ON the accent water, so it takes the
                        accent's auto black/white contrast colour instead of the flowing hue,
                        and z-10 keeps it above the water. */}
                    <span className={cn("relative z-10 leading-none", isToday && 'text-[hsl(var(--btn-on-accent))]')}>{format(day, 'd')}</span>
                    {hasRides && (
                      <span className={cn(
                        "relative z-10 leading-none text-[7px] font-semibold",
                        isToday ? 'text-[hsl(var(--btn-on-accent))]' : 'text-accent',
                      )}>
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
          {/* Driver/Uber switch. Each option OWNS HALF THE ROW as its tap target — the
              visible pill is just the label's styling, painted on an inner span. The pills
              themselves are ~30px wide, which is a fiddly thing to hit with a thumb; giving
              them the full footer width to aim at costs nothing visually. */}
          <div className="flex w-full">
            {CALENDAR_MODES.map(({ id, label }) => {
              const isActive = calendarMode === id;
              return (
                <Button
                  key={id}
                  variant="ghost"
                  // px-0 + transparent hover: the hit area stretches, the highlight doesn't.
                  className="group flex-1 h-9 px-0 hover:bg-transparent active:bg-transparent"
                  onClick={() => setCalendarMode(id)}
                  aria-pressed={isActive}
                >
                  <span className={cn(
                    "px-3 py-1 rounded-xl text-[10px] font-medium transition-colors",
                    isActive
                      ? 'bg-primary text-btn-on-primary'
                      : 'text-btn-on-surface group-hover:bg-foreground/10 group-active:bg-foreground/15',
                  )}>
                    {label}
                  </span>
                </Button>
              );
            })}
          </div>
        </CardFooter>

        {/* ── Monthly summary — same card, divided from the calendar; the Driver/Uber
            toggle above switches both the grid and this summary section. ── */}
        {calendarMode === 'driver' ? (
          <div className="border-t border-border/30">
            <CardHeader className="p-3">
              <CardTitle className="text-foreground uppercase text-[10px] tracking-widest">Monthly Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1.5">
              {pricingMode === 'monthly' && isEditingCalendar && !isLocked && !isPaidForMonth ? (
                <>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-foreground">Flat monthly rate</p>
                    <Input
                      type="number"
                      min={0}
                      value={monthlyAmountOverride}
                      onChange={e => handleMonthlyOverrideChange(e.target.value)}
                      placeholder={String(transportSettings.monthlyFee)}
                      className="h-9 w-32 text-right text-sm font-bold"
                    />
                  </div>
                  {monthlyAmountOverride !== '' && parseFloat(monthlyAmountOverride) !== transportSettings.monthlyFee && (
                    <p className="text-[10px] text-muted-foreground text-right">
                      Default {formatCurrency(transportSettings.monthlyFee)} · adjusted for {format(currentDate, 'MMMM')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between items-baseline">
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
                    <p className="text-base font-bold whitespace-nowrap text-foreground">
                      {formatCurrency(totalDue)}
                    </p>
                  </div>
                  {hasMonthlyOverride && savedMonthlyOverride !== transportSettings.monthlyFee && (
                    <p className="text-[10px] text-muted-foreground text-right">
                      Default {formatCurrency(transportSettings.monthlyFee)} · adjusted for {format(currentDate, 'MMMM')}
                    </p>
                  )}
                </>
              )}
            </CardContent>
            <CardFooter className="p-3 pt-0">
              <Button
                className={cn(
                  "w-full h-8 text-xs font-bold",
                  !isPaidForMonth && "pay-button-3d",
                  isPaidForMonth && "paid-button-3d"
                )}
                variant={isPaidForMonth ? 'outline' : 'default'}
                onClick={handleMarkAsPaid}
                disabled={!isPaidForMonth && (isLocked || totalDue <= 0)}
              >
                {isPaidForMonth ? '✓ Payment Confirmed — tap to undo' : `Mark as Paid for ${format(currentDate, 'MMMM')}`}
              </Button>
            </CardFooter>
          </div>
        ) : (
          <div className="border-t border-border/30">
            <CardHeader className="p-3">
              <CardTitle className="text-foreground uppercase text-[10px] tracking-widest">Uber — {format(currentDate, 'MMMM yyyy')}</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-between items-baseline p-3 pt-0">
              <p className="text-xs text-foreground">
                <span className="font-bold">{uberMonthRides.length}</span> ride{uberMonthRides.length !== 1 ? 's' : ''}
              </p>
              <p className="text-base font-bold whitespace-nowrap text-foreground">{formatCurrency(uberMonthTotal)}</p>
            </CardContent>
          </div>
        )}
      </Card>

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
