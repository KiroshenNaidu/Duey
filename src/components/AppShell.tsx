'use client';

import { memo, useContext, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { FolderAccess } from '@/lib/folderAccess';
import { usePathname, useRouter } from 'next/navigation';
import { animate, useReducedMotion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { warmBackgroundChunks } from '@/lib/prefetch';
import { acquirePerfFreeze, releasePerfFreeze } from '@/lib/perfFreeze';
import {
  pageProgress, getPageTransition, type PageTransitionPreset,
  SWIPE_SETTLE_SPRING as SETTLE_SPRING,
  SWIPE_PROJECTION_MS as PROJECTION_MS,
  SWIPE_COMMIT_FRACTION as COMMIT_FRACTION,
  SWIPE_VELOCITY_WINDOW_MS as VELOCITY_WINDOW_MS,
  SWIPE_MIN_COMMIT_PX as MIN_COMMIT_PX,
  SWIPE_FLING_VELOCITY as FLING_VELOCITY,
  swipeRubberBand as rubberBand,
} from '@/lib/pageTransitions';
import { MoneyPage } from '@/components/pages/MoneyPage';
import { TransportPage } from '@/components/pages/TransportPage';
import { StatsPage } from '@/components/pages/StatsPage';
import { SettingsPage } from '@/components/pages/SettingsPage';

// Elements are built ONCE at module scope so their identity never changes: a re-render
// of AppShell (route commit, context update) then reuses each page's subtree untouched
// instead of re-rendering all four heavy trees — the route commit used to do exactly
// that in the middle of the settle spring, visibly starving the animation of frames.
const PAGES = [
  { href: '/transport', element: <TransportPage /> },
  { href: '/',          element: <MoneyPage /> },
  { href: '/stats',     element: <StatsPage /> },
  { href: '/settings',  element: <SettingsPage /> },
] as const;

const ROUTE_ORDER: Record<string, number> = {
  '/transport': 0,
  '/':          1,
  '/stats':     2,
  '/settings':  3,
};

const ROUTES = ['/transport', '/', '/stats', '/settings'];
const MAIN_ROUTES = new Set(ROUTES);

// Swipe feel tuning lives in lib/pageTransitions.ts (SWIPE_* constants) — shared with
// SwipeTabView so the History/Theme sub-tab carousels feel identical to the pages.

// A page renders only while some part of it can be on screen (|idx − progress| < 1).
const VISIBLE_RANGE = 0.999;

function isInHorizontalScroller(el: EventTarget | null): boolean {
  let node = el as Element | null;
  while (node && node !== document.body) {
    const role = node.getAttribute('role');
    if (role === 'slider') return true; // Radix Slider thumb
    // Swipeable list cards (SwipeableRow) own their horizontal gesture.
    if (node.hasAttribute('data-swipe-row')) return true;
    // Radix Slider root carries data-orientation="horizontal" AND contains a slider thumb.
    // Match only that — NOT Radix Tabs root, which also has data-orientation="horizontal"
    // but no slider descendant (otherwise page-swipe is blocked over tab strips).
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

// Elements that own their whole touch gesture — the quick-add + FABs (see FAB_GESTURE_ATTR
// in QuickAdd). Checked at touchSTART because the FAB's gesture only *becomes* an overlay
// after its long-press fires: by then the finger has usually drifted past the 4px slop and
// the carousel has already locked itself in as a horizontal drag, so isOverlayOpen() below
// never gets a chance to stop it.
function ownsGesture(el: EventTarget | null): boolean {
  return el instanceof Element && !!el.closest('[data-fab-gesture]');
}

// True while ANY app-covering overlay is open (dialog, quick-add radial, calculator,
// notepad) — they all hold an overlay-blur token, which toggles this single body class.
// The page carousel must never swipe behind such an overlay: dragging to aim the radial
// was also driving the pages (the "background moves + drag feels laggy" bug). Reading the
// live class means no cross-component state to coordinate and nothing to reset — when the
// overlay releases its blur token, swipes are free again automatically.
function isOverlayOpen(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('overlay-blur');
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { navGuard, pageSwipeLocked, pageTransitionId } = useContext(AppDataContext);
  const reduceMotion = useReducedMotion();

  const pathnameRef = useRef(pathname);
  const navGuardRef = useRef(navGuard);
  const pageSwipeLockedRef = useRef(pageSwipeLocked);
  pathnameRef.current = pathname;
  navGuardRef.current = navGuard;
  pageSwipeLockedRef.current = pageSwipeLocked;

  const isMainRoute = MAIN_ROUTES.has(pathname);
  // On non-main routes (History), keep the LAST main index instead of falling back to
  // Money — otherwise the carousel (and nav pill) would animate to Money behind
  // History's back and slide visibly on return.
  const idxFromPath: number | undefined = ROUTE_ORDER[pathname];
  const lastMainIdxRef = useRef(idxFromPath ?? 1);
  if (idxFromPath !== undefined) lastMainIdxRef.current = idxFromPath;
  const activeIdx = idxFromPath ?? lastMainIdxRef.current;

  // Under reduced motion the pages still track the finger (direct manipulation, not an
  // animation), but the transition style stays a plain flat slide.
  const preset = getPageTransition(reduceMotion ? 'slide' : pageTransitionId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Held for the whole swipe+settle window so the ambient decorative loops pause and
  // don't fight the finger-tracked pager for the main thread (see perfFreeze.ts).
  const swipeFreezeRef = useRef<symbol | null>(null);

  // ── Container height lock ──
  // The carousel container's height comes from the ACTIVE page (position: relative);
  // neighbours are absolute and get CLIPPED by the container's overflow:hidden. When the
  // incoming page is taller than the outgoing one, its bottom was visibly cut off
  // mid-drag (hold a slow swipe from a short Money page and the next page ends abruptly).
  // While the pages are in motion — finger down or settle spring running — pin the
  // container's min-height to the tallest page so nothing is ever clipped; release when
  // the settle completes and the active page's natural height takes over again.
  //
  // BASE_MIN_HEIGHT is 1px taller than the scroll viewport ON PURPOSE: it guarantees
  // <main> always has scrollable overflow, so Android's native stretch-overscroll
  // (the "rubber band") engages even on pages shorter than the screen (Money).
  const BASE_MIN_HEIGHT = 'calc(100% + 1px)';
  const lockContainerHeight = useCallback(() => {
    // Freeze ambient animations for the duration of the gesture (idempotent: one token
    // spans the whole swipe→settle, released once in releaseContainerHeight).
    if (swipeFreezeRef.current === null) swipeFreezeRef.current = acquirePerfFreeze();
    const c = containerRef.current;
    if (!c) return;
    let max = 0;
    for (const child of Array.from(c.children)) {
      max = Math.max(max, (child as HTMLElement).offsetHeight);
    }
    if (max > 0) c.style.minHeight = `max(${BASE_MIN_HEIGHT}, ${max}px)`;
  }, []);
  const releaseContainerHeight = useCallback(() => {
    if (swipeFreezeRef.current !== null) {
      releasePerfFreeze(swipeFreezeRef.current);
      swipeFreezeRef.current = null;
    }
    const c = containerRef.current;
    if (c) {
      c.style.minHeight = BASE_MIN_HEIGHT;
    }
  }, []);

  // Drive the shared carousel progress toward the active page. First sync jumps
  // (no boot animation when deep-linking to /stats etc.); after that every route
  // change — tab tap or committed swipe — settles there with the shared spring, so
  // the pages and the BottomNav pill move as one unit from wherever they are.
  const progressSyncedRef = useRef(false);
  // A committed swipe starts its velocity-seeded settle BEFORE navigating; when the
  // route change lands, this ref tells the sync effect the spring is already running
  // so it must not restart it (that would drop the finger's momentum).
  const pendingSettleRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!progressSyncedRef.current) {
      progressSyncedRef.current = true;
      pageProgress.jump(activeIdx);
      return;
    }
    if (pendingSettleRef.current === activeIdx) {
      pendingSettleRef.current = null;
      return;
    }
    if (pageProgress.get() !== activeIdx) {
      lockContainerHeight();
      animate(pageProgress, activeIdx, { ...SETTLE_SPRING, onComplete: releaseContainerHeight });
    }
  }, [activeIdx, lockContainerHeight, releaseContainerHeight]);

  // Reset scroll to top before paint on every route change (covers main tabs,
  // non-main routes like /history, and navigating back from them)
  useLayoutEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  // Pause the ambient decorative loops while <main> is scrolling/flinging — same reason
  // as the swipe freeze: their per-frame main-thread repaint stutters the scroll in the
  // Android WebView. Acquire once on the first scroll event, release a beat after motion
  // stops. Passive so it never delays the scroll. <main> is a stable parent of AppShell,
  // so one bind on mount covers every route.
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    let token: symbol | null = null;
    let idle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      if (token === null) token = acquirePerfFreeze();
      clearTimeout(idle);
      idle = setTimeout(() => {
        if (token !== null) { releasePerfFreeze(token); token = null; }
      }, 160);
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      main.removeEventListener('scroll', onScroll);
      clearTimeout(idle);
      if (token !== null) releasePerfFreeze(token);
    };
  }, []);

  const navigate = useCallback(
    (href: string) => {
      if (navGuardRef.current) {
        navGuardRef.current.onAttempt(href);
      } else {
        router.push(href, { scroll: false });
      }
    },
    [router],
  );

  // Global safety net for Radix's stuck-overlay bug. When two modal layers
  // (e.g. a nested AlertDialog inside a Dialog) tear down in the same tick, or a
  // dialog unmounts mid-close, Radix can leave `pointer-events: none` on <body>
  // and never remove it — making the whole app unclickable until a refresh.
  // This watchdog watches <body> for that inline lock and clears it whenever no
  // modal layer is actually open, recovering from any missed call-site cleanup.
  useEffect(() => {
    const body = document.body;

    const hasOpenModalLayer = () =>
      document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]'
      ) != null;

    const clearIfStale = () => {
      if (body.style.pointerEvents === 'none' && !hasOpenModalLayer()) {
        body.style.pointerEvents = '';
      }
    };

    // Defer past Radix's own DOM work (which may briefly have no open layer
    // while it swaps state) so we only clear a genuinely stale lock.
    let raf = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(clearIfStale);
    });
    // Body's inline style carries the lock; its direct children are where Radix
    // portals mount/unmount — both signal a teardown worth re-checking.
    observer.observe(body, { attributes: true, attributeFilter: ['style'], childList: true });

    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  // Once the app is interactive, warm the deferred chunks in the background (Money Balance
  // first, then Profile + its sub-pages) and prefetch the History route, so navigating to
  // them later is instant without bloating the initial bundle/boot.
  //
  // Production only: in dev, each import()/prefetch forces an on-demand Turbopack compile of
  // these heavy modules (the ~1,400-line settings menus, the jsPDF-pulling History route),
  // which competes with navigation for the dev server's compiler and makes pages feel slow.
  // Dev compiles them lazily on first visit instead.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    warmBackgroundChunks();
    router.prefetch?.('/history');
  }, [router]);

  // Open downloaded file when user taps a "File Saved" notification
  useEffect(() => {
    let removeListener: (() => void) | null = null;
    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
        LocalNotifications.addListener('localNotificationActionPerformed', action => {
          const extra = (action.notification as { extra?: { fileUri?: string; mimeType?: string } }).extra;
          if (extra?.fileUri) {
            FolderAccess.openFile({ fileUri: extra.fileUri, mimeType: extra.mimeType ?? '*/*' }).catch(() => {});
          }
        }).then(handle => { removeListener = () => handle.remove(); });
      });
    });
    return () => { removeListener?.(); };
  }, []);

  useEffect(() => {
    // start.progress is the carousel position at the moment the drag is classified —
    // NOT the route index. Grabbing mid-settle therefore catches the pages exactly
    // where they are (native-pager feel) instead of teleporting them to the route.
    const start = { x: 0, y: 0, progress: 1, routeIdx: 1, width: 1 };
    // Recent (time, x) samples for instantaneous release velocity.
    const samples: { t: number; x: number }[] = [];
    let tracking: 'none' | 'h' | 'v' = 'none';

    const onStart = (e: TouchEvent) => {
      start.x = e.touches[0].clientX;
      start.y = e.touches[0].clientY;
      // Touches inside a modal dialog, or on an element that owns its own gesture (the
      // quick-add FABs), must never trigger page swipes.
      tracking = isInDialog(e.target) || ownsGesture(e.target) ? 'v' : 'none';
    };

    const onMove = (e: TouchEvent) => {
      if (tracking === 'v') return;
      // An overlay can appear MID-DRAG (a long-press maturing into the quick-add radial).
      // Hand the gesture over: let go of the pages and settle them back where they were,
      // rather than dragging the whole blurred app around behind the radial.
      if (tracking === 'h' && isOverlayOpen()) {
        tracking = 'v';
        animate(pageProgress, start.routeIdx, { ...SETTLE_SPRING, onComplete: releaseContainerHeight });
        return;
      }
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (tracking === 'none') {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          tracking = 'v';
          return;
        }
        if (isInHorizontalScroller(e.target)) {
          tracking = 'v';
          return;
        }
        // Guards that used to run at release now gate the LIVE drag: a sub-view (e.g.
        // Theme menu) may own horizontal swipes, an overlay (quick-add radial, dialog,
        // calculator) may be covering the app, and non-main routes (History) never
        // page-swipe. Bail before the pages ever move.
        if (pageSwipeLockedRef.current || isOverlayOpen() || !MAIN_ROUTES.has(pathnameRef.current)) {
          tracking = 'v';
          return;
        }
        tracking = 'h';
        pageProgress.stop(); // take over from any running commit/cancel animation
        start.progress = pageProgress.get();
        start.routeIdx = ROUTE_ORDER[pathnameRef.current] ?? 1;
        start.width = containerRef.current?.clientWidth || window.innerWidth;
        samples.length = 0;
        // Pin the container to the tallest page for the whole gesture so a taller
        // incoming page is never clipped while held mid-drag (the "cut" bug).
        lockContainerHeight();
      }

      samples.push({ t: Date.now(), x: e.touches[0].clientX });
      if (samples.length > 8) samples.shift();

      // Finger-following: progress = the position the finger implies right now,
      // rubber-banded past the first/last page so the edges resist progressively.
      let target = start.progress - dx / start.width;
      const last = ROUTES.length - 1;
      if (target < 0) target = -rubberBand(-target);
      else if (target > last) target = last + rubberBand(target - last);
      pageProgress.set(target);
    };

    const onEnd = (e: TouchEvent) => {
      if (tracking !== 'h') return;
      tracking = 'none';

      const endX = e.changedTouches[0].clientX;
      const endT = Date.now();

      // Instantaneous velocity: earliest sample inside the trailing window. Holding
      // still before release leaves no fresh samples → 0 → the fling dies, exactly
      // like a native pager (a whole-gesture average would wrongly keep it alive).
      let vx = 0; // px/ms
      for (const s of samples) {
        const dt = endT - s.t;
        if (dt <= VELOCITY_WINDOW_MS) {
          if (dt > 0) vx = (endX - s.x) / dt;
          break;
        }
      }

      const dx = endX - start.x;
      const currIdx = start.routeIdx;
      // Project ~180ms of momentum past the finger, then commit if the projected
      // position crossed half a page in either direction (clamped to one page/gesture).
      const projected = start.progress - dx / start.width + (-vx / start.width) * PROJECTION_MS;
      let nextIdx = currIdx;
      if (Math.abs(dx) >= MIN_COMMIT_PX) {
        // Fling checks require the velocity and the drag to agree on direction, so a
        // drag-left-then-flick-right release reads as "throw it back", not a commit.
        if (projected > currIdx + COMMIT_FRACTION || (vx < -FLING_VELOCITY && dx < 0)) nextIdx = currIdx + 1;
        else if (projected < currIdx - COMMIT_FRACTION || (vx > FLING_VELOCITY && dx > 0)) nextIdx = currIdx - 1;
      }
      nextIdx = Math.max(0, Math.min(ROUTES.length - 1, nextIdx));

      // Seed the settle spring with the finger's velocity (progress units/second) so
      // the pages keep moving seamlessly from under the finger — no restart, no jump.
      const progressVelocity = (-vx / start.width) * 1000;

      if (nextIdx === currIdx) {
        animate(pageProgress, currIdx, { ...SETTLE_SPRING, velocity: progressVelocity, onComplete: releaseContainerHeight });
        return;
      }

      if (navGuardRef.current) {
        // The guard may veto (it shows its own dialog), so return the pages home now;
        // if the user confirms, the route change animates the carousel from rest.
        animate(pageProgress, currIdx, { ...SETTLE_SPRING, velocity: progressVelocity, onComplete: releaseContainerHeight });
        navGuardRef.current.onAttempt(ROUTES[nextIdx]);
        return;
      }

      // Reset scroll synchronously here so the incoming page is never seen at
      // a scroll position inherited from the page being swiped away from.
      // The useLayoutEffect below is a safety net for tab-tap navigation.
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

      // Start the velocity-seeded settle BEFORE navigating and tell the progress-sync
      // effect it's already running (pendingSettleRef) so it doesn't restart it.
      pendingSettleRef.current = nextIdx;
      animate(pageProgress, nextIdx, { ...SETTLE_SPRING, velocity: progressVelocity, onComplete: releaseContainerHeight });
      navigate(ROUTES[nextIdx]);
    };

    // Android fires touchcancel when the WebView/browser steals the gesture (e.g. an
    // incoming notification shade drag) — without this the pages would freeze mid-drag.
    const onCancel = () => {
      if (tracking !== 'h') return;
      tracking = 'none';
      animate(pageProgress, start.routeIdx, { ...SETTLE_SPRING, onComplete: releaseContainerHeight });
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
  }, [navigate, lockContainerHeight, releaseContainerHeight]);

  return (
    <>
      {/* Always-mounted carousel — all 4 pages live in the DOM permanently */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          // 1px taller than the scroll viewport so <main> always has overflow — this is
          // what lets Android's stretch-overscroll fire on pages shorter than the screen.
          minHeight: BASE_MIN_HEIGHT,
          display: isMainRoute ? 'block' : 'none',
        }}
      >
        {PAGES.map(({ href, element }, i) => (
          <CarouselPage key={href} index={i} active={i === activeIdx} preset={preset}>
            {element}
          </CarouselPage>
        ))}
      </div>

      {/* Non-main routes (History, etc.) render children normally */}
      {!isMainRoute && children}
    </>
  );
}

