'use client';

import { ReactNode, useEffect, useState, useContext } from 'react';
import { idbGet } from '@/lib/utils';
import { Inter } from 'next/font/google';
import { AppDataContext } from '@/context/AppDataContext';
import type { ThemeSettings } from '@/lib/types';

// Themeable status / category colors — single source of truth shared by the apply effect,
// the theme editor, and the default state. `default` mirrors the CSS :root fallback.
export const STATUS_COLOR_VARS: { field: keyof ThemeSettings; cssVar: string; label: string; default: string }[] = [
  { field: 'positive',      cssVar: '--positive',       label: 'Positive',   default: '161 50% 57%' },
  { field: 'negative',      cssVar: '--negative',       label: 'Negative',   default: '0 70% 62%' },
  { field: 'catTransport',  cssVar: '--cat-transport',  label: 'Transport',  default: '217 91% 68%' },
  { field: 'catBudget',     cssVar: '--cat-budget',     label: 'Budget',     default: '0 70% 62%' },
  { field: 'catExpense',    cssVar: '--cat-expense',    label: 'Expense',    default: '25 95% 53%' },
  { field: 'catCompletion', cssVar: '--cat-completion', label: 'Completed',  default: '43 96% 70%' },
  { field: 'catEmployment', cssVar: '--cat-employment', label: 'Employment', default: '173 80% 74%' },
  { field: 'catSnapshot',   cssVar: '--cat-snapshot',   label: 'Summary',    default: '199 89% 62%' },
];

/** Apply themeable status colors (falling back to defaults) onto a style target. */
export function applyStatusColors(root: HTMLElement, settings: Partial<ThemeSettings>) {
  for (const { field, cssVar, default: def } of STATUS_COLOR_VARS) {
    root.style.setProperty(cssVar, (settings[field] as string) || def);
  }
}

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

