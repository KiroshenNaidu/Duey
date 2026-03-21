'use client';
import { useContext, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { StickyNote, X } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { cn } from '@/lib/utils';

export function QuickNotepad() {
  const { notepadContent, setNotepadContent } = useContext(AppDataContext);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="fixed bottom-20 right-4 z-[60] h-12 w-12 rounded-full shadow-lg bg-card/80 backdrop-blur-sm border-2 border-accent/30"
        >
          <StickyNote className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[85vw] sm:w-[40vw] max-w-md h-[45vh] bg-card/90 backdrop-blur-md p-4 border border-accent/10 mb-4 mr-4 shadow-2xl rounded-2xl flex flex-col" 
        side="top"
        align="end"
      >
        <div className="flex flex-row items-center justify-between pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider opacity-90 text-foreground">Quick Notepad</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-accent/10 transition-colors"
          >
            <X className="h-6 w-6 text-primary" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="flex flex-col h-full py-2">
          <Textarea
            value={notepadContent}
            onChange={(e) => setNotepadContent(e.target.value)}
            className={cn(
              "flex-1 text-sm bg-background/30 h-full resize-none border-none",
              "focus-visible:ring-0 focus-visible:ring-offset-0", // No colourful outline
              "placeholder:text-muted-foreground/40"
            )}
            placeholder="Jot down some notes..."
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}