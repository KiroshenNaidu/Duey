'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { X } from 'lucide-react';

const DraggableCard = ({ children, title, onClose, isOpen }: { children: React.ReactNode, title: string, onClose: () => void, isOpen: boolean }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen && cardRef.current) {
      const { innerWidth, innerHeight } = window;
      const { offsetWidth, offsetHeight } = cardRef.current;
      setPosition({
        x: (innerWidth - offsetWidth) / 2,
        y: (innerHeight - offsetHeight) / 2,
      });
    }
  }, [isOpen]);

  const onDragStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
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
    const currentOnDrag = (e: MouseEvent | TouchEvent) => onDrag(e);
    const currentOnDragEnd = () => onDragEnd();
    
    window.addEventListener('mousemove', currentOnDrag);
    window.addEventListener('touchmove', currentOnDrag, { passive: false });
    window.addEventListener('mouseup', currentOnDragEnd);
    window.addEventListener('touchend', currentOnDragEnd);

    return () => {
      window.removeEventListener('mousemove', currentOnDrag);
      window.removeEventListener('touchmove', currentOnDrag);
      window.removeEventListener('mouseup', currentOnDragEnd);
      window.removeEventListener('touchend', currentOnDragEnd);
    };
  }, [onDrag, onDragEnd]);

  if (!isOpen) return null;

  return (
    <div
      ref={cardRef}
      className="fixed z-50 w-[80vw] max-w-[300px] md:w-[40vw]"
      style={{ left: `${position.x}px`, top: `${position.y}px`, touchAction: 'none' }}
    >
      <Card className="shadow-2xl bg-card/90 backdrop-blur-md">
         <CardHeader 
           onMouseDown={onDragStart} 
           onTouchStart={onDragStart}
           className="cursor-move p-2 flex flex-row items-center justify-between"
         >
          <span className="font-semibold text-sm pl-2">{title}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} onTouchEnd={onClose}><X size={18} /></Button>
         </CardHeader>
         <CardContent className="p-2">
          {children}
         </CardContent>
      </Card>
    </div>
  );
};


export function FloatingCalculator({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');

  const handleInput = (value: string) => {
    if (display === 'Error') {
      setDisplay('0');
      setExpression('');
    }
    if (display === '0' && value !== '.') {
        setDisplay(value);
    } else {
        setDisplay(display + value);
    }
    setExpression(prev => prev + value);
  };

  const handleOperator = (operator: string) => {
    if (display === 'Error') return;
    const lastChar = expression.slice(-1);
    if (['+', '-', '*', '/'].includes(lastChar)) {
      setExpression(prev => prev.slice(0, -1) + operator);
    } else {
      setExpression(prev => prev + operator);
    }
    setDisplay(operator);
  };
  
  const calculate = () => {
    if (display === 'Error') return;
    try {
      // Unsafe eval, but acceptable for this sandboxed calculator feature.
      const result = eval(expression.replace(/--/g, '+'));
      setDisplay(String(result));
      setExpression(String(result));
    } catch {
      setDisplay('Error');
      setExpression('');
    }
  };

  const clear = () => {
    setDisplay('0');
    setExpression('');
  };

  const buttons = [
    '7', '8', '9', '/',
    '4', '5', '6', '*',
    '1', '2', '3', '-',
    '0', '.', '=', '+',
  ];

  const handleButtonClick = (btn: string) => {
    if (!isNaN(parseInt(btn)) || btn === '.') {
      handleInput(btn);
    } else if (['+', '-', '*', '/'].includes(btn)) {
      handleOperator(btn);
    } else if (btn === '=') {
      calculate();
    }
  };

  return (
     <DraggableCard title="Calculator" onClose={onClose} isOpen={isOpen}>
      <div className="space-y-2">
        <div className="bg-background/50 rounded p-2 text-right text-3xl font-mono truncate">
          {display}
        </div>
        <div className="grid grid-cols-4 gap-2">
            <Button onClick={clear} variant="destructive" className="col-span-4 h-14 text-lg">Clear</Button>
            {buttons.map(btn => (
                <Button key={btn} onClick={() => handleButtonClick(btn)} variant="outline" className="h-14 text-lg">
                    {btn}
                </Button>
            ))}
        </div>
      </div>
    </DraggableCard>
  );
}
