'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Wallet, BarChart3, User, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContext } from 'react';
import { AppDataContext } from '@/context/AppDataContext';

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

  return (
    <nav className="fixed top-0 left-0 right-0 bg-card border-b border-border z-50 transition-colors duration-300" style={{ height: 'var(--top-nav-h)' }}>
      <div className="flex justify-around items-center h-full max-w-md mx-auto px-4" style={{ paddingTop: 'var(--top-nav-pt)' }}>
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
                  router.push(item.href);
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors duration-200',
                isActive ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? "text-accent" : "text-muted-foreground")} />
              <span className={cn("text-[10px] font-medium", isActive ? "text-accent" : "text-muted-foreground")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
