// Background pre-warming of code-split chunks.
//
// After the app is interactive we fetch + parse the chunks for screens the user is likely
// to visit next, during idle time, so navigating to them later feels instant. Webpack
// dedupes by module specifier, so these import() calls warm the very same chunks that the
// matching next/dynamic() calls load on demand (e.g. the Settings sub-menus in SettingsPage,
// and MoneyOverview in MoneyPage).
//
// The 4 main pages and the eager Money sub-tabs are NOT here — they're in the initial bundle
// and already instant. This only warms the deferred tiers.

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
function warmSequential(thunks: Thunk[]): void {
  if (!thunks.length) return;
  const [first, ...rest] = thunks;
  onIdle(() => {
    Promise.resolve()
      .then(first)
      .catch(() => {})
      .finally(() => warmSequential(rest));
  });
}

// Tier 1 — warmed first: the Money "Balance" tab (lazy MoneyOverview) so every Money
// sub-page is instant.
const tier1: Thunk[] = [
  () => import('@/components/MoneyOverview'),
];

// Tier 2 — warmed after: Profile and all of its sub-pages.
const tier2: Thunk[] = [
  () => import('@/components/settings/ProfileMenu'),
  () => import('@/components/settings/ThemeSettingsMenu'),
  () => import('@/components/settings/DataManagementMenu'),
  () => import('@/components/settings/NotificationsMenu'),
];

/** Warm the deferred chunks in priority order, spread across idle ticks. */
export function warmBackgroundChunks(): void {
  warmSequential([...tier1, ...tier2]);
}
