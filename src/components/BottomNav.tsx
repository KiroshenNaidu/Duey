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
    <nav className="fixed top-0 left-0 right-0 h-14 bg-card/95 backdrop-blur-sm border-b border-accent/[.2] z-50">
      <div className="flex justify-around items-center h-full max-w-md mx-auto">
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
              <item.icon className="h-4 w-4" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
