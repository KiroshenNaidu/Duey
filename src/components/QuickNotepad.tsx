'use client';
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { StickyNote, X, Trash2 } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from './ui/card';
import { acquireOverlayBlur, releaseOverlayBlur } from '@/lib/overlayBlur';
import { hapticTap } from '@/lib/haptics';
import { FixedPortal } from '@/components/FixedPortal';

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
    if (boxRef.current) {
      const { innerWidth, innerHeight } = window;
      const { offsetWidth, offsetHeight } = boxRef.current;
      setPosition({
        x: innerWidth - offsetWidth - 20,
        y: innerHeight - offsetHeight - 100,
      });
    }
  }, []);

  // Blur the whole app uniformly while open (same mechanism dialogs/quick-add use).
  // The old backdrop-filter blur sampled page layers inconsistently — big page titles
  // stayed sharp while card text went mushy — and left the FABs floating unblurred.
  useEffect(() => {
    const token = acquireOverlayBlur();
    return () => releaseOverlayBlur(token);
  }, []);

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
    window.addEventListener('touchmove', onDrag, { passive: true });
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchend', onDragEnd);

    return () => {
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('touchmove', onDrag);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchend', onDragEnd);
    };
  }, [onDrag, onDragEnd]);

  // Portaled to <body>: the overlay blur filters #app-root, which would blur the
  // notepad itself and re-anchor its position:fixed if it stayed in the subtree.
  return (
    <FixedPortal>
      <motion.div
        className="fixed inset-0 z-[105] bg-black/40"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />
      <motion.div
        ref={boxRef}
        className="fixed z-[110] w-[85vw] max-w-[320px] h-[40vh]"
        style={{ left: `${position.x}px`, top: `${position.y}px`, touchAction: 'none' }}
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 10 }}
        transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.18 }}
      >
        <Card className="h-full shadow-2xl flex flex-col overflow-hidden rounded-2xl border border-accent/20">
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
      </motion.div>
    </FixedPortal>
  );
};

export function QuickNotepad({ showButton = true }: { showButton?: boolean }) {
  const { notepadContent, setNotepadContent } = useContext(AppDataContext);
  const [isOpen, setIsOpen] = useState(false);
  const [localContent, setLocalContent] = useState(notepadContent);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The quick-add "Notes" shortcut opens the notepad from any page.
  useEffect(() => {
    const onOpen = () => setIsOpen(true);
    window.addEventListener('duey:open-notes', onOpen);
    return () => window.removeEventListener('duey:open-notes', onOpen);
  }, []);

  // Sync local content when the notepad opens so it reflects persisted state.
  // notepadContent intentionally omitted from deps — including it would reset mid-edit content on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isOpen) setLocalContent(notepadContent);
  }, [isOpen]);

  // Cleanup pending debounce on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleChange = useCallback((val: string) => {
    setLocalContent(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setNotepadContent(val), 300);
  }, [setNotepadContent]);

  const handleClear = useCallback(() => {
    setLocalContent('');
    clearTimeout(debounceRef.current);
    setNotepadContent('');
  }, [setNotepadContent]);

  return (
    <>
      {showButton && (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-4 z-[60] h-12 w-12 rounded-full shadow-lg bg-card border-2 border-accent/30"
          style={{ bottom: 'calc(10px + var(--sab))' }}
          onClick={() => { hapticTap(); setIsOpen(prev => !prev); }}
        >
          <StickyNote className="h-5 w-5" />
        </Button>
      )}

      <AnimatePresence>
        {isOpen && (
          <DraggableNotepadBox
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onClear={handleClear}
          >
            <Textarea
              value={localContent}
              onChange={(e) => handleChange(e.target.value)}
              className={cn(
                "w-full h-full text-sm bg-transparent resize-none border-none p-0",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-muted-foreground/40"
              )}
              placeholder="Jot down some notes..."
            />
          </DraggableNotepadBox>
        )}
      </AnimatePresence>
    </>
  );
}