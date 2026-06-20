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

    root.style.setProperty('--background', themeSettings.background);
    root.style.setProperty('--foreground', themeSettings.foreground);
    root.style.setProperty('--card', themeSettings.surface);
    root.style.setProperty('--card-foreground', themeSettings.foreground);
    root.style.setProperty('--popover', themeSettings.background);
    root.style.setProperty('--popover-foreground', themeSettings.foreground);
    root.style.setProperty('--primary', themeSettings.primary);
    root.style.setProperty('--accent', themeSettings.accent);
    root.style.setProperty('--ring', themeSettings.accent);
    root.style.setProperty('--accent-foreground', themeSettings.accentForeground);
    root.style.setProperty('--secondary', lighten(themeSettings.surface, 4));
    root.style.setProperty('--secondary-foreground', themeSettings.foreground);
    root.style.setProperty('--muted', lighten(themeSettings.surface, 4));
    root.style.setProperty('--muted-foreground', themeSettings.accentForeground);
    root.style.setProperty('--border', lighten(themeSettings.surface, 9));
    root.style.setProperty('--input', lighten(themeSettings.surface, 6));
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
