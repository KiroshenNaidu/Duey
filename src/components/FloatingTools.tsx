'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { Calculator, StickyNote } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';

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

  useEffect(() => {
    setIsClient(true);
  }, []);

  // The quick-add "Calc" / "Notes" shortcuts open either panel from ANY page (both are
  // mounted app-wide; only their bottom corner buttons are home-only).
  useEffect(() => {
    const onCalc = () => setIsCalculatorOpen(true);
    const onNotes = () => setIsNotepadOpen(true);
    window.addEventListener('duey:open-calculator', onCalc);
    window.addEventListener('duey:open-notes', onNotes);
    return () => {
      window.removeEventListener('duey:open-calculator', onCalc);
      window.removeEventListener('duey:open-notes', onNotes);
    };
  }, []);

  useEffect(() => { if (isCalculatorOpen) setCalcMounted(true); }, [isCalculatorOpen]);
  useEffect(() => { if (isNotepadOpen) setNotepadMounted(true); }, [isNotepadOpen]);

  if (!isClient) {
    return null;
  }

  const onHome = pathname === '/';

  return (
    <>
      {/* Notepad launch button — home page only */}
      {onHome && (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-4 z-[60] h-12 w-12 rounded-full shadow-lg bg-card border-2 border-accent/30"
          style={{ bottom: 'calc(10px + var(--sab))' }}
          onClick={() => { hapticTap(); setIsNotepadOpen(prev => !prev); }}
        >
          <StickyNote className="h-5 w-5" />
        </Button>
      )}

      {/* Calculator launch button — home page only */}
      {onHome && (
        <div className="fixed left-4 z-[60]" style={{ bottom: 'calc(10px + var(--sab))' }}>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg bg-card border-2 border-accent/30"
            onClick={() => { hapticTap(); setIsCalculatorOpen(prev => !prev); }}
          >
            <Calculator className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Panels — mounted app-wide from first use so the quick-add shortcuts can open them */}
      {notepadMounted && <QuickNotepad isOpen={isNotepadOpen} onClose={() => setIsNotepadOpen(false)} />}
      {calcMounted && <FloatingCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />}
    </>
  );
}
