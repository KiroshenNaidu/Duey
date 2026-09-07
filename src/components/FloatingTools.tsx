'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Calculator, StickyNote } from 'lucide-react';
import { SwipeLaunchFab, type ThrowOrigin } from './SwipeLaunchFab';

// The two launch BUTTONS stay eager — they're part of the home page's first painted frame,
// so they can never pop in late. The PANELS behind them are code-split: neither is on screen
// at boot, and both are warmed in the background moments afterwards (prefetch.ts tier 1,
// where they lead the queue because the quick-nav radial routes straight into them).
const QuickNotepad = dynamic(() => import('./QuickNotepad').then(m => ({ default: m.QuickNotepad })), { ssr: false });
const FloatingCalculator = dynamic(() => import('./FloatingCalculator').then(m => ({ default: m.FloatingCalculator })), { ssr: false });

export function FloatingTools() {
  const pathname = usePathname();
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Mount latches. A panel is mounted the first time it opens and then STAYS mounted, so its
  // in-progress state (the calculator's running expression and tape) survives a close/reopen
  // exactly as it did when both panels were mounted from boot.
  const [calcMounted, setCalcMounted] = useState(false);
  const [notepadMounted, setNotepadMounted] = useState(false);

  // How each panel was opened. A flick off a corner FAB passes the throw's origin and
  // heading down to the panel, which then grows out of that point along that heading. A
  // plain tap — or a quick-add shortcut, which has no corner to fly out of — passes null
  // and keeps the quiet slide-down both panels have always had.
  const [calcThrow, setCalcThrow] = useState<ThrowOrigin | null>(null);
  const [notepadThrow, setNotepadThrow] = useState<ThrowOrigin | null>(null);
  const openCalculator = useCallback((from: ThrowOrigin | null) => {
    setCalcThrow(from);
    setIsCalculatorOpen(true);
  }, []);
  const openNotepad = useCallback((from: ThrowOrigin | null) => {
    setNotepadThrow(from);
    setIsNotepadOpen(true);
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // The quick-add "Calc" / "Notes" shortcuts open either panel from ANY page (both are
  // mounted app-wide; only their bottom corner buttons are home-only).
  useEffect(() => {
    const onCalc = () => openCalculator(null);
    const onNotes = () => openNotepad(null);
    window.addEventListener('duey:open-calculator', onCalc);
    window.addEventListener('duey:open-notes', onNotes);
    return () => {
      window.removeEventListener('duey:open-calculator', onCalc);
      window.removeEventListener('duey:open-notes', onNotes);
    };
  }, [openCalculator, openNotepad]);

  useEffect(() => { if (isCalculatorOpen) setCalcMounted(true); }, [isCalculatorOpen]);
  useEffect(() => { if (isNotepadOpen) setNotepadMounted(true); }, [isNotepadOpen]);

  if (!isClient) {
    return null;
  }

  const onHome = pathname === '/';

  return (
    <>
      {/* Notepad launch button — home page only. Same deal as the calculator: tap toggles,
          thumb-and-flick in any direction throws the panel out with a bounce. */}
      {onHome && (
        <SwipeLaunchFab
          tourId="tools-notepad"
          className="right-4"
          style={{ bottom: 'calc(10px + var(--sab))' }}
          ariaLabel="Quick notepad — tap, or swipe to open"
          icon={<StickyNote className="h-5 w-5" />}
          onTap={() => { if (isNotepadOpen) setIsNotepadOpen(false); else openNotepad(null); }}
          onLaunch={from => openNotepad(from)}
        />
      )}

      {/* Calculator launch button — home page only. Tap toggles it as before; thumbing
          the button and flicking it in ANY direction throws the panel onto the screen with
          a bounce (see SwipeLaunchFab, which borrows the quick-add radial's gesture
          vocabulary for a single destination that direction cannot disambiguate). */}
      {onHome && (
        <SwipeLaunchFab
          tourId="tools-calc"
          className="left-4"
          style={{ bottom: 'calc(10px + var(--sab))' }}
          ariaLabel="Calculator — tap, or swipe to open"
          icon={<Calculator className="h-5 w-5" />}
          onTap={() => { if (isCalculatorOpen) setIsCalculatorOpen(false); else openCalculator(null); }}
          onLaunch={from => openCalculator(from)}
        />
      )}

      {/* Panels — mounted app-wide from first use so the quick-add shortcuts can open them */}
      {notepadMounted && <QuickNotepad isOpen={isNotepadOpen} throwFrom={notepadThrow} onClose={() => setIsNotepadOpen(false)} />}
      {calcMounted && <FloatingCalculator isOpen={isCalculatorOpen} throwFrom={calcThrow} onClose={() => setIsCalculatorOpen(false)} />}
    </>
  );
}
