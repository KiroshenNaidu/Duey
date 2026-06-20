'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

const ITEM_H = 44;
const VISIBLE = 5; // must be odd so the center slot is clear

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function fmt(n: number) { return String(n).padStart(2, '0'); }

function TimeColumn({
  items,
  selected,
  onSelect,
}: {
  items: number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to the current selection every time the column mounts (popover opens)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = selected * ITEM_H;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced scroll → read final snap position and report it
  const handleScroll = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
      onSelect(items[idx]);
    }, 80);
  }, [items, onSelect]);

  // Tap an item → smoothly scroll it to center (scroll handler picks it up)
  const handleTap = useCallback((idx: number) => {
    ref.current?.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative w-14" style={{ height: VISIBLE * ITEM_H }}>
      {/* Selection highlight ring */}
      <div
        className="absolute inset-x-0.5 pointer-events-none z-10 rounded-xl bg-primary/20 border border-primary/40"
        style={{ top: Math.floor(VISIBLE / 2) * ITEM_H, height: ITEM_H }}
      />
      {/* Top fade */}
      <div className="absolute top-0 inset-x-0 h-16 pointer-events-none z-10 bg-gradient-to-b from-card to-transparent" />
      {/* Bottom fade */}
      <div className="absolute bottom-0 inset-x-0 h-16 pointer-events-none z-10 bg-gradient-to-t from-card to-transparent" />

      {/* Scroll container */}
      <div
        ref={ref}
        className="h-full overflow-y-scroll"
        // 'center' snap: item center aligns with container center → scrollTop = idx * ITEM_H
        style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
        onScroll={handleScroll}
      >
        {/* Top padding so item 0 can center */}
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
            {fmt(v)}
          </div>
        ))}

        {/* Bottom padding so last item can center */}
        <div style={{ height: Math.floor(VISIBLE / 2) * ITEM_H }} aria-hidden />
      </div>
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const parts = value?.match(/^(\d{1,2}):(\d{2})$/);
  const h = parts ? parseInt(parts[1]) : 0;
  const m = parts ? parseInt(parts[2]) : 0;
  const hasValue = !!parts;

  const display = hasValue ? `${fmt(h)}:${fmt(m)}` : '--:--';

  const updateH = useCallback((newH: number) => {
    onChange(`${fmt(newH)}:${fmt(m)}`);
  }, [m, onChange]);

  const updateM = useCallback((newM: number) => {
    onChange(`${fmt(h)}:${fmt(newM)}`);
  }, [h, onChange]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            'flex items-center gap-2 w-full h-9 rounded-md border border-input bg-background px-3 text-sm',
            'transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !hasValue && 'text-muted-foreground',
            disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
          )}
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
            Select Time
          </p>
          <div className="flex items-center justify-center gap-0 px-3">
            <TimeColumn items={HOURS}   selected={h} onSelect={updateH} />
            <span className="text-2xl font-bold text-muted-foreground/60 pb-0.5 px-1">:</span>
            <TimeColumn items={MINUTES} selected={m} onSelect={updateM} />
          </div>
          <div className="flex items-center justify-between px-4 pb-3 pt-2 border-t border-border/30 mt-1">
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
            >
              Clear
            </button>
            <button
              onClick={() => setOpen(false)}
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
