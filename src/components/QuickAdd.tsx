'use client';

import { useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { format, startOfDay } from 'date-fns';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { calculateTransportMonth, isTransportPaidForMonth } from '@/lib/calculations';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Zap, X, Check } from 'lucide-react';
import { acquireOverlayBlur, releaseOverlayBlur } from '@/lib/overlayBlur';
import { getRadialFx } from '@/lib/radialFx';
import { AimSparkles, CurvedLabel } from '@/components/RadialAimFx';
import { getShortcut, type QuickShortcut } from '@/lib/quickShortcuts';

// Global quick-add: log a debt payment, expense, extra income or Uber ride from anywhere.
// Opened by long-pressing any bottom-center + FAB (see useFabLongPress) or tapping the
// lightning FAB rendered on pages that have no + FAB of their own (/transport, /stats).
// The menu is a SEMICIRCLE of actions that springs out radially around the FAB.

const OPEN_EVENT = 'duey:quick-add';

/** Open the radial. gesture=true means the pointer is still held down — the menu
 *  supports slide-to-an-item-and-release selection for that same gesture. */
export function openQuickAdd(gesture = false) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { gesture } }));
}

// ═══════════════════ Radial menu tuning — everything adjustable lives here ═══════════════════
const LONG_PRESS_MS = 450;   // hold time on a money-page + FAB before the radial opens
const RADIUS = 104;          // fan distance (px) from the FAB centre
const ARC_FROM_DEG = 160;    // leftmost item angle (degrees above the FAB)
const ARC_TO_DEG = 20;       // rightmost item angle

// Flick/aim selection: DIRECTION-based, not distance-based — the moment the finger moves
// AIM_MIN_DIST px away from the FAB centre, the item whose direction best matches the
// finger's direction is aimed. A short flick toward an item is enough; releasing selects.
const AIM_MIN_DIST = 35;          // dead-zone radius around the FAB centre (px) — smaller = aims sooner
const AIM_MAX_DIST = 240;         // "safe area" radius — flick BEYOND this (e.g. up to the top
                                  // of the screen) aims at nothing, so releasing there CANCELS.
const SECTOR_TOLERANCE_DEG = 42;  // max angular distance from an item that still aims it

// Drag/touch visual effects live in lib/radialFx.ts as user-selectable presets
// (Theme → Style, with a live demo). The active one comes from AppState.quickAddFxId.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Long-press props for the money-page FABs. Spread onto the FAB button — a hold opens
 * the QuickAdd radial (with slide-to-select active) and swallows the click so the FAB's
 * normal dialog doesn't open. touchAction none keeps pointermove alive while sliding.
 */
export function useFabLongPress() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const start = useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      openQuickAdd(true); // pointer is still down → slide-select gesture
    }, LONG_PRESS_MS);
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onClickCapture: (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        firedRef.current = false;
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // suppress mobile long-press menu
  };
}

/** Merge into the FAB's style prop: keeps pointermove alive while sliding on touch
 *  (otherwise the browser steals the drag for scrolling and fires pointercancel). */
export const FAB_TOUCH_STYLE = { touchAction: 'none' } as const;

/**
 * Pulsing FAB inner content: a soft primary ring pulses outward behind the solid fill.
 * Put inside a TRANSPARENT, fixed/relative FAB button (h-12 w-12) and pass the icon as
 * children. Shared by the quick-add lightning FAB and the money-page + FABs so they pulse
 * identically. Respects prefers-reduced-motion.
 */
