'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Wallet, BarChart3, User, Car } from 'lucide-react';
import { motion, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useContext } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { pageProgress } from '@/lib/pageTransitions';

const navItems = [
  { href: '/transport', label: 'Transport', icon: Car },
  { href: '/', label: 'Money', icon: Wallet },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/settings', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { navGuard } = useContext(AppDataContext);

  const activeIdx = navItems.findIndex((item) => item.href === pathname);
  const onMainRoute = activeIdx >= 0;

  // The pill is a pure function of the SAME live progress the page carousel runs on
  // (AppShell writes it during drags and commit/cancel animations), so it glides under
  // the finger in lockstep with the pages — including the rubber-band at the ends,
  // which the clamp pins to the first/last tab.
  const pillX = useTransform(pageProgress, (p) => `${Math.min(Math.max(p, 0), navItems.length - 1) * 100}%`);

  return (
    <nav className="fixed top-0 left-0 right-0 bg-card border-b border-border z-50 transition-colors duration-300" style={{ height: 'var(--top-nav-h)' }}>
      <div className="relative flex items-stretch h-full max-w-md mx-auto" style={{ paddingTop: 'var(--top-nav-pt)' }}>
        {/* Sliding highlight — driven by the live carousel progress, not route state */}
        {onMainRoute && (
          <motion.div
            className="absolute left-0 pointer-events-none"
            style={{ width: `${100 / navItems.length}%`, top: 'var(--top-nav-pt)', bottom: 0, x: pillX }}
          >
            <span className="absolute inset-1.5 rounded-xl bg-primary/10" />
          </motion.div>
        )}

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <button
              key={item.href}
              role="link"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if (navGuard && !isActive) {
                  navGuard.onAttempt(item.href);
                } else {
                  router.push(item.href, { scroll: false });
                }
              }}
              className={cn(
                'relative flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors duration-200',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn("h-5 w-5 relative", isActive ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-[10px] font-semibold relative", isActive ? "text-primary" : "text-muted-foreground font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
