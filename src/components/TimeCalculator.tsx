'use client';

import { useState } from 'react';
import { formatCurrency, cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimePicker } from '@/components/TimePicker';

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/60 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
      >
        <span className="text-xs font-bold text-foreground uppercase tracking-widest">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="p-4 space-y-3 bg-card border-t border-border/40">{children}</div>}
    </div>
  );
}

function toFraction(n: number): string {
  if (!isFinite(n) || Math.abs(n) < 1e-12) return '0';
  const neg = n < 0;
  const abs = Math.abs(n);
  if (Number.isInteger(abs)) return (neg ? '-' : '') + abs.toString();

  let [h0, h1, _k0, k1] = [0, 1, 1, 0];
  let b = abs;
  for (let i = 0; i < 100 && k1 <= 200000; i++) {
    const a = Math.floor(b);
    [h0, h1] = [h1, a * h1 + h0];
    [_k0, k1] = [k1, a * k1 + _k0];
    if (Math.abs(abs - h1 / k1) < 1e-9) break;
    const r = b - a;
    if (r < 1e-12) break;
    b = 1 / r;
  }
  const prefix = neg ? '-' : '';
  const intPart = Math.floor(h1 / k1);
  const remN = h1 - intPart * k1;
  if (remN === 0) return `${prefix}${intPart}`;
  if (intPart === 0) return `${prefix}${h1}/${k1}`;
  return `${prefix}${intPart} ${remN}/${k1}`;
}

function ResultBox({ label, value, exactValue }: { label: string; value: string; exactValue?: number }) {
  const [showFraction, setShowFraction] = useState(false);
  const fraction = exactValue !== undefined && !Number.isInteger(exactValue) ? toFraction(exactValue) : null;

  return (
    <div
      className={cn(
        'bg-muted/30 rounded-xl px-3 py-2.5 flex justify-between items-center border border-border/30',
        fraction && 'cursor-pointer active:bg-muted/60 transition-colors'
      )}
      onClick={() => fraction && setShowFraction(f => !f)}
    >
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-bold text-foreground font-mono">
          {showFraction && fraction ? fraction : value}
        </span>
        {fraction && (
          <span className="text-[9px] text-muted-foreground/60 block leading-tight">
            {showFraction ? 'tap for decimal' : 'tap for fraction'}
          </span>
        )}
      </div>
    </div>
  );
}

function DurationCalculator() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  let totalSeconds = 0;
  if (start && end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let startMins = sh * 60 + sm;
    let endMins = eh * 60 + em;
    if (endMins <= startMins) endMins += 24 * 60;
    totalSeconds = (endMins - startMins) * 60;
  }

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Time</Label>
          <TimePicker value={start} onChange={setStart} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Time</Label>
          <TimePicker value={end} onChange={setEnd} />
        </div>
      </div>
      {totalSeconds > 0 && (
        <div className="space-y-1.5">
          <ResultBox label="Duration" value={`${h}h ${m}m ${s}s`} />
          <ResultBox label="Total Hours" value={`${(totalSeconds / 3600).toFixed(2)} hrs`} exactValue={totalSeconds / 3600} />
          <ResultBox label="Total Minutes" value={`${Math.round(totalSeconds / 60)} min`} />
        </div>
      )}
    </div>
  );
}

function EarningsCalculator() {
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');

  const h = parseFloat(hours) || 0;
  const r = parseFloat(rate) || 0;
  const earned = h * r;
  const perDay = r * 8;
  const perWeek = r * 40;
  const perMonth = r * 160;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Hours Worked</Label>
          <Input type="number" placeholder="e.g., 8.5" value={hours} onChange={e => setHours(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hourly Rate (R)</Label>
          <Input type="number" placeholder="e.g., 120" value={rate} onChange={e => setRate(e.target.value)} />
        </div>
      </div>
      {h > 0 && r > 0 && (
        <div className="space-y-1.5">
          <ResultBox label={`${h} hrs earned`} value={formatCurrency(earned)} />
          <ResultBox label="Day estimate (8h)" value={formatCurrency(perDay)} />
          <ResultBox label="Week estimate (40h)" value={formatCurrency(perWeek)} />
          <ResultBox label="Month estimate (160h)" value={formatCurrency(perMonth)} />
        </div>
      )}
    </div>
  );
}

type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days';

function UnitConverter() {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<TimeUnit>('hours');

  const n = parseFloat(value) || 0;
  const toSeconds: Record<TimeUnit, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
  const totalSeconds = n * toSeconds[unit];

  const conversions: { label: string; value: string; exact: number }[] = [
    { label: 'Seconds', value: totalSeconds.toFixed(0), exact: totalSeconds },
    { label: 'Minutes', value: (totalSeconds / 60).toFixed(2), exact: totalSeconds / 60 },
    { label: 'Hours', value: (totalSeconds / 3600).toFixed(4), exact: totalSeconds / 3600 },
    { label: 'Days', value: (totalSeconds / 86400).toFixed(4), exact: totalSeconds / 86400 },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input type="number" placeholder="e.g., 90" value={value} onChange={e => setValue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground appearance-none"
            value={unit}
            onChange={e => setUnit(e.target.value as TimeUnit)}
          >
            <option value="seconds">Seconds</option>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      </div>
      {n > 0 && (
        <div className="space-y-1.5">
          {conversions.map(c => (
            <ResultBox key={`${c.label}-${c.exact}`} label={c.label} value={c.value} exactValue={c.exact} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TimeCalculator() {
  return (
    <div className="space-y-2">
      <Section title="Duration Calculator" defaultOpen={true}>
        <DurationCalculator />
      </Section>
      <Section title="Earnings Calculator">
        <EarningsCalculator />
      </Section>
      <Section title="Unit Converter">
        <UnitConverter />
      </Section>
    </div>
  );
}
