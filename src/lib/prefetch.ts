// Background pre-warming of code-split chunks.
//
// After the app is interactive we fetch + parse the chunks for screens the user is likely
// to reach next, during idle time, so getting there later feels instant. Webpack dedupes by
// module specifier, so these import() calls warm the very same chunks that the matching
// next/dynamic() calls load on demand.
//
// PRIORITY ORDER IS THE POINT. The 4 main pages, the bottom nav and the quick-nav radial are
// NOT here — they're in the initial bundle and already live the moment the app paints. What
// follows warms everything else in strict "how soon could the user hit this" order:
//
//   TIER 1  reach-from-anywhere — the things a quick-nav pick or a FAB tap opens within a
//           second of boot. Warmed first so the quick menu never waits on a network/disk
//           read for its own destinations.
//   TIER 2  settings — Profile and its sub-menus. Occasional, deliberate navigation.
//   TIER 3  history — the heaviest screen in the app (its route chunk plus the export
//           machinery behind it). Deliberately dead last, behind an extra idle gap, so it
//           can never compete with anything above for main-thread time.
//
// Each tier drains one chunk per idle callback, so we never evaluate several modules inside
// one frame, and a tier only starts once the previous one has fully drained.

type Thunk = () => Promise<unknown>;

// requestIdleCallback is missing in some older Android WebViews — fall back to a short
// timeout (mirrors the defensive style in utils.ts genId).
function onIdle(cb: () => void, timeout = 2000): void {
  if (typeof window === 'undefined') return;
  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === 'function') ric(cb, { timeout });
  else window.setTimeout(cb, 200);
}

// Warm one thunk per idle tick so we never block a frame evaluating several chunks at once.
// `done` fires after the LAST thunk settles, which is how the tiers stay strictly ordered.
function warmSequential(thunks: Thunk[], done?: () => void): void {
  if (!thunks.length) {
    done?.();
    return;
  }
  const [first, ...rest] = thunks;
  onIdle(() => {
    Promise.resolve()
      .then(first)
      .catch(() => {})
      .finally(() => warmSequential(rest, done));
  });
}

// TIER 1 — reachable from any page, immediately. The first two are quick-nav destinations
// (the "Calc" and "Notes" shortcuts dispatch straight into these panels), so they lead.
const tier1: Thunk[] = [
  () => import('@/components/FloatingCalculator'),
  () => import('@/components/QuickNotepad'),
  () => import('@/components/AddDebtForm'),
  () => import('@/components/MoneyOverview'),
  () => import('@/components/MeasurementConverter'),
];

// TIER 2 — Profile and all of its sub-pages.
const tier2: Thunk[] = [
  () => import('@/components/settings/ProfileMenu'),
  () => import('@/components/settings/ThemeSettingsMenu'),
  () => import('@/components/settings/DataManagementMenu'),
  () => import('@/components/settings/NotificationsMenu'),
];

/**
 * Warm the deferred chunks in priority order, spread across idle ticks.
 *
 * `prefetchHistory` (the router prefetch for /history) is invoked only after tiers 1 and 2
 * have fully drained, plus one more idle gap on top — the "laziest" slot in the app.
 */
export function warmBackgroundChunks(prefetchHistory?: () => void): void {
  warmSequential(tier1, () =>
    warmSequential(tier2, () => {
      if (!prefetchHistory) return;
      // One extra idle hop past the last tier: History is the single heaviest screen, and
      // nothing above it should ever share a frame with its chunk.
      onIdle(() => prefetchHistory(), 6000);
    }),
  );
}
