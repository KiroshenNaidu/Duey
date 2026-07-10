// Quick-add radial gesture effect presets. Selected in Theme → Style (live demo there),
// stored as AppState.quickAddFxId, consumed by QuickAdd and the RadialFxDemo.
//
// Adding a preset = one more entry here; removing an effect everywhere = zero out its
// field. Nothing else in the app needs touching.

export interface RadialFx {
  hoverScale: number;    // aimed item grows to this scale (1 = off)
  dimOthers: number;     // other items fade to this opacity while aiming (1 = off)
  hoverGlow: boolean;    // soft glow ring on the aimed item
  pointerRing: boolean;  // ring following your finger while sliding
  ringPulse: boolean;    // the finger ring pulses
  aimBeam: boolean;      // beam from the FAB centre toward your finger (follows the finger)
  aimTrail: boolean;     // FAB-thick primary bar growing out of the centre button, sticking to
                         // the aimed option, with accent chevrons streaming outward inside it
  beamWidth: number;     // beam thickness in px
  magneticPull: number;  // aimed item leans this many px outward toward the flick (0 = off)
  sparkles: number;      // tiny twinkling particles around the aimed item (0 = off)
  wobble: boolean;       // aimed item rocks side to side while held
  cometTrail: boolean;   // glowing particles stream down the aim beam (needs aimBeam)
  rippleBurst: boolean;  // shockwave rings burst outward from the aimed item
  elasticFan: boolean;   // bouncier fan-out spring — items overshoot and settle
}

export interface RadialFxPreset {
  id: string;
  name: string;
  description: string;
  fx: RadialFx;
}

export const RADIAL_FX_PRESETS: RadialFxPreset[] = [
  {
    id: 'stardust',
    name: 'Stardust',
    description: 'A cloud of tiny sparkles around whatever you aim at',
    fx: { hoverScale: 1.18, dimOthers: 0.5, hoverGlow: false, pointerRing: false, ringPulse: false, aimBeam: false, aimTrail: true, beamWidth: 0, magneticPull: 6, sparkles: 9, wobble: false, cometTrail: false, rippleBurst: false, elasticFan: false },
  },
  {
    id: 'magnetic',
    name: 'Magnetic',
    description: 'Items lunge toward your flick and rattle in your grip',
    fx: { hoverScale: 1.15, dimOthers: 0.45, hoverGlow: true, pointerRing: false, ringPulse: false, aimBeam: false, aimTrail: true, beamWidth: 0, magneticPull: 20, sparkles: 0, wobble: true, cometTrail: false, rippleBurst: false, elasticFan: false },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Just a subtle grow and dim — no rings, no beam',
    fx: { hoverScale: 1.1, dimOthers: 0.55, hoverGlow: false, pointerRing: false, ringPulse: false, aimBeam: false, aimTrail: false, beamWidth: 0, magneticPull: 0, sparkles: 0, wobble: false, cometTrail: false, rippleBurst: false, elasticFan: false },
  },
  {
    id: 'comet',
    name: 'Comet',
    description: 'Your aim becomes a glowing beam with sparks streaming down it',
    fx: { hoverScale: 1.16, dimOthers: 0.45, hoverGlow: true, pointerRing: true, ringPulse: false, aimBeam: true, aimTrail: false, beamWidth: 3, magneticPull: 10, sparkles: 0, wobble: false, cometTrail: true, rippleBurst: false, elasticFan: false },
  },
  {
    id: 'shockwave',
    name: 'Shockwave',
    description: 'Rings ripple outward from whatever you aim at',
    fx: { hoverScale: 1.2, dimOthers: 0.4, hoverGlow: true, pointerRing: false, ringPulse: false, aimBeam: false, aimTrail: true, beamWidth: 0, magneticPull: 8, sparkles: 0, wobble: false, cometTrail: false, rippleBurst: true, elasticFan: false },
  },
  {
    id: 'elastic',
    name: 'Elastic',
    description: 'The fan bursts out with a rubbery overshoot and snaps to your aim',
    fx: { hoverScale: 1.22, dimOthers: 0.5, hoverGlow: false, pointerRing: false, ringPulse: false, aimBeam: false, aimTrail: true, beamWidth: 0, magneticPull: 26, sparkles: 0, wobble: true, cometTrail: false, rippleBurst: false, elasticFan: true },
  },
];

export const DEFAULT_RADIAL_FX_ID = 'stardust';

export function getRadialFx(id: string | undefined): RadialFx {
  return (RADIAL_FX_PRESETS.find(p => p.id === id) ?? RADIAL_FX_PRESETS[0]).fx;
}
