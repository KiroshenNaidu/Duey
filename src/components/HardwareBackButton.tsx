'use client';

import { useEffect } from 'react';

/**
 * Wires the Android hardware back button to behave like a normal app:
 *   1. If a modal/overlay is open (dialog, alert, select, popover), close it.
 *   2. Otherwise navigate back through history (page → previous page → …).
 *   3. Only when there's nowhere left to go does the app exit.
 *
 * Without this, Capacitor's default behavior is to immediately exit the app on
 * the very first back press. Renders nothing.
 */
export function HardwareBackButton() {
  useEffect(() => {
    let remove: (() => void) | null = null;

    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;

      import('@capacitor/app').then(({ App }) => {
        App.addListener('backButton', ({ canGoBack }) => {
          // 1. Close any open Radix overlay (modal dialogs, alert dialogs,
          //    select menus, popovers) by simulating the Escape key — Radix
          //    layers dismiss on Escape and call their onOpenChange handlers.
          const openOverlay = document.querySelector(
            '[data-state="open"][role="dialog"], ' +
            '[data-state="open"][role="alertdialog"], ' +
            '[data-state="open"][role="menu"], ' +
            '[data-state="open"][role="listbox"]'
          );
          if (openOverlay) {
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );
            return;
          }

          // 2. Navigate back if there's history (page navigations + the dummy
          //    entries the settings sub-menus push). Settings listens for the
          //    resulting popstate to step back through its own sub-screens.
          if (canGoBack || window.history.length > 1) {
            window.history.back();
            return;
          }

          // 3. Nothing left in history — exit the app (root of the back stack).
          App.exitApp();
        }).then(handle => { remove = () => handle.remove(); });
      });
    });

    return () => { remove?.(); };
  }, []);

  return null;
}
