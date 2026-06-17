'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarDays } from 'lucide-react';

const ITEM_H = 44;
const VISIBLE = 5;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 71 }, (_, i) => CURRENT_YEAR - 35 + i);

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function DateColumn<T extends number>({
  items,
  selected,
  onSelect,
  format,
}: {
  items: T[];
  selected: T;
  onSelect: (v: T) => void;
  format: (v: T) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ref.current) {
      const idx = items.indexOf(selected);
      if (idx >= 0) ref.current.scrollTop = idx * ITEM_H;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
      onSelect(items[idx]);
    }, 80);
  }, [items, onSelect]);

  const handleTap = useCallback((idx: number) => {
    ref.current?.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative" style={{ width: 52, height: VISIBLE * ITEM_H }}>
      <div
        className="absolute inset-x-0.5 pointer-events-none z-10 rounded-xl bg-primary/20 border border-primary/40"
        style={{ top: Math.floor(VISIBLE / 2) * ITEM_H, height: ITEM_H }}
      />
      <div className="absolute top-0 inset-x-0 h-16 pointer-events-none z-10 bg-gradient-to-b from-card to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-16 pointer-events-none z-10 bg-gradient-to-t from-card to-transparent" />
      <div
        ref={ref}
        className="h-full overflow-y-scroll"
        style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
        onScroll={handleScroll}
      >
        <div style={{ height: Math.floor(VISIBLE / 2) * ITEM_H }} aria-hidden />
        {items.map((v, idx) => (
          <div
            key={v}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            onClick={() => handleTap(idx)}
            className={cn(
              'flex items-center justify-center font-mono transition-all select-none cursor-pointer',
              v === selected
                ? 'text-primary text-lg font-bold'
                : 'text-muted-foreground text-base hover:text-foreground/70'
            )}
          >
            {format(v)}
          </div>
        ))}
        <div style={{ height: Math.floor(VISIBLE / 2) * ITEM_H }} aria-hidden />
      </div>
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const today = new Date();
  const parsed = value ? new Date(value + 'T00:00:00') : null;
  const initDay   = parsed ? parsed.getDate()     : today.getDate();
  const initMonth = parsed ? parsed.getMonth()    : today.getMonth();
  const initYear  = parsed ? parsed.getFullYear() : today.getFullYear();

  const [day,   setDay]   = useState(initDay);
  const [month, setMonth] = useState(initMonth);
  const [year,  setYear]  = useState(initYear);

  const maxDay = daysInMonth(year, month);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const clampedDay = Math.min(day, maxDay);

  const handleConfirm = () => {
    const d = Math.min(day, daysInMonth(year, month));
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onChange(`${year}-${mm}-${dd}`);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setOpen(false);
  };

  const display = parsed
    ? `${String(parsed.getDate()).padStart(2, '0')} ${MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`
    : '--';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 w-full h-9 rounded-md border border-input bg-background px-3 text-sm',
            'transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !parsed && 'text-muted-foreground'
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-mono tracking-wider">{display}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 overflow-hidden rounded-2xl border-border/60"
        align="start"
        sideOffset={6}
      >
        <div className="bg-card">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center pt-3 pb-1">
            Select Date
          </p>
          <div className="flex items-center justify-center gap-1 px-3">
            <DateColumn
              items={days}
              selected={clampedDay}
              onSelect={setDay}
              format={v => String(v).padStart(2, '0')}
            />
            <DateColumn
              items={MONTHS}
              selected={month}
              onSelect={setMonth}
              format={v => MONTH_NAMES[v]}
            />
            <DateColumn
              items={YEARS}
              selected={year}
              onSelect={setYear}
              format={v => String(v)}
            />
          </div>
          <div className="flex items-center justify-between px-4 pb-3 pt-2 border-t border-border/30 mt-1">
            <button
              onClick={handleClear}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
            >
              Clear
            </button>
            <button
              onClick={handleConfirm}
              className="text-xs font-semibold text-primary px-4 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
