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
//
// hapticImpact is the exception: it's the "something happened" confirmation (the quick-nav
// radial springing open) and must ALWAYS land, so it ignores the gap and re-arms it.

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

/**
 * Resolve the native plugin AHEAD of the first gesture. Without this the first haptic of
 * the session always took the web fallback (the probe is async, so `hapticsMod` was still
 * unresolved) — and on the Android WebView `navigator.vibrate` is a no-op, so the very
 * first + press of every launch produced NO vibration at all. Priming at module load
 * means the motor is ready long before a finger touches the screen.
 */
export function primeHaptics() {
  if (hapticsMod !== undefined) return;
  void resolveNative().then(m => { hapticsMod = m ?? null; });
}
if (typeof window !== 'undefined') primeHaptics();

// navigator.vibrate durations per strength (ms) — short, distinct pulses.
const WEB_VIBRATE_MS: Record<Exclude<HapticStrength, 'off'>, number> = {
  light: 8,
  medium: 15,
  strong: 30,
};

/** One step firmer than the user's setting — used for confirmations so they read as a
 *  heavier "thunk" than the selection ticks around them, at every strength setting. */
const FIRMER: Record<Exclude<HapticStrength, 'off'>, Exclude<HapticStrength, 'off'>> = {
  light: 'medium',
  medium: 'strong',
  strong: 'strong',
};

function fire(level: Exclude<HapticStrength, 'off'>, force = false) {
  const now = Date.now();
  if (!force && now - lastTick < MIN_GAP_MS) return;
  lastTick = now;

  if (hapticsMod) {
    const style =
      level === 'light' ? hapticsMod.ImpactStyle.Light :
      level === 'strong' ? hapticsMod.ImpactStyle.Heavy :
      hapticsMod.ImpactStyle.Medium;
    void hapticsMod.Haptics.impact({ style }).catch(() => {});
    return;
  }
  if (hapticsMod === undefined) primeHaptics(); // first-ever call raced the probe
  try {
    navigator.vibrate?.(WEB_VIBRATE_MS[level]);
  } catch {
    // unsupported / blocked — feedback is purely optional
  }
}

/** Selection-style tick for continuous gestures (radial aiming, row arming, tab commits). */
export function hapticTick() {
  if (strength === 'off') return;
  fire(strength);
}

/** Discrete press feedback for buttons (nav bar, FABs, tool buttons). Same motor pulse
 *  as hapticTick today, but a separate entry point so tap feedback can diverge from
 *  gesture ticks without touching call sites. */
export function hapticTap() {
  if (strength === 'off') return;
  fire(strength);
}

/**
 * Confirmation pulse: firmer than a tick, and it always fires — no rate-limit skip. For
 * the moment a press turns into something (the quick-nav radial opening). Re-arms the
 * gap so the aim ticks that immediately follow don't smear into it.
 */
export function hapticImpact() {
  if (strength === 'off') return;
  fire(FIRMER[strength], true);
}
