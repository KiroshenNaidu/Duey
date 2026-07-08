'use client';

import { useContext, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { FolderAccess } from '@/lib/folderAccess';
import { usePathname, useRouter } from 'next/navigation';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { warmBackgroundChunks } from '@/lib/prefetch';
import { pageProgress, getPageTransition, type PageTransitionPreset } from '@/lib/pageTransitions';
import { MoneyPage } from '@/components/pages/MoneyPage';
import { TransportPage } from '@/components/pages/TransportPage';
import { StatsPage } from '@/components/pages/StatsPage';
import { SettingsPage } from '@/components/pages/SettingsPage';

const PAGES = [
  { href: '/transport', Component: TransportPage },
  { href: '/',          Component: MoneyPage },
  { href: '/stats',     Component: StatsPage },
  { href: '/settings',  Component: SettingsPage },
] as const;

const ROUTE_ORDER: Record<string, number> = {
  '/transport': 0,
  '/':          1,
  '/stats':     2,
  '/settings':  3,
};

const ROUTES = ['/transport', '/', '/stats', '/settings'];
const MAIN_ROUTES = new Set(ROUTES);

// Swipe feel tuning — modeled on the platform pagers (UIScrollView / ViewPager2):
// - release velocity is measured over the last ~90ms only, so pausing mid-drag kills
//   the fling exactly like a native pager (a whole-gesture average gets this wrong),
// - the commit decision PROJECTS ~180ms of that momentum past the finger: a slow drag
//   needs half a page, a flick commits from almost anywhere,
// - the settle is a velocity-seeded, critically-damped spring — motion continues
//   seamlessly from the finger instead of restarting on a fixed duration curve,
// - edge overshoot follows the iOS rubber-band curve (progressive resistance,
//   asymptoting at half a page) instead of a linear damp.
// stiffness 700 / damping 52 ≈ critically damped, settles in ~250ms — native-pager
// pace. Softer values read as "floaty" and were reported as slow.
const SETTLE_SPRING = { type: 'spring', stiffness: 700, damping: 52 } as const;
const PROJECTION_MS = 180;     // momentum lookahead for the commit decision
const COMMIT_FRACTION = 0.5;   // projected position past half a page → commit
const VELOCITY_WINDOW_MS = 90; // trailing window for instantaneous release velocity
const MIN_COMMIT_PX = 12;      // ignore micro-twitches regardless of projection
const FLING_VELOCITY = 0.8;    // px/ms — a definite fling commits regardless of distance
                               // (ViewPager's minimumFlingVelocity shortcut; projection
                               // alone under-serves medium flicks over short distances)

/** iOS-style rubber band in page-fraction units: f(0.5) ≈ 0.18, asymptote 0.5. */
const rubberBand = (overshoot: number) => 0.5 * (1 - 1 / (overshoot * 1.1 + 1));

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
    if (pageProgress.get() !== activeIdx) animate(pageProgress, activeIdx, SETTLE_SPRING);
  }, [activeIdx]);

  // Reset scroll to top before paint on every route change (covers main tabs,
  // non-main routes like /history, and navigating back from them)
  useLayoutEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

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
      // Touches inside a modal dialog must never trigger page swipes
      tracking = isInDialog(e.target) ? 'v' : 'none';
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
        if (isInHorizontalScroller(e.target)) {
          tracking = 'v';
          return;
        }
        // Guards that used to run at release now gate the LIVE drag: a sub-view (e.g.
        // Theme menu) may own horizontal swipes, and non-main routes (History) never
        // page-swipe. Bail before the pages ever move.
        if (pageSwipeLockedRef.current || !MAIN_ROUTES.has(pathnameRef.current)) {
          tracking = 'v';
          return;
        }
        tracking = 'h';
        pageProgress.stop(); // take over from any running commit/cancel animation
        start.progress = pageProgress.get();
        start.routeIdx = ROUTE_ORDER[pathnameRef.current] ?? 1;
        start.width = containerRef.current?.clientWidth || window.innerWidth;
        samples.length = 0;
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
        animate(pageProgress, currIdx, { ...SETTLE_SPRING, velocity: progressVelocity });
        return;
      }

      if (navGuardRef.current) {
        // The guard may veto (it shows its own dialog), so return the pages home now;
        // if the user confirms, the route change animates the carousel from rest.
        animate(pageProgress, currIdx, { ...SETTLE_SPRING, velocity: progressVelocity });
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
      animate(pageProgress, nextIdx, { ...SETTLE_SPRING, velocity: progressVelocity });
      navigate(ROUTES[nextIdx]);
    };

    // Android fires touchcancel when the WebView/browser steals the gesture (e.g. an
    // incoming notification shade drag) — without this the pages would freeze mid-drag.
    const onCancel = () => {
      if (tracking !== 'h') return;
      tracking = 'none';
      animate(pageProgress, start.routeIdx, SETTLE_SPRING);
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
  }, [navigate]);

  return (
    <>
      {/* Always-mounted carousel — all 4 pages live in the DOM permanently */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          minHeight: '100%',
          display: isMainRoute ? 'block' : 'none',
        }}
      >
        {PAGES.map(({ href, Component }, i) => (
          <CarouselPage key={href} index={i} active={i === activeIdx} preset={preset}>
            <Component />
          </CarouselPage>
        ))}
      </div>

      {/* Non-main routes (History, etc.) render children normally */}
      {!isMainRoute && children}
    </>
  );
}

/**
 * One always-mounted page of the carousel. Position/scale/opacity/rotation are all pure
 * functions of the shared pageProgress MotionValue (see lib/pageTransitions.ts), applied
 * per-frame OUTSIDE React — dragging never re-renders the pages. Only `active` (position
 * relative vs absolute, pointer events) changes through React, on commit.
 */
function CarouselPage({ index, active, preset, children }: {
  index: number;
  active: boolean;
  preset: PageTransitionPreset;
  children: React.ReactNode;
}) {
  const first = preset.frame(index - pageProgress.get());
  const x = useMotionValue<string>(first.x);
  const scale = useMotionValue(first.scale);
  const opacity = useMotionValue(first.opacity);
  const rotateY = useMotionValue(first.rotateY);
  const visibility = useMotionValue<'visible' | 'hidden'>(
    Math.abs(index - pageProgress.get()) < VISIBLE_RANGE ? 'visible' : 'hidden'
  );

  useEffect(() => {
    const update = (p: number) => {
      const f = preset.frame(index - p);
      x.set(f.x);
      scale.set(f.scale);
      opacity.set(f.opacity);
      rotateY.set(f.rotateY);
      visibility.set(Math.abs(index - p) < VISIBLE_RANGE ? 'visible' : 'hidden');
    };
    update(pageProgress.get()); // re-style immediately when the preset changes
    return pageProgress.on('change', update);
  }, [index, preset, x, scale, opacity, rotateY, visibility]);

  return (
    <motion.div
      style={{
        x,
        scale,
        opacity,
        rotateY,
        visibility,
        // perspective() composes into this element's own transform — only 3D presets need it
        transformPerspective: preset.threeD ? 1100 : undefined,
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
    </motion.div>
  );
}
