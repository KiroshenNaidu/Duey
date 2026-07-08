'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion, useMotionValue } from 'framer-motion';
import { RADIAL_FX_PRESETS, getRadialFx } from '@/lib/radialFx';
import { AimSparkles, RippleBurst, CometTrail } from '@/components/RadialAimFx';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { Zap, CreditCard, Receipt, BadgeDollarSign, Car, Check } from 'lucide-react';

// Live playground for the quick-add radial effects (Theme → Style). A dummy FAB you can
// actually hold + flick, running the exact same aim math as the real menu but selecting
// nothing — flicking an item just flashes a check and resets.
//
// CONTROLLED component — the picked preset goes to the parent's draft (Theme page
// save-then-apply semantics); the demo previews the DRAFT, but app state only changes
// when the user hits Save.

// Compact geometry so the fan fits the demo box — the real values live in QuickAdd.tsx.
const DEMO_RADIUS = 78;
const DEMO_ARC_FROM = 160;
const DEMO_ARC_TO = 20;
const AIM_MIN_DIST = 35;
const SECTOR_TOLERANCE_DEG = 42;

const DEMO_ITEMS = [
  { id: 'a', icon: CreditCard },
  { id: 'b', icon: Receipt },
  { id: 'c', icon: BadgeDollarSign },
  { id: 'd', icon: Car },
].map((item, i, arr) => {
  const angleDeg = DEMO_ARC_FROM - i * ((DEMO_ARC_FROM - DEMO_ARC_TO) / (arr.length - 1));
  const rad = angleDeg * (Math.PI / 180);
  return { ...item, angleDeg, x: Math.cos(rad) * DEMO_RADIUS, y: -Math.sin(rad) * DEMO_RADIUS };
});

