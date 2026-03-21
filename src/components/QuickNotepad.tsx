'use client';
import { useContext } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from './ui/sheet';
import { StickyNote, X } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { cn } from '@/lib/utils';

export function QuickNotepad() {
  const { notepadContent, setNotepadContent } = useContext(AppDataContext);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="fixed bottom-20 right-4 z-[60] h-12 w-12 rounded-full shadow-lg bg-card/80 backdrop-blur-sm border-2 border-accent/30"
        >
          <StickyNote className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent 
        className="w-[40%] sm:w-[40%] max-w-none bg-card/90 backdrop-blur-md p-4 border-l border-accent/10" 
        side="right"
        // Custom close button is handled inside the header for better access
      >
        <SheetHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <SheetTitle className="text-sm font-bold uppercase tracking-wider opacity-90">Quick Notepad</SheetTitle>
          <SheetClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-accent/10 transition-colors">
            <X className="h-5 w-5 text-primary" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col h-[calc(100%-3rem)] py-2">
          <Textarea
            value={notepadContent}
            onChange={(e) => setNotepadContent(e.target.value)}
            className={cn(
              "flex-1 text-sm bg-background/30 h-full resize-none border-none",
              "focus-visible:ring-0 focus-visible:ring-offset-0", // Remove colorful outline
              "placeholder:text-muted-foreground/40"
            )}
            placeholder="Jot down some notes..."
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
