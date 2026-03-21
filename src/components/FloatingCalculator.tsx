'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      className="fixed z-[100] w-[80vw] max-w-[300px] md:w-[40vw]"
      style={{ left: `${position.x}px`, top: `${position.y}px`, touchAction: 'none' }}
    >
      <Card className="shadow-2xl bg-card/90 backdrop-blur-md border border-accent/20">
         <CardHeader 
           onMouseDown={onDragStart} 
           onTouchStart={onDragStart}
           className="cursor-move p-2 flex flex-row items-center justify-between border-b border-accent/10"
         >
          <span className="font-semibold text-sm pl-2">Calculator</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={onClose} onTouchEnd={onClose}><X size={18} /></Button>
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
  const [isOperatorClicked, setIsOperatorClicked] = useState(false);

  const handleInput = (value: string) => {
    if (expression.includes('=')) {
        clear();
        setDisplay(value);
        return;
    }
    if (isOperatorClicked) {
        setDisplay(value);
        setIsOperatorClicked(false);
    } else {
        setDisplay(prev => (prev === '0' && value !== '.') ? value : prev + value);
    }
  };

  const handleOperator = (operator: string) => {
    if (expression.includes('=')) {
        setExpression(display + operator);
    } else if (isOperator(display)) {
        setExpression(prev => prev.slice(0, -1) + operator);
    } else {
        setExpression(prev => prev + display + operator);
    }
    setDisplay(operator);
    setIsOperatorClicked(true);
  };
  
  const calculate = () => {
    if (isOperator(display)) return;

    let finalExpression = expression + display;
    try {
      const result = eval(finalExpression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-'));
      const resultString = String(parseFloat(result.toPrecision(15)));
      
      setExpression(finalExpression + '=' + resultString);
      setDisplay(resultString);
    } catch {
      setDisplay('Error');
      setExpression('');
    }
    setIsOperatorClicked(false);
  };

  const clear = () => {
    setDisplay('0');
    setExpression('');
    setIsOperatorClicked(false);
  };

  const isOperator = (char: string) => ['+', '−', '×', '÷'].includes(char);
  
  const buttons = [
    { display: '7', value: '7', type: 'num' }, { display: '8', value: '8', type: 'num' }, { display: '9', value: '9', type: 'num' }, { display: '÷', value: '÷', op: true },
    { display: '4', value: '4', type: 'num' }, { display: '5', value: '5', type: 'num' }, { display: '6', value: '6', type: 'num' }, { display: '×', value: '×', op: true },
    { display: '1', value: '1', type: 'num' }, { display: '2', value: '2', type: 'num' }, { display: '3', value: '3', type: 'num' }, { display: '−', value: '−', op: true },
    { display: '0', value: '0', type: 'num' }, { display: '.', value: '.', type: 'num' }, { display: '=', value: '=', op: true }, { display: '+', value: '+', op: true },
  ];

  const handleButtonClick = (btn: any) => {
    if (btn.value === '=') {
        calculate();
    } else if (btn.op) {
        handleOperator(btn.value);
    } else {
        handleInput(btn.value);
    }
  };

  return (
     <DraggableCard title="Calculator" onClose={onClose} isOpen={isOpen}>
      <div className="space-y-2">
        <div className="bg-background/50 rounded p-2 text-right font-mono space-y-1 border border-accent/5">
            <div className="text-muted-foreground text-xs h-4 truncate">{expression}</div>
            <div className="text-3xl truncate font-bold">{display}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
            <Button onClick={clear} variant="destructive" className="col-span-4 h-10 text-sm font-bold">Clear</Button>
            {buttons.map(btn => {
                const isNumeric = btn.type === 'num';
                return (
                    <Button 
                        key={btn.value} 
                        onClick={() => handleButtonClick(btn)} 
                        variant={isNumeric ? 'default' : (btn.value === '=' ? 'default' : 'secondary')}
                        className={cn(
                            "h-12 text-lg font-bold shadow-sm transition-transform active:scale-95",
                            isNumeric && "bg-primary text-primary-foreground hover:bg-primary/90",
                            !isNumeric && btn.value !== '=' && "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        )}
                    >
                        {btn.display}
                    </Button>
                );
            })}
        </div>
      </div>
    </DraggableCard>
  );
}