export function FabPulse({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <>
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-full bg-primary/50"
          // Both ends of the loop sit at opacity 0 so the repeat has nothing visible to
          // snap back to: the ring fades in small, then expands outward as it fades out.
          animate={{ scale: [1, 1.12, 1.55], opacity: [0, 0.55, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', times: [0, 0.18, 1] }}
        />
      )}
      <span className="absolute inset-0 rounded-full bg-primary shadow-lg flex items-center justify-center text-primary-foreground">
        {children}
      </span>
    </>
  );
}

// The set + order of shortcuts comes from AppState.quickAddShortcuts (user-configured in
// Theme → Style → Quick Menu, 1–7 items). Geometry is computed per count: items spread
// across the arc (a single item sits straight up), and the radius widens a little as the
// fan gets crowded so 7 items don't overlap.
export type RadialItem = QuickShortcut & { angleDeg: number; x: number; y: number };

/** Exported so the Quick Menu config preview can render the exact same layout. */
export function computeRadial(ids: string[], baseRadius = RADIUS): { items: RadialItem[]; radius: number } {
  const shortcuts = ids.map(getShortcut).filter((s): s is QuickShortcut => !!s);
  const n = shortcuts.length;
  const radius = baseRadius + Math.max(0, n - 4) * 12;
  const items = shortcuts.map((s, i) => {
    const angleDeg = n === 1 ? 90 : ARC_FROM_DEG - i * ((ARC_FROM_DEG - ARC_TO_DEG) / (n - 1));
    const rad = angleDeg * (Math.PI / 180);
    return { ...s, angleDeg, x: Math.cos(rad) * radius, y: -Math.sin(rad) * radius };
  });
  return { items, radius };
}

/** Smallest angular difference between two angles, in degrees (0–180). */
const angleDelta = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Nav / tool shortcuts. Calculator + notes are global panels (mounted app-wide by
 *  FloatingTools/QuickNotepad), opened via window events. Theme + history navigate;
 *  SettingsPage is always mounted (AppShell carousel) so its theme-open listener is live. */
function runNavShortcut(id: string, router: AppRouterInstance) {
  switch (id) {
    case 'calculator': window.dispatchEvent(new Event('duey:open-calculator')); break;
    case 'notes':      window.dispatchEvent(new Event('duey:open-notes')); break;
    case 'theme':      window.dispatchEvent(new Event('duey:open-theme')); router.push('/settings'); break;
    case 'history':    router.push('/history'); break;
  }
}

export function QuickAdd() {
  const pathname = usePathname();
  const router = useRouter();
  const { quickAddFxId, quickAddShortcuts } = useContext(AppDataContext);
  const [radialOpen, setRadialOpen] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  // Active effect preset. Ref-mirrored so the gesture listeners (attached once per
  // gesture) always read the current value without re-binding mid-drag.
  const fx = getRadialFx(quickAddFxId);
  const fxRef = useRef(fx);
  fxRef.current = fx;

  // User-configured shortcut fan (also ref-mirrored for the gesture listeners).
  const radial = useMemo(() => computeRadial(quickAddShortcuts), [quickAddShortcuts]);
  const radialRef = useRef(radial);
  radialRef.current = radial;

  // ── Flick/slide-to-select gesture state ──
  // hoveredId: item currently aimed at while the finger is down; pointerPos feeds the
  // finger-following ring; beam is the centre→finger aim indicator. Refs mirror state
  // for the window-level listeners.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [beam, setBeam] = useState<{ angleDeg: number; length: number } | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const pendingGestureRef = useRef(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      pendingGestureRef.current = !!(e as CustomEvent<{ gesture?: boolean }>).detail?.gesture;
      setAction(null);
      setRadialOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Blur the app while the radial is open (same mechanism dialogs use).
  useEffect(() => {
    if (!radialOpen) return;
    const token = acquireOverlayBlur();
    return () => releaseOverlayBlur(token);
  }, [radialOpen]);

  const pick = useCallback((id: string) => {
    setRadialOpen(false);
    setHoveredId(null);
    hoveredRef.current = null;
    setPointerPos(null);
    setBeam(null);
    // Nav shortcuts open a tool / navigate instead of opening a logging form.
    if (getShortcut(id)?.kind === 'nav') {
      runNavShortcut(id, router);
      return;
    }
    setAction(id);
  }, [router]);

  const closeRadial = useCallback(() => {
    setRadialOpen(false);
    setHoveredId(null);
    hoveredRef.current = null;
    setPointerPos(null);
    setBeam(null);
  }, []);

  // Gesture engine: while the opening pointer is still down, track it globally.
  // Selection is DIRECTIONAL — once the finger leaves the AIM_MIN_DIST dead-zone, the
  // item whose direction best matches the finger's direction from the FAB centre is
  // aimed (within SECTOR_TOLERANCE_DEG), so a short flick is enough; releasing selects.
  // Releasing inside the dead-zone / no direction leaves the menu open for tap-to-pick.
  useEffect(() => {
    if (!radialOpen || !pendingGestureRef.current) return;
    pendingGestureRef.current = false;

    const endVisuals = () => {
      setHoveredId(null);
      hoveredRef.current = null;
      setPointerPos(null);
      setBeam(null);
    };

    const onMove = (e: PointerEvent) => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const dx = e.clientX - anchor.left;
      const dy = e.clientY - anchor.top;
      const dist = Math.hypot(dx, dy);

      let aimed: string | null = null;
      // Aim only inside the "safe area" ring [AIM_MIN_DIST, AIM_MAX_DIST]. Too close = dead
      // zone; too far (flicked up toward the top) = nothing aimed, so releasing CANCELS.
      if (dist >= AIM_MIN_DIST && dist <= AIM_MAX_DIST) {
        // Screen y grows downward, our angles are up-positive → negate dy.
        const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
        let best = SECTOR_TOLERANCE_DEG;
        for (const item of radialRef.current.items) {
          const diff = angleDelta(angle, item.angleDeg);
          if (diff <= best) { aimed = item.id; best = diff; }
        }
        if (fxRef.current.aimBeam) setBeam({ angleDeg: angle, length: Math.min(dist, radialRef.current.radius - 18) });
      } else if (fxRef.current.aimBeam) {
        setBeam(null);
      }

      hoveredRef.current = aimed;
      setHoveredId(aimed);
      if (fxRef.current.pointerRing) setPointerPos({ x: e.clientX, y: e.clientY });
    };

    const onUp = () => {
      const target = hoveredRef.current;
      cleanup();
      if (target) pick(target);
      else endVisuals(); // released without aiming → stay open in tap mode
    };

    const onCancel = () => { cleanup(); endVisuals(); };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return cleanup;
  }, [radialOpen, pick]);

  return (
    <>
      {/* Standalone lightning FAB on pages without a + FAB of their own.
          Idle-animated: a soft pulse ring plus an occasional icon shake.
          Press-down opens the radial immediately with slide-to-select armed:
          hold → slide to an action → release. A plain tap leaves it open. */}
      {(pathname === '/transport' || pathname === '/stats') && (
        <button
          aria-label="Quick add"
          onPointerDown={() => openQuickAdd(true)}
          className="fab-blurable fixed left-1/2 -translate-x-1/2 h-12 w-12 rounded-full z-40 focus:outline-none"
          style={{ bottom: 'calc(10px + var(--sab))', ...FAB_TOUCH_STYLE }}
        >
          <FabPulse>
            <motion.span
              animate={{ rotate: [0, -12, 12, -6, 0] }}
              transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 3.5, ease: 'easeInOut' }}
            >
              <Zap className="h-5 w-5" />
            </motion.span>
          </FabPulse>
        </button>
      )}

      {/* Radial semicircle menu, anchored to the FAB position.
          IMPORTANT: AnimatePresence's conditional child is a SINGLE keyed motion.div (the
          backdrop), with everything nested inside it. A Fragment here breaks Framer's
          exit tracking — the backdrop could fail to unmount and stay as an invisible
          full-screen layer that swallows every tap (the "app freezes, needs refresh" bug). */}
      <AnimatePresence>
        {radialOpen && (
          <motion.div
            key="radial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            // pointerEvents:none on exit → the moment it starts closing it stops blocking
            // taps, even if the fade-out frame or unmount lags. Prevents the invisible
            // full-screen backdrop from freezing the app after close (critical on Android).
            exit={{ opacity: 0, pointerEvents: 'none' }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[70] bg-black/50"
            style={{ touchAction: 'none' }}
            onClick={closeRadial}
          >
            {/* Anchor: zero-size point at the FAB centre; items spring out from here.
                Also the reference point the gesture engine measures aim against.
                stopPropagation so tapping an item/close doesn't also hit the backdrop. */}
            <div
              ref={anchorRef}
              className="absolute left-1/2 w-0 h-0"
              style={{ bottom: 'calc(34px + var(--sab))' }}
              onClick={e => e.stopPropagation()}
            >
              {radial.items.map((a, i) => {
                const isAimed = hoveredId === a.id;
                const somethingAimed = hoveredId !== null;
                // Magnetic pull: the aimed item leans outward along its own angle, as if
                // drawn toward the flick. Lives on the INNER element so it reacts
                // instantly — the outer element's staggered fly-out delay never touches it.
                const pull = isAimed ? fx.magneticPull : 0;
                return (
                  <motion.button
                    key={a.id}
                    onClick={() => pick(a.id)}
                    initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
                    animate={{ x: a.x, y: a.y, scale: 1, opacity: somethingAimed && !isAimed ? fx.dimOthers : 1 }}
                    // NO exit prop: items fade out with the backdrop as a unit. A per-item
                    // exit (spring) plus nested infinite effects (sparkles/pulse/wobble) made
                    // AnimatePresence wait on descendants and delay the backdrop unmount —
                    // that lingering invisible backdrop was the app-freeze bug.
                    // Stagger only the fly-out (x/y); opacity reacts instantly.
                    transition={{
                      x: { type: 'spring', stiffness: 420, damping: 26, delay: i * 0.045 },
                      y: { type: 'spring', stiffness: 420, damping: 26, delay: i * 0.045 },
                      scale: { type: 'spring', stiffness: 420, damping: 26, delay: i * 0.045 },
                      opacity: { duration: 0.12 },
                    }}
                    className="absolute"
                    style={{ left: 0, top: 0, translateX: '-50%', translateY: '-50%' }}
                  >
                    {/* Inner layer: instant aim feedback (grow + magnetic lean + wobble) */}
                    <motion.span
                      className="relative flex items-center justify-center"
                      animate={{
                        x: (a.x / radial.radius) * pull,
                        y: (a.y / radial.radius) * pull,
                        scale: isAimed ? fx.hoverScale : 1,
                        rotate: fx.wobble && isAimed ? [0, -5, 5, -3, 0] : 0,
                      }}
                      transition={{
                        type: 'spring', stiffness: 600, damping: 30,
                        rotate: fx.wobble && isAimed
                          ? { duration: 0.45, repeat: Infinity, ease: 'easeInOut' }
                          : { duration: 0.15 },
                      }}
                    >
                      <span
                        className={cn(
                          'relative h-12 w-12 rounded-full bg-card border shadow-xl text-accent flex items-center justify-center transition-colors',
                          isAimed ? 'border-accent bg-accent/15' : 'border-accent/40'
                        )}
                        style={fx.hoverGlow && isAimed ? { boxShadow: '0 0 18px 4px hsl(var(--accent) / 0.45)' } : undefined}
                      >
                        <a.icon className="h-5 w-5" />
                        {isAimed && <AimSparkles count={fx.sparkles} />}
                      </span>
                      {/* Label curves around the button, slowly orbiting + shimmering (primary) */}
                      <CurvedLabel id={a.id} index={i} text={a.label} />
                    </motion.span>
                  </motion.button>
                );
              })}

              {/* Centre close button sits exactly over the FAB */}
              <motion.button
                onClick={closeRadial}
                initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                className="absolute h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
                style={{ left: 0, top: 0, translateX: '-50%', translateY: '-50%' }}
                aria-label="Close quick add"
              >
                <X className="h-5 w-5" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Aim beam + finger ring render OUTSIDE the radial container, gated purely on their
          own state (nulled synchronously on select/close). Keeping them out of the
          AnimatePresence subtree means they disappear the instant you select — they can't
          be frozen into the backdrop's exit snapshot (the "line lingers after selecting" bug). */}
      {radialOpen && fx.aimBeam && beam && (
        <div className="fixed left-1/2 z-[73] w-0 h-0 pointer-events-none" style={{ bottom: 'calc(34px + var(--sab))' }}>
          <div
            className="absolute rounded-full"
            style={{
              left: 0,
              top: 0,
              width: beam.length,
              height: fx.beamWidth,
              transform: `rotate(${-beam.angleDeg}deg)`,
              transformOrigin: '0 50%',
              // Fade out at BOTH ends so the tip dissolves instead of a harsh cutoff.
              background: 'linear-gradient(90deg, hsl(var(--accent) / 0), hsl(var(--accent) / 0.9) 55%, hsl(var(--accent) / 0))',
              filter: 'drop-shadow(0 0 6px hsl(var(--accent) / 0.45))',
            }}
          />
        </div>
      )}
      {radialOpen && fx.pointerRing && pointerPos && (
        <motion.div
          animate={fx.ringPulse ? { scale: [1, 1.18, 1] } : { scale: 1 }}
          transition={fx.ringPulse ? { scale: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } } : undefined}
          className="fixed z-[74] pointer-events-none h-10 w-10 rounded-full border-2 border-accent/70"
          style={{
            left: pointerPos.x - 20,
            top: pointerPos.y - 20,
            boxShadow: '0 0 12px 2px hsl(var(--accent) / 0.35)',
          }}
        />
      )}

      {/* Form dialog for the picked action */}
      <Dialog open={action !== null} onOpenChange={v => { if (!v) setAction(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              {(action && getShortcut(action)?.title) ?? 'Quick add'}
            </DialogTitle>
            <DialogDescription className="sr-only">Quickly log something for today.</DialogDescription>
          </DialogHeader>
          {action === 'payment' ? (
            <QuickPaymentForm onDone={() => setAction(null)} />
          ) : action === 'expense' ? (
            <QuickExpenseForm onDone={() => setAction(null)} />
          ) : action === 'income' ? (
            <QuickIncomeForm onDone={() => setAction(null)} />
          ) : action === 'uber' ? (
            <QuickUberForm onDone={() => setAction(null)} />
          ) : action === 'debt' ? (
            <QuickDebtForm onDone={() => setAction(null)} />
          ) : action === 'transport-paid' ? (
            <QuickTransportPaidForm onDone={() => setAction(null)} />
          ) : action === 'budget-plan' ? (
            <QuickBudgetPlanForm onDone={() => setAction(null)} />
          ) : action === 'budget-item' ? (
            <QuickBudgetItemForm onDone={() => setAction(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Mini-forms ───────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{children}</p>;
}

function QuickPaymentForm({ onDone }: { onDone: () => void }) {
  const { debts, logCustomPayment } = useContext(AppDataContext);
  const [debtId, setDebtId] = useState(debts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const selected = debts.find(d => d.id === debtId);

  const submit = () => {
    const amt = parseFloat(amount);
    if (!debtId) { setError('Pick a debt first.'); return; }
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    logCustomPayment(debtId, amt);
    onDone();
  };

  if (debts.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No debts tracked yet — add one on the Money page first.</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Debt</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {debts.map(d => (
            <button
              key={d.id}
              onClick={() => setDebtId(d.id)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors',
                d.id === debtId ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'
              )}
            >
              {d.title}
            </button>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Amount (R)</FieldLabel>
        <Input
          type="number" inputMode="decimal" value={amount} autoFocus
          onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder={selected ? `Installment: ${formatCurrency(selected.installment_amount)}` : ''}
        />
        {selected && selected.installment_amount > 0 && (
          <button
            onClick={() => setAmount(String(selected.installment_amount))}
            className="mt-1.5 text-[10px] font-semibold text-accent"
          >
            Use installment ({formatCurrency(selected.installment_amount)})
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full" onClick={submit}>Log payment</Button>
    </div>
  );
}

function QuickExpenseForm({ onDone }: { onDone: () => void }) {
  const { addExpense } = useContext(AppDataContext);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState('');

  const submit = () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    addExpense({ title: title.trim(), amount: amt, date: new Date().toISOString(), recurring });
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Title</FieldLabel>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Groceries" autoFocus />
      </div>
      <div>
        <FieldLabel>Amount (R)</FieldLabel>
        <Input
          type="number" inputMode="decimal" value={amount}
          onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
      </div>
      <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2.5">
        <p className="text-xs font-semibold text-foreground">Recurring</p>
        <Switch checked={recurring} onCheckedChange={setRecurring} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full" onClick={submit}>Add expense</Button>
    </div>
  );
}

function QuickIncomeForm({ onDone }: { onDone: () => void }) {
  const { addExtraIncome } = useContext(AppDataContext);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState('');

  const submit = () => {
    if (!label.trim()) { setError('Label is required.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    addExtraIncome(label.trim(), amt, recurring);
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Label</FieldLabel>
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g., Freelance" autoFocus />
      </div>
      <div>
        <FieldLabel>Amount (R)</FieldLabel>
        <Input
          type="number" inputMode="decimal" value={amount}
          onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
      </div>
      <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold text-foreground">Monthly</p>
          <p className="text-[9px] text-muted-foreground">{recurring ? 'Counts every month' : 'This month only'}</p>
        </div>
        <Switch checked={recurring} onCheckedChange={setRecurring} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full" onClick={submit}>Add income</Button>
    </div>
  );
}

function QuickUberForm({ onDone }: { onDone: () => void }) {
  const { addUberRide } = useContext(AppDataContext);
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const amt = parseFloat(price);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive price.'); return; }
    // The Uber calendar keys each day cell by local-midnight → toISOString (UTC-shifted for
    // UTC+ timezones — see the getDayState NOTE in calculations.ts). Derive today's key the
    // same way so the ride lands on TODAY's cell, not tomorrow's. A plain local
    // 'yyyy-MM-dd' here put rides one cell ahead.
    addUberRide({
      date: startOfDay(new Date()).toISOString().split('T')[0],
      price: amt,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Price (R)</FieldLabel>
        <Input
          type="number" inputMode="decimal" value={price} autoFocus
          onChange={e => setPrice(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>From (optional)</FieldLabel>
          <Input value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <FieldLabel>To (optional)</FieldLabel>
          <Input value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Logged for today · {format(new Date(), 'd MMMM')}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full" onClick={submit}>Log ride</Button>
    </div>
  );
}

function QuickDebtForm({ onDone }: { onDone: () => void }) {
  const { addDebt } = useContext(AppDataContext);
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [installment, setInstallment] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    const totalNum = parseFloat(total);
    const instNum = parseFloat(installment);
    if (isNaN(totalNum) || totalNum <= 0) { setError('Enter a valid total owed.'); return; }
    if (isNaN(instNum) || instNum <= 0) { setError('Enter a valid installment.'); return; }
    addDebt({ title: title.trim(), total_owed: totalNum, installment_amount: instNum, dueDay: null });
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Title / Person</FieldLabel>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., John, Car Loan" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Total owed (R)</FieldLabel>
          <Input type="number" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="5000" />
        </div>
        <div>
          <FieldLabel>Installment (R)</FieldLabel>
          <Input
            type="number" inputMode="decimal" value={installment}
            onChange={e => setInstallment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="500"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Due-day reminders can be set later from the debt&apos;s edit dialog.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full" onClick={submit}>Add debt</Button>
    </div>
  );
}

function QuickTransportPaidForm({ onDone }: { onDone: () => void }) {
  const {
    transportSettings, transportOverrides, transportMonthlyOverrides, history, logTransportPayment,
  } = useContext(AppDataContext);

  const now = new Date();
  const monthKey = format(now, 'yyyy-MM');
  const monthStr = format(now, 'MMMM yyyy');
  const alreadyPaid = isTransportPaidForMonth(history, now);
  // Same figure the Transport page charges: calendar total, honouring the per-month
  // flat-fee override when in monthly pricing mode.
  const { totalDue } = calculateTransportMonth(
    now, transportOverrides, transportSettings, now, transportMonthlyOverrides[monthKey],
  );

  const submit = () => {
    logTransportPayment(totalDue, monthStr);
    onDone();
  };

  if (alreadyPaid) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-positive font-semibold">
        <Check className="h-4 w-4" /> {monthStr} is already marked as paid.
      </div>
    );
  }
  if (totalDue <= 0) {
    return <p className="text-xs text-muted-foreground py-2">Nothing due for {monthStr} — set fees or travel days on the Transport page first.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-muted/30 px-3 py-3 flex justify-between items-baseline">
        <span className="text-xs text-muted-foreground">{monthStr}</span>
        <span className="text-lg font-bold tabular-nums">{formatCurrency(totalDue)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Logs a transport payment for this month — same as &ldquo;Mark as Paid&rdquo; on the Transport page. Undo there anytime.</p>
      <Button className="w-full" onClick={submit}>Mark {format(now, 'MMMM')} as paid</Button>
    </div>
  );
}

function QuickBudgetPlanForm({ onDone }: { onDone: () => void }) {
  const { addBudgetPlan } = useContext(AppDataContext);
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    const amt = parseFloat(budget);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid budget amount.'); return; }
    addBudgetPlan(name.trim(), amt);
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Plan name</FieldLabel>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Groceries, PC Build" autoFocus />
      </div>
      <div>
        <FieldLabel>Budget (R)</FieldLabel>
        <Input
          type="number" inputMode="decimal" value={budget}
          onChange={e => setBudget(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="e.g., 2000"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full" onClick={submit}>Create plan</Button>
    </div>
  );
}

function QuickBudgetItemForm({ onDone }: { onDone: () => void }) {
  const { budgetPlans, addBudgetItem } = useContext(AppDataContext);
  const [planId, setPlanId] = useState(budgetPlans[0]?.id ?? '');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!planId) { setError('Pick a plan first.'); return; }
    if (!name.trim()) { setError('Item name is required.'); return; }
    const amt = parseFloat(price);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid price.'); return; }
    addBudgetItem(planId, { name: name.trim(), price: amt });
    onDone();
  };

  if (budgetPlans.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No budget plans yet — create one first (there&apos;s a shortcut for that too).</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Plan</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {budgetPlans.map(p => (
            <button
              key={p.id}
              onClick={() => setPlanId(p.id)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors',
                p.id === planId ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Item name</FieldLabel>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Keyboard" autoFocus />
      </div>
      <div>
        <FieldLabel>Price (R)</FieldLabel>
        <Input
          type="number" inputMode="decimal" value={price}
          onChange={e => setPrice(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full" onClick={submit}>Add item</Button>
    </div>
  );
}
