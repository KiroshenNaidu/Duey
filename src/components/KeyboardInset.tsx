"use client"

import { useEffect } from "react"

/**
 * Keeps the layout fixed when the on-screen keyboard opens and exposes the
 * keyboard's height as the CSS variable `--keyboard-height` on <html>. Dialogs
 * and inputs read this to lift above the keyboard instead of being hidden by it.
 *
 * Preferred path — the VirtualKeyboard API. Setting `overlaysContent = true`
 * tells the WebView to draw the keyboard *over* the page rather than resizing or
 * panning the viewport. The fixed top nav and bottom bar stay exactly where they
 * are; nothing gets shoved off-screen. We read the keyboard rect from the
 * `geometrychange` event to drive `--keyboard-height`.
 *
 * Fallback path — the VisualViewport API, for WebViews without VirtualKeyboard
 * support. Here the WebView still resizes/pans, so we measure the visible region
 * and snap any residual scroll offset back once the keyboard closes.
 */
export function KeyboardInset() {
  useEffect(() => {
    const root = document.documentElement
    const setKeyboard = (px: number) =>
      root.style.setProperty("--keyboard-height", `${Math.max(0, Math.round(px))}px`)

    // Preferred: VirtualKeyboard API — keyboard overlays content, layout stays put.
    const vk = (navigator as unknown as { virtualKeyboard?: VirtualKeyboardLike }).virtualKeyboard
    if (vk && "overlaysContent" in vk) {
      vk.overlaysContent = true
      const onGeometry = () => setKeyboard(vk.boundingRect?.height ?? 0)
      onGeometry()
      vk.addEventListener("geometrychange", onGeometry)

      // In overlay mode the WebView no longer auto-reveals the focused field, so
      // an input low on the page can sit behind the keyboard. Nudge it into the
      // region above the keyboard. Dialogs lift themselves via --keyboard-height,
      // so skip anything inside a fixed-position container.
      const onFocusIn = (e: FocusEvent) => {
        const el = e.target as HTMLElement | null
        if (!el || !el.matches("input, textarea, [contenteditable='true']")) return
        if (el.closest("[role='dialog'], [role='alertdialog']")) return
        // Wait a frame for the keyboard geometry to settle before measuring.
        requestAnimationFrame(() => {
          const keyboardTop = window.innerHeight - (vk.boundingRect?.height ?? 0)
          if (el.getBoundingClientRect().bottom > keyboardTop) {
            el.scrollIntoView({ block: "center", behavior: "smooth" })
          }
        })
      }
      window.addEventListener("focusin", onFocusIn)

      return () => {
        vk.removeEventListener("geometrychange", onGeometry)
        window.removeEventListener("focusin", onFocusIn)
        vk.overlaysContent = false
        setKeyboard(0)
      }
    }

    // Fallback: VisualViewport for WebViews that resize/pan on soft-input.
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    if (!vv) return

    let prevKeyboard = 0
    const update = () => {
      // Gap between the layout viewport and the visible (un-keyboarded) region.
      const overlap = window.innerHeight - vv.height - vv.offsetTop
      const keyboard = Math.max(0, Math.round(overlap))
      setKeyboard(keyboard)

      // On the open→closed edge, snap any residual offset back. The focus-time
      // scrollIntoView (and some WebViews scrolling the document/body to reveal the
      // field) can leave the layout shifted up with the fixed top nav off-screen.
      // Resetting these once the keyboard is fully gone restores the normal layout.
      if (prevKeyboard > 0 && keyboard === 0) {
        window.scrollTo(0, 0)
        root.scrollTop = 0
        document.body.scrollTop = 0
      }
      prevKeyboard = keyboard
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)

    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setKeyboard(0)
    }
  }, [])

  return null
}

interface VirtualKeyboardLike extends EventTarget {
  overlaysContent: boolean
  boundingRect?: DOMRectReadOnly
}
