'use client';

import { useRef, useContext, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';

const ROUTE_ORDER: Record<string, number> = {
  '/transport': 0,
  '/': 1,
  '/stats': 2,
  '/settings': 3,
};

const ROUTES = ['/transport', '/', '/stats', '/settings'];

const variants = {
  enter: (d: number) => ({ x: d >= 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d >= 0 ? '-100%' : '100%', opacity: 0 }),
};

// iOS-style ease-out curve — fast start, smooth settle
const transition = {
  type: 'tween' as const,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  duration: 0.22,
};

function isInHorizontalScroller(el: EventTarget | null): boolean {
  let node = el as Element | null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const ox = style.overflowX;
    if ((ox === 'scroll' || ox === 'auto') && node.scrollWidth > node.clientWidth) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { navGuard } = useContext(AppDataContext);

  const prevPathnameRef = useRef(pathname);
  const directionRef = useRef(0);
  const pathnameRef = useRef(pathname);
  const navGuardRef = useRef(navGuard);

  pathnameRef.current = pathname;
  navGuardRef.current = navGuard;

  if (prevPathnameRef.current !== pathname) {
    const prevIdx = ROUTE_ORDER[prevPathnameRef.current] ?? 1;
    const currIdx = ROUTE_ORDER[pathname] ?? 1;
    directionRef.current = currIdx >= prevIdx ? 1 : -1;
    prevPathnameRef.current = pathname;
  }

  const navigate = useCallback(
    (href: string) => {
      if (navGuardRef.current) {
        navGuardRef.current.onAttempt(href);
      } else {
        router.push(href);
      }
    },
    [router],
  );

  useEffect(() => {
    const start = { x: 0, y: 0, time: 0 };
    // 'none' = undecided, 'h' = tracking horizontal, 'v' = vertical (skip)
    let tracking: 'none' | 'h' | 'v' = 'none';

    const onStart = (e: TouchEvent) => {
      start.x = e.touches[0].clientX;
      start.y = e.touches[0].clientY;
      start.time = Date.now();
      tracking = 'none';
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
        // Don't hijack touches inside a horizontal scroll container
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

      const dx = e.changedTouches[0].clientX - start.x;
      const velocity = Math.abs(dx) / Math.max(Date.now() - start.time, 1); // px/ms

      // Fast flick needs less distance; slow drag needs more
      const threshold = velocity > 0.4 ? 28 : 55;
      if (Math.abs(dx) < threshold) return;

      const currIdx = ROUTE_ORDER[pathnameRef.current] ?? 1;
      const nextIdx = dx < 0 ? currIdx + 1 : currIdx - 1;
      if (nextIdx < 0 || nextIdx >= ROUTES.length) return;

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
    <div style={{ position: 'relative', overflowX: 'hidden' }}>
      <AnimatePresence mode="popLayout" custom={directionRef.current}>
        <motion.div
          key={pathname}
          custom={directionRef.current}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
