'use client';

import { createPortal } from 'react-dom';

/**
 * Renders children directly on document.body, escaping any CSS transform
 * ancestor that would otherwise re-parent position:fixed elements.
 */
export function FixedPortal({ children }: { children: React.ReactNode }) {
  if (typeof window === 'undefined') return null;
  return createPortal(children, document.body);
}
