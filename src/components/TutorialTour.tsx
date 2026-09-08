'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ElementType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3, Calculator, Car, Compass, Hand, PartyPopper,
  Plus, SlidersHorizontal, Wallet, Zap,
} from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { FixedPortal } from '@/components/FixedPortal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticTap, hapticTick } from '@/lib/haptics';

// First-run feature tour: a stack of small cards over the LIVE app, each one routing to the
// page it talks about and ringing the real control it points at (no screenshots to go stale).
//
// It fires exactly once — right after the currency picker is answered — and is replayable
// forever from Profile -> "How to use Duey", which dispatches START_EVENT.
//
// Why it isn't a Radix dialog: the whole point is that the app stays visible and unblurred
// behind it, while a normal dialog dims + blurs #app-root (see lib/overlayBlur.ts). It does
// carry role="dialog" + data-state="open" so the two behaviours that key off those attributes
// still apply for free: the Android hardware back button sends it an Escape (HardwareBackButton)
// and the page carousel refuses to swipe under it (AppShell.isInDialog).

const START_EVENT = 'duey:start-tutorial';

/** Replay the tour from anywhere (Profile -> How to use Duey). */
export function startTutorial() {
  window.dispatchEvent(new CustomEvent(START_EVENT));
}

interface TourStep {
  id: string;
  /** Page to show behind the card. The tour navigates there before measuring. */
  route: string;
  /** Selector(s) for the real element(s) to ring. Missing targets degrade to no spotlight. */
  target?: string | string[];
  icon: ElementType;
  title: string;
  body: string;
  /** Optional one-line "try it" nudge, rendered as a pill under the body. */
  tip?: string;
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/',
    icon: PartyPopper,
    title: 'Welcome to Duey',
    body: 'Duey keeps what you owe, what you spend and what you earn in one place, no accounts, no bank logins, everything stays on this device.',
    tip: 'Takes about a minute :D',
  },
  {
    id: 'nav',
    route: '/',
    target: '[data-tour="nav"]',
    icon: Compass,
    title: 'Four pages, one swipe apart',
    body: 'Transport, Money, Stats and Profile. Tap a tab up top to jump straight there, or just swipe left and right anywhere on the page.',
  },
  {
    id: 'money',
    route: '/',
    target: '[data-tour="money-tabs"]',
    icon: Wallet,
    title: 'All your debts displayed in one place.',
    body: 'Debts tracks what you still owe and to whom. Budget plans a spending ceiling and ticks items off. Expenses logs what goes out, Balance sums it all up, and Tools holds the time and measurement calculators.',
  },
  {
    id: 'add',
    route: '/',
    target: '[data-tour="money-fab"]',
    icon: Plus,
    title: 'The + adds whatever you are looking at',
    body: 'On Debts it starts a new debt, on Budget a new plan, on Expenses a new expense. One button, always in the same spot.',
  },
  {
    id: 'quick-add',
    route: '/',
    target: '[data-tour="money-fab"]',
    icon: Zap,
    title: 'Hold the + for the quick menu',
    body: 'Press and hold, then slide to an action and let go, a payment, expense, extra income or Uber ride logged for today without leaving the page. Choose which shortcuts appear in Profile -> Settings.',
    tip: 'Customise your quick nav in Settings',
  },
  {
    id: 'swipe-rows',
    route: '/',
    icon: Hand,
    title: 'Swipe a card for its actions',
    body: 'Swipe any debt, expense or ride sideways to reveal edit and delete. Delete the wrong one and the undo toast at the bottom puts it straight back.',
  },
  {
    id: 'transport',
    route: '/transport',
    icon: Car,
    title: 'Transport tracks your commute',
    body: 'Tap the days you actually rode on the calendar and Duey works out what you owe your driver this month, daily rate or flat monthly. The Uber tab logs individual trips alongside it.',
  },
  {
    id: 'stats',
    route: '/stats',
    icon: BarChart3,
    title: 'Stats shows all your numbers.',
    body: 'Totals paid, progress on every debt, and month-by-month charts, all built from what you have logged, so the more you use Duey the more it tells you.',
  },
  {
    id: 'tools',
    route: '/',
    target: ['[data-tour="tools-calc"]', '[data-tour="tools-notepad"]'],
    icon: Calculator,
    title: 'A calculator and a notepad, always nearby',
    body: 'The two round buttons in the bottom corners of the Money page open a floating calculator and a quick notepad. Both keep their contents while you carry on using the app.',
  },
  {
    id: 'profile',
    route: '/settings',
    target: '[data-tour="settings-config"]',
    icon: SlidersHorizontal,
    title: 'Make it yours',
    body: 'Settings & Configuration holds it all: your payday reminder, backups, the pay date your balance resets on, and every appearance setting. Replaying this tour lives in there too.',
    tip: 'You can always come back here',
  },
];

