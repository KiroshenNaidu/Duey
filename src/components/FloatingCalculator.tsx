'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './ui/button';
import { X, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { acquireOverlayBlur, releaseOverlayBlur } from '@/lib/overlayBlur';
import { FixedPortal } from '@/components/FixedPortal';

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

const DraggableCard = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);
  const isDraggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  // Open near the TOP of the screen (just under the fixed top nav) for easy thumb reach
  // instead of dead-centre; still fully draggable from the header afterwards. navBottom is
  // measured live so the notch/safe area is accounted for on every device.
  useEffect(() => {
    if (!cardRef.current) return;
    const { innerWidth } = window;
    const { offsetWidth } = cardRef.current;
    const navBottom = document.querySelector('nav')?.getBoundingClientRect().bottom ?? 56;
    setPosition({
      x: Math.max(12, Math.round((innerWidth - offsetWidth) / 2)),
      y: Math.round(navBottom + 12),
    });
    setPlaced(true);
  }, []);

  // Blur the whole app uniformly while open (same mechanism dialogs/quick-add use).
  // The old backdrop-filter blur sampled page layers inconsistently — big page titles
  // stayed sharp while card text went mushy — and the + FAB floated unblurred on top.
  useEffect(() => {
    const token = acquireOverlayBlur();
    return () => releaseOverlayBlur(token);
  }, []);

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

  // Portaled to <body>: the panel lives inside #app-root's subtree, and the overlay
  // blur puts a CSS filter on #app-root — which would blur the calculator itself AND
  // re-anchor its position:fixed. On body it floats sharp above the blurred app.
  return (
    <FixedPortal>
      <motion.div
        className="fixed inset-0 z-[95] bg-black/40"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />
      <motion.div
        ref={cardRef}
        className="fixed z-[100] w-[85vw] min-w-[280px] max-w-[320px]"
        style={{ left: `${position.x}px`, top: `${position.y}px`, touchAction: 'none' }}
        // Slide DOWN into place from just above; held invisible until the top position is
        // measured so it never flashes at 0,0.
        initial={{ opacity: 0, scale: 0.94, y: -14 }}
        animate={{ opacity: placed ? 1 : 0, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -14 }}
        transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.18 }}
      >
        {/* aurora-dialog: the app's themed rotating-gradient ring (matches every modal +
            the Quick Notepad). `border bg-background` is the fallback chrome under the
            glass/minimal/elevated UI styles, same pattern as DialogContent. */}
        <div className="aurora-dialog rounded-3xl overflow-hidden border bg-background flex flex-col">
          <div
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            className="cursor-move select-none flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Calculator size={16} />
            </span>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-[13px] font-bold text-foreground">Calculator</p>
              <p className="text-[10px] text-muted-foreground">Drag to move</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label="Close calculator"
            >
              <X size={18} strokeWidth={2.5} />
            </Button>
          </div>
          <div className="p-3">
            {children}
          </div>
        </div>
      </motion.div>
    </FixedPortal>
  );
};

const OPERATORS = ['+', '−', '×', '÷'];
const isOp = (s: string) => OPERATORS.includes(s);

