'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function safeCalculate(raw: string): number {
  const expr = raw.replace(/\s+/g, '');
  let i = 0;

  function parseExpr(): number {
    let val = parseTerm();
    while (i < expr.length && (expr[i] === '+' || expr[i] === '-')) {
      const op = expr[i++];
      val = op === '+' ? val + parseTerm() : val - parseTerm();
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseUnary();
    while (i < expr.length && (expr[i] === '*' || expr[i] === '/')) {
      const op = expr[i++];
      const right = parseUnary();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      val = op === '*' ? val * right : val / right;
    }
    return val;
  }

  function parseUnary(): number {
    if (expr[i] === '-') { i++; return -parseUnary(); }
    if (expr[i] === '+') { i++; return parseUnary(); }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (expr[i] === '(') {
      i++;
      const val = parseExpr();
      if (expr[i] !== ')') throw new Error('Mismatched parentheses');
      i++;
      return val;
    }
    const start = i;
    while (i < expr.length && /[\d.]/.test(expr[i])) i++;
    if (i === start) throw new Error(`Unexpected character at position ${i}`);
    return parseFloat(expr.slice(start, i));
  }

  const result = parseExpr();
  if (i !== expr.length) throw new Error(`Unexpected token: ${expr[i]}`);
  return result;
}

const DraggableCard = ({ children, onClose, isOpen }: { children: React.ReactNode; onClose: () => void; isOpen: boolean }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen && cardRef.current) {
      const { innerWidth, innerHeight } = window;
      const { offsetWidth, offsetHeight } = cardRef.current;
      setPosition({ x: (innerWidth - offsetWidth) / 2, y: (innerHeight - offsetHeight) / 2 });
    }
  }, [isOpen]);

  const onDragStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      offsetRef.current = { x: clientX - rect.left, y: clientY - rect.top };
    }
  }, []);

  const onDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDraggingRef.current) return;
    if (e.type === 'touchmove') e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setPosition({ x: clientX - offsetRef.current.x, y: clientY - offsetRef.current.y });
  }, []);

  const onDragEnd = useCallback(() => { isDraggingRef.current = false; }, []);

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
    <>
      <div className="fixed inset-0 z-[95] bg-black/5 backdrop-blur-[1.5px]" onClick={onClose} />
      <div
        ref={cardRef}
        className="fixed z-[100] w-[85vw] min-w-[280px] max-w-[320px]"
        style={{ left: `${position.x}px`, top: `${position.y}px`, touchAction: 'none' }}
      >
        <Card className="rounded-3xl overflow-hidden border-accent/20 shadow-2xl">
          <CardHeader
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            className="cursor-move px-4 pt-3 pb-0 flex flex-row items-center justify-between"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60 select-none">Calculator</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
            >
              <X size={15} strokeWidth={2.5} />
            </Button>
          </CardHeader>
          <CardContent className="p-3 pt-2">
            {children}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

const OPERATORS = ['+', '−', '×', '÷'];
const isOp = (s: string) => OPERATORS.includes(s);