const angleDelta = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export function RadialFxDemo({ value, onChange }: {
  value: string;
  onChange: (id: string) => void;
}) {
  const fx = getRadialFx(value);
  const fxRef = useRef(fx);
  fxRef.current = fx;

  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null); // item that was just "selected"
  // Ring + beam are MotionValue-driven, mirroring QuickAdd: pointermove writes styles
  // directly instead of re-rendering the animated demo subtree on every move.
  const ringX = useMotionValue(0);
  const ringY = useMotionValue(0);
  const ringOpacity = useMotionValue(0);
  const beamLen = useMotionValue(0);
  const beamRotate = useMotionValue(0);
  const beamOpacity = useMotionValue(0);
  const hoveredRef = useRef<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const reset = useCallback(() => {
    setOpen(false);
    setHovered(null);
    hoveredRef.current = null;
    ringOpacity.set(0);
    beamOpacity.set(0);
  }, [ringOpacity, beamOpacity]);

  const startGesture = (e: React.PointerEvent) => {
    e.preventDefault();
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
    setOpen(true);

    const onMove = (ev: PointerEvent) => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const box = boxRef.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      const dx = ev.clientX - anchor.left;
      const dy = ev.clientY - anchor.top;
      const dist = Math.hypot(dx, dy);

      let aimed: string | null = null;
      if (dist >= AIM_MIN_DIST) {
        const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
        let best = SECTOR_TOLERANCE_DEG;
        for (const item of DEMO_ITEMS) {
          const diff = angleDelta(angle, item.angleDeg);
          if (diff <= best) { aimed = item.id; best = diff; }
        }
        if (fxRef.current.aimBeam) {
          beamLen.set(Math.min(dist, DEMO_RADIUS - 14));
          beamRotate.set(-angle);
          beamOpacity.set(1);
        }
      } else if (fxRef.current.aimBeam) {
        beamOpacity.set(0);
      }
      // Same selection haptic as the real menu, so the preset previews true to feel.
      if (aimed && aimed !== hoveredRef.current) hapticTick();
      hoveredRef.current = aimed;
      setHovered(aimed); // bails out when unchanged — no re-render per move
      // Ring position relative to the demo box (it renders inside the box, not fixed).
      if (fxRef.current.pointerRing) {
        ringX.set(ev.clientX - box.left - 18);
        ringY.set(ev.clientY - box.top - 18);
        ringOpacity.set(1);
      }
    };

    const onUp = () => {
      cleanup();
      const target = hoveredRef.current;
      if (target) {
        // "Selected" flash, then fold the fan back in.
        setFlash(target);
        setHovered(null);
        hoveredRef.current = null;
        ringOpacity.set(0);
        beamOpacity.set(0);
        flashTimer.current = setTimeout(() => { setFlash(null); setOpen(false); }, 650);
      } else {
        reset();
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="space-y-3">
      {/* Preset picker */}
      <div className="flex flex-wrap gap-1.5">
        {RADIAL_FX_PRESETS.map(p => (
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
      <p className="text-[10px] text-muted-foreground">
        {RADIAL_FX_PRESETS.find(p => p.id === value)?.description}
      </p>

      {/* Live playground */}
      <div
        ref={boxRef}
        className="relative h-52 rounded-2xl border border-border/60 bg-muted/10 overflow-hidden"
        style={{ touchAction: 'none' }}
      >
        <p className="absolute top-2 inset-x-0 text-center text-[10px] text-muted-foreground/60 select-none">
          Hold the button, flick toward an icon
        </p>

        {/* Anchor point where the dummy FAB sits */}
        <div ref={anchorRef} className="absolute left-1/2 bottom-9 w-0 h-0">
          {/* Beam sits OUTSIDE AnimatePresence and follows the pointer via MotionValues
              (opacity zeroed synchronously on release) so it clears the instant you let
              go — never frozen into the items' fold-back exit snapshot. */}
          {open && fx.aimBeam && (
            <motion.div
              className="absolute pointer-events-none rounded-full"
              style={{
                left: 0, top: 0, width: beamLen, height: fx.beamWidth,
                rotate: beamRotate, opacity: beamOpacity, transformOrigin: '0 50%',
                background: 'linear-gradient(90deg, hsl(var(--accent) / 0), hsl(var(--accent) / 0.9) 55%, hsl(var(--accent) / 0))',
                filter: 'drop-shadow(0 0 6px hsl(var(--accent) / 0.45))',
              }}
            >
              {fx.cometTrail && <CometTrail />}
            </motion.div>
          )}
          {/* Items array = valid keyed AnimatePresence children (no Fragment wrapper). */}
          <AnimatePresence>
            {(open || flash) &&
                DEMO_ITEMS.map((item, i) => {
                  const isAimed = hovered === item.id;
                  const isFlash = flash === item.id;
                  const somethingAimed = hovered !== null;
                  const pull = isAimed ? fx.magneticPull : 0;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
                      animate={{ x: item.x, y: item.y, scale: 1, opacity: somethingAimed && !isAimed ? fx.dimOthers : 1 }}
                      exit={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
                      transition={{
                        x: { type: 'spring', ...(fx.elasticFan ? { stiffness: 500, damping: 15 } : { stiffness: 550, damping: 30 }), delay: i * 0.028 },
                        y: { type: 'spring', ...(fx.elasticFan ? { stiffness: 500, damping: 15 } : { stiffness: 550, damping: 30 }), delay: i * 0.028 },
                        scale: { type: 'spring', ...(fx.elasticFan ? { stiffness: 500, damping: 15 } : { stiffness: 550, damping: 30 }), delay: i * 0.028 },
                        opacity: { duration: 0.12 },
                      }}
                      className="absolute"
                      style={{ left: 0, top: 0, translateX: '-50%', translateY: '-50%' }}
                    >
                      <motion.span
                        className={cn(
                          'relative flex h-10 w-10 rounded-full bg-card border shadow-lg items-center justify-center transition-colors',
                          isAimed || isFlash ? 'border-accent bg-accent/15 text-accent' : 'border-accent/40 text-accent'
                        )}
                        animate={{
                          x: (item.x / DEMO_RADIUS) * pull,
                          y: (item.y / DEMO_RADIUS) * pull,
                          scale: isFlash ? 1.3 : isAimed ? fx.hoverScale : 1,
                          rotate: fx.wobble && isAimed ? [0, -5, 5, -3, 0] : 0,
                        }}
                        transition={{
                          type: 'spring', stiffness: 600, damping: 30,
                          rotate: fx.wobble && isAimed
                            ? { duration: 0.45, repeat: Infinity, ease: 'easeInOut' }
                            : { duration: 0.15 },
                        }}
                        style={fx.hoverGlow && (isAimed || isFlash) ? { boxShadow: '0 0 16px 3px hsl(var(--accent) / 0.45)' } : undefined}
                      >
                        {isFlash ? <Check className="h-4 w-4" /> : <item.icon className="h-4 w-4" />}
                        {isAimed && <AimSparkles count={fx.sparkles} />}
                        {isAimed && fx.rippleBurst && <RippleBurst />}
                      </motion.span>
                    </motion.div>
                  );
                })}
          </AnimatePresence>

          {/* The dummy FAB itself */}
          <button
            onPointerDown={startGesture}
            onContextMenu={e => e.preventDefault()}
            aria-label="Effect demo button"
            className="absolute h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
            style={{ left: 0, top: 0, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
          >
            <Zap className="h-4 w-4" />
          </button>
        </div>

        {/* Finger ring, positioned inside the demo box — MotionValue-driven like the
            real menu, so dragging in the demo never re-renders it per move. */}
        {open && fx.pointerRing && (
          <motion.div
            animate={fx.ringPulse ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={fx.ringPulse ? { scale: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } } : undefined}
            className="absolute left-0 top-0 pointer-events-none h-9 w-9 rounded-full border-2 border-accent/70"
            style={{
              x: ringX,
              y: ringY,
              opacity: ringOpacity,
              boxShadow: '0 0 12px 2px hsl(var(--accent) / 0.35)',
            }}
          />
        )}
      </div>
    </div>
  );
}
