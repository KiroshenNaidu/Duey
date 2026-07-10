'use client';

import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { animate, motionValue, useReducedMotion, type MotionValue } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import {
  getPageTransition, type PageTransitionPreset,
  SWIPE_SETTLE_SPRING, SWIPE_PROJECTION_MS, SWIPE_COMMIT_FRACTION,
  SWIPE_VELOCITY_WINDOW_MS, SWIPE_MIN_COMMIT_PX, SWIPE_FLING_VELOCITY,
  swipeRubberBand,
} from '@/lib/pageTransitions';

// Finger-tracked tab carousel — the SAME direct-manipulation pager the AppShell page
// carousel uses (shared SWIPE_* tuning and the user's selected page-transition preset),
// applied to in-page tab sets: History's All/Debts/… tabs and the Theme menu's sub-tabs.
// Panels track the finger 1:1 (styles written synchronously from the touch handler, no
// rAF hop), rubber-band at the ends, and commit with velocity projection.

// A panel renders only while some part of it can be on screen (|idx − progress| < 1).
const VISIBLE_RANGE = 0.999;

function isInHorizontalScroller(el: EventTarget | null): boolean {
  let node = el as Element | null;
  while (node && node !== document.body) {
    const role = node.getAttribute('role');
    if (role === 'slider') return true; // Radix Slider thumb
    // Swipeable list cards (SwipeableRow) own their horizontal gesture.
    if (node.hasAttribute('data-swipe-row')) return true;
    // Explicitly marked horizontal scroll regions.
    if (node.getAttribute('data-h-scroll') === 'true') return true;
    // Radix Slider root carries data-orientation="horizontal" AND contains a slider thumb.
    // Match only that — NOT Radix Tabs root (also horizontal but no slider descendant).
    if (node.getAttribute('data-orientation') === 'horizontal' && node.querySelector('[role="slider"]')) return true;
    const style = window.getComputedStyle(node);
    const ox = style.overflowX;
    if ((ox === 'scroll' || ox === 'auto') && node.scrollWidth > node.clientWidth) return true;
    node = node.parentElement;
  }
  return false;
}

function isInDialog(el: EventTarget | null): boolean {
  let node = el as Element | null;
  while (node && node !== document.body) {
    if (node.getAttribute('role') === 'dialog') return true;
    node = node.parentElement;
  }
  return false;
}

function frameStyles(preset: PageTransitionPreset, index: number, p: number) {
  const f = preset.frame(index - p);
  const perspective = preset.threeD ? 'perspective(1100px) ' : '';
  return {
    transform: `${perspective}translateX(${f.x}) scale(${f.scale}) rotateY(${f.rotateY}deg)`,
    opacity: f.opacity,
    visibility: (Math.abs(index - p) < VISIBLE_RANGE ? 'visible' : 'hidden') as 'visible' | 'hidden',
  };
}

