'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListChecks, BarChart3, Settings, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/transport', label: 'Transport', icon: Car },
  { href: '/', label: 'Debts', icon: ListChecks },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-20 bg-card/95 backdrop-blur-[18px] border-t border-accent/[.2] z-50 rounded-t-[2.5rem] shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.3)]">
      <div className="flex justify-around items-center h-full max-w-md mx-auto px-4 pb-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors duration-200',
                isActive ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? "text-accent" : "text-muted-foreground")} />
              <span className={cn("text-[10px] font-medium", isActive ? "text-accent" : "text-muted-foreground")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
