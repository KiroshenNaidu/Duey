'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  QUICK_SHORTCUTS, getShortcut, MIN_QUICK_SHORTCUTS, MAX_QUICK_SHORTCUTS,
} from '@/lib/quickShortcuts';
import { computeRadial } from '@/components/QuickAdd';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Zap, X, Plus, Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

// Configure the quick-add radial on a LIVE preview of the fan itself: the items sit at
// their real arc positions, so what you arrange here is exactly what opens in the app.
// Tap an item to select it, tap another to swap places (or nudge with ◀ ▶), remove with
// the bin. "Add shortcut" opens the full catalogue.
//
// CONTROLLED component — edits go to the parent's draft (Theme page save-then-apply
// semantics); nothing is written to app state until the user hits Save.

const PREVIEW_RADIUS = 82; // compact fan radius so up to 7 items fit the preview box

export function QuickMenuConfig({ value, onChange }: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const radial = useMemo(() => computeRadial(value, PREVIEW_RADIUS), [value]);
  const selectedIndex = selected ? value.indexOf(selected) : -1;

  const atMin = value.length <= MIN_QUICK_SHORTCUTS;
  const atMax = value.length >= MAX_QUICK_SHORTCUTS;

  const tapItem = (id: string) => {
    if (!selected) { setSelected(id); return; }
    if (selected === id) { setSelected(null); return; }
    // Swap the selected item with the tapped one — positions animate to show the result.
    const next = [...value];
    const a = next.indexOf(selected);
    const b = next.indexOf(id);
    if (a >= 0 && b >= 0) [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
    setSelected(null);
  };

  const nudge = (dir: -1 | 1) => {
    if (selectedIndex < 0) return;
    const target = selectedIndex + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    onChange(next);
  };

  const removeSelected = () => {
    if (!selected || atMin) return;
    onChange(value.filter(id => id !== selected));
    setSelected(null);
  };

  const add = (id: string) => {
    if (atMax || value.includes(id)) return;
    onChange([...value, id]);
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        {value.length} of {MAX_QUICK_SHORTCUTS} slots · tap an item, then tap another to swap — this is exactly how your menu will look
      </p>

      {/* Live radial preview */}
      <div className="relative h-48 rounded-2xl border border-border/60 bg-muted/10 overflow-hidden">
        <div className="absolute left-1/2 bottom-8 w-0 h-0">
          {radial.items.map(item => {
            const isSelected = selected === item.id;
            return (
              <motion.button
                key={item.id}
                onClick={() => tapItem(item.id)}
                initial={false}
                animate={{ x: item.x, y: item.y, scale: isSelected ? 1.15 : 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className="absolute flex flex-col items-center gap-0.5"
                style={{ left: 0, top: 0, translateX: '-50%', translateY: '-50%' }}
              >
                <span
                  className={cn(
                    'h-10 w-10 rounded-full bg-card border flex items-center justify-center transition-colors text-primary',
                    isSelected ? 'border-primary bg-primary/10 sel-glow' : 'border-accent/40'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className={cn(
                  'text-[8px] font-bold rounded-full px-1.5 py-0.5 whitespace-nowrap',
                  isSelected ? 'bg-accent text-btn-on-accent' : 'bg-black/60 text-foreground'
                )}>
                  {item.label}
                </span>
              </motion.button>
            );
          })}
          {/* FAB stand-in at the anchor */}
          <span
            className="absolute h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
            style={{ left: 0, top: 0, transform: 'translate(-50%, -50%)' }}
          >
            <Zap className="h-4 w-4" />
          </span>
        </div>
      </div>

      {/* Toolbar for the selected item */}
      {selected && selectedIndex >= 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-2.5 py-2">
          <p className="flex-1 text-xs font-semibold text-foreground truncate">
            {getShortcut(selected)?.title} <span className="text-muted-foreground font-normal">· slot {selectedIndex + 1}</span>
          </p>
          <button
            onClick={() => nudge(-1)}
            disabled={selectedIndex === 0}
            aria-label="Move left along the arc"
            className="p-1.5 rounded-lg text-muted-foreground disabled:opacity-25 active:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => nudge(1)}
            disabled={selectedIndex === value.length - 1}
            aria-label="Move right along the arc"
            className="p-1.5 rounded-lg text-muted-foreground disabled:opacity-25 active:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={removeSelected}
            disabled={atMin}
            aria-label="Remove from menu"
            className="p-1.5 rounded-lg text-muted-foreground/60 disabled:opacity-25 active:bg-destructive/10 active:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSelected(null)}
            aria-label="Deselect"
            className="p-1.5 rounded-lg text-muted-foreground/60 active:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <p className="text-[9px] text-muted-foreground/70 px-1">
          {atMin ? `At least ${MIN_QUICK_SHORTCUTS} shortcut must stay in the menu. ` : ''}Select an item above to move or remove it.
        </p>
      )}

      {/* Add new area — opens the full catalogue */}
      <button
        onClick={() => setCatalogOpen(true)}
        disabled={atMax}
        className={cn(
          'w-full rounded-xl border border-dashed px-3 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
          atMax
            ? 'border-border/40 text-muted-foreground/40'
            : 'border-accent/40 text-accent hover:bg-accent/5'
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {atMax ? `Menu is full (${MAX_QUICK_SHORTCUTS} max)` : 'Add shortcut'}
      </button>

      {/* Catalogue — large picker of every available shortcut. Flex column: fixed header +
          footer, the middle list is the only scroll region (min-h-0 lets it shrink), so
          items never clip against the header/footer edges. */}
      <Dialog open={catalogOpen} onOpenChange={v => setCatalogOpen(v)}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[85dvh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3 text-left shrink-0">
            <DialogTitle>All shortcuts</DialogTitle>
            <DialogDescription className="text-xs">
              Everything the quick menu can do.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-1 space-y-2">
            {QUICK_SHORTCUTS.map(s => {
              const added = value.includes(s.id);
              const full = value.length >= MAX_QUICK_SHORTCUTS;
              return (
                <button
                  key={s.id}
                  onClick={() => add(s.id)}
                  disabled={added || full}
                  className={cn(
                    'w-full rounded-2xl border p-3 flex items-center gap-3 text-left transition-colors',
                    added
                      ? 'border-accent/40 bg-accent/5'
                      : full
                        ? 'border-border/40 opacity-50'
                        : 'border-border hover:border-accent/50 hover:bg-accent/5'
                  )}
                >
                  <span className="h-10 w-10 rounded-full bg-card border border-accent/40 text-accent flex items-center justify-center shrink-0">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.description}</p>
                  </div>
                  {added ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-accent shrink-0">
                      <Check className="h-3.5 w-3.5" /> Added
                    </span>
                  ) : (
                    <Plus className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-5 pt-3 shrink-0 border-t border-border/40">
            <Button variant="secondary" className="w-full" onClick={() => setCatalogOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
