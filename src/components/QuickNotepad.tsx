'use client';
import { useContext } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { StickyNote } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';

export function QuickNotepad() {
  const { notepadContent, setNotepadContent } = useContext(AppDataContext);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="fixed bottom-20 right-4 z-[60] h-12 w-12 rounded-full shadow-lg bg-card/80 backdrop-blur-sm border-2 border-accent/30">
          <StickyNote className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[40%] sm:w-[40%] max-w-none bg-card/90 backdrop-blur-sm p-4" side="right">
        <SheetHeader>
          <SheetTitle className="text-sm">Quick Notepad</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col h-full py-2">
          <Textarea
            value={notepadContent}
            onChange={(e) => setNotepadContent(e.target.value)}
            className="flex-1 text-sm bg-background/50 h-full resize-none"
            placeholder="Jot down some notes..."
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
