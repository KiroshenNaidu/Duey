'use client';
import { useState, useContext } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { StickyNote, Sigma } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { AppDataContext } from '@/context/AppDataContext';

export function QuickNotepad() {
  const { notepadContent, setNotepadContent } = useContext(AppDataContext);
  const [total, setTotal] = useState<number | null>(null);

  const calculateTotal = () => {
    const numbers = notepadContent.match(/(\d{1,3}(,\d{3})*(\.\d+)?|\d+(\.\d+)?)/g) || [];
    const sum = numbers.reduce((acc, numStr) => {
      const cleanNumStr = numStr.replace(/,/g, '');
      return acc + parseFloat(cleanNumStr);
    }, 0);
    setTotal(sum);
  };

  return (
    <Sheet onOpenChange={() => setTotal(null)}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="fixed bottom-20 right-4 z-[60] h-12 w-12 rounded-full shadow-lg bg-card/80 backdrop-blur-sm border-2 border-accent/30">
          <StickyNote className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-md bg-card/90 backdrop-blur-sm" side="right">
        <SheetHeader>
          <SheetTitle>Quick Notepad</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col h-full py-4">
          <Textarea
            value={notepadContent}
            onChange={(e) => setNotepadContent(e.target.value)}
            className="flex-1 text-base bg-background/50 h-full"
            placeholder="Jot down some notes... e.g. Rent 500, Food 200, Savings 1500.25"
          />
          <div className="mt-4">
            <Button onClick={calculateTotal} className="w-full">
              <Sigma className="mr-2 h-4 w-4" /> Calculate Note
            </Button>
            {total !== null && (
              <p className="mt-2 text-center font-semibold text-lg">
                Total: <span className="font-mono text-primary">{formatCurrency(total)}</span>
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