export function FloatingCalculator({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [isResult, setIsResult] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const endsWithOp = (expr: string) => isOp(expr.slice(-1));

  const handleNumber = useCallback((value: string) => {
    if (isResult) {
      setExpression('');
      setDisplay(value === '.' ? '0.' : value);
      setIsResult(false);
      return;
    }
    // If display currently holds an operator, start a fresh number (don't concatenate onto the symbol)
    if (isOp(display)) {
      setDisplay(value === '.' ? '0.' : value);
      return;
    }
    if (value === '.' && display.includes('.')) return;
    setDisplay(prev => (prev === '0' && value !== '.') ? value : prev + value);
  }, [display, isResult]);

  const handleOperator = useCallback((op: string) => {
    if (isResult) {
      setExpression(display + op);
      setDisplay(op);
      setIsResult(false);
      return;
    }
    if (isOp(display)) {
      // Swap the pending operator — don't double-append
      setExpression(prev => (endsWithOp(prev) ? prev.slice(0, -1) : prev) + op);
      setDisplay(op);
      return;
    }
    // Commit current number to expression, then append operator
    const newExpr = expression + display;
    setExpression(newExpr + op);
    setDisplay(op);
    setIsResult(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- endsWithOp/isOp are module-level pure fns, not deps; adding them causes infinite re-renders
  }, [display, expression, isResult]);

  const handleEquals = useCallback(() => {
    // Can't evaluate if display is an operator or we just got a result
    if (isResult || isOp(display)) return;
    const fullExpr = expression + display;
    if (endsWithOp(fullExpr) || fullExpr === '' || fullExpr === '0') return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- same as handleOperator; endsWithOp/safeCalculate are pure module fns
  }, [display, expression, isResult]);

  const handleClear = useCallback(() => {
    setDisplay('0');
    setExpression('');
    setIsResult(false);
  }, []);

  const handleBackspace = useCallback(() => {
    if (isResult) { handleClear(); return; }
    if (isOp(display)) {
      // Remove the pending operator from expression and reset display
      setExpression(prev => endsWithOp(prev) ? prev.slice(0, -1) : prev);
      setDisplay('0');
      return;
    }
    setDisplay(prev => (prev === 'Error' || prev.length <= 1) ? '0' : prev.slice(0, -1));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- endsWithOp is a pure module fn; handleClear is stable (empty deps); lint false-positive
  }, [isResult, display, handleClear]);

  const handlePlusMinus = useCallback(() => {
    if (display === '0' || isOp(display)) return;
    setDisplay(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
  }, [display]);

  const handlePercent = useCallback(() => {
    const num = parseFloat(display);
    if (isNaN(num)) return;
    setDisplay(String(parseFloat((num / 100).toPrecision(12))));
  }, [display]);

  const displaySize = display.length > 11 ? 'text-xl' : display.length > 8 ? 'text-2xl' : 'text-[2.4rem]';

  const num = "h-12 text-[15px] font-semibold rounded-2xl bg-card hover:bg-accent/5 border border-accent/10 shadow-sm transition-transform active:scale-95 duration-75 select-none";
  // Dual light+dark glyph outline so the operator symbols (esp. the thin "+") stay
  // legible whatever the theme's primary/accent colours are: the dark halo carries
  // contrast on light buttons, the light halo carries it on dark buttons.
  const glyphOutline = "[text-shadow:_0_0_1px_rgba(0,0,0,0.55),_0_0_2px_rgba(0,0,0,0.45),_0_0_1px_rgba(255,255,255,0.55),_0_0_2px_rgba(255,255,255,0.45)]";
  const op  = cn("h-12 text-lg font-bold rounded-2xl bg-primary text-btn-on-primary hover:bg-primary/85 shadow-sm transition-transform active:scale-95 duration-75 select-none", glyphOutline);
  const fn  = "h-12 text-[13px] font-semibold rounded-2xl bg-foreground/8 text-foreground/60 hover:bg-foreground/12 border border-accent/10 shadow-sm transition-transform active:scale-95 duration-75 select-none";
  const eq  = cn("h-12 text-lg font-bold rounded-2xl bg-accent text-btn-on-accent hover:bg-accent/85 shadow-sm transition-transform active:scale-95 duration-75 select-none", glyphOutline);

  // Highlight the active operator button only while waiting for the next number
  const activeOp = !isResult && isOp(display) ? display : '';

  return (
    <AnimatePresence>
      {isOpen && <DraggableCard onClose={onClose}>
      <div className="space-y-2">

        {/* History — latest entry only, with clear button */}
        {history.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistory([])}
              className="text-muted-foreground/25 hover:text-muted-foreground/60 transition-colors p-1 rounded-lg active:scale-90 text-xs leading-none shrink-0"
              aria-label="Clear history"
            >
              ✕
            </button>
            <p className="flex-1 text-right text-[10px] font-mono text-muted-foreground/40 truncate leading-4 select-none">
              {history[0]}
            </p>
          </div>
        )}

        {/* Display */}
        <div className="bg-background/50 rounded-2xl px-4 pt-3 pb-4 border border-accent/5">
          {/* ⌫ in its own row — never overlaps expression or result text */}
          <div className="flex justify-end mb-1">
            <button
              onPointerDown={(e) => { e.stopPropagation(); handleBackspace(); }}
              className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors px-2 py-0.5 rounded-lg active:scale-90 text-base leading-none"
              aria-label="Backspace"
            >
              ⌫
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground/40 font-mono min-h-[16px] text-right truncate tracking-wider select-none">
            {expression || ' '}
          </div>
          <div className={cn('font-bold text-right font-mono tracking-tight transition-all leading-tight mt-1', displaySize)}>
            {display}
          </div>
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
    </DraggableCard>}
    </AnimatePresence>
  );
}
