"use client"

import { useEffect } from "react"

/**
 * Tracks how much of the viewport the on-screen keyboard covers and exposes it
 * as the CSS variable `--keyboard-height` on <html>. Dialogs read this to stay
 * centered in the visible area above the keyboard instead of behind it.
 *
 * Uses the VisualViewport API, which reports the actual visible region and works
 * regardless of how the Capacitor WebView handles soft-input resizing.
 */
export function KeyboardInset() {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    if (!vv) return

    const root = document.documentElement

    const update = () => {
      // Gap between the layout viewport and the visible (un-keyboarded) region.
      const overlap = window.innerHeight - vv.height - vv.offsetTop
      const keyboard = Math.max(0, Math.round(overlap))
      root.style.setProperty("--keyboard-height", `${keyboard}px`)
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)

    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      root.style.setProperty("--keyboard-height", "0px")
    }
  }, [])

  return null
}