// Pick pure white or black — whichever has the higher WCAG contrast ratio against
// the given "h s% l%" background. Used to keep button text legible on any theme
// (value only — no hue), regardless of how dull the theme's own foreground is.
function autoContrast(hsl: string): string {
  const p = hsl.trim().split(/\s+/);
  if (p.length < 3) return '0 0% 100%';
  const h = ((parseFloat(p[0]) % 360) + 360) % 360;
  const s = parseFloat(p[1]) / 100;
  const l = parseFloat(p[2]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const lin = (v: number) => {
    const u = v + m;
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastBlack = (L + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '0 0% 100%' : '0 0% 0%';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeSettings } = useContext(AppDataContext);
  const [backgroundImage, setBackgroundImage] = useState('');
  const [backgroundVideo, setBackgroundVideo] = useState('');
  const [isImageReady, setIsImageReady] = useState(false);

  // One-time probe: flag genuinely low-end devices so globals.css can ease the
  // most GPU-expensive effect (glass backdrop-blur) without changing the look elsewhere.
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency ?? 8;
    const memory = nav.deviceMemory ?? 8;
    if (cores <= 4 || memory <= 3) {
      document.body.classList.add('low-power');
    }
  }, []);

  useEffect(() => {
    async function loadInitialImage() {
      try {
        const [storedImage, storedVideo] = await Promise.all([
          idbGet<string>('backgroundImage'),
          idbGet<string>('backgroundVideo'),
        ]);
        if (storedImage) setBackgroundImage(storedImage);
        if (storedVideo) setBackgroundVideo(storedVideo);
      } catch (error) {
        console.error("Failed to load background media", error);
      } finally {
        setIsImageReady(true);
      }
    }
    loadInitialImage();
  }, []);

  useEffect(() => {
    if (!themeSettings) return;

    const root = document.documentElement;

    // Derive secondary/muted/border/input by lightening the surface value
    const lighten = (hsl: string, delta: number) => {
      const p = hsl.trim().split(/\s+/);
      if (p.length < 3) return hsl;
      const l = Math.min(100, Math.max(0, parseFloat(p[2]) + delta));
      return `${p[0]} ${p[1]} ${l.toFixed(0)}%`;
    };

    // Derive the "completed debt" colour by rotating the primary hue +30°.
    // This keeps it in the same colour family as the active theme while staying
    // visually distinct — e.g. gold→yellow, blue→purple, green→teal.
    const shiftHue = (hsl: string, delta: number) => {
      const p = hsl.trim().split(/\s+/);
      if (p.length < 3) return hsl;
      const h = ((parseFloat(p[0]) + delta) % 360 + 360) % 360;
      return `${h.toFixed(0)} ${p[1]} ${p[2]}`;
    };

    root.style.setProperty('--background', themeSettings.background);
    root.style.setProperty('--foreground', themeSettings.foreground);
    root.style.setProperty('--card', themeSettings.surface);
    root.style.setProperty('--card-foreground', themeSettings.foreground);
    root.style.setProperty('--popover', themeSettings.background);
    root.style.setProperty('--popover-foreground', themeSettings.foreground);
    root.style.setProperty('--primary', themeSettings.primary);
    // Analogous hue family — used for the flowing progress bar gradient.
    // Each variable is a fixed hue offset from --primary, so all four update
    // together whenever the theme changes. Spread: -20° … 0° … +20° … +45°
    root.style.setProperty('--primary-a',        shiftHue(themeSettings.primary, -20)); // cool side
    root.style.setProperty('--primary-b',        shiftHue(themeSettings.primary,  20)); // warm side
    root.style.setProperty('--primary-complete', shiftHue(themeSettings.primary,  45)); // completion colour
    root.style.setProperty('--accent', themeSettings.accent);
    root.style.setProperty('--ring', themeSettings.accent);
    root.style.setProperty('--accent-foreground', themeSettings.accentForeground);
    root.style.setProperty('--secondary', lighten(themeSettings.surface, 4));
    root.style.setProperty('--secondary-foreground', themeSettings.foreground);
    root.style.setProperty('--muted', lighten(themeSettings.surface, 4));
    root.style.setProperty('--muted-foreground', themeSettings.accentForeground);
    root.style.setProperty('--border', lighten(themeSettings.surface, 9));
    root.style.setProperty('--input', lighten(themeSettings.surface, 6));

    // Auto-contrast button text (white or black) per the active theme, so filled
    // buttons stay legible even when the theme's own foreground is dull.
    root.style.setProperty('--btn-on-primary', autoContrast(themeSettings.primary));
    root.style.setProperty('--btn-on-secondary', autoContrast(lighten(themeSettings.surface, 4)));
    root.style.setProperty('--btn-on-accent', autoContrast(themeSettings.accent));
    root.style.setProperty('--btn-on-destructive', autoContrast('0 62.8% 30.6%'));
    root.style.setProperty('--font-family', 'var(--font-inter)');
    applyStatusColors(root, themeSettings);
    root.style.setProperty('--bg-x', `${themeSettings.bgX ?? 50}%`);
    root.style.setProperty('--bg-y', `${themeSettings.bgY ?? 50}%`);
    root.style.setProperty('--glass-opacity', String(themeSettings.glassOpacity ?? 0.55));

    document.body.style.zoom = `${themeSettings.uiScale || 1.0}`;

    root.style.setProperty('--bg-scale', String(themeSettings.bgScale ?? 1));
    root.style.setProperty('--bg-blur', `${themeSettings.backgroundBlur ?? 0}px`);

    const body = document.body;
    body.classList.toggle('has-bg-image', !!backgroundImage || !!backgroundVideo);
    body.classList.remove('ui-glass', 'ui-minimal', 'ui-elevated');
    if (themeSettings.uiStyle !== 'solid') body.classList.add(`ui-${themeSettings.uiStyle}`);

  }, [themeSettings, backgroundImage, backgroundVideo, isImageReady]);

  // Background layers are over-scanned (104%) so the blur filter's soft edge
  // falls outside the viewport instead of showing a transparent halo.
  const bgLayerStyle = {
    position: 'fixed' as const,
    top: '-2%', left: '-2%', width: '104%', height: '104%',
    zIndex: -10,
    filter: 'blur(var(--bg-blur, 0px))',
    transform: 'translateZ(0) scale(var(--bg-scale, 1))',
    transformOrigin: 'center',
    willChange: 'opacity',
  };

  // A video background takes precedence over an image when both are set. Both
  // layers stay mounted (visibility toggled) so the theme editor can mutate them
  // directly for live preview, mirroring how it already drives the image layer.
  const showVideo = !!backgroundVideo;
  const hasBg = showVideo || !!backgroundImage;

  return (
    <div className={inter.variable}>
      <video
        id="global-bg-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        src={backgroundVideo || undefined}
        style={{
          ...bgLayerStyle,
          objectFit: 'cover',
          objectPosition: 'var(--bg-x, 50%) var(--bg-y, 50%)',
          display: showVideo ? 'block' : 'none',
        }}
      />
      <div
        id="global-bg-image"
        className="bg-cover"
        style={{
          ...bgLayerStyle,
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
          backgroundPosition: 'var(--bg-x, 50%) var(--bg-y, 50%)',
          display: showVideo ? 'none' : 'block',
        }}
      />
      <div
        id="global-bg-overlay"
        className="fixed inset-0 z-[-9] bg-black transition-opacity duration-500"
        style={{ opacity: hasBg ? themeSettings.backgroundOpacity : 0, willChange: 'opacity', transform: 'translateZ(0)' }}
      />
      {children}
    </div>
  );
}
