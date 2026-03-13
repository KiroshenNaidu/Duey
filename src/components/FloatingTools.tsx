'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Calculator } from 'lucide-react';
import { QuickNotepad } from './QuickNotepad';
import { FloatingCalculator } from './FloatingCalculator';

export function FloatingTools() {
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return (
    <>
      <QuickNotepad />
      <div className="fixed bottom-24 left-6 z-40">
         <Button
          variant="outline"
          size="icon"
          className="h-16 w-16 rounded-full shadow-lg bg-card/80 backdrop-blur-sm border-2 border-primary/20"
          onClick={() => setIsCalculatorOpen(true)}
        >
          <Calculator />
        </Button>
      </div>

      <FloatingCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </>
  );
}
