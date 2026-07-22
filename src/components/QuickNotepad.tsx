'use client';
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { StickyNote, X, Trash2 } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { cn } from '@/lib/utils';
import { acquireOverlayBlur, releaseOverlayBlur } from '@/lib/overlayBlur';
import { hapticTap } from '@/lib/haptics';
import { FixedPortal } from '@/components/FixedPortal';

type SaveState = 'saved' | 'saving';

const DraggableNotepadBox = ({
  children,
  onClose,
  onClear,
  charCount,
  saveState,
}: {
  children: React.ReactNode,
  onClose: () => void,
  onClear: () => void,
  charCount: number,
  saveState: SaveState,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);
  const isDraggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  // Open near the TOP of the screen (just under the fixed top nav) so it's within easy
  // thumb reach instead of buried at the bottom. Centred horizontally; still fully
  // draggable from the header afterwards. navBottom is measured live so the notch/safe
  // area is accounted for on every device.
  useEffect(() => {
    if (!boxRef.current) return;
    const { innerWidth } = window;
    const { offsetWidth } = boxRef.current;
    const navBottom = document.querySelector('nav')?.getBoundingClientRect().bottom ?? 56;
    setPosition({
      x: Math.max(12, Math.round((innerWidth - offsetWidth) / 2)),
      y: Math.round(navBottom + 12),
    });
    setPlaced(true);
  }, []);

  // Blur the whole app uniformly while open (same mechanism dialogs/quick-add use).
  // The old backdrop-filter blur sampled page layers inconsistently — big page titles
  // stayed sharp while card text went mushy — and left the FABs floating unblurred.
  useEffect(() => {
    const token = acquireOverlayBlur();
    return () => releaseOverlayBlur(token);
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    if (boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      offsetRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    }
  }, []);

  const onDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDraggingRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setPosition({
      x: clientX - offsetRef.current.x,
      y: clientY - offsetRef.current.y,
    });
  }, []);

  const onDragEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag, { passive: true });
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchend', onDragEnd);

    return () => {
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('touchmove', onDrag);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchend', onDragEnd);
    };
  }, [onDrag, onDragEnd]);

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
      <motion.div
        ref={boxRef}
        className="fixed z-[110] w-[88vw] max-w-[340px] h-[44vh]"
        style={{ left: `${position.x}px`, top: `${position.y}px`, touchAction: 'none' }}
        // Slide DOWN into place from just above — reads as "dropping in from the top".
        // Held invisible until the top position is measured so it never flashes at 0,0.
        initial={{ opacity: 0, scale: 0.94, y: -14 }}
        animate={{ opacity: placed ? 1 : 0, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -14 }}
        transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.18 }}
      >
        {/* aurora-dialog: the app's themed rotating-gradient ring (matches every modal).
            `border bg-background` is the fallback chrome under the glass/minimal/elevated
            UI styles, where the aurora selector bows out — same pattern as DialogContent. */}
        <div className="aurora-dialog h-full flex flex-col overflow-hidden rounded-2xl border bg-background">
          {/* ── Header / drag handle ── */}
          <div
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
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
    </FixedPortal>
  );
};

export function QuickNotepad({ showButton = true }: { showButton?: boolean }) {
  const { notepadContent, setNotepadContent } = useContext(AppDataContext);
  const [isOpen, setIsOpen] = useState(false);
  const [localContent, setLocalContent] = useState(notepadContent);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The quick-add "Notes" shortcut opens the notepad from any page.
  useEffect(() => {
    const onOpen = () => setIsOpen(true);
    window.addEventListener('duey:open-notes', onOpen);
    return () => window.removeEventListener('duey:open-notes', onOpen);
  }, []);

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
      {showButton && (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-4 z-[60] h-12 w-12 rounded-full shadow-lg bg-card border-2 border-accent/30"
          style={{ bottom: 'calc(10px + var(--sab))' }}
          onClick={() => { hapticTap(); setIsOpen(prev => !prev); }}
        >
          <StickyNote className="h-5 w-5" />
        </Button>
      )}

      <AnimatePresence>
        {isOpen && (
          <DraggableNotepadBox
            onClose={() => setIsOpen(false)}
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
