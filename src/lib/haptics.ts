// Crisp selection-style haptics. On the Android APK this uses the native Capacitor
// Haptics plugin — proper VibrationEffect ticks, and the plugin brings the VIBRATE
// permission the bare Vibration API silently lacked. In a plain browser it falls back
// to navigator.vibrate where available, and no-ops everywhere else.
//
// Rate-limited on purpose: gesture streams (radial aiming, row arming) can request
// ticks many times a second, which the motor renders as one long mushy buzz instead
// of discrete clicks — exactly the "vibration doesn't work well" failure mode.

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

export function hapticTick() {
  const now = Date.now();
  if (now - lastTick < MIN_GAP_MS) return;
  lastTick = now;

  if (hapticsMod === undefined) {
    hapticsMod = null; // web until proven native — the first tick may use the fallback
    void resolveNative().then(m => { hapticsMod = m; });
  }
  if (hapticsMod) {
    void hapticsMod.Haptics.impact({ style: hapticsMod.ImpactStyle.Light }).catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(10);
  } catch {
    // unsupported / blocked — feedback is purely optional
  }
}
