'use client';

import { useEffect, useState } from 'react';

/**
 * Animated SVG checkmark inside a circle.
 *
 * How it works:
 *  1. The circle and check paths start "invisible" using the SVG
 *     stroke-dashoffset trick: the dash is exactly as long as the path,
 *     so it looks like an empty gap covering the whole stroke.
 *  2. We animate stroke-dashoffset → 0, which "slides" the dash into view,
 *     making it look like the path is drawing itself.
 *  3. The check uses `animation-delay` so it starts after the circle finishes.
 *  4. Both animations use `forwards` fill-mode so they stay visible once done.
 */

// Circle radius and its circumference (2 × π × r).
// These must match the <circle r="40"> below.
const CIRCLE_RADIUS = 40;
const CIRCLE_CIRCUMFERENCE = Math.round(2 * Math.PI * CIRCLE_RADIUS); // ≈ 251

// Approximate pixel length of the checkmark path M 25 50 L 42 67 L 75 33.
// Calculated: segment1 ≈ 24px + segment2 ≈ 48px = 72px total.
const CHECK_LENGTH = 72;

export function SuccessCheckmark() {
  // `animate` flips to true shortly after mount, triggering the CSS animations.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Small delay (80 ms) lets the modal finish its open transition first.
    const id = setTimeout(() => setAnimate(true), 80);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      {/* Keyframe definitions — inlined so no extra CSS file is needed */}
      <style>{`
        /* Step 1: circle draws itself over 0.55 s */
        @keyframes duey-draw-circle {
          to { stroke-dashoffset: 0; }
        }

        /* Step 2: checkmark draws itself over 0.4 s, starting after the circle */
        @keyframes duey-draw-check {
          to { stroke-dashoffset: 0; }
        }

        /* --- Circle --- */
        .duey-circle {
          /* Start fully hidden: the dash gap covers the whole circumference */
          stroke-dasharray: ${CIRCLE_CIRCUMFERENCE};
          stroke-dashoffset: ${CIRCLE_CIRCUMFERENCE};
        }
        .duey-circle.duey-animate {
          /* Slide dash into place → circle appears to draw itself */
          animation: duey-draw-circle 0.55s ease-out forwards;
        }

        /* --- Checkmark --- */
        .duey-check {
          stroke-dasharray: ${CHECK_LENGTH};
          stroke-dashoffset: ${CHECK_LENGTH};
        }
        .duey-check.duey-animate {
          /* Delay equals circle duration (0.55s) so check starts when circle ends */
          animation: duey-draw-check 0.4s ease-out forwards 0.55s;
        }
      `}</style>

      <svg
        viewBox="0 0 100 100"
        width="96"
        height="96"
        aria-hidden="true"
        className="select-none"
      >
        {/* --- Circle outline --- */}
        {/*
          rotate(-90) moves the start point from the right (3 o'clock) to
          the top (12 o'clock) so the circle draws clockwise from the top.
        */}
        <circle
          cx="50"
          cy="50"
          r={CIRCLE_RADIUS}
          fill="none"
          stroke="hsl(103 77% 59%)"
          strokeWidth="5"
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          className={`duey-circle${animate ? ' duey-animate' : ''}`}
        />

        {/* --- Checkmark path --- */}
        {/*
          Three points: left base → bottom tip → top right.
          Drawn as a single connected path so it animates as one stroke.
        */}
        <path
          d="M 25 50 L 42 67 L 75 33"
          fill="none"
          stroke="hsl(103 77% 59%)"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`duey-check${animate ? ' duey-animate' : ''}`}
        />
      </svg>
    </>
  );
}
