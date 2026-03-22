'use client';

/**
 * @fileOverview A new empty bottom bar component.
 * Matches the appearance of the top navigation bar.
 */

export function EmptyBottomBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-card/95 backdrop-blur-[18px] border-t border-accent/[.2] z-40" />
  );
}