/** Compose one page's inline styles for a given carousel position. Perspective is baked
 *  into the element's own transform (only 3D presets need it), matching what framer's
 *  transformPerspective produced before. */
function frameStyles(preset: PageTransitionPreset, index: number, p: number) {
  const f = preset.frame(index - p);
  const perspective = preset.threeD ? 'perspective(1100px) ' : '';
  return {
    transform: `${perspective}translateX(${f.x}) scale(${f.scale}) rotateY(${f.rotateY}deg)`,
    opacity: f.opacity,
    visibility: (Math.abs(index - p) < VISIBLE_RANGE ? 'visible' : 'hidden') as 'visible' | 'hidden',
  };
}

/**
 * One always-mounted page of the carousel. Position/scale/opacity/rotation are pure
 * functions of the shared pageProgress value (see lib/pageTransitions.ts), written
 * STRAIGHT to el.style from the progress subscription — no React re-render AND no
 * MotionValue → rAF hop. pageProgress.set() notifies subscribers synchronously, so a
 * touchmove moves the pages in the very same event turn; that saved frame of latency is
 * what makes the drag stick to the finger on Android instead of trailing it. Only
 * `active` (position relative vs absolute, pointer events) changes through React.
 *
 * memo: on a route commit only the outgoing and incoming pages' wrappers re-render
 * (their `active` flipped) — and thanks to the stable children elements even those
 * re-renders stop at this wrapper div instead of descending into the page tree.
 */
