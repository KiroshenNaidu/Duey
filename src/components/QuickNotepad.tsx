'use client';
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { StickyNote, X, Trash2 } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from './ui/card';

const DraggableNotepadBox = ({ 
  children, 
  onClose, 
  isOpen, 
  onClear 
}: { 
  children: React.ReactNode, 
  onClose: () => void, 
  isOpen: boolean,
  onClear: () => void
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen && boxRef.current) {
      const { innerWidth, innerHeight } = window;
      const { offsetWidth, offsetHeight } = boxRef.current;
      // Initialize position to bottom right, above the button
      setPosition({
        x: innerWidth - offsetWidth - 20,
        y: innerHeight - offsetHeight - 100,
      });
    }
  }, [isOpen]);

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
    if (e.type === 'touchmove') e.preventDefault();
    
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
    window.addEventListener('touchmove', onDrag, { passive: false });
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchend', onDragEnd);

    return () => {
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('touchmove', onDrag);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchend', onDragEnd);
    };
  }, [onDrag, onDragEnd]);

  if (!isOpen) return null;

  return (
    <div
      ref={boxRef}
      className="fixed z-[110] w-[85vw] max-w-[320px] h-[40vh]"
      style={{ left: `${position.x}px`, top: `${position.y}px`, touchAction: 'none' }}
    >
      <Card className="h-full shadow-2xl bg-card/90 backdrop-blur-md border border-accent/20 flex flex-col overflow-hidden rounded-2xl">
         <CardHeader 
           onMouseDown={onDragStart} 
           onTouchStart={onDragStart}
           className="cursor-move p-3 flex flex-row items-center justify-between border-b border-accent/10 flex-shrink-0"
         >
          <span className="font-bold text-xs uppercase tracking-wider opacity-90">Quick Notepad</span>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors" 
              onClick={onClear}
            >
              <Trash2 size={16} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-primary hover:bg-primary/10 transition-colors" 
              onClick={onClose}
            >
              <X size={24} strokeWidth={2.5} />
            </Button>
          </div>
         </CardHeader>
         <CardContent className="p-4 flex-1 overflow-hidden">
          {children}
         </CardContent>
      </Card>
    </div>
  );
};

export function QuickNotepad() {
  const { notepadContent, setNotepadContent } = useContext(AppDataContext);
  const [isOpen, setIsOpen] = useState(false);

  const handleClear = () => {
    setNotepadContent('');
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="icon" 
        className="fixed bottom-20 right-4 z-[60] h-12 w-12 rounded-full shadow-lg bg-card/80 backdrop-blur-sm border-2 border-accent/30"
        onClick={() => setIsOpen(prev => !prev)}
      >
        <StickyNote className="h-5 w-5" />
      </Button>

      <DraggableNotepadBox 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)}
        onClear={handleClear}
      >
        <Textarea
          value={notepadContent}
          onChange={(e) => setNotepadContent(e.target.value)}
          className={cn(
            "w-full h-full text-sm bg-transparent resize-none border-none p-0",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "placeholder:text-muted-foreground/40"
          )}
          placeholder="Jot down some notes..."
        />
      </DraggableNotepadBox>
    </>
  );
}