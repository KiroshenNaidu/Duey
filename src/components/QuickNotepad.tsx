'use client';
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { StickyNote, X, Trash2 } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { cn } from '@/lib/utils';
import { acquireOverlayBlur, releaseOverlayBlur } from '@/lib/overlayBlur';
import { FixedPortal } from '@/components/FixedPortal';
import { useDraggablePanel } from '@/hooks/useDraggablePanel';
import type { ThrowOrigin } from '@/components/SwipeLaunchFab';

type SaveState = 'saved' | 'saving';

const DraggableNotepadBox = ({
  children,
  throwFrom,
  onClose,
  onClear,
  charCount,
  saveState,
}: {
  children: React.ReactNode,
  throwFrom: ThrowOrigin | null,
  onClose: () => void,
  onClear: () => void,
  charCount: number,
  saveState: SaveState,
}) => {
  // Placement + drag: one rAF-coalesced, transform-driven engine shared with the floating
  // calculator (see useDraggablePanel for why the old per-touchmove setState dragged).
  const { ref: boxRef, origin, placed, x, y, handleProps } = useDraggablePanel();

  // Blur the whole app uniformly while open (same mechanism dialogs/quick-add use).
  // The old backdrop-filter blur sampled page layers inconsistently — big page titles
  // stayed sharp while card text went mushy — and left the FABs floating unblurred.
  useEffect(() => {
    const token = acquireOverlayBlur();
    return () => releaseOverlayBlur(token);
  }, []);

  // Portaled to <body>: the overlay blur filters #app-root, which would blur the
  // notepad itself and re-anchor its position:fixed if it stayed in the subtree.
  return (
    <FixedPortal>
      <motion.div
        className="fixed inset-0 z-[105] bg-black/50"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />
      {/* Positioner. Owns nothing but WHERE the panel is: a resting origin in left/top and
          the drag's live offset as x/y MotionValues, written straight to this node's
          transform without a React render (useDraggablePanel). The entrance animation is a
          separate element inside it, so the two transforms can never fight over the node. */}
      <motion.div
        ref={boxRef}
        className="fixed z-[110] w-[88vw] max-w-[340px] h-[44vh]"
        style={{ left: origin.x, top: origin.y, x, y }}
      >
      <motion.div
        className="h-full w-full"
        style={{
          // The pivot the throw entrance grows from, in this box's own coordinates. Left
          // at the default centre for a tap, which must look exactly as it always did.
          transformOrigin: throwFrom ? `${throwFrom.x - origin.x}px ${throwFrom.y - origin.y}px` : undefined,
        }}
        // Two entrances. Tapped open, it slides DOWN into place from just above, as it
        // always has. THROWN open by a flick off a corner FAB, it grows out of that FAB
        // along the heading of the throw: transform-origin is moved to the FAB's centre
        // (a point well outside this box — perfectly legal, and the whole trick), so
        // scaling up from near-nothing reads as the window unfolding from under the thumb
        // rather than fading in where it will end up. It additionally starts a little way
        // BACK along the throw and tilts against it, so the first frames travel the way
        // the thumb did and the tilt settles out like something caught mid-flight. The
        // spring is underdamped (damping ratio ~0.42) — the overshoot IS the catch.
        // Either way it is held invisible until the top position is measured, so it never
        // flashes at 0,0.
        initial={throwFrom
          ? { opacity: 0, scale: 0.12, x: -throwFrom.dx * 40, y: -throwFrom.dy * 40, rotate: -throwFrom.dx * 6 }
          : { opacity: 0, scale: 0.94, y: -14 }}
        animate={{ opacity: placed ? 1 : 0, scale: 1, x: 0, y: 0, rotate: 0 }}
        // Exit is ALWAYS the quick tween, never the entrance spring. An underdamped
        // spring takes the better part of a second to settle, and AnimatePresence keeps
        // the whole subtree — including the full-screen backdrop — mounted until every
        // value lands. That backdrop then silently ate the next tap or swipe for a second
        // after each close. Closing should be brisk anyway; the bounce belongs to arrival.
        exit={{
          opacity: 0, scale: 0.94, y: -14,
          transition: { type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.15 },
        }}
        transition={throwFrom
          // damping 22 against stiffness 460 / mass 0.9 is a ratio of ~0.54 — about 13%
          // overshoot. Tuned DOWN from the 0.42 a free-standing card would want, because
          // the distant transform-origin turns scale overshoot into travel: with the pivot
          // ~750px away, every 1% of scale swings the card ~7px, and at 20% the notepad
          // sailed clean off the top of the screen before coming back. This still lands
          // with a visible catch, without the panel leaving the viewport to get it.
          ? { type: 'spring', stiffness: 460, damping: 22, mass: 0.9, opacity: { duration: 0.12 } }
          : { type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.18 }}
      >
        {/* aurora-dialog: the app's themed rotating-gradient ring (matches every modal).
            `border bg-background` is the fallback chrome under the glass/minimal/elevated
            UI styles, where the aurora selector bows out — same pattern as DialogContent. */}
        <div className="aurora-dialog h-full flex flex-col overflow-hidden rounded-2xl border bg-background">
          {/* ── Header / drag handle ── */}
          <div
            {...handleProps}
            className="cursor-move select-none flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40 flex-shrink-0"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <StickyNote size={16} />
            </span>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-[13px] font-bold text-foreground">Quick Notepad</p>
              <p className="text-[10px] text-muted-foreground">Drag to move · saves as you type</p>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                onClick={onClear}
                aria-label="Clear notes"
              >
                <Trash2 size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={onClose}
                aria-label="Close notepad"
              >
                <X size={18} strokeWidth={2.5} />
              </Button>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-hidden px-3.5 py-3">
            {children}
          </div>

          {/* ── Footer: live save state + character count ── */}
          <div className="flex items-center justify-between px-3.5 py-2 border-t border-border/40 text-[10px] font-medium text-muted-foreground flex-shrink-0">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  saveState === 'saved' ? 'bg-positive' : 'bg-accent animate-pulse'
                )}
              />
              {saveState === 'saved' ? 'Saved' : 'Saving…'}
            </span>
            <span className="tabular-nums">{charCount} {charCount === 1 ? 'char' : 'chars'}</span>
          </div>
        </div>
      </motion.div>
      </motion.div>
    </FixedPortal>
  );
};

