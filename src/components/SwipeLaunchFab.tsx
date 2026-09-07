'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { hapticImpact, hapticTap, hapticTick } from '@/lib/haptics';
import { acquirePerfFreeze, releasePerfFreeze } from '@/lib/perfFreeze';
import { aimTrailTrackStyle } from '@/components/RadialAimFx';
import { FAB_GESTURE_ATTR, FAB_TOUCH_STYLE } from '@/components/QuickAdd';
import { cn } from '@/lib/utils';

// A corner FAB you can either TAP or THUMB-AND-FLICK — in ANY direction — to launch its
// panel. Built on the quick-add radial's gesture vocabulary (QuickAdd.tsx), deliberately
// similar rather than shared: the radial aims by DIRECTION across a fan of options, so it
// has to decide WHICH one you meant. This has exactly one destination, so direction
// carries no meaning at all — only distance does. Flick it whichever way your thumb
// happens to fall and the light path swings round to follow.
//
// What is copied on purpose is the feel:
//   • a dead zone over the FAB itself, so a tap can never be mistaken for a flick;
//   • an ARMED distance the thumb must reach before releasing does anything;
//   • visuals driven entirely by MotionValues written from a rAF-coalesced pointermove —
//     zero React re-renders per move, which is what keeps the drag smooth on the Android
//     WebView (see the long note in QuickAdd's gesture engine);
//   • the same three haptics: tap on press, tick on arming, impact on launch.
//
// There is deliberately NO target marker at the far end — just the light path itself. A
// second copy of the icon floating above the button read as a duplicate rather than a
// destination, and pinning one to a fixed spot fights the whole point of a gesture that
// works in every direction. The path IS the affordance: it is exactly as long as the
// throw needs to be, so the orb arriving at its tip is the same moment as arming.

// ─────────────── Gesture tuning ───────────────
const DEAD_ZONE = 10;      // px of travel before this counts as a swipe rather than a tap
const ARM_DIST = 74;       // px of travel, in any direction, that ARMS the launch
const RAIL_LEN = ARM_DIST; // the path's length IS the armed distance, so "the orb reached
                           // the end" and "releasing launches" are the same moment
const RAIL_THICKNESS = 48; // = the FAB's diameter (h-12), so the path's long edges are the
                           // FAB circle's tangents and it grows out of the rim with no
                           // seam, whatever angle it is swung to. See aimTrailTrackStyle.
const FLING_V = 0.45;      // px/ms at release that launches from a SHORT swipe, so a quick
                           // flick needn't travel the full ARM_DIST. 450 px/s is still
                           // unambiguously a flick — Android's own MINIMUM_FLING_VELOCITY
                           // is 50 dp/s and a deliberate slow drag measures under 200 px/s.
const FLING_MIN_DIST = 34; // …but it still has to be a swipe. Without a floor here, the
                           // slight twitch at the end of a sloppy TAP clears the velocity
                           // bar and launches something nobody asked for.
const VELOCITY_WINDOW_MS = 120;
const OVERSHOOT = 34;      // px of travel past the path's end that still moves the FAB,
                           // rubber-banded, so a long throw does not drag it forever
const LEAN_RATIO = 0.24;   // how much of the thumb's travel the FAB itself follows. Well
                           // under 1 on purpose: at 1:1 the button walks the whole length
                           // of its own light path and slides off the square base it is
                           // there to hide. A quarter reads as the button being TUGGED.

/**
 * Where a throw came from and which way it went, handed to the panel so it can grow out
 * of that exact point along that exact heading — the window looks flung from under the
 * thumb rather than merely appearing. `x`/`y` are the FAB's RESTING centre in viewport
 * coordinates (the same point the light path grew out of, not the leaning button's
 * momentary position); `dx`/`dy` are the release direction, normalised.
 */
export type ThrowOrigin = { x: number; y: number; dx: number; dy: number };

/** Progressive resistance past the path's end, in px (cf. swipeRubberBand in
 *  pageTransitions, which is normalised to a container width — this one is absolute). */
