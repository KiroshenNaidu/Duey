'use client';

import { hapticTap, setHapticStrength, getHapticStrength, type HapticStrength } from '@/lib/haptics';
import { Vibrate, VibrateOff } from 'lucide-react';
import { cn } from '@/lib/utils';

// Vibration feedback picker — Off / Light / Medium / Strong, matching the standard
// haptic-strength options on Android.
//
// PRESENTATIONAL ONLY: it does not persist anything. The parent owns the value and, like
// every other control in the Settings/Theme editor, only commits it to app state on Save.
// Picking a strength previews it with a one-off tick at that strength (temporarily nudging
// the module strength, then restoring the live value) so the choice can be felt without
// changing what the rest of the app currently uses.

const OPTIONS: { id: HapticStrength; label: string }[] = [
  { id: 'off',    label: 'Off' },
  { id: 'light',  label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'strong', label: 'Strong' },
];

export function HapticsCard({ value, onChange }: { value: HapticStrength; onChange: (s: HapticStrength) => void }) {
  const pick = (s: HapticStrength) => {
    onChange(s);
    // Preview the chosen strength without applying it app-wide: fire one tick at `s`, then
    // restore the strength the app is still live on (the saved value while drafting).
    const restore = getHapticStrength();
    setHapticStrength(s);
    hapticTap();
    setHapticStrength(restore);
  };

  return (
    <div className="bg-card rounded-2xl p-3">
      <div className="flex items-center gap-4">
        {value === 'off'
          ? <VibrateOff className="h-5 w-5 text-accent shrink-0" />
          : <Vibrate className="h-5 w-5 text-accent shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-card-foreground">Vibration</p>
          <p className="text-xs text-muted-foreground">Haptic feedback for buttons & gestures</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 mt-3">
        {OPTIONS.map(o => (
          <button
            key={o.id}
            onClick={() => pick(o.id)}
            className={cn(
              'py-2 rounded-xl text-[11px] font-semibold border transition-colors',
              value === o.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground border-border active:bg-muted'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
