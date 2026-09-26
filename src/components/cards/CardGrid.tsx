'use client';

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, type MotionValue } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { cn } from '@/lib/utils';
import {
  CARD_SIZE_LABEL, moveItem, nextSize, resolveLayout, toSaved,
  type CardSize, type CardSpec, type ResolvedLayout,
} from '@/lib/cardLayout';
import { useLongPress } from '@/hooks/useLongPress';
import { FixedPortal } from '@/components/FixedPortal';
import { usePageFab } from '@/components/QuickAdd';
import { showUndoToast } from '@/components/ui/undo-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { hapticTap, hapticTick } from '@/lib/haptics';
import { Check, GripHorizontal, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';

/**
 * A page of cards you can rearrange, like widgets on an Android home screen.
 *
 *   • Hold any card (about half a second) → edit mode.
 *   • In edit mode, hold a card briefly and drag it to a new spot. A quick swipe still
 *     scrolls the page, and dragging near the top or bottom edge scrolls for you.
 *   • The size chip (1×1 / 2×1 / 2×2) steps the card through its sizes; − hides it.
 *   • "Add card" brings a hidden card back; "Reset" restores the page's default layout.
 *   • Done, or the phone's back button, leaves edit mode.
 *
 * Layouts are saved per page in app state (see lib/cardLayout.ts), so they survive restarts
 * and travel with backups.
 *
 * Touch handling, and why it is shaped like this: the page scrolls inside <main> with
 * PASSIVE touch listeners everywhere, which keeps scrolling smooth on Android. Stopping a
 * scroll so a card can follow the finger needs a non-passive touchmove listener, and the
 * browser only honours one that already existed when the finger went down. So that
 * listener is added only while edit mode is on — normal browsing keeps its smooth scroll,
 * and the hold that ENTERS edit mode is a separate gesture from the drag that follows.
 */

export interface GridCard extends CardSpec {
  title: string;
  icon: React.ElementType;
  /** Draws the card at the given size. */
  render: (size: CardSize) => React.ReactNode;
  /** False while the card has nothing to show (no debts yet, say). It is left out of the
   *  page then, and edit mode shows a placeholder with `emptyHint` so it can still be placed. */
  available?: boolean;
  emptyHint?: string;
}

const EDIT_HOLD_MS = 180;   // hold before a card lifts in edit mode (shorter = accidental lifts while scrolling)
const HOLD_SLOP = 8;        // px a finger may drift during that hold before it counts as a scroll
const EDGE_ZONE = 110;      // px from the screen's top/bottom where a drag starts scrolling the page
const MAX_SCROLL_STEP = 14; // px per frame at the very edge

const SPRING = { type: 'spring' as const, stiffness: 520, damping: 42, mass: 0.8 };

export function CardGrid({ pageId, cards, active, className }: {
  /** Key the layout is saved under. */
  pageId: string;
  cards: GridCard[];
  /** False while the page is off screen — leaves edit mode so it never lingers unseen. */
  active: boolean;
  className?: string;
}) {
  const { cardLayouts, setCardLayout, setPageSwipeLocked } = useContext(AppDataContext);
  const saved = cardLayouts?.[pageId];
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const layout = useMemo(() => resolveLayout(cards, saved), [cards, saved]);

  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // While a card is being dragged the order lives here, and is saved once, on drop.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  // The card that is lifted: under the finger, or flying home after the drop.
  const [liftedId, setLiftedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!dragOrder) return layout.visible;
    const sizes = new Map(layout.visible.map(c => [c.id, c.size]));
    return dragOrder.filter(id => sizes.has(id)).map(id => ({ id, size: sizes.get(id)! }));
  }, [layout.visible, dragOrder]);
  const orderRef = useRef<string[]>([]);
  orderRef.current = visible.map(c => c.id);

  const save = useCallback((next: ResolvedLayout) => setCardLayout(pageId, toSaved(next)), [pageId, setCardLayout]);
  // What the drop handler needs, read at drop time. Keeping it in a ref gives the drag
  // handlers a stable identity, so a re-render mid-drag (new data arriving) cannot tear
  // down the listeners and end the drag early.
  const latest = useRef({ layout, byId, save });
  latest.current = { layout, byId, save };

  // ── Entering and leaving edit mode ──
  const enterEdit = useCallback(() => { hapticTap(); setEditing(true); }, []);
  const exitEdit = useCallback(() => { setEditing(false); setAddOpen(false); }, []);

  useEffect(() => { if (!active) exitEdit(); }, [active, exitEdit]);
  // No sideways page-swipes while arranging — a drag would otherwise flick the whole page.
  useEffect(() => {
    if (!editing) return;
    setPageSwipeLocked(true);
    return () => setPageSwipeLocked(false);
  }, [editing, setPageSwipeLocked]);
  // The quick-add FAB sits where the edit toolbar goes; stand it down meanwhile.
  usePageFab(editing);
  // Escape (and the Android back button, which sends Escape while the toolbar is up)
  // leaves edit mode — unless a dialog (the Add-card sheet) is open, in which case that
  // Escape is the dialog's. Checked on window in the CAPTURE phase, before Radix sees the
  // key: Radix closes the sheet synchronously, so by the time a later listener ran, the
  // sheet would already be gone and the same Escape would close edit mode too.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      exitEdit();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, exitEdit]);

  // ── Dragging ──
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const drag = useRef<{
    id: string;
    pointerId: number;
    /** Where the finger is now, in viewport px. */
    px: number; py: number;
    /** Finger offset inside the card when it was lifted, so the card does not jump. */
    grabX: number; grabY: number;
    /** The card last swapped with — not swapped back until the finger leaves it. */
    lastSwap: string | null;
    raf: number;
  } | null>(null);
  const pending = useRef<{
    id: string; pointerId: number; mouse: boolean;
    sx: number; sy: number; px: number; py: number;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);

  /** Top-left of a card's resting slot in viewport px. offsetLeft/offsetTop ignore
   *  transforms, so this is where the card BELONGS, not where it is being drawn. */
  const slotOf = (el: HTMLDivElement) => {
    const box = containerRef.current!.getBoundingClientRect();
    return { left: box.left + el.offsetLeft, top: box.top + el.offsetTop };
  };

  const place = useCallback(() => {
    const d = drag.current;
    const el = d && cardEls.current.get(d.id);
    if (!d || !el || !containerRef.current) return;
    const slot = slotOf(el);
    x.set(d.px - d.grabX - slot.left);
    y.set(d.py - d.grabY - slot.top);
  }, [x, y]);

  const hitTest = useCallback(() => {
    const d = drag.current;
    if (!d || !containerRef.current) return;
    let over: string | null = null;
    for (const id of orderRef.current) {
      if (id === d.id) continue;
      const el = cardEls.current.get(id);
      if (!el) continue;
      const s = slotOf(el);
      if (d.px >= s.left && d.px <= s.left + el.offsetWidth && d.py >= s.top && d.py <= s.top + el.offsetHeight) {
        over = id;
        break;
      }
    }
    if (over == null) { d.lastSwap = null; return; }
    if (over === d.lastSwap) return;
    d.lastSwap = over;
    const cur = orderRef.current;
    setDragOrder(moveItem(cur, cur.indexOf(d.id), cur.indexOf(over)));
    hapticTick();
  }, []);

  // After a reorder the lifted card's slot has moved; keep it under the finger.
  useLayoutEffect(() => { place(); }, [dragOrder, place]);

  const autoScroll = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    const main = document.querySelector('main');
    if (main) {
      let step = 0;
      if (d.py < EDGE_ZONE) step = -MAX_SCROLL_STEP * Math.min(1, (EDGE_ZONE - d.py) / EDGE_ZONE);
      else if (d.py > window.innerHeight - EDGE_ZONE) step = MAX_SCROLL_STEP * Math.min(1, (d.py - (window.innerHeight - EDGE_ZONE)) / EDGE_ZONE);
      if (step !== 0) {
        const before = main.scrollTop;
        main.scrollTop += step;
        if (main.scrollTop !== before) { place(); hitTest(); }
      }
    }
    d.raf = requestAnimationFrame(autoScroll);
  }, [place, hitTest]);

  const lift = useCallback((id: string, pointerId: number, px: number, py: number) => {
    const el = cardEls.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set(0); y.set(0);
    drag.current = { id, pointerId, px, py, grabX: px - r.left, grabY: py - r.top, lastSwap: null, raf: 0 };
    drag.current.raf = requestAnimationFrame(autoScroll);
    setLiftedId(id);
    setDragOrder(orderRef.current.slice());
    hapticTap();
  }, [x, y, autoScroll]);

  const drop = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    drag.current = null;
    const { layout: cur, byId: specs, save: commit } = latest.current;
    const sizes = new Map(cur.visible.map(c => [c.id, c.size]));
    commit({
      visible: orderRef.current.map(id => ({ id, size: sizes.get(id) ?? specs.get(id)?.defaultSize ?? 'wide' })),
      hidden: cur.hidden,
    });
    setDragOrder(null);
    const id = d.id;
    // Fly home, then let the card rejoin the layout animations.
    let settled = 0;
    const done = () => { if (++settled === 2) setLiftedId(cur => (cur === id ? null : cur)); };
    animate(x, 0, { ...SPRING, onComplete: done });
    animate(y, 0, { ...SPRING, onComplete: done });
  }, [x, y]);

  // Window-level tracking for the hold and the drag. Only mounted in edit mode.
  useEffect(() => {
    if (!editing) return;
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (p && e.pointerId === p.pointerId) {
        p.px = e.clientX; p.py = e.clientY;
        const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
        // A mouse lifts as soon as it moves; a finger that moves before the hold is up is
        // scrolling, so let it.
        if (p.mouse) {
          if (dx * dx + dy * dy > 16) { clearTimeout(p.timer); pending.current = null; lift(p.id, p.pointerId, e.clientX, e.clientY); }
        } else if (dx * dx + dy * dy > HOLD_SLOP * HOLD_SLOP) {
          clearTimeout(p.timer); pending.current = null;
        }
        return;
      }
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.px = e.clientX; d.py = e.clientY;
      place();
      hitTest();
    };
    const onUp = (e: PointerEvent) => {
      const p = pending.current;
      if (p && e.pointerId === p.pointerId) { clearTimeout(p.timer); pending.current = null; }
      if (drag.current && e.pointerId === drag.current.pointerId) drop();
    };
    // Registered BEFORE any finger lands (see the file comment), so preventDefault is
    // honoured: while a card is lifted the page must not scroll under it.
    const container = containerRef.current;
    const blockScroll = (e: TouchEvent) => { if (drag.current) e.preventDefault(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    container?.addEventListener('touchmove', blockScroll, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      container?.removeEventListener('touchmove', blockScroll);
      if (pending.current) { clearTimeout(pending.current.timer); pending.current = null; }
      if (drag.current) drop();
    };
  }, [editing, lift, drop, place, hitTest]);

  const onEditPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag.current || pending.current) return;
    const { pointerId, clientX, clientY } = e;
    const mouse = e.pointerType === 'mouse';
    // A finger has to hold still briefly first (see onMove); a mouse lifts when it moves.
    const timer = mouse ? undefined : setTimeout(() => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      lift(p.id, p.pointerId, p.px, p.py);
    }, EDIT_HOLD_MS);
    pending.current = { id, pointerId, mouse, sx: clientX, sy: clientY, px: clientX, py: clientY, timer };
  }, [lift]);

  // ── Resize, hide, add, reset ──
  const resize = (id: string) => {
    const spec = byId.get(id);
    if (!spec) return;
    hapticTick();
    save({
      visible: layout.visible.map(c => (c.id === id ? { id, size: nextSize(spec, c.size) } : c)),
      hidden: layout.hidden,
    });
  };
  const hide = (id: string) => {
    hapticTick();
    save({ visible: layout.visible.filter(c => c.id !== id), hidden: [...layout.hidden, id] });
  };
  const reveal = (id: string) => {
    const spec = byId.get(id);
    if (!spec) return;
    hapticTap();
    save({
      visible: [...layout.visible, { id, size: spec.defaultSize }],
      hidden: layout.hidden.filter(h => h !== id),
    });
  };
  const reset = () => {
    const before = saved;
    hapticTap();
    setCardLayout(pageId, null);
    if (before) showUndoToast('Layout reset', () => setCardLayout(pageId, before));
  };

  return (
    <>
      {editing && (
        <p className="mb-2 rounded-2xl bg-accent/10 px-3 py-2 text-[11px] text-foreground/80">
          Hold a card, then drag it to move it. Tap the size (like 2×1) to resize it, or − to hide it.
        </p>
      )}

      <div
        ref={containerRef}
        className={cn('relative grid grid-cols-2 gap-3', className)}
      >
        {visible.map(({ id, size }) => {
          const card = byId.get(id);
          if (!card) return null;
          const available = card.available !== false;
          // Outside edit mode an empty card simply is not there.
          if (!editing && !available) return null;
          const lifted = liftedId === id;
          return (
            <GridItem
              key={id}
              card={card}
              size={size}
              editing={editing}
              available={available}
              lifted={lifted}
              x={lifted ? x : undefined}
              y={lifted ? y : undefined}
              setEl={el => { if (el) cardEls.current.set(id, el); else cardEls.current.delete(id); }}
              onHold={enterEdit}
              onEditPointerDown={e => onEditPointerDown(id, e)}
              onResize={card.sizes.length > 1 ? () => resize(id) : undefined}
              onHide={() => hide(id)}
            />
          );
        })}
      </div>

      {editing && (
        <FixedPortal>
          <div
            // data-back-dismiss: the Android back button (HardwareBackButton) sends Escape
            // while this is on screen, which leaves edit mode instead of leaving the page.
            role="toolbar"
            aria-label="Edit card layout"
            data-back-dismiss=""
            className="fixed left-1/2 -translate-x-1/2 z-40 flex w-max max-w-[calc(100vw-16px)] items-center gap-1 whitespace-nowrap rounded-full border border-border/70 bg-card/95 backdrop-blur-md p-1.5 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ bottom: 'calc(14px + var(--sab))' }}
          >
            <button
              onClick={() => { hapticTick(); setAddOpen(true); }}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground hover:bg-foreground/10 active:bg-foreground/15"
            >
              <Plus className="h-4 w-4" /> Add card
              {layout.hidden.length > 0 && (
                <span className="rounded-full bg-accent/20 px-1.5 text-[10px] tabular-nums text-accent">{layout.hidden.length}</span>
              )}
            </button>
            <button
              onClick={reset}
              disabled={!saved}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-foreground/10 active:bg-foreground/15 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button
              onClick={() => { hapticTap(); exitEdit(); }}
              className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-xs font-bold text-btn-on-accent active:bg-accent/85"
            >
              <Check className="h-4 w-4" /> Done
            </button>
          </div>
        </FixedPortal>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a card</DialogTitle>
            <DialogDescription>
              {layout.hidden.length > 0
                ? 'Tap one to put it back on the page. It goes at the bottom - drag it wherever you like.'
                : 'Every card is already on the page. Hide one with − to tuck it away here.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {layout.hidden.map(id => {
              const card = byId.get(id);
              if (!card) return null;
              const Icon = card.icon;
              return (
                <button
                  key={id}
                  onClick={() => reveal(id)}
                  className="flex w-full items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-left active:bg-muted/70"
                >
                  <Icon className="h-4 w-4 shrink-0 text-accent" />
                  <span className="flex-1 text-sm font-semibold text-foreground">{card.title}</span>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GridItem({
  card, size, editing, available, lifted, x, y, setEl, onHold, onEditPointerDown, onResize, onHide,
}: {
  card: GridCard;
  size: CardSize;
  editing: boolean;
  available: boolean;
  lifted: boolean;
  x?: MotionValue<number>;
  y?: MotionValue<number>;
  setEl: (el: HTMLDivElement | null) => void;
  onHold: () => void;
  onEditPointerDown: (e: React.PointerEvent) => void;
  onResize?: () => void;
  onHide: () => void;
}) {
  // Outside edit mode a hold anywhere on the card starts editing; the click that trails
  // the hold is swallowed by the hook, so it never also presses a button in the card.
  const hold = useLongPress(onHold, { enabled: !editing });
  const Icon = card.icon;

  return (
    <motion.div
      ref={setEl}
      data-card-id={card.id}
      // Siblings glide into their new slots; the lifted card follows the finger instead.
      layout={!lifted}
      transition={SPRING}
      style={{ x, y, zIndex: lifted ? 30 : undefined }}
      className={cn(
        'relative min-w-0 select-none',
        size === 'small' ? 'col-span-1' : 'col-span-2',
      )}
      {...(editing ? { onPointerDown: onEditPointerDown } : hold)}
    >
      <div
        className={cn(
          'h-full transition-transform duration-150',
          editing && 'pointer-events-none',
          editing && !lifted && 'scale-[0.97]',
          lifted && 'scale-[1.03] drop-shadow-2xl',
        )}
      >
        {available ? card.render(size) : (
          <div className="flex h-full min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-muted-foreground/30 bg-card/60 p-4 text-center">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">{card.title}</p>
            {card.emptyHint && <p className="text-[10px] text-muted-foreground">{card.emptyHint}</p>}
          </div>
        )}
      </div>

      {editing && (
        <>
          {/* The outline says "this is movable" without covering what the card shows. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-accent/50" />
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-card/90 px-1.5 text-accent">
            <GripHorizontal className="h-3.5 w-3.5" />
          </span>
          <button
            aria-label={`Hide ${card.title}`}
            onPointerDown={e => e.stopPropagation()}
            onClick={onHide}
            className="absolute -right-1.5 -top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-btn-on-destructive shadow-md active:scale-95"
          >
            <Minus className="h-4 w-4" strokeWidth={3} />
          </button>
          {onResize && (
            <button
              aria-label={`Resize ${card.title}, now ${CARD_SIZE_LABEL[size]}`}
              onPointerDown={e => e.stopPropagation()}
              onClick={onResize}
              className="absolute -bottom-1.5 -right-1.5 z-10 flex h-7 items-center gap-1 rounded-full bg-accent px-2 text-[10px] font-bold tabular-nums text-btn-on-accent shadow-md active:scale-95"
            >
              <Maximize2 className="h-2.5 w-2.5" /> {CARD_SIZE_LABEL[size]}
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}