/** Gap between a target's own box and the ring drawn around it. */
const SPOTLIGHT_PAD = 8;
/** id of the mask that cuts the scrim's holes. Only one tour is ever mounted. */
const MASK_ID = 'tour-spotlight';

/** Round targets (the + FAB, the corner tool buttons) deserve a round ring, not a squircle. */
const spotlightRadius = (r: DOMRect) => (Math.abs(r.width - r.height) < 12 ? 9999 : 18);

/**
 * The padded box a ring is drawn on. The pad is trimmed on any side that would push the
 * ring past a viewport edge — the top nav sits flush against the top of the screen, and on
 * a device with no status-bar inset its 8px of headroom simply isn't there. Trimming the
 * PADDING keeps the whole ring on screen without moving or squashing the target box, which
 * is what an all-round clamp used to do (round targets came out as off-centre ovals).
 */
function spotlightBox(r: DOMRect) {
  const vw = typeof window === 'undefined' ? r.right : window.innerWidth;
  const vh = typeof window === 'undefined' ? r.bottom : window.innerHeight;
  const pad = (available: number) => Math.min(SPOTLIGHT_PAD, Math.max(0, available));
  const l = pad(r.left), t = pad(r.top), rt = pad(vw - r.right), b = pad(vh - r.bottom);
  return {
    left: r.left - l,
    top: r.top - t,
    width: r.width + l + rt,
    height: r.height + t + b,
    radius: spotlightRadius(r),
  };
}

/**
 * One box per target that is actually on screen. A step that points at two controls (the
 * corner tool buttons) gets a ring around EACH of them, instead of one wide ring swallowing
 * the whole row between them.
 *
 * Boxes come back exactly as measured — staying on screen is spotlightBox's job, and it
 * does it by trimming padding rather than by clamping the target box, which used to squash
 * whichever side sat against an edge (the + FAB's ring came out as an off-centre oval).
 */
function measureTargets(target: string | string[] | undefined): DOMRect[] {
  if (!target) return [];
  const selectors = Array.isArray(target) ? target : [target];
  const boxes: DOMRect[] = [];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    boxes.push(box);
  }
  return boxes;
}

/** Bounding box of every ring — used only to pick which half of the screen the card sits on. */
function unionRect(boxes: DOMRect[]): DOMRect | null {
  if (!boxes.length) return null;
  const l = Math.min(...boxes.map((b) => b.left));
  const t = Math.min(...boxes.map((b) => b.top));
  const r = Math.max(...boxes.map((b) => b.right));
  const b = Math.max(...boxes.map((b) => b.bottom));
  return new DOMRect(l, t, r - l, b - t);
}


