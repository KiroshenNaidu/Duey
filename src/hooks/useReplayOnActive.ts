'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Returns a `ready` flag that re-runs false → true every time `route` becomes
 * the active page.
 *
 * Why this exists: AppShell keeps all four pages permanently mounted in a swipe
 * carousel (see AppShell.tsx) — navigating just translates them, it never
 * remounts. So a plain mount effect fires only once and the fill animation
 * never replays when you swipe back to a page. This hook watches the pathname
 * and re-arms the animation each time the user lands on `route`.
 *
 * Consumers must disable their CSS transition while `ready` is false, so the
 * reset to the empty state is instant (no reverse animation), then transition
 * to the filled state when it flips back true. e.g.:
 *
 *   style={{ width: `${ready ? pct : 0}%` }}
 *   className={ready ? 'transition-[width] duration-700' : ''}
 *
 * @param route   the pathname this component lives on (e.g. '/stats')
 * @param enabled gate the replay (e.g. until client-side data has hydrated)
 */
export function useReplayOnActive(route: string, enabled = true): boolean {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || pathname !== route) return;
    setReady(false);
    // Double-RAF: let the browser paint the empty state once before animating to full.
    // Both handles are tracked so the inner RAF can be cancelled if the effect re-runs
    // between the two frames (e.g. user swipes away mid-animation).
    let innerId = 0;
    const id = requestAnimationFrame(() => { innerId = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(innerId); };
  }, [pathname, route, enabled]);

  return ready;
}
