'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { Calculator } from 'lucide-react';
import { QuickNotepad } from './QuickNotepad';
import { FloatingCalculator } from './FloatingCalculator';

export function FloatingTools() {
  const pathname = usePathname();
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // The quick-add "Calc" shortcut opens the calculator from ANY page (the panel is now
  // mounted app-wide; only its bottom-left button is home-only).
  useEffect(() => {
    const onOpen = () => setIsCalculatorOpen(true);
    window.addEventListener('duey:open-calculator', onOpen);
    return () => window.removeEventListener('duey:open-calculator', onOpen);
  }, []);

  if (!isClient) {
    return null;
  }

  const onHome = pathname === '/';

  return (
    <>
      {/* Notepad panel + its button (button gated to home inside QuickNotepad) */}
      <QuickNotepad showButton={onHome} />

      {/* Calculator launch button — home page only */}
      {onHome && (
        <div className="fixed left-4 z-[60]" style={{ bottom: 'calc(10px + var(--sab))' }}>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg bg-card border-2 border-accent/30"
            onClick={() => setIsCalculatorOpen(prev => !prev)}
          >
            <Calculator className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Calculator panel — mounted everywhere so the quick-add shortcut can open it */}
      <FloatingCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </>
  );
}
