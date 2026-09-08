// How the AppShell carousel animates between pages, plus the swipe-gesture tuning shared
// by every finger-tracked pager in the app.
//
// This was once a user-selectable preset (Slide / Depth / Parallax / Cube, stored as
// AppState.pageTransitionId). The picker was removed — there is one animation now, the
// former default, and reduced motion still gets the flat slide.

import { motionValue } from 'framer-motion';

/** Live carousel position: activeIdx + drag fraction (e.g. 1.4 = 40% of the way from
 *  Money toward Stats). AppShell is the single writer (finger drags plus commit/cancel
 *  animations); BottomNav reads it so the nav pill glides in lockstep with the pages.
 *  A module singleton instead of context so per-frame updates never re-render React. */
export const pageProgress = motionValue(1);

/** Style of one page at a signed offset from the live position (offset = pageIdx −
 *  progress). 0 = centered/active, −1 = one page to the left, +1 = one to the right. */
export interface PageFrame {
  x: string;       // CSS translateX (percentage of the page width)
  scale: number;
  opacity: number;
}

// Scale/opacity effects saturate at one page away; x keeps the raw offset so far-away
// pages stay parked off-screen (offset 2 → 200%).
const clamp1 = (o: number) => Math.max(-1, Math.min(1, o));

/** Pages sink back and dim as they leave, and pop forward as they arrive. */
export const pageFrame = (offset: number): PageFrame => {
  const t = Math.abs(clamp1(offset));
  return { x: `${offset * 100}%`, scale: 1 - t * 0.14, opacity: 1 - t * 0.35 };
};

/** Reduced motion: the pages still track the finger (that is direct manipulation, not an
 *  animation) but nothing scales or fades. */
export const flatPageFrame = (offset: number): PageFrame =>
  ({ x: `${offset * 100}%`, scale: 1, opacity: 1 });

// ── Shared swipe-gesture tuning ────────────────────────────────────────────────
// One source of truth for every finger-tracked carousel in the app (the AppShell page
// carousel, History tabs, Theme sub-tabs), modeled on the platform pagers
// (UIScrollView / ViewPager2):
// - release velocity is measured over the last ~90ms only, so pausing mid-drag kills
//   the fling exactly like a native pager (a whole-gesture average gets this wrong),
// - the commit decision PROJECTS ~180ms of that momentum past the finger: a slow drag
//   needs half a page, a flick commits from almost anywhere,
// - the settle is a velocity-seeded, critically-damped spring — motion continues
//   seamlessly from the finger instead of restarting on a fixed duration curve,
// - edge overshoot follows the iOS rubber-band curve (progressive resistance,
//   asymptoting at half a page) instead of a linear damp.
// stiffness 700 / damping 52 ≈ critically damped, settles in ~250ms — native-pager
// pace. Softer values read as "floaty" and were reported as slow.
export const SWIPE_SETTLE_SPRING = { type: 'spring', stiffness: 700, damping: 52 } as const;
export const SWIPE_PROJECTION_MS = 180;     // momentum lookahead for the commit decision
export const SWIPE_COMMIT_FRACTION = 0.5;   // projected position past half a page → commit
export const SWIPE_VELOCITY_WINDOW_MS = 90; // trailing window for instantaneous release velocity
export const SWIPE_MIN_COMMIT_PX = 12;      // ignore micro-twitches regardless of projection
export const SWIPE_FLING_VELOCITY = 0.8;    // px/ms — a definite fling commits regardless of distance
                                            // (ViewPager's minimumFlingVelocity shortcut; projection
                                            // alone under-serves medium flicks over short distances)

/** iOS-style rubber band in page-fraction units: f(0.5) ≈ 0.18, asymptote 0.5. */
export const swipeRubberBand = (overshoot: number) => 0.5 * (1 - 1 / (overshoot * 1.1 + 1));
