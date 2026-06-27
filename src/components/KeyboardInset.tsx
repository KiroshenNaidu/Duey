"use client"

import { useEffect } from "react"

/**
 * Handles the on-screen keyboard by letting the page scroll up *normally* rather
 * than transforming, shrinking, or panning the layout (which cut off the top of
 * the page). Two jobs:
 *
 *  1. Publish the keyboard's height as `--keyboard-height` on <html>. The main
 *     scroll area adds this to its bottom padding, extending the maximum scroll
 *     depth so fields near the bottom can be scrolled clear of the keyboard.
 *
 *  2. When a field is focused, scroll it into the region above the keyboard using
 *     ordinary scrolling of its scroll container — the page just scrolls up.
 *
 * Uses the VisualViewport API, which reports the visible region above the keyboard
 * regardless of how the WebView handles soft-input.
 */
export function KeyboardInset() {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    if (!vv) return

    const root = document.documentElement
    let prevKeyboard = 0

    const update = () => {
      // Gap between the layout viewport and the visible (un-keyboarded) region.
      const overlap = window.innerHeight - vv.height - vv.offsetTop
      const keyboard = Math.max(0, Math.round(overlap))
      root.style.setProperty("--keyboard-height", `${keyboard}px`)

      // Once the keyboard is fully gone, snap the page's scroll container back to
      // the top. The field was scrolled up to clear the keyboard, and the content
      // beneath it may have changed height while editing (e.g. committing an
      // override shrinks the card) — without this the page is left scrolled into
      // now-empty space with the top cut off. The scroller is <main>, matching how
      // the rest of the app resets scroll; window/body/root are NOT the scroller.
      if (prevKeyboard > 0 && keyboard === 0) {
        document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
      }
      prevKeyboard = keyboard
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)

    // Scroll a newly focused field into the area above the keyboard by scrolling
    // its container normally. The extended bottom padding on <main> provides the
    // extra scroll depth needed to lift bottom-of-page fields clear of the keyboard.
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null
      if (!el || !el.matches("input, textarea, select, [contenteditable='true']")) return

      // Defer until the keyboard has shrunk the visual viewport, then only scroll
      // if the field actually sits behind (or right against) the keyboard.
      window.setTimeout(() => {
        const keyboardTop = vv.height + vv.offsetTop
        if (el.getBoundingClientRect().bottom > keyboardTop - 16) {
          el.scrollIntoView({ block: "center", behavior: "smooth" })
        }
      }, 250)
    }
    window.addEventListener("focusin", onFocusIn)

    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      window.removeEventListener("focusin", onFocusIn)
      root.style.setProperty("--keyboard-height", "0px")
    }
  }, [])

  return null
}
