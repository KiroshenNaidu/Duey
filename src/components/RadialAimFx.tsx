'use client';

import { motion, useReducedMotion } from 'framer-motion';

// Tiny sparkle particles that twinkle around an aimed radial item. Shared by the real
// quick-add menu and the Theme→Style demo. Deterministic offsets (no Math.random) so
// renders are stable; each sparkle drifts outward while fading, on its own loop.
//
// Tune here: SPARKLE_BASE_R (distance from item centre), sizes, and the per-sparkle
// duration/delay formulas. Presets control only the count (fx.sparkles, 0 = off).

const SPARKLE_BASE_R = 30;

export function AimSparkles({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.45 : 0);
        const r = SPARKLE_BASE_R + (i % 3) * 8;
        const size = 2 + (i % 3);
        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-accent pointer-events-none"
            style={{ width: size, height: size, left: '50%', top: '50%', marginLeft: -size / 2, marginTop: -size / 2 }}
            initial={{ opacity: 0 }}
            animate={{
              x: [Math.cos(angle) * r * 0.6, Math.cos(angle) * r],
              y: [Math.sin(angle) * r * 0.6, Math.sin(angle) * r],
              opacity: [0, 1, 0],
              scale: [0.4, 1.2, 0.3],
            }}
            transition={{
              duration: 0.8 + (i % 3) * 0.25,
              repeat: Infinity,
              delay: i * 0.09,
              ease: 'easeOut',
            }}
          />
        );
      })}
    </>
  );
}

// Curved label that hugs the outer edge of a radial item's circle. The text SLOWLY ORBITS
// its own button (each at a desynced pace/phase) and gently shimmers through the analogous
// primary palette, cascading 1→2→3→4 like the budget gauge (see .radial-label-shimmer).
// `id` must be unique per item (SVG textPath refs it by id); `index` drives the desync.
// The dark stroke behind the fill keeps it readable on the blurred backdrop without a pill.
const CURVED_ARC_R = 34;   // svg is 80×80, centre 40,40; button radius is 24
export function CurvedLabel({ id, index, text }: { id: string; index: number; text: string }) {
  const reduce = useReducedMotion();
  const pathId = `radial-arc-${id}`;
  const cx = 40;
  // Sweep flag 0 → the arc bulges DOWNWARD so the text starts hugging the BOTTOM (upright).
  const d = `M ${cx - CURVED_ARC_R} ${cx} A ${CURVED_ARC_R} ${CURVED_ARC_R} 0 0 0 ${cx + CURVED_ARC_R} ${cx}`;

  // Heavy desync: each label spins at a different pace, phase, AND direction (alternating
  // CW/CCW) so they never sync up.
  const dir = index % 2 === 0 ? 1 : -1;               // alternate spin direction
  const rotDuration = 6 + ((index * 3.7) % 6);        // 6–12s, non-linear spread (faster)
  const startAngle = (index * 67) % 360;              // starting phase

  // Variable-speed spin (loading-screen feel): two FAST bursts per revolution separated by
  // slow crawls. Keyframe angles are unevenly paced against `times`, so equal time slices
  // cover unequal angle = the rotation surges and rests. easeInOut smooths each segment; the
  // loop seam sits mid-crawl so it stays continuous. Full 360 → position loops seamlessly.
  const spin = [0, 20, 160, 185, 205, 345, 360].map(a => startAngle + dir * a);
  const spinTimes = [0, 0.12, 0.24, 0.44, 0.56, 0.68, 1];

  return (
    <motion.svg
      viewBox="0 0 80 80"
      className="absolute pointer-events-none overflow-visible"
      // All transforms via Framer (translate + rotate) so the Tailwind centering classes
      // can't clobber the animated rotate. Rotates around its own centre = the button centre.
      style={{ left: '50%', top: '50%', width: 80, height: 80, translateX: '-50%', translateY: '-50%' }}
      initial={{ rotate: startAngle }}
      animate={reduce ? { rotate: startAngle } : { rotate: spin }}
      transition={reduce ? undefined : { duration: rotDuration, repeat: Infinity, ease: 'easeInOut', times: spinTimes }}
      aria-hidden
    >
      <defs>
        <path id={pathId} d={d} fill="none" />
      </defs>
      <text
        className="radial-label-shimmer"
        fill="currentColor"
        fontSize="9"
        fontWeight="800"
        stroke="rgba(0,0,0,0.7)"
        strokeWidth="2.5"
        style={{ paintOrder: 'stroke', letterSpacing: '0.03em' }}
      >
        <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">{text}</textPath>
      </text>
    </motion.svg>
  );
}
