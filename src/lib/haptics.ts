// Crisp selection-style haptics. On the Android APK this uses the native Capacitor
// Haptics plugin — proper VibrationEffect ticks, and the plugin brings the VIBRATE
// permission the bare Vibration API silently lacked. In a plain browser it falls back
// to navigator.vibrate where available, and no-ops everywhere else.
//
// Strength is user-configurable (Settings → Vibration): off / light / medium / strong,
// mapped to the platform-standard impact styles (Light / Medium / Heavy) so it matches
// what every other app's "haptic strength" slider does. AppDataContext pushes the saved
// value in via setHapticStrength on load and whenever the setting changes.
//
// hapticTick is rate-limited on purpose: gesture streams (radial aiming, row arming)
// can request ticks many times a second, which the motor renders as one long mushy buzz
// instead of discrete clicks. hapticTap (discrete button presses) shares the same gap —
// a double-fire from pointer+click on one press must collapse into a single tick.

export type HapticStrength = 'off' | 'light' | 'medium' | 'strong';

export const DEFAULT_HAPTIC_STRENGTH: HapticStrength = 'medium';

let strength: HapticStrength = DEFAULT_HAPTIC_STRENGTH;

export function setHapticStrength(s: HapticStrength) {
  strength = s;
}

export function getHapticStrength(): HapticStrength {
  return strength;
}

let lastTick = 0;
const MIN_GAP_MS = 80;

type HapticsModule = typeof import('@capacitor/haptics');
// undefined = not probed yet · null = web/no plugin · module = native ready
let hapticsMod: HapticsModule | null | undefined;

async function resolveNative(): Promise<HapticsModule | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    return await import('@capacitor/haptics');
  } catch {
    return null;
  }
}

// navigator.vibrate durations per strength (ms) — short, distinct pulses.
const WEB_VIBRATE_MS: Record<Exclude<HapticStrength, 'off'>, number> = {
  light: 8,
  medium: 15,
  strong: 30,
};

function fire() {
  if (strength === 'off') return;
  const now = Date.now();
  if (now - lastTick < MIN_GAP_MS) return;
  lastTick = now;

  if (hapticsMod === undefined) {
    hapticsMod = null; // web until proven native — the first tick may use the fallback
    void resolveNative().then(m => { hapticsMod = m; });
  }
  if (hapticsMod) {
    const style =
      strength === 'light' ? hapticsMod.ImpactStyle.Light :
      strength === 'strong' ? hapticsMod.ImpactStyle.Heavy :
      hapticsMod.ImpactStyle.Medium;
    void hapticsMod.Haptics.impact({ style }).catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(WEB_VIBRATE_MS[strength]);
  } catch {
    // unsupported / blocked — feedback is purely optional
  }
}

/** Selection-style tick for continuous gestures (radial aiming, row arming, tab commits). */
export function hapticTick() {
  fire();
}

/** Discrete press feedback for buttons (nav bar, FABs, tool buttons). Same motor pulse
 *  as hapticTick today, but a separate entry point so tap feedback can diverge from
 *  gesture ticks without touching call sites. */
export function hapticTap() {
  fire();
}
