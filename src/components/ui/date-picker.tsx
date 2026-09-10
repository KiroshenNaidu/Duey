'use client';

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';

interface DatePickerInputProps {
  value?: string; // ISO date string YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePickerInput({ value, onChange, placeholder = 'Pick a date', className }: DatePickerInputProps) {
  const selected = value ? new Date(value.slice(0, 10) + 'T12:00:00') : null;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click/touch
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler, true);
    document.addEventListener('touchstart', handler, true);
    return () => {
      document.removeEventListener('mousedown', handler, true);
      document.removeEventListener('touchstart', handler, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-2 w-full h-8 px-3 rounded-lg border border-border bg-muted/30 text-xs text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary',
          !selected && 'text-muted-foreground',
          open && 'ring-1 ring-primary border-primary',
          className
        )}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">
          {selected ? format(selected, 'd MMM yyyy') : placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute z-[200] top-full mt-1 left-0 w-[19rem] max-w-[calc(100vw-2rem)] p-3 bg-popover border border-border rounded-xl shadow-xl">
          <Calendar
            value={selected}
            onSelect={d => {
              onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
              setOpen(false);
            }}
          />
          {/* Clearing is the one action the calendar itself cannot express — "today" and
              every jump already live in its quick row. */}
          <div className="flex justify-end mt-3 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
