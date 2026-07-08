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
  aimBeam: boolean;      // beam from the FAB centre toward your finger
  beamWidth: number;     // beam thickness in px
  magneticPull: number;  // aimed item leans this many px outward toward the flick (0 = off)
  sparkles: number;      // tiny twinkling particles around the aimed item (0 = off)
  wobble: boolean;       // aimed item rocks side to side while held
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
    fx: { hoverScale: 1.18, dimOthers: 0.5, hoverGlow: false, pointerRing: true, ringPulse: false, aimBeam: false, beamWidth: 0, magneticPull: 6, sparkles: 9, wobble: false },
  },
  {
    id: 'magnetic',
    name: 'Magnetic',
    description: 'Items lunge toward your flick and rattle in your grip',
    fx: { hoverScale: 1.15, dimOthers: 0.45, hoverGlow: true, pointerRing: true, ringPulse: false, aimBeam: false, beamWidth: 0, magneticPull: 20, sparkles: 0, wobble: true },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Just a subtle grow and dim — no rings, no beam',
    fx: { hoverScale: 1.1, dimOthers: 0.55, hoverGlow: false, pointerRing: false, ringPulse: false, aimBeam: false, beamWidth: 0, magneticPull: 0, sparkles: 0, wobble: false },
  },
];

export const DEFAULT_RADIAL_FX_ID = 'stardust';

export function getRadialFx(id: string | undefined): RadialFx {
  return (RADIAL_FX_PRESETS.find(p => p.id === id) ?? RADIAL_FX_PRESETS[0]).fx;
}
