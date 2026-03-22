'use client';

import { usePathname } from 'next/navigation';

/**
 * @fileOverview A new empty bottom bar component.
 * Matches the appearance of the top navigation bar.
 * Rendered only on the Debt (home) page.
 * Supports Solid and Glass theme modes via CSS class.
 */

export function EmptyBottomBar() {
  const pathname = usePathname();

  // Only show this bar on the Debt page (root path)
  if (pathname !== '/') {
    return null;
  }

  return (
    <div className="fixed-bottom-bar fixed bottom-0 left-0 right-0 h-[115px] bg-card border-t border-border z-40 transition-colors duration-300" />
  );
}