const CarouselPage = memo(function CarouselPage({ index, active, preset, children }: {
  index: number;
  active: boolean;
  preset: PageTransitionPreset;
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
    apply(pageProgress.get()); // first paint, and re-style immediately on preset change
    return pageProgress.on('change', apply);
  }, [index, preset]);

  // First-paint frame, FROZEN at mount. The style prop must present the exact same
  // frame values on every render so React's diff never rewrites transform/opacity/
  // visibility after mount — the progress subscription above is their single writer.
  // (Recomputing this per render was the "ghost page" bug: the route-commit render
  // captured mid-settle values, and by the time that commit reached the DOM the spring
  // had finished — React stamped the stale mid-swipe frame back on with nothing left
  // running to correct it, leaving the outgoing page half-visible under the new one.)
  const initialFrame = useRef(frameStyles(preset, index, pageProgress.get())).current;

  return (
    <div
      ref={ref}
      style={{
        ...initialFrame,
        // Keep the pages permanently promoted to their own GPU layers: promoting them
        // lazily at drag-start costs a visible first-frame hitch on Android WebViews.
        willChange: 'transform',
        position: active ? 'relative' : 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        // Higher routes stack above lower ones so the parallax preset covers/uncovers
        // correctly; harmless for the side-by-side presets (pages never overlap there).
        zIndex: index,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
})
