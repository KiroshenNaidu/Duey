'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

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

// Shockwave rings that burst outward from an aimed radial item ("Shockwave" preset).
// Two staggered rings loop while the aim is held. Rendered inside the item circle
// (which is position:relative), so inset-0 hugs the button exactly. Like AimSparkles,
// it must only ever live inside NON-exiting AnimatePresence children (the radial items
// have no exit prop by design — see the QuickAdd comments).
export function RippleBurst() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <>
      {[0, 1].map(i => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border-2 border-accent pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.45, ease: 'easeOut' }}
        />
      ))}
    </>
  );
}

// Geometry + colour ramp for the aim-trail track — the FAB-thick bar that grows from behind
// the FAB out to the aimed option. Shared by the real quick-add menu and the Theme→Style demo
// so the two can't drift.
//
// The track is a band exactly as thick as the FAB is wide, and it starts AT the FAB centre —
// which is the whole trick. Two lines a diameter apart, straddling the centre of a circle of
// that diameter, are the circle's two TANGENTS: they touch the rim at its top and bottom
// points and carry straight on from there. So the band's long edges leave the button without
// a seam, and its flat back edge is the button's own vertical diameter — sitting entirely
// under the opaque ✕, which paints over it.
//
// Do NOT round the back cap. A `thickness/2` radius there is an arc of a circle centred half
// a thickness OUT along the beam — a different circle from the FAB's. The two cross at 30°
// off the centreline, and that crossing is a visible cusp: a hard diagonal nick slicing out
// of the button exactly where the trail should be growing smoothly out of it. Extending the
// box backwards to make the cap concentric instead just blooms the drop-shadow out the BACK
// of the button as a halo. (Tried both. Square is the one that's actually tangent.)
//
// Alpha finishes the job: the ramp starts fully TRANSPARENT at the FAB centre and reaches
// full strength at the rim (half a thickness out), so the wedges of band that fall outside
// the circle on the way there — and the drop-shadow they cast — fade in rather than appear.
// The rest of the ramp is unchanged, so the trail still fades out as it reaches the option.
export function aimTrailTrackStyle(length: number, thickness: number, cornerRadius: number) {
  const width = Math.max(0, length);
  // The FAB's rim, as a stop along the track: half the thickness = the FAB's radius.
  const rimPct = width > 0 ? Math.min(45, (thickness / 2 / width) * 100).toFixed(1) : '0';
  return {
    left: 0,
    width,
    height: thickness,
    marginTop: -thickness / 2,
    // Square at the FAB end (tangent, see above); only the far end is rounded.
    borderRadius: `0 ${cornerRadius}px ${cornerRadius}px 0`,
    background:
      `linear-gradient(90deg, hsl(var(--primary) / 0) 0%, hsl(var(--primary) / 0.55) ${rimPct}%, ` +
      `hsl(var(--primary) / 0.34) 55%, hsl(var(--primary) / 0.18) 88%, hsl(var(--primary) / 0) 100%)`,
  };
}

// Chevrons that stream OUTWARD along the aim-trail bar, from the FAB centre toward the
// locked option — racing-game "boost" arrows. Rendered inside the bar element itself:
// the bar's width is its length and its x-axis points at the option, so `left`
// percentages travel toward the option no matter how the bar is rotated. Accent-coloured
// so the flow doubles as the bar's highlight on the primary base. Deterministic, self-looping.
export function TrailFlow() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="absolute pointer-events-none text-accent"
          style={{ top: '50%', marginTop: -9 }}
          initial={{ opacity: 0 }}
          animate={{ left: ['2%', '70%'], opacity: [0, 0.9, 0] }}
          transition={{ duration: 1.0, repeat: Infinity, delay: i * 0.33, ease: 'easeInOut' }}
        >
          <ChevronRight className="h-[18px] w-[18px]" strokeWidth={3} />
        </motion.span>
      ))}
    </>
  );
}

