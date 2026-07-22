'use client';

import { useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { systemPresets } from '@/lib/systemThemes';
import { STATUS_COLOR_VARS } from '@/components/ThemeProvider';
import type { ThemeSettings, UserTheme } from '@/lib/types';
import { Sun, Moon, Settings2, Check, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

// One-tap Day/Night theme switch. Each mode is bound to a saved preset (system or
// user-made); flipping the toggle applies that preset instantly via setThemeSettings —
// ThemeProvider repaints live. System presets are addressed as 'preset:<name>'.

const defaultStatusColors = Object.fromEntries(
  STATUS_COLOR_VARS.map(v => [v.field, v.default])
) as Partial<ThemeSettings>;

type PresetOption = { id: string; name: string; settings: Omit<UserTheme, 'id'>['settings'] };

// Mobile-friendly picker: wrapping tap chips with a colour swatch per preset,
// instead of a long scrolling dropdown.
function PresetChips({ label, icon, options, selectedId, onPick }: {
  label: string;
  icon: React.ReactNode;
  options: PresetOption[];
  selectedId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1">{icon} {label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const selected = o.id === selectedId;
          return (
            <button
              key={o.id}
              onClick={() => onPick(o.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                selected ? 'border-primary text-foreground sel-glow' : 'border-border text-muted-foreground active:bg-muted'
              )}
            >
              <span
                className="h-4 w-4 rounded-full border border-border/60 shrink-0"
                style={{ background: `linear-gradient(135deg, hsl(${o.settings.primary}) 50%, hsl(${o.settings.background}) 50%)` }}
              />
              {o.name}
              {selected && <Check className="h-3 w-3 text-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DayNightToggle() {
  const { themeSettings, setThemeSettings, userThemes, dayNight, setDayNight, favouriteThemes } = useContext(AppDataContext);
  const [expanded, setExpanded] = useState(false);

  // Full catalogue — used to resolve/apply an already-bound theme even if it was unstarred.
  const options: PresetOption[] = useMemo(() => [
    ...systemPresets.map(p => ({ id: `preset:${p.name}`, name: p.name, settings: p.settings })),
    ...userThemes.map(t => ({ id: t.id, name: `${t.name} (yours)`, settings: t.settings })),
  ], [userThemes]);

  // Only starred themes are offered as chips (star them in Theme → Presets).
  const favouriteOptions = useMemo(
    () => options.filter(o => favouriteThemes.includes(o.id)),
    [options, favouriteThemes],
  );

  const findOption = (id: string) => options.find(o => o.id === id);

  const applyThemeById = (id: string) => {
    const opt = findOption(id);
    if (!opt) return;
    // Same merge the theme editor's preset tap uses: status-color defaults first so
    // presets without their own status colors restore the colored palette.
    setThemeSettings({ ...themeSettings, ...defaultStatusColors, ...opt.settings });
  };

  const configured = !!dayNight.dayThemeId && !!dayNight.nightThemeId;

  const handleToggle = () => {
    const nextMode = dayNight.mode === 'day' ? 'night' : 'day';
    const targetId = nextMode === 'day' ? dayNight.dayThemeId : dayNight.nightThemeId;
    if (!targetId) { setExpanded(true); return; }
    applyThemeById(targetId);
    setDayNight({ ...dayNight, mode: nextMode });
  };

  const handlePick = (slot: 'day' | 'night', id: string) => {
    const next = slot === 'day'
      ? { ...dayNight, dayThemeId: id }
      : { ...dayNight, nightThemeId: id };
    setDayNight(next);
    // If the picked slot is the currently active mode, apply it right away for feedback.
    if (next.mode === slot) applyThemeById(id);
  };

  return (
    // relative anchor: the config panel floats below the card (overlaying the menu
    // buttons underneath) instead of expanding the card and pushing them down.
    <div className="relative">
      {/* Bottom corners square off while open so the floating panel below reads as one
          connected drop-down surface. */}
      <div className={cn('bg-card rounded-2xl p-3 transition-[border-radius] duration-300', expanded && 'rounded-b-none')}>
        <div className="flex items-center gap-4">
          {dayNight.mode === 'day'
            ? <Sun className="h-5 w-5 text-accent shrink-0" />
            : <Moon className="h-5 w-5 text-accent shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-card-foreground">Day / Night</p>
            <p className="text-xs text-muted-foreground">
              {configured
                ? `${dayNight.mode === 'day' ? 'Day' : 'Night'} theme active — tap to switch`
                : 'Pick a theme for each mode to enable'}
            </p>
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-2 rounded-xl text-muted-foreground/60 active:bg-muted shrink-0"
            aria-label="Configure day/night themes"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          {/* Same goo Switch used everywhere else — daynight-switch variant keeps the track
              in the active theme's primary colour in BOTH positions (see globals.css), and
              iconStyle swaps the I/O track glyphs for a sun/moon pair (this switch only). */}
          <Switch
            checked={dayNight.mode === 'day'}
            onCheckedChange={handleToggle}
            aria-label="Toggle day/night theme"
            className="daynight-switch"
            iconStyle="daynight"
          />
        </div>
      </div>

      {/* Animated drop-down: height reveal clipped by overflow-hidden, same easing as the
          settings menu slide (SettingsPage menuTransition) so it feels native to the app.
          Absolutely positioned + z-30 so it floats over the menu items below the card. */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="daynight-config"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.28 }}
            className="absolute left-0 right-0 top-full z-30 overflow-hidden rounded-b-2xl bg-card shadow-xl shadow-black/40"
          >
            <div className="space-y-3 p-3 border-t border-border/40">
              {favouriteOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No favourite themes yet. Star themes in{' '}
                  <span className="font-semibold text-foreground">Theme → Presets</span>{' '}
                  (<Star className="inline h-3 w-3 -mt-0.5 text-yellow-400 fill-yellow-400" />) and they&apos;ll show up here to pick from.
                </p>
              ) : (
                <>
                  <PresetChips
                    label="Day theme"
                    icon={<Sun className="h-3 w-3" />}
                    options={favouriteOptions}
                    selectedId={dayNight.dayThemeId}
                    onPick={id => handlePick('day', id)}
                  />
                  <PresetChips
                    label="Night theme"
                    icon={<Moon className="h-3 w-3" />}
                    options={favouriteOptions}
                    selectedId={dayNight.nightThemeId}
                    onPick={id => handlePick('night', id)}
                  />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