// Cards travel in the direction of the step change, matching the settings menus.
const cardVariants = {
  enter: (d: number) => ({ opacity: 0, x: d >= 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit:  (d: number) => ({ opacity: 0, x: d >= 0 ? -40 : 40 }),
};
const cardTransition = { type: 'tween' as const, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number], duration: 0.22 };

export function TutorialTour() {
  const { currency, tutorialSeen, setTutorialSeen } = useContext(AppDataContext);
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [rects, setRects] = useState<DOMRect[]>([]);
  // Where the user was standing when the tour started — the tour walks them across four
  // pages, so finishing puts them back rather than abandoning them on whatever page the
  // last step happened to use.
  const originRouteRef = useRef('/');

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  // Auto-start: only ever once, and only after the currency picker has been answered —
  // the two modals must never be on screen together. The delay lets the picker's close
  // animation finish so the tour doesn't slide in over a dissolving dialog.
  useEffect(() => {
    if (tutorialSeen || currency === '' || open) return;
    const id = setTimeout(() => { originRouteRef.current = '/'; setIndex(0); setDir(1); setOpen(true); }, 500);
    return () => clearTimeout(id);
  // `open` is deliberately excluded: re-running on open would cancel the timer it just set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialSeen, currency]);

  // Manual replay from Profile.
  useEffect(() => {
    const onStart = () => {
      originRouteRef.current = window.location.pathname === '/settings' ? '/settings' : '/';
      setIndex(0); setDir(1); setRects([]); setOpen(true);
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, []);

  // Drive the app to the page this step is about, so the card always has the right thing
  // behind it. Routing is a no-op when we're already there.
  useEffect(() => {
    if (!open) return;
    if (pathname !== step.route) router.push(step.route, { scroll: false });
  }, [open, step.route, pathname, router]);

  // Keep the ring glued to its target for as long as the step is up. A rAF loop rather than
  // a one-shot measure because the page carousel is usually still animating into place when
  // the step opens, and the FAB/nav move with it — one measurement would freeze the ring at
  // wherever the element happened to be mid-transition. One getBoundingClientRect per frame
  // on a single element is cheap, and the loop only exists while the tour is open.
  useEffect(() => {
    if (!open) return;
    if (!step.target) { setRects([]); return; }
    let raf = 0;
    let last = '';
    let scrolled = false;
    const tick = () => {
      // A target can start below the fold (the replay row at the foot of Profile). Bring it
      // on screen ONCE per step; the loop below then keeps the ring glued to it as it moves.
      if (!scrolled) {
        const first = document.querySelector(Array.isArray(step.target) ? step.target[0] : step.target!);
        // Latch only once the element actually EXISTS — a step that changes route renders its
        // card before the new page mounts, and latching on that empty first frame would mean
        // the target never gets scrolled to at all.
        if (first) {
          scrolled = true;
          const box = first.getBoundingClientRect();
          if (box.bottom > window.innerHeight - 24 || box.top < 0) {
            first.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
      const next = measureTargets(step.target);
      const key = next.map((r) => `${r.left},${r.top},${r.width},${r.height}`).join('|');
      if (key !== last) { last = key; setRects(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, index, step.target]);

  const finish = useCallback(() => {
    setOpen(false);
    setRects([]);
    setTutorialSeen(true);
    router.push(originRouteRef.current, { scroll: false });
  }, [router, setTutorialSeen]);

  const go = useCallback((delta: number) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= STEPS.length) { hapticTap(); finish(); return; }
    hapticTick();
    setDir(delta);
    setRects([]);
    setIndex(next);
  }, [index, finish]);

  // Escape = one step back (and the Android hardware back button, which HardwareBackButton
  // translates into an Escape for anything role="dialog"). From the first step it exits.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (index === 0) finish(); else go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, index, go, finish]);

  // Swipe the card itself between steps — the same gesture language as the rest of the app.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    go(dx < 0 ? 1 : -1);
  };

  if (!open) return null;

  // The card sits on the opposite half of the screen from whatever is being pointed at, so
  // the ring is never hidden behind the thing explaining it. With no target it just centres.
  //
  // Positioning lives on a WRAPPER, not on the animated card: framer-motion writes the card's
  // `transform` itself to drive the x slide, which silently wiped a translate(-50%) used for
  // centring and pushed the card (and its Next button) half off screen.
  const viewportH = typeof window === 'undefined' ? 0 : window.innerHeight;
  const spot = unionRect(rects);
  const spotlightInTopHalf = spot ? spot.top + spot.height / 2 < viewportH / 2 : false;
  const slotPosition: React.CSSProperties = !spot
    // No target: sit low, clear of the FAB row, rather than dead-centre over the very page
    // the card is describing.
    ? { bottom: 'calc(88px + var(--sab))' }
    : spotlightInTopHalf
      ? { top: Math.max(16, Math.min(spot.bottom + 24, viewportH - 300)) }
      : { bottom: Math.max(16, Math.min(viewportH - spot.top + 24, viewportH - 300)) };

  const Icon = step.icon;

  return (
    <FixedPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Duey feature tour"
        data-state="open"
        className="fixed inset-0 z-[150]"
        style={{ touchAction: 'none' }}
      >
        {/* Scrim, with a real hole punched out per target — an SVG mask rather than one
            element's huge outward shadow, because a step can ring TWO controls (the corner
            tool buttons) and a shadow only ever cuts one hole. Holes are true cut-outs, so
            each ringed control keeps its real colours instead of showing through a wash. */}
        <motion.svg
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 h-full w-full pointer-events-auto"
        >
          <defs>
            <mask id={MASK_ID} maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {rects.map((r, i) => {
                const box = spotlightBox(r);
                return (
                  <rect
                    key={i}
                    x={box.left}
                    y={box.top}
                    width={box.width}
                    height={box.height}
                    rx={box.radius}
                    fill="black"
                  />
                );
              })}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            mask={`url(#${MASK_ID})`}
            style={{ fill: 'hsl(var(--background) / 0.82)' }}
          />
        </motion.svg>

        {/* The rings themselves, pulsing so the eye lands on them before reading the card. */}
        {rects.map((r, i) => {
          const box = spotlightBox(r);
          return (
            <motion.div
              key={i}
              className="absolute pointer-events-none border-2 border-primary"
              initial={false}
              animate={reduceMotion ? { opacity: 1 } : { opacity: [1, 0.45, 1] }}
              transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                borderRadius: box.radius,
                boxShadow: '0 0 0 4px hsl(var(--primary) / 0.18)',
              }}
            />
          );
        })}

        {/* A single-cell grid holding every card in that one cell: the outgoing and incoming
            cards overlap cleanly during the cross-slide without either leaving flow, so the
            wrapper still sizes and centres itself off the card. */}
        <div
          className="absolute left-0 right-0 grid justify-items-center px-4 pointer-events-none"
          style={slotPosition}
        >
          <AnimatePresence custom={dir}>
            <motion.div
              key={step.id}
              custom={reduceMotion ? 0 : dir}
              variants={reduceMotion ? undefined : cardVariants}
              initial={reduceMotion ? { opacity: 0 } : 'enter'}
              animate={reduceMotion ? { opacity: 1 } : 'center'}
              exit={reduceMotion ? { opacity: 0 } : 'exit'}
              transition={cardTransition}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              className="w-full max-w-[380px] rounded-[1.75rem] border border-border bg-card p-5 shadow-2xl pointer-events-auto"
              style={{ gridArea: '1 / 1' }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 border border-primary/25">
                  <Icon className="h-[18px] w-[18px] text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Step {index + 1} of {STEPS.length}
                  </p>
                  <h2 className="text-base font-bold leading-snug text-card-foreground mt-0.5">{step.title}</h2>
                </div>
                <button
                  onClick={() => { hapticTap(); finish(); }}
                  className="shrink-0 -mr-1 -mt-1 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-foreground/10 active:bg-foreground/15 transition-colors"
                >
                  Skip
                </button>
              </div>

              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

              {step.tip && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/30 px-3 py-1 text-[11px] font-semibold text-foreground">
                  <Zap className="h-3 w-3 text-accent" />
                  {step.tip}
                </p>
              )}

              <div className="mt-4 flex items-center gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {STEPS.map((s, i) => (
                    <span
                      key={s.id}
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-200',
                        i === index ? 'w-4 bg-primary' : i < index ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted-foreground/25'
                      )}
                    />
                  ))}
                </div>
                {index > 0 && (
                  <Button variant="ghost" className="h-9 shrink-0 px-3 text-sm font-semibold" onClick={() => go(-1)}>
                    Back
                  </Button>
                )}
                <Button className="h-9 shrink-0 px-4 text-sm font-semibold" onClick={() => go(1)}>
                  {isLast ? 'Got it' : 'Next'}
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </FixedPortal>
  );
}
