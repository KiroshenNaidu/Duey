'use client';

import { useContext, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { FolderAccess } from '@/lib/folderAccess';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
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

const transition = {
  type: 'tween' as const,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  duration: 0.22,
};

function isInHorizontalScroller(el: EventTarget | null): boolean {
  let node = el as Element | null;
  while (node && node !== document.body) {
    const role = node.getAttribute('role');
    if (role === 'slider') return true; // Radix Slider thumb
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
  const { navGuard, pageSwipeLocked } = useContext(AppDataContext);

  const pathnameRef = useRef(pathname);
  const navGuardRef = useRef(navGuard);
  const pageSwipeLockedRef = useRef(pageSwipeLocked);
  pathnameRef.current = pathname;
  navGuardRef.current = navGuard;
  pageSwipeLockedRef.current = pageSwipeLocked;

  const isMainRoute = MAIN_ROUTES.has(pathname);
  const activeIdx = ROUTE_ORDER[pathname] ?? 1;

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
    const start = { x: 0, y: 0, time: 0 };
    let tracking: 'none' | 'h' | 'v' = 'none';

    const onStart = (e: TouchEvent) => {
      start.x = e.touches[0].clientX;
      start.y = e.touches[0].clientY;
      start.time = Date.now();
      // Touches inside a modal dialog must never trigger page swipes
      tracking = isInDialog(e.target) ? 'v' : 'none';
    };

    const onMove = (e: TouchEvent) => {
      if (tracking === 'v') return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;

      if (tracking === 'none') {
        if (Math.abs(dy) > Math.abs(dx)) {
          tracking = 'v';
          return;
        }
        if (isInHorizontalScroller(e.target)) {
          tracking = 'v';
          return;
        }
        tracking = 'h';
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (tracking !== 'h') return;
      tracking = 'none';

      // A sub-view (e.g. Theme menu) may own horizontal swipes for its own sub-tabs.
      if (pageSwipeLockedRef.current) return;

      // Don't swipe-navigate when on a non-main route (e.g. History)
      if (!MAIN_ROUTES.has(pathnameRef.current)) return;

      const dx = e.changedTouches[0].clientX - start.x;
      const velocity = Math.abs(dx) / Math.max(Date.now() - start.time, 1);
      const threshold = velocity > 0.4 ? 28 : 55;
      if (Math.abs(dx) < threshold) return;

      const currIdx = ROUTE_ORDER[pathnameRef.current] ?? 1;
      const nextIdx = dx < 0 ? currIdx + 1 : currIdx - 1;
      if (nextIdx < 0 || nextIdx >= ROUTES.length) return;

      // Reset scroll synchronously here so the incoming page is never seen at
      // a scroll position inherited from the page being swiped away from.
      // The useLayoutEffect below is a safety net for tab-tap navigation.
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

      navigate(ROUTES[nextIdx]);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [navigate]);

  return (
    <>
      {/* Always-mounted carousel — all 4 pages live in the DOM permanently */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          minHeight: '100%',
          display: isMainRoute ? 'block' : 'none',
        }}
      >
        {PAGES.map(({ href, Component }, i) => (
          <motion.div
            key={href}
            animate={{ x: `${(i - activeIdx) * 100}%` }}
            transition={transition}
            style={{
              position: i === activeIdx ? 'relative' : 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              pointerEvents: i === activeIdx ? 'auto' : 'none',
              visibility: i === activeIdx ? 'visible' : 'hidden',
            }}
          >
            <Component />
          </motion.div>
        ))}
      </div>

      {/* Non-main routes (History, etc.) render children normally */}
      {!isMainRoute && children}
    </>
  );
}
