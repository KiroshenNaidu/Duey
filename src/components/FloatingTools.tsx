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

  if (!isClient) {
    return null;
  }

  // ONLY render the calculator and notes button on the Debt (home) page
  if (pathname !== '/') {
    return null;
  }

  return (
    <>
      <QuickNotepad />
      <div className="fixed bottom-20 left-4 z-[60]">
         <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg bg-card/80 backdrop-blur-sm border-2 border-accent/30"
          onClick={() => setIsCalculatorOpen(prev => !prev)}
        >
          <Calculator className="h-5 w-5" />
        </Button>
      </div>

      <FloatingCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </>
  );
}