export function SwipeTabView<T extends string>({
  tabs,
  active,
  onChange,
  renderTab,
  enabled = true,
  edgeZone = 0,
  className,
}: {
  /** Ordered tab ids — panel order along the swipe axis. */
  tabs: readonly T[];
  /** Controlled active tab id. */
  active: T;
  /** Called when a swipe commits to a neighbouring tab (tab-strip taps stay external). */
  onChange: (tab: T) => void;
  renderTab: (tab: T) => React.ReactNode;
  /** Gate the document-level listeners (e.g. only while this view's route is showing). */
  enabled?: boolean;
  /** Width (px) of screen-edge bands where a swipe ALWAYS changes tabs, bypassing the
   *  slider/scroller guard — keeps slider-heavy tabs swipeable from the gutters. */
  edgeZone?: number;
  className?: string;
}) {
  const { pageTransitionId } = useContext(AppDataContext);
  const reduceMotion = useReducedMotion();
  // Under reduced motion the panels still track the finger (direct manipulation, not an
  // animation), but the transition style stays a plain flat slide.
  const preset = getPageTransition(reduceMotion ? 'slide' : pageTransitionId);

  const activeIdx = Math.max(0, tabs.indexOf(active));
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Local carousel position (activeIdx + drag fraction) — same contract as the global
  // pageProgress, but scoped to this tab set.
  const progress = useMemo(() => motionValue(activeIdx), []); // eslint-disable-line react-hooks/exhaustive-deps

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pin the container to the tallest panel while panels are in motion, so a taller
  // incoming panel is never clipped by the container's overflow:hidden mid-drag
  // (the active panel alone defines the height at rest).
  const lockHeight = () => {
    const c = containerRef.current;
    if (!c) return;
    let max = 0;
    for (const child of Array.from(c.children)) {
      max = Math.max(max, (child as HTMLElement).offsetHeight);
    }
    if (max > 0) c.style.minHeight = `${max}px`;
  };
  const releaseHeight = () => {
    const c = containerRef.current;
    if (c) c.style.minHeight = '';
  };

  // Settle toward the active tab on external changes (tab-strip taps). A committed
  // swipe starts its settle BEFORE calling onChange; pendingSettleRef stops this effect
  // from restarting the spring (which would drop the finger's momentum).
  const syncedRef = useRef(false);
  const pendingSettleRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!syncedRef.current) {
      syncedRef.current = true;
      progress.jump(activeIdx);
      return;
    }
    if (pendingSettleRef.current === activeIdx) {
      pendingSettleRef.current = null;
      return;
    }
    if (progress.get() !== activeIdx) {
      lockHeight();
      animate(progress, activeIdx, { ...SWIPE_SETTLE_SPRING, onComplete: releaseHeight });
    }
  }, [activeIdx, progress]);

  // Ref-mirror the commit callback so the gesture effect never re-binds mid-drag.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    const start = { x: 0, y: 0, progress: 0, fromIdx: 0, width: 1, edge: false };
    const samples: { t: number; x: number }[] = [];
    let tracking: 'none' | 'h' | 'v' = 'none';

    const onStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      start.x = x;
      start.y = e.touches[0].clientY;
      // Touches inside a modal dialog must never drive the tab carousel.
      tracking = isInDialog(e.target) ? 'v' : 'none';
      start.edge = edgeZone > 0 && (x <= edgeZone || x >= window.innerWidth - edgeZone);
    };

    const onMove = (e: TouchEvent) => {
      if (tracking === 'v') return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (tracking === 'none') {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          tracking = 'v';
          return;
        }
        // Edge swipes always change tabs; interior swipes yield to sliders/scrollers.
        if (!start.edge && isInHorizontalScroller(e.target)) {
          tracking = 'v';
          return;
        }
        tracking = 'h';
        progress.stop(); // take over from any running commit/cancel animation
        start.progress = progress.get();
        start.fromIdx = activeIdxRef.current;
        start.width = containerRef.current?.clientWidth || window.innerWidth;
        samples.length = 0;
        lockHeight();
      }

      samples.push({ t: Date.now(), x: e.touches[0].clientX });
      if (samples.length > 8) samples.shift();

      // Finger-following: progress = the position the finger implies right now,
      // rubber-banded past the first/last tab so the edges resist progressively.
      let target = start.progress - dx / start.width;
      const last = tabsRef.current.length - 1;
      if (target < 0) target = -swipeRubberBand(-target);
      else if (target > last) target = last + swipeRubberBand(target - last);
      progress.set(target);
    };

    const onEnd = (e: TouchEvent) => {
      if (tracking !== 'h') return;
      tracking = 'none';

      const endX = e.changedTouches[0].clientX;
      const endT = Date.now();

      // Instantaneous velocity: earliest sample inside the trailing window. Holding
      // still before release leaves no fresh samples → 0 → the fling dies.
      let vx = 0; // px/ms
      for (const s of samples) {
        const dt = endT - s.t;
        if (dt <= SWIPE_VELOCITY_WINDOW_MS) {
          if (dt > 0) vx = (endX - s.x) / dt;
          break;
        }
      }

      const dx = endX - start.x;
      const currIdx = start.fromIdx;
      const projected = start.progress - dx / start.width + (-vx / start.width) * SWIPE_PROJECTION_MS;
      let nextIdx = currIdx;
      if (Math.abs(dx) >= SWIPE_MIN_COMMIT_PX) {
        if (projected > currIdx + SWIPE_COMMIT_FRACTION || (vx < -SWIPE_FLING_VELOCITY && dx < 0)) nextIdx = currIdx + 1;
        else if (projected < currIdx - SWIPE_COMMIT_FRACTION || (vx > SWIPE_FLING_VELOCITY && dx > 0)) nextIdx = currIdx - 1;
      }
      nextIdx = Math.max(0, Math.min(tabsRef.current.length - 1, nextIdx));

      const progressVelocity = (-vx / start.width) * 1000;

      if (nextIdx === currIdx) {
        animate(progress, currIdx, { ...SWIPE_SETTLE_SPRING, velocity: progressVelocity, onComplete: releaseHeight });
        return;
      }

      // Reset scroll before the new tab is revealed, then settle and commit.
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      pendingSettleRef.current = nextIdx;
      animate(progress, nextIdx, { ...SWIPE_SETTLE_SPRING, velocity: progressVelocity, onComplete: releaseHeight });
      onChangeRef.current(tabsRef.current[nextIdx]);
    };

    const onCancel = () => {
      if (tracking !== 'h') return;
      tracking = 'none';
      animate(progress, activeIdxRef.current, { ...SWIPE_SETTLE_SPRING, onComplete: releaseHeight });
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, edgeZone, progress]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {tabs.map((tab, i) => (
        <TabPanel key={tab} index={i} active={i === activeIdx} preset={preset} progress={progress}>
          {renderTab(tab)}
        </TabPanel>
      ))}
    </div>
  );
}

/** One always-mounted tab panel. Styles are written straight to el.style from the
 *  progress subscription — no React re-render and no rAF hop, so panels stick to the
 *  finger (see CarouselPage in AppShell for the full rationale). */
function TabPanel({ index, active, preset, progress, children }: {
  index: number;
  active: boolean;
  preset: PageTransitionPreset;
  progress: MotionValue<number>;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;

  useLayoutEffect(() => {
    const apply = (p: number) => {
      const el = ref.current;
      if (!el) return;
      const s = frameStyles(presetRef.current, index, p);
      el.style.transform = s.transform;
      el.style.opacity = String(s.opacity);
      el.style.visibility = s.visibility;
    };
    apply(progress.get()); // re-style immediately when the preset changes
    return progress.on('change', apply);
  }, [index, preset, progress]);

  return (
    <div
      ref={ref}
      style={{
        ...frameStyles(preset, index, progress.get()),
        willChange: 'transform',
        position: active ? 'relative' : 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        zIndex: index,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
}
