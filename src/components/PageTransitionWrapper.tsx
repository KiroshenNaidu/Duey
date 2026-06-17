'use client';

import { useRef, useContext } from 'react';
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

const transition = { type: 'tween' as const, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number], duration: 0.26 };

export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { navGuard } = useContext(AppDataContext);
  const prevPathnameRef = useRef(pathname);
  const directionRef = useRef(0);
  const touchStartRef = useRef({ x: 0, y: 0 });

  // Compute direction from route order whenever pathname changes
  if (prevPathnameRef.current !== pathname) {
    const prevIdx = ROUTE_ORDER[prevPathnameRef.current] ?? 1;
    const currIdx = ROUTE_ORDER[pathname] ?? 1;
    directionRef.current = currIdx >= prevIdx ? 1 : -1;
    prevPathnameRef.current = pathname;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    // Only fire if clearly horizontal and over 60px threshold
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const currIdx = ROUTE_ORDER[pathname] ?? 1;
    const nextIdx = dx < 0 ? currIdx + 1 : currIdx - 1;
    if (nextIdx < 0 || nextIdx >= ROUTES.length) return;
    const targetHref = ROUTES[nextIdx];
    if (navGuard) {
      navGuard.onAttempt(targetHref);
    } else {
      router.push(targetHref);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'relative', overflowX: 'hidden' }}
    >
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
