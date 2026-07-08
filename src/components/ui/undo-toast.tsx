'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Undo2 } from 'lucide-react';

// Lightweight global undo toast. Call showUndoToast('Deleted "WiFi"', restoreFn) right
// after a delete — the item is removed immediately and the toast offers a 5s window to
// put it back. Event-based so callers don't need a context; <UndoToastHost /> is mounted
// once in the root layout.

const EVENT_NAME = 'duey:undo-toast';

interface UndoToastDetail {
  message: string;
  onUndo: () => void;
}

export function showUndoToast(message: string, onUndo: () => void) {
  window.dispatchEvent(new CustomEvent<UndoToastDetail>(EVENT_NAME, { detail: { message, onUndo } }));
}

const TOAST_DURATION_MS = 5000;

export function UndoToastHost() {
  const [toast, setToast] = useState<(UndoToastDetail & { key: number }) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  useEffect(() => {
    const onShow = (e: Event) => {
      const detail = (e as CustomEvent<UndoToastDetail>).detail;
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ ...detail, key: Date.now() });
      timerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    };
    window.addEventListener(EVENT_NAME, onShow);
    return () => {
      window.removeEventListener(EVENT_NAME, onShow);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleUndo = () => {
    toast?.onUndo();
    dismiss();
  };

  // Centering lives on a fixed wrapper (flex justify-center) — NOT on the motion.div,
  // because framer-motion owns that element's transform and would overwrite a Tailwind
  // -translate-x-1/2, pushing the toast off-center.
  return (
    <div
      className="fixed left-0 right-0 z-[90] flex justify-center pointer-events-none px-4"
      style={{ bottom: 'calc(76px + var(--sab))' }}
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.key}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-card border border-border shadow-xl pl-4 pr-2 py-2 max-w-full"
          >
            <p className="text-xs text-foreground truncate">{toast.message}</p>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold text-accent active:bg-accent/10"
            >
              <Undo2 className="h-3.5 w-3.5" /> UNDO
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