// Pure panel: open state and the launch button live in FloatingTools, which also owns the
// 'duey:open-notes' quick-add shortcut. Keeping this component free of both is what lets
// FloatingTools code-split it without the home page's notepad button arriving late.
export function QuickNotepad({ isOpen, throwFrom = null, onClose }: { isOpen: boolean; throwFrom?: ThrowOrigin | null; onClose: () => void }) {
  const { notepadContent, setNotepadContent } = useContext(AppDataContext);
  const [localContent, setLocalContent] = useState(notepadContent);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync local content when the notepad opens so it reflects persisted state.
  // notepadContent intentionally omitted from deps — including it would reset mid-edit content on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isOpen) { setLocalContent(notepadContent); setSaveState('saved'); }
  }, [isOpen]);

  // Cleanup pending debounce on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleChange = useCallback((val: string) => {
    setLocalContent(val);
    setSaveState('saving');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setNotepadContent(val);
      setSaveState('saved');
    }, 300);
  }, [setNotepadContent]);

  const handleClear = useCallback(() => {
    setLocalContent('');
    clearTimeout(debounceRef.current);
    setNotepadContent('');
    setSaveState('saved');
  }, [setNotepadContent]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <DraggableNotepadBox
            throwFrom={throwFrom}
            onClose={onClose}
            onClear={handleClear}
            charCount={localContent.length}
            saveState={saveState}
          >
            <Textarea
              value={localContent}
              onChange={(e) => handleChange(e.target.value)}
              className={cn(
                "w-full h-full text-sm leading-relaxed bg-transparent resize-none border-none p-0",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-muted-foreground/40"
              )}
              placeholder="Jot down some notes…"
              autoFocus
            />
          </DraggableNotepadBox>
        )}
      </AnimatePresence>
    </>
  );
}
