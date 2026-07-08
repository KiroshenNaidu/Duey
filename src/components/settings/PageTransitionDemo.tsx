'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PAGE_TRANSITION_PRESETS, getPageTransition } from '@/lib/pageTransitions';
import { cn } from '@/lib/utils';
import { Car, Wallet, BarChart3 } from 'lucide-react';

// Picker + auto-playing mini carousel for the page-swipe transition (Theme → Style).
// CONTROLLED component — the picked preset goes to the parent's draft (same
// save-then-apply contract as the radial FX demo); the real carousel only changes when
// the user hits Save. The preview runs the exact same frame() math AppShell uses.

const DEMO_PAGES = [
  { icon: Car, tint: 'bg-primary/25' },
  { icon: Wallet, tint: 'bg-accent/25' },
  { icon: BarChart3, tint: 'bg-muted/70' },
];

export function PageTransitionDemo({ value, onChange }: {
  value: string;
  onChange: (id: string) => void;
}) {
  const preset = getPageTransition(value);
  const reduce = useReducedMotion();

  // Ping-pong between the mini pages (0→1→2→1→0…) so the loop never has to snap
  // across a two-page jump.
  const [idx, setIdx] = useState(1);
  const dirRef = useRef(1);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      setIdx(i => {
        let next = i + dirRef.current;
        if (next < 0 || next >= DEMO_PAGES.length) {
          dirRef.current *= -1;
          next = i + dirRef.current;
        }
        return next;
      });
    }, 1500);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="space-y-3">
      {/* Preset picker */}
      <div className="flex flex-wrap gap-1.5">
        {PAGE_TRANSITION_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
              p.id === value ? 'border-primary text-primary sel-glow' : 'border-border text-muted-foreground active:bg-muted'
            )}
          >
            {p.name}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">{preset.description}</p>

      {/* Live preview — three mini pages cycling with the selected preset */}
      <div className="relative h-24 rounded-2xl border border-border/60 bg-muted/10 overflow-hidden">
        {DEMO_PAGES.map((page, i) => {
          const f = preset.frame(i - idx);
          return (
            <motion.div
              key={i}
              className="absolute inset-2"
              animate={{ x: f.x, scale: f.scale, opacity: f.opacity, rotateY: f.rotateY }}
              transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: reduce ? 0 : 0.45 }}
              style={{
                transformPerspective: preset.threeD ? 700 : undefined,
                zIndex: i, // parallax stacking, same as the real carousel
              }}
            >
              <div className="h-full w-full rounded-lg border border-border/60 bg-card shadow-sm flex items-center gap-2.5 px-3">
                <span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', page.tint)}>
                  <page.icon className="h-4 w-4 text-foreground/70" />
                </span>
                <div className="flex-1 space-y-1.5">
                  <div className="h-1.5 w-1/2 rounded-full bg-muted-foreground/25" />
                  <div className="h-1.5 w-3/4 rounded-full bg-muted-foreground/15" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
