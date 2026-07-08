// Page-swipe transition presets for the AppShell carousel, selected in
// Theme → Style → Page Transition and stored as AppState.pageTransitionId.
// Mirrors the radialFx.ts preset pattern: adding a preset = one more entry here;
// AppShell and the settings preview both consume it, nothing else needs touching.

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
  rotateY: number; // degrees — needs threeD on the preset to read as 3D
}

export interface PageTransitionPreset {
  id: string;
  name: string;
  description: string;
  /** Pages get a CSS perspective so rotateY renders with depth. */
  threeD?: boolean;
  frame: (offset: number) => PageFrame;
}

// Scale/opacity/rotate effects saturate at one page away; x keeps the raw offset so
// far-away pages stay parked off-screen (offset 2 → 200%).
const clamp1 = (o: number) => Math.max(-1, Math.min(1, o));

export const PAGE_TRANSITION_PRESETS: PageTransitionPreset[] = [
  {
    id: 'slide',
    name: 'Slide',
    description: 'Classic flat slide between pages',
    frame: o => ({ x: `${o * 100}%`, scale: 1, opacity: 1, rotateY: 0 }),
  },
  {
    id: 'depth',
    name: 'Depth',
    description: 'Pages sink back and dim as they leave, pop forward as they arrive',
    frame: o => {
      const t = Math.abs(clamp1(o));
      return { x: `${o * 100}%`, scale: 1 - t * 0.14, opacity: 1 - t * 0.35, rotateY: 0 };
    },
  },
  {
    id: 'parallax',
    name: 'Parallax',
    description: 'New pages glide in over the old one like a stack of cards',
    frame: o => {
      // Left neighbours crawl (30%) and dim UNDER; right neighbours slide full-speed on
      // top (pages are z-ordered by index, so higher routes cover lower ones mid-swipe).
      const t = Math.abs(clamp1(o));
      return o < 0
        ? { x: `${o * 30}%`, scale: 1 - t * 0.04, opacity: 1 - t * 0.45, rotateY: 0 }
        : { x: `${o * 100}%`, scale: 1, opacity: 1, rotateY: 0 };
    },
  },
  {
    id: 'cube',
    name: 'Cube',
    description: 'Pages pivot in 3D as they pass — the boldest of the bunch',
    threeD: true,
    frame: o => {
      const t = clamp1(o);
      const a = Math.abs(t);
      return { x: `${o * 100}%`, scale: 1 - a * 0.08, opacity: 1 - a * 0.3, rotateY: t * -55 };
    },
  },
];

export const DEFAULT_PAGE_TRANSITION_ID = 'depth';

export function getPageTransition(id: string | undefined): PageTransitionPreset {
  return PAGE_TRANSITION_PRESETS.find(p => p.id === id) ?? PAGE_TRANSITION_PRESETS[0];
}