// Sparks that stream DOWN the aim beam, from the finger end back toward the FAB centre
// ("Comet" preset). Rendered inside the beam element itself: the beam is a rotated div
// whose width = beam length, so `left` percentages travel along the beam no matter how
// it is angled or how long it currently is. Deterministic offsets, self-looping.
export function CometTrail() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <>
      {[0, 1, 2, 3].map(i => {
        const size = 4 - (i % 2);
        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-accent pointer-events-none"
            style={{
              width: size,
              height: size,
              top: '50%',
              marginTop: -size / 2,
              boxShadow: '0 0 6px 1px hsl(var(--accent) / 0.6)',
            }}
            initial={{ opacity: 0 }}
            animate={{ left: ['96%', `${28 + i * 9}%`], opacity: [0.9, 0], scale: [1.1, 0.4] }}
            transition={{ duration: 0.55 + i * 0.12, repeat: Infinity, delay: i * 0.11, ease: 'easeOut' }}
          />
        );
      })}
    </>
  );
}

// Curved label that hugs the outer edge of a radial item's circle. It rests upright at the
// bottom of its button and, WHILE AIMED, slowly orbits and shimmers through the analogous
// primary palette (see .radial-label-shimmer). `id` must be unique per item (SVG textPath
// refs it by id); `index` drives the orbit's desynced pace/phase. The dark stroke behind
// the fill keeps it readable on the blurred backdrop without a pill.
//
// PERF: the orbit is an infinite SVG-transform animation, and SVG transforms are
// CPU-rasterized on the Android WebView (no GPU layer like a div). Running one per item
// meant up to SEVEN continuous rasterizing animations the whole time the radial was open —
// a large slice of the "still laggy" cost. So only the AIMED label orbits (at most one at a
// time); the rest sit static and upright, which also reads cleaner. `active` gates it.
const CURVED_ARC_R = 34;   // svg is 80×80, centre 40,40; button radius is 24
export function CurvedLabel({ id, index, text, active = false }: { id: string; index: number; text: string; active?: boolean }) {
  const reduce = useReducedMotion();
  const pathId = `radial-arc-${id}`;
  const cx = 40;
  // Sweep flag 0 → the arc bulges DOWNWARD so the text starts hugging the BOTTOM (upright).
  const d = `M ${cx - CURVED_ARC_R} ${cx} A ${CURVED_ARC_R} ${CURVED_ARC_R} 0 0 0 ${cx + CURVED_ARC_R} ${cx}`;

  const spinning = active && !reduce;

  // Heavy desync: each label spins at a different pace and direction (alternating CW/CCW).
  // The orbit always starts and ends at rotate 0 (upright at the bottom) so arming/releasing
  // aim glides in and out of the resting pose instead of snapping from a random angle.
  const dir = index % 2 === 0 ? 1 : -1;               // alternate spin direction
  const rotDuration = 6 + ((index * 3.7) % 6);        // 6–12s, non-linear spread

  // Variable-speed spin (loading-screen feel): two FAST bursts per revolution separated by
  // slow crawls. Keyframe angles are unevenly paced against `times`, so equal time slices
  // cover unequal angle = the rotation surges and rests. easeInOut smooths each segment; the
  // loop seam sits at 0 so it stays continuous. Full 360 → position loops seamlessly.
  const spin = [0, 20, 160, 185, 205, 345, 360].map(a => dir * a);
  const spinTimes = [0, 0.12, 0.24, 0.44, 0.56, 0.68, 1];

  return (
    <motion.svg
      viewBox="0 0 80 80"
      className="absolute pointer-events-none overflow-visible"
      // All transforms via Framer (translate + rotate) so the Tailwind centering classes
      // can't clobber the animated rotate. Rotates around its own centre = the button centre.
      style={{ left: '50%', top: '50%', width: 80, height: 80, translateX: '-50%', translateY: '-50%' }}
      initial={{ rotate: 0 }}
      animate={spinning ? { rotate: spin } : { rotate: 0 }}
      transition={spinning ? { duration: rotDuration, repeat: Infinity, ease: 'easeInOut', times: spinTimes } : { duration: 0.3 }}
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