const rubberBand = (over: number) => OVERSHOOT * (1 - 1 / (over / OVERSHOOT + 1));

/** Eat the one synthetic click the browser emits after a touch we have already acted on.
 *  Capture phase, so it never reaches whatever has just been mounted under the finger;
 *  one-shot, and self-expiring, so it can never sit around eating a later, real click. */
function swallowNextClick() {
  const onClick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); done(); };
  const done = () => {
    window.removeEventListener('click', onClick, true);
    clearTimeout(timer);
  };
  const timer = setTimeout(done, 400);
  window.addEventListener('click', onClick, true);
}

export function SwipeLaunchFab({
  icon,
  ariaLabel,
  onTap,
  onLaunch,
  className,
  style,
  tourId,
}: {
  icon: React.ReactNode;
  ariaLabel: string;
  /** Plain press with no travel — the FAB's ordinary click behaviour. */
  onTap: () => void;
  /** An armed flick, released — launch, with the bouncy entrance thrown from `origin`. */
  onLaunch: (origin: ThrowOrigin) => void;
  className?: string;
  style?: React.CSSProperties;
  /** data-tour anchor for the feature tour, if this FAB is one of its stops. */
  tourId?: string;
}) {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  // gestureOn only MOUNTS the path; nothing about the drag itself is React state.
  const [gestureOn, setGestureOn] = useState(false);
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);

  const leanX = useMotionValue(0);       // FAB's own offset toward the thumb, px
  const leanY = useMotionValue(0);
  const railRotate = useMotionValue(0);  // path's heading — swings to follow the thumb
  const railOpacity = useMotionValue(0); // ramps across the armed band: full == armed
  const orbDist = useMotionValue(0);     // charge orb's distance ALONG the path, px
  // Held for the length of the gesture, exactly as the page carousel and the scroll
  // listener hold one (AppShell): the home page's ambient loops — gauge glows, flowing
  // bars, the calendar water — repaint on the main thread and would otherwise be
  // competing with the orb and the light path for the very frames the flick needs.
  const freezeRef = useRef<symbol | null>(null);

  const resetVisuals = useCallback((snapBack: boolean) => {
    setGestureOn(false);
    setArmed(false);
    armedRef.current = false;
    railOpacity.set(0);
    orbDist.set(0);
    if (snapBack && (leanX.get() !== 0 || leanY.get() !== 0)) {
      animate(leanX, 0, { type: 'spring', stiffness: 620, damping: 30 });
      animate(leanY, 0, { type: 'spring', stiffness: 620, damping: 30 });
    } else {
      leanX.set(0);
      leanY.set(0);
    }
  }, [leanX, leanY, railOpacity, orbDist]);

  // Route change (or the tour) unmounting the FAB mid-drag must not strand it leaning —
  // nor leave the perf-freeze held by a gesture that no longer exists.
  useEffect(() => () => {
    leanX.set(0);
    leanY.set(0);
    if (freezeRef.current) { releasePerfFreeze(freezeRef.current); freezeRef.current = null; }
  }, [leanX, leanY]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    hapticTap(); // the press registered — the launch's own confirm comes later, if it arms
    if (freezeRef.current === null) freezeRef.current = acquirePerfFreeze();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    // Android touchscreens sample well above the refresh rate; do the work once per
    // painted frame and throw the rest away (QuickAdd's aim loop, same reason).
    let queuedX = startX;
    let queuedY = startY;
    let queued = false;
    let raf = 0;
    const samples: { t: number; x: number; y: number }[] = [];

    function cleanup() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      queued = false;
      if (freezeRef.current) { releasePerfFreeze(freezeRef.current); freezeRef.current = null; }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    }

    const apply = (clientX: number, clientY: number) => {
      const dx = clientX - startX;
      const dy = clientY - startY;
      const dist = Math.hypot(dx, dy);

      if (dist < DEAD_ZONE) {
        // Dead zone over the FAB itself — too small a movement to have a heading yet, and
        // swinging the path around on a 3px wobble would just look like a glitch.
        railOpacity.set(0);
        orbDist.set(0);
        leanX.set(dx * LEAN_RATIO);
        leanY.set(dy * LEAN_RATIO);
        if (armedRef.current) { armedRef.current = false; setArmed(false); }
        return;
      }

      moved = true;

      // Screen y grows downward and CSS rotation is clockwise-positive, so the raw screen
      // angle is already the rotation the path needs — no negation, unlike the radial,
      // which works in up-positive maths because its item angles are authored that way.
      railRotate.set((Math.atan2(dy, dx) * 180) / Math.PI);

      const travel = dist <= RAIL_LEN ? dist : RAIL_LEN + rubberBand(dist - RAIL_LEN);
      const k = (travel / dist) * LEAN_RATIO;
      leanX.set(dx * k);
      leanY.set(dy * k);

      orbDist.set(Math.min(dist, RAIL_LEN));
      // Full brightness lands exactly on the armed distance, so the path finishing lighting
      // up IS the "let go now" signal — the job the target marker used to do.
      railOpacity.set(Math.max(0, Math.min(1, (dist - DEAD_ZONE) / (ARM_DIST - DEAD_ZONE))));

      const nowArmed = dist >= ARM_DIST;
      if (nowArmed !== armedRef.current) {
        armedRef.current = nowArmed;
        setArmed(nowArmed);
        if (nowArmed) hapticTick(); // selection-style tick, exactly as the radial locks on
      }
    };

    const flush = () => {
      raf = 0;
      if (!queued) return;
      queued = false;
      apply(queuedX, queuedY);
    };

    const onMove = (ev: PointerEvent) => {
      const now = performance.now();
      samples.push({ t: now, x: ev.clientX, y: ev.clientY });
      while (samples.length > 2 && now - samples[1].t > VELOCITY_WINDOW_MS) samples.shift();
      queuedX = ev.clientX;
      queuedY = ev.clientY;
      queued = true;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const onUp = (ev: PointerEvent) => {
      // A move can still be queued for a frame that will never run; a fast flick-and-
      // release would otherwise be judged on a stale position.
      if (queued) { queued = false; apply(queuedX, queuedY); }
      cleanup();
      // Both outcomes below act on POINTERUP, which lands before the browser synthesises
      // its click. By the time that click is dispatched the panel is already open and its
      // full-screen backdrop is under the cursor — so the click hit the BACKDROP, whose
      // job is to close the panel, and the tap opened and shut it in one motion. (The old
      // plain onClick button was immune: the click itself did the opening, so there was
      // never a second one to go astray.) Swallow exactly one click, then stand down.
      swallowNextClick();

      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);

      // Speed over the trailing window, px/ms. Direction is irrelevant — there is only one
      // destination — so this is the magnitude of the velocity vector, not a signed axis.
      const now = performance.now();
      const speedFrom = (s: { t: number; x: number; y: number }) => {
        const dt = now - s.t;
        return dt > 0 ? Math.hypot(ev.clientX - s.x, ev.clientY - s.y) / dt : 0;
      };
      let v = 0;
      for (const s of samples) {
        // Oldest sample still inside the window (samples run oldest → newest), so the
        // reading spans as much of the flick as is still relevant.
        if (now - s.t > 0 && now - s.t <= VELOCITY_WINDOW_MS) { v = speedFrom(s); break; }
      }
      // Nothing inside the window at all — a slow event pipeline, or a WebView that
      // coalesced the tail of the gesture. Fall back to the newest sample rather than
      // reading a real flick as motionless. This can't manufacture speed out of nothing:
      // a finger that genuinely STOPPED emits no further moves, so its newest sample sits
      // where it stopped and the distance collapses to ~0 on its own.
      if (v === 0 && samples.length > 0) v = speedFrom(samples[samples.length - 1]);

      if (armedRef.current || (dist >= FLING_MIN_DIST && v >= FLING_V)) {
        hapticImpact(); // the payoff — firmer than the arming tick, never rate-limited away
        // Measure the FAB's resting box BEFORE resetVisuals, while the layout is settled,
        // and read the centre off the wrapper rather than the button — the button is still
        // leaning toward the thumb and would bias the origin a few px off the light path.
        const r = rootRef.current?.getBoundingClientRect();
        // A launch always travelled, so dist > 0 here; the guard is only so a degenerate
        // reading can't divide by zero and hand the panel a NaN heading.
        const n = dist || 1;
        resetVisuals(false);
        onLaunch({
          x: r ? r.left + r.width / 2 : ev.clientX,
          y: r ? r.top + r.height / 2 : ev.clientY,
          dx: (ev.clientX - startX) / n,
          dy: (ev.clientY - startY) / n,
        });
        return;
      }
      resetVisuals(true);
      // No travel at all → this was a tap. Run it on release rather than from onClick so
      // the FAB answers the finger immediately, with no synthetic-click delay.
      if (!moved) onTap();
    };

    const onCancel = () => { cleanup(); resetVisuals(true); };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    setGestureOn(true);
  }, [leanX, leanY, railRotate, orbDist, railOpacity, resetVisuals, onLaunch, onTap]);

  return (
    <div ref={rootRef} data-tour={tourId} className={cn('fixed z-[60] h-12 w-12', className)} style={style}>
      {/* Light path — swings out of the FAB toward wherever the thumb went. Rendered
          BEFORE the button, so its square base is hidden under the opaque circle exactly
          as the radial's trail hides under its ✕. */}
      {gestureOn && !reduce && (
        <div className="absolute left-1/2 top-1/2 h-0 w-0 pointer-events-none z-0">
          <motion.div
            className="absolute"
            style={{
              top: 0,
              rotate: railRotate,
              transformOrigin: '0 50%',
              opacity: railOpacity,
              ...aimTrailTrackStyle(RAIL_LEN, RAIL_THICKNESS, 12),
              filter: 'drop-shadow(0 0 10px hsl(var(--primary) / 0.18))',
            }}
          >
            {/* Charge orb riding the path at the thumb's distance — a per-move MotionValue
                write, so it stays glued to the finger while the pulse loops on top. The
                path's own x axis always points at the thumb, so the orb travels on x no
                matter which way the swipe went. */}
            <motion.span
              className="absolute rounded-full"
              animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                x: orbDist,
                left: -15,
                top: '50%',
                width: 30,
                height: 30,
                marginTop: -15,
                background: 'radial-gradient(circle, hsl(var(--accent) / 0.8), hsl(var(--accent) / 0.25) 55%, hsl(var(--accent) / 0) 75%)',
                filter: 'drop-shadow(0 0 8px hsl(var(--accent) / 0.6))',
              }}
            />
          </motion.div>
        </div>
      )}

      {/* The FAB itself. It leans toward the thumb, so the swipe feels like picking the
          panel up rather than scrubbing an invisible slider, and it carries the ARMED
          state on its own rim — with no marker at the far end, the button is the only
          thing left that can say "let go now" in vision as well as haptics. */}
      <motion.button
        {...{ [FAB_GESTURE_ATTR]: '' }}
        type="button"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        // Release has already decided tap vs. launch; swallow the synthetic click that
        // follows a travelled gesture so an abandoned swipe can't also open the panel.
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        // Pointer events never fire for keyboard activation, so keyboard users get the
        // plain tap behaviour here.
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 bg-card text-foreground shadow-lg transition-colors',
          armed ? 'border-accent' : 'border-accent/30'
        )}
        style={{
          x: leanX,
          y: leanY,
          ...(armed ? { boxShadow: '0 0 18px 4px hsl(var(--accent) / 0.45)' } : null),
          ...FAB_TOUCH_STYLE,
        }}
      >
        {/* Armed tint as its OWN layer, never as a bg-* class alongside bg-card: cn() is
            twMerge, so a conditional `bg-accent/15` in the same call REPLACES bg-card and
            the button stops being opaque — it would then show its own light path through
            itself. Same fix, same reason, as the aimed item in QuickAdd. */}
        {armed && <span className="absolute inset-0 -z-[1] rounded-full bg-accent/15 pointer-events-none" />}
        <span className="relative flex items-center justify-center">{icon}</span>
      </motion.button>
    </div>
  );
}
