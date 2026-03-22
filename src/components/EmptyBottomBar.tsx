'use client';

import { usePathname } from 'next/navigation';

/**
 * @fileOverview A new empty bottom bar component.
 * Matches the appearance of the top navigation bar.
 * Rendered only on the Debt (home) page.
 */

export function EmptyBottomBar() {
  const pathname = usePathname();

  // Only show this bar on the Debt page (root path)
  if (pathname !== '/') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-card/95 backdrop-blur-[18px] border-t border-accent/[.2] z-40" />
  );
}
