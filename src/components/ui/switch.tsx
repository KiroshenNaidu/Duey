"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Animated "goo" toggle (adapted from Uiverse.io by njesenberger). Drop-in replacement for the
// previous Radix switch — same API (checked / onCheckedChange / disabled / id / className).
// Colors are theme-driven via CSS vars in globals.css (.toggle-container): the active fill is
// --primary and the inactive track is --input, so it recolors with the app theme automatically.

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Track glyphs: 'io' = the default I/O marks; 'daynight' = sun (checked side) and
   *  moon (unchecked side) — used only by the Settings Day/Night theme switch. */
  iconStyle?: "io" | "daynight"
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, iconStyle = "io", ...props }, ref) => {
    // Unique filter id per instance so multiple toggles don't share/lose the goo filter.
    const filterId = `goo-${React.useId().replace(/:/g, "")}`
    return (
      <div className={cn("toggle-container h-6", disabled && "opacity-50 cursor-not-allowed", className)}>
        <input
          ref={ref}
          type="checkbox"
          className="toggle-input"
          checked={!!checked}
          disabled={disabled}
          onChange={e => onCheckedChange?.(e.target.checked)}
          {...props}
        />
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 292 142" className="toggle" aria-hidden="true">
          <path
            d="M71 142C31.7878 142 0 110.212 0 71C0 31.7878 31.7878 0 71 0C110.212 0 119 30 146 30C173 30 182 0 221 0C260 0 292 31.7878 292 71C292 110.212 260.212 142 221 142C181.788 142 173 112 146 112C119 112 110.212 142 71 142Z"
            className="toggle-background"
          />
          {iconStyle === "io" ? (
            <>
              <rect rx="6" height="64" width="12" y="39" x="64" className="toggle-icon on" />
              <path
                d="M221 91C232.046 91 241 82.0457 241 71C241 59.9543 232.046 51 221 51C209.954 51 201 59.9543 201 71C201 82.0457 209.954 91 221 91ZM221 103C238.673 103 253 88.6731 253 71C253 53.3269 238.673 39 221 39C203.327 39 189 53.3269 189 71C189 88.6731 203.327 103 221 103Z"
                fillRule="evenodd"
                className="toggle-icon off"
              />
            </>
          ) : (
            <>
              {/* Sun — revealed on the left when the knob sits right (checked = day) */}
              <g className="toggle-icon on">
                <circle cx="71" cy="71" r="13" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
                  <rect key={a} x="68" y="38" width="6" height="13" rx="3" transform={`rotate(${a} 71 71)`} />
                ))}
              </g>
              {/* Moon — revealed on the right when the knob sits left (unchecked = night) */}
              <path
                className="toggle-icon off"
                transform="translate(194.6 44.6) scale(2.2)"
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
              />
            </>
          )}
          <g filter={`url(#${filterId})`}>
            <rect fill="#fff" rx="29" height="58" width="116" y="42" x="13" className="toggle-circle-center" />
            <rect fill="#fff" rx="58" height="114" width="114" y="14" x="14" className="toggle-circle left" />
            <rect fill="#fff" rx="58" height="114" width="114" y="14" x="164" className="toggle-circle right" />
          </g>
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="10" result="blur" in="SourceGraphic" />
            <feColorMatrix result="goo" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" mode="matrix" in="blur" />
          </filter>
        </svg>
      </div>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
