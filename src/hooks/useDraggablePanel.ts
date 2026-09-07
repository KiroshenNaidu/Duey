'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionValue, type MotionValue } from 'framer-motion';
import { acquirePerfFreeze, releasePerfFreeze } from '@/lib/perfFreeze';

/**
 * The drag engine behind the floating Calculator and Quick Notepad — the same gesture
 * vocabulary the rest of the app already uses (QuickAdd's aim loop, SwipeLaunchFab), and
 * for the same reasons.
 *
 * Both panels used to drag by writing `setPosition` from every mousemove/touchmove and
 * rendering `left`/`top` off that state. Three costs stacked up on the Android WebView and
 * the result was a card that lagged visibly behind the thumb:
 *
 *   1. Touchscreens sample well above the display's refresh rate, so React re-rendered the
 *      whole panel several times per PAINTED frame and every render but the last was
 *      thrown away. Moves are coalesced into one rAF here, so exactly one position is
 *      computed per frame that is actually shown.
 *   2. `left`/`top` are layout properties: each write re-ran layout for the panel and its
 *      whole subtree (the calculator's 20-button grid). x/y MotionValues write a
 *      `transform` straight to the DOM node — no React render, no layout, no style recalc
 *      of the children.
 *   3. The calculator re-read `offsetWidth`/`offsetHeight` inside the move handler to
 *      clamp, forcing a synchronous layout flush per event. The panel cannot resize
 *      mid-drag, so its box is measured ONCE at pointerdown and reused.
 *
 * The fourth cost was not in JS at all: `.aurora-dialog`'s conic ring animates a paint
 * property, so it repainted the entire panel background every frame underneath the drag.
 * It is paused for the duration of the gesture via the shared perf-freeze token (see
 * lib/perfFreeze.ts and the `body.perf-freeze .aurora-dialog` rule in globals.css) — an
 * 18s rotation is imperceptible across a drag, and its frames are exactly the ones the
 * gesture needs.
 *
 * Position is kept as a fixed `origin` (measured once, on open) plus a transform offset
 * the drag accumulates. Nothing commits that offset back into React state at the end of
 * the gesture: a state update and a MotionValue reset cannot land in the same paint, so
 * committing would flash the panel back to its old spot for one frame.
 */

const MARGIN = 8; // px of screen the panel is never allowed to leave

/** Keep the whole panel on screen. On a small phone — or a normal one with Android's
 *  display size turned up, which shrinks the CSS viewport — an unclamped drag could park
 *  a panel half off the edge with no way to fetch it back. If the panel is genuinely
 *  larger than the viewport the clamp degrades to pinning its top-left corner. */
function clampToScreen(x: number, y: number, w: number, h: number) {
  const maxX = window.innerWidth - w - MARGIN;
  const maxY = window.innerHeight - h - MARGIN;
  return {
    x: Math.round(Math.min(Math.max(x, MARGIN), Math.max(MARGIN, maxX))),
    y: Math.round(Math.min(Math.max(y, MARGIN), Math.max(MARGIN, maxY))),
  };
}

export interface DraggablePanel {
  /** Attach to the panel's outer (positioner) element. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Resting top-left in viewport px, measured once the panel has a box. */
  origin: { x: number; y: number };
  /** False until `origin` has been measured — hold the panel invisible until then so it
   *  never flashes at 0,0. */
  placed: boolean;
  /** Live drag offset from `origin`, in px. Feed straight into the positioner's style. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Spread onto the drag handle (the panel's header). */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
}

/**
 * Places a floating panel under the top nav, centred, and makes it draggable by a handle.
 * @param topGap px between the bottom of the fixed top nav and the panel's top edge.
 */
export function useDraggablePanel(topGap = 12): DraggablePanel {
  const ref = useRef<HTMLDivElement | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);
  const originRef = useRef({ x: 0, y: 0 });
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Tears down an in-flight drag if the panel unmounts mid-gesture (a route change, the
  // backdrop closing it) — otherwise its window listeners and perf-freeze token outlive it.
  const endDragRef = useRef<(() => void) | null>(null);

  // Open near the TOP of the screen (just under the fixed top nav) so the panel is within
  // easy thumb reach instead of buried at the bottom or dead-centre. navBottom is measured
  // live, so the notch / safe area is accounted for on every device.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const navBottom = document.querySelector('nav')?.getBoundingClientRect().bottom ?? 56;
    const p = clampToScreen(
      (window.innerWidth - el.offsetWidth) / 2,
      navBottom + topGap,
      el.offsetWidth,
      el.offsetHeight,
    );
    originRef.current = p;
    setOrigin(p);
    setPlaced(true);
  }, [topGap]);

  // A rotation, or the keyboard opening, can shrink the viewport out from under a panel
  // that was legally placed a moment ago — re-clamp rather than strand it off screen.
  useEffect(() => {
    const onResize = () => {
      const el = ref.current;
      if (!el) return;
      const o = originRef.current;
      const c = clampToScreen(o.x + x.get(), o.y + y.get(), el.offsetWidth, el.offsetHeight);
      x.set(c.x - o.x);
      y.set(c.y - o.y);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [x, y]);

  useEffect(() => () => endDragRef.current?.(), []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // The header carries the close/clear buttons — pressing one is not a drag.
    if ((e.target as HTMLElement).closest('button')) return;
    const el = ref.current;
    if (!el) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const baseX = x.get();
    const baseY = y.get();
    const o = originRef.current;
    // Measured once: the panel cannot resize mid-drag, and reading it per move would force
    // a synchronous layout flush on every one.
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const freeze = acquirePerfFreeze();

    let queuedX = startX;
    let queuedY = startY;
    let queued = false;
    let raf = 0;

    const apply = (clientX: number, clientY: number) => {
      const c = clampToScreen(
        o.x + baseX + (clientX - startX),
        o.y + baseY + (clientY - startY),
        w, h,
      );
      x.set(c.x - o.x);
      y.set(c.y - o.y);
    };

    const flush = () => {
      raf = 0;
      if (!queued) return;
      queued = false;
      apply(queuedX, queuedY);
    };

    const onMove = (ev: PointerEvent) => {
      queuedX = ev.clientX;
      queuedY = ev.clientY;
      queued = true;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const end = () => {
      // A move can still be queued for a frame that will never run; land it so the panel
      // finishes exactly where the thumb left it rather than a frame behind.
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (queued) { queued = false; apply(queuedX, queuedY); }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      releasePerfFreeze(freeze);
      endDragRef.current = null;
    };

    endDragRef.current = end;
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, [x, y]);

  return {
    ref,
    origin,
    placed,
    x,
    y,
    // touch-action lives on the HANDLE, not the whole panel: with it on the panel (as it
    // used to be) the notepad's textarea could not be scrolled by touch at all.
    handleProps: { onPointerDown, style: { touchAction: 'none' } },
  };
}