export function FloatingCalculator({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [isResult, setIsResult] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);

  const endsWithOp = (expr: string) => isOp(expr.slice(-1));

  const handleNumber = useCallback((value: string) => {
    if (isResult) {
      setExpression('');
      setDisplay(value === '.' ? '0.' : value);
      setIsResult(false);
      return;
    }
    if (value === '.' && display.includes('.')) return;
    setDisplay(prev => (prev === '0' && value !== '.') ? value : prev + value);
  }, [display, isResult]);

  const handleOperator = useCallback((op: string) => {
    const base = isResult ? display : expression + display;
    setExpression(endsWithOp(base) ? base.slice(0, -1) + op : base + op);
    setDisplay(op);
    setIsResult(false);
  }, [display, expression, isResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEquals = useCallback(() => {
    if (isResult || endsWithOp(expression)) return;
    const fullExpr = expression + display;
    try {
      const raw = fullExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
      const result = safeCalculate(raw);
      const resultStr = String(parseFloat(result.toPrecision(12)));
      setHistory(prev => [`${fullExpr} = ${resultStr}`, ...prev].slice(0, 5));
      setExpression(fullExpr + ' =');
      setDisplay(resultStr);
      setIsResult(true);
    } catch {
      setDisplay('Error');
      setExpression('');
      setIsResult(false);
    }
  }, [display, expression, isResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = useCallback(() => {
    setDisplay('0');
    setExpression('');
    setIsResult(false);
  }, []);

  const handleBackspace = useCallback(() => {
    if (isResult) { handleClear(); return; }
    setDisplay(prev => (prev === 'Error' || prev.length <= 1) ? '0' : prev.slice(0, -1));
  }, [isResult, handleClear]);

  const handlePlusMinus = useCallback(() => {
    if (display === '0' || isOp(display)) return;
    setDisplay(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
  }, [display]);

  const handlePercent = useCallback(() => {
    const num = parseFloat(display);
    if (isNaN(num)) return;
    setDisplay(String(parseFloat((num / 100).toPrecision(12))));
  }, [display]);

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = 0;
  }, [history]);

  const displaySize = display.length > 11 ? 'text-xl' : display.length > 8 ? 'text-2xl' : 'text-[2.4rem]';

  const num = "h-12 text-[15px] font-semibold rounded-2xl bg-card hover:bg-accent/5 border border-accent/10 shadow-sm transition-transform active:scale-95 duration-75 select-none";
  const op  = "h-12 text-[15px] font-semibold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/85 shadow-sm transition-transform active:scale-95 duration-75 select-none";
  const fn  = "h-12 text-[13px] font-semibold rounded-2xl bg-foreground/8 text-foreground/60 hover:bg-foreground/12 border border-accent/10 shadow-sm transition-transform active:scale-95 duration-75 select-none";
  const eq  = "h-12 text-[15px] font-bold rounded-2xl bg-accent text-accent-foreground hover:bg-accent/85 shadow-sm transition-transform active:scale-95 duration-75 select-none";

  // Highlight active operator
  const activeOp = !isResult && expression.length > 0 ? expression.slice(-1) : '';

  return (
    <DraggableCard onClose={onClose} isOpen={isOpen}>
      <div className="space-y-2">

        {/* History */}
        {history.length > 0 && (
          <div ref={historyRef} className="max-h-12 overflow-y-auto space-y-0.5">
            {history.map((entry, idx) => (
              <button
                key={idx}
                onClick={() => {
                  const result = entry.split('=').pop()?.trim() ?? '';
                  setDisplay(result);
                  setExpression('');
                  setIsResult(true);
                }}
                className="w-full text-right text-[10px] font-mono text-muted-foreground/40 hover:text-muted-foreground/70 truncate px-1 py-px transition-colors leading-4"
              >
                {entry}
              </button>
            ))}
          </div>
        )}

        {/* Display */}
        <div className="relative bg-background/50 rounded-2xl px-4 pt-2 pb-3 border border-accent/5">
          <div className="text-[10px] text-muted-foreground/35 font-mono h-4 text-right truncate tracking-wider mt-1 select-none">
            {expression || ' '}
          </div>
          <div className={cn('font-bold text-right font-mono tracking-tight transition-all leading-none mt-1', displaySize)}>
            {display}
          </div>
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleBackspace(); }}
            className="absolute top-2 right-2 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors p-1.5 rounded-lg active:scale-90"
            aria-label="Backspace"
          >
            ⌫
          </button>
        </div>

        {/* Button grid */}
        <div className="grid grid-cols-4 gap-1.5">
          <button className={fn} onClick={handleClear}>AC</button>
          <button className={fn} onClick={handlePlusMinus}>+/-</button>
          <button className={fn} onClick={handlePercent}>%</button>
          <button className={cn(op, activeOp === '÷' && 'ring-2 ring-primary/40')} onClick={() => handleOperator('÷')}>÷</button>

          <button className={num} onClick={() => handleNumber('7')}>7</button>
          <button className={num} onClick={() => handleNumber('8')}>8</button>
          <button className={num} onClick={() => handleNumber('9')}>9</button>
          <button className={cn(op, activeOp === '×' && 'ring-2 ring-primary/40')} onClick={() => handleOperator('×')}>×</button>

          <button className={num} onClick={() => handleNumber('4')}>4</button>
          <button className={num} onClick={() => handleNumber('5')}>5</button>
          <button className={num} onClick={() => handleNumber('6')}>6</button>
          <button className={cn(op, activeOp === '−' && 'ring-2 ring-primary/40')} onClick={() => handleOperator('−')}>−</button>

          <button className={num} onClick={() => handleNumber('1')}>1</button>
          <button className={num} onClick={() => handleNumber('2')}>2</button>
          <button className={num} onClick={() => handleNumber('3')}>3</button>
          <button className={cn(op, activeOp === '+' && 'ring-2 ring-primary/40')} onClick={() => handleOperator('+')}>+</button>

          <button className={cn(num, 'col-span-2 flex items-center justify-start pl-[22px]')} onClick={() => handleNumber('0')}>0</button>
          <button className={num} onClick={() => handleNumber('.')}>.</button>
          <button className={eq} onClick={handleEquals}>=</button>
        </div>

      </div>
    </DraggableCard>
  );
}
