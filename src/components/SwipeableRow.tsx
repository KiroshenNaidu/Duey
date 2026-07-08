'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// Swipe-to-reveal action tray for list cards (expenses, debts, Uber rides), tuned to
// feel like the platform list swipes (iOS Mail / Gmail):
// - releases use a VELOCITY-PROJECTED target (position + ~60ms of momentum), and the
//   snap spring is seeded with the release velocity so motion never restarts,
// - dragging past ~55% of the row ARMS a full swipe: the outermost action expands to
//   fill the tray with a haptic tick, and releasing fires it directly,
// - only ONE row is open app-wide — starting a drag on another row (or touching
//   anywhere outside the open one) closes it, like every native list.
//
// Interplay with the rest of the app:
// - The root carries data-swipe-row, which AppShell's isInHorizontalScroller checks so
//   a card swipe never doubles as a page swipe.
// - framer's drag="x" plus touchAction pan-y keeps vertical scrolling alive on touch
//   devices (web and the Android WebView) and also makes rows mouse-draggable on web.
// - The tray is revealed by GROWING a clipped container (width = drag distance) rather
//   than sitting behind the card — translucent glass-style cards never leak the tray.
// - Honours AppState.swipeActionsEnabled (Theme → Style → Gestures); when off, rows
//   render exactly as before.

export interface SwipeAction {
  icon: LucideIcon;
  label: string;
  onAction: () => void;
  /** Colour treatment of the tray button. */
  tone?: 'default' | 'destructive' | 'accent';
}

const ACTION_W = 64;              // px per tray button
const SNAP_SPRING = { type: 'spring', stiffness: 550, damping: 38 } as const;
const PROJECTION_S = 0.06;        // momentum lookahead (s) for the snap decision
const FULL_SWIPE_FRACTION = 0.55; // drag past this fraction of the row arms full swipe

const toneClasses: Record<NonNullable<SwipeAction['tone']>, string> = {
  default: 'bg-muted text-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  accent: 'bg-accent text-btn-on-accent',
};

// Single-open registry: the currently open row's close function. Module-level on
// purpose — rows in different lists must still close each other.
let closeActiveRow: (() => void) | null = null;

