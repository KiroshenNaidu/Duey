'use client';

import { useState } from 'react';
import { format, startOfMonth, getDay, getDaysInMonth, addMonths, subMonths, isToday, startOfToday } from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DatePickerInputProps {
  value?: string; // ISO date string YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePickerInput({ value, onChange, placeholder = 'Pick a date', className }: DatePickerInputProps) {
  const selected = value ? new Date(value + 'T12:00:00') : null;
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? startOfToday());
  const [open, setOpen] = useState(false);

  const firstDow = getDay(startOfMonth(viewMonth));
  const daysCount = getDaysInMonth(viewMonth);
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);

  const handleSelect = (day: number) => {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(iso);
    setOpen(false);
  };

  const isSelected = (day: number) =>
    selected?.getFullYear() === viewMonth.getFullYear() &&
    selected?.getMonth() === viewMonth.getMonth() &&
    selected?.getDate() === day;

  const isTodayDay = (day: number) => {
    const today = startOfToday();
    return today.getFullYear() === viewMonth.getFullYear() &&
      today.getMonth() === viewMonth.getMonth() &&
      today.getDate() === day;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 w-full h-8 px-3 rounded-lg border border-border bg-muted/30 text-xs text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">
            {selected ? format(selected, 'd MMM yyyy') : placeholder}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-3" align="start">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewMonth(m => subMonths(m, 1))}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-semibold text-foreground">
            {format(viewMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setViewMonth(m => addMonths(m, 1))}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Week day headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEK_DAYS.map(d => (
            <div key={d} className="h-6 flex items-center justify-center text-[9px] font-semibold text-muted-foreground uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
          {days.map(day => {
            const sel = isSelected(day);
            const tod = isTodayDay(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => handleSelect(day)}
                className={cn(
                  'h-7 w-full rounded-lg text-[11px] font-medium transition-all duration-150 flex items-center justify-center',
                  sel
                    ? 'bg-primary text-primary-foreground'
                    : tod
                      ? 'bg-accent/20 text-accent font-bold'
                      : 'text-foreground hover:bg-muted/60',
                  tod && !sel && 'ring-1 ring-accent ring-offset-1 ring-offset-card'
                )}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Quick actions */}
        <div className="flex justify-between mt-3 pt-2 border-t border-border/40">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              const today = startOfToday();
              const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              onChange(iso);
              setViewMonth(today);
              setOpen(false);
            }}
            className="text-[10px] text-primary font-semibold hover:text-primary/80 transition-colors"
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
