'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Wallet, BarChart3, User, Car } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useContext } from 'react';
import { AppDataContext } from '@/context/AppDataContext';

const navItems = [
  { href: '/transport', label: 'Transport', icon: Car },
  { href: '/', label: 'Money', icon: Wallet },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/settings', label: 'Profile', icon: User },
];

// Mirrors the page carousel transition in AppShell so the nav pill glides in
// lockstep with the page as it swipes/animates between tabs.
const transition = {
  type: 'tween' as const,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  duration: 0.22,
};

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { navGuard } = useContext(AppDataContext);

  const activeIdx = navItems.findIndex((item) => item.href === pathname);
  const onMainRoute = activeIdx >= 0;

  return (
    <nav className="fixed top-0 left-0 right-0 bg-card border-b border-border z-50 transition-colors duration-300" style={{ height: 'var(--top-nav-h)' }}>
      <div className="relative flex items-stretch h-full max-w-md mx-auto" style={{ paddingTop: 'var(--top-nav-pt)' }}>
        {/* Sliding highlight — moves in sync with the page carousel */}
        {onMainRoute && (
          <motion.div
            className="absolute left-0 pointer-events-none"
            style={{ width: `${100 / navItems.length}%`, top: 'var(--top-nav-pt)', bottom: 0 }}
            initial={false}
            animate={{ x: `${activeIdx * 100}%` }}
            transition={transition}
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