export function SwipeableRow({ children, rightActions = [], leftActions = [], className }: {
  children: React.ReactNode;
  /** Revealed by swiping LEFT; rendered left→right, the LAST one is outermost and is
   *  what an armed full swipe fires. */
  rightActions?: SwipeAction[];
  /** Revealed by swiping RIGHT; the FIRST one is outermost / full-swipe target. */
  leftActions?: SwipeAction[];
  className?: string;
}) {
  const { swipeActionsEnabled } = useContext(AppDataContext);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const rowWRef = useRef(320);
  const armedRef = useRef<'right' | 'left' | null>(null);
  const [armed, setArmed] = useState<'right' | 'left' | null>(null);
  const [open, setOpen] = useState(false);

  const x = useMotionValue(0);
  // Clipped reveal containers — width tracks the drag so nothing shows at rest.
  const rightW = useTransform(x, v => Math.max(0, -v));
  const leftW = useTransform(x, v => Math.max(0, v));

  const rightOpenW = rightActions.length * ACTION_W;
  const leftOpenW = leftActions.length * ACTION_W;

  // Stable identity for the registry across renders; the impl ref always sees fresh state.
  const closeImplRef = useRef<() => void>(() => {});
  const selfCloseRef = useRef(() => closeImplRef.current());
  const selfClose = selfCloseRef.current;

  const snapTo = (target: number, velocity = 0) => {
    setOpen(target !== 0);
    if (target !== 0) {
      if (closeActiveRow && closeActiveRow !== selfClose) closeActiveRow();
      closeActiveRow = selfClose;
    } else if (closeActiveRow === selfClose) {
      closeActiveRow = null;
    }
    animate(x, target, { ...SNAP_SPRING, velocity });
  };
  closeImplRef.current = () => { if (x.get() !== 0) snapTo(0); };

  const fire = (action: SwipeAction) => {
    snapTo(0);
    action.onAction();
  };

  // Touching anywhere outside an open row closes it (standard list behavior).
  useEffect(() => {
    if (!open) return;
    const close = selfCloseRef.current;
    const onDown = (e: Event) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Unmount: release the registry slot if this row holds it.
  useEffect(() => {
    const close = selfCloseRef.current;
    return () => { if (closeActiveRow === close) closeActiveRow = null; };
  }, []);

  if (!swipeActionsEnabled || (rightActions.length === 0 && leftActions.length === 0)) {
    return <>{children}</>;
  }

  const onDragStart = () => {
    draggingRef.current = true;
    rowWRef.current = rootRef.current?.getBoundingClientRect().width ?? 320;
    // Grabbing any row closes whichever other row is open.
    if (closeActiveRow && closeActiveRow !== selfClose) closeActiveRow();
    x.stop();
  };

  const onDrag = () => {
    // Arm/disarm the full swipe live, with a haptic tick on each transition — the
    // expanding primary button is the "release to fire" affordance.
    const cur = x.get();
    const w = rowWRef.current;
    let a: 'right' | 'left' | null = null;
    if (rightActions.length && cur < -Math.max(w * FULL_SWIPE_FRACTION, rightOpenW + 24)) a = 'right';
    else if (leftActions.length && cur > Math.max(w * FULL_SWIPE_FRACTION, leftOpenW + 24)) a = 'left';
    if (a !== armedRef.current) {
      armedRef.current = a;
      setArmed(a);
      hapticTick();
    }
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // Let the post-drag click (which lands on whatever is under the pointer) be
    // swallowed by the capture handler below before clearing the flag.
    setTimeout(() => { draggingRef.current = false; }, 0);

    if (armedRef.current) {
      const side = armedRef.current;
      armedRef.current = null;
      setArmed(null);
      fire(side === 'right' ? rightActions[rightActions.length - 1] : leftActions[0]);
      return;
    }

    // Velocity-projected snap: where would ~60ms of momentum leave the row?
    const cur = x.get();
    const vx = info.velocity.x; // px/s
    const projected = cur + vx * PROJECTION_S;

    let target = 0;
    if (cur < -8 && rightActions.length && projected < -rightOpenW * 0.5) target = -rightOpenW;
    else if (cur > 8 && leftActions.length && projected > leftOpenW * 0.5) target = leftOpenW;

    if (target !== 0) hapticTick();
    snapTo(target, vx);
  };

  const renderTray = (actions: SwipeAction[], side: 'right' | 'left') => {
    if (actions.length === 0) return null;
    const primaryIdx = side === 'right' ? actions.length - 1 : 0;
    return (
      <motion.div
        className={cn(
          'absolute inset-y-0 flex overflow-hidden rounded-lg',
          side === 'right' ? 'right-0 justify-end' : 'left-0 justify-start',
        )}
        style={{ width: side === 'right' ? rightW : leftW }}
      >
        {actions.map((a, i) => {
          const isPrimary = i === primaryIdx;
          const collapsed = armed === side && !isPrimary;
          return isPrimary ? (
            // Primary (outermost): flex-1 absorbs overshoot AND fills the whole tray
            // when the siblings collapse in the armed state.
            <button
              key={a.label}
              aria-label={a.label}
              onClick={() => fire(a)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 shrink-0 flex-1',
                toneClasses[a.tone ?? 'default'],
              )}
              style={{ minWidth: ACTION_W }}
            >
              <a.icon className="h-4 w-4" />
              <span className="text-[9px] font-bold uppercase tracking-wide">{a.label}</span>
            </button>
          ) : (
            <motion.button
              key={a.label}
              aria-label={a.label}
              onClick={() => fire(a)}
              initial={false}
              animate={{ width: collapsed ? 0 : ACTION_W, opacity: collapsed ? 0 : 1 }}
              transition={SNAP_SPRING}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 shrink-0 overflow-hidden',
                toneClasses[a.tone ?? 'default'],
              )}
            >
              <a.icon className="h-4 w-4" />
              <span className="text-[9px] font-bold uppercase tracking-wide">{a.label}</span>
            </motion.button>
          );
        })}
      </motion.div>
    );
  };

  return (
    <div ref={rootRef} data-swipe-row className={cn('relative rounded-lg', className)}>
      {renderTray(rightActions, 'right')}
      {renderTray(leftActions, 'left')}

      {/* The card itself. Constraints pin the no-action side(s) at 0 (dragElastic gives
          them a rubber feel); the action side is free — the arm/snap logic owns the rest. */}
      <motion.div
        drag="x"
        dragConstraints={{
          left: rightActions.length ? -9999 : 0,
          right: leftActions.length ? 9999 : 0,
        }}
        dragElastic={0.15}
        dragMomentum={false}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onClickCapture={e => {
          // Swallow the click that follows a drag release, and turn a plain tap on an
          // OPEN row into "close" instead of activating whatever was tapped.
          if (draggingRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (Math.abs(x.get()) > 4) {
            e.preventDefault();
            e.stopPropagation();
            snapTo(0);
          }
        }}
        style={{ x, touchAction: 'pan-y' }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  );
}
