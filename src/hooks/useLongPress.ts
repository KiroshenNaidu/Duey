'use client';

import { useCallback, useRef } from 'react';

/**
 * Press-and-hold detection for list cards (the multi-select entry gesture). Fires once
 * after `ms` of stillness; drifting past `tolerance` (a scroll starting), releasing
 * early, or a pointercancel (the browser claiming the gesture) all abort silently.
 *
 * Two platform quirks are handled here so call sites stay clean:
 * - The click that trails a fired hold (finger lifts → browser synthesizes a click on
 *   whatever is under it) is swallowed in the capture phase, so a hold never ALSO
 *   activates the control it happened to land on.
 * - contextmenu is suppressed while enabled — Android's WebView long-press otherwise
 *   opens the text-selection menu on top of our own gesture.
 *
 * Spread the returned handlers onto the pressable element.
 */
export function useLongPress(
  onHold: () => void,
  { ms = 450, tolerance = 12, enabled = true }: { ms?: number; tolerance?: number; enabled?: boolean } = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    origin.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // left button / touch only
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; fired.current = true; onHold(); }, ms);
  }, [enabled, ms, onHold]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!timer.current || !origin.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    if (dx * dx + dy * dy > tolerance * tolerance) cancel();
  }, [cancel, tolerance]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (fired.current) {
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (enabled) e.preventDefault();
  }, [enabled]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture,
    onContextMenu,
  };
}